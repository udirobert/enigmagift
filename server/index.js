import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { join, dirname } from 'node:path';
import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR, hashCode, verifyCode } from './db.js';
import { runPipeline, reclue } from './pipeline.js';
import { buildWorld } from './world.js';
import { buildPortrait, portraitMime } from './portrait.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');

const app = express();
const PORT = process.env.PORT || 8787;

// CORS allowlist — defaults to the deployed domains + localhost dev.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || [
  'https://enigmagift.pages.dev',
  'https://enigmagift.netlify.app',
  'https://saved-you-a-seat--enigmagift.netlify.app',
  'https://for-you-room--enigmagift.netlify.app',
  'http://localhost:5173',
  'http://localhost:4183',
].join(','))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// CORS: allowlist + same-origin (the browser sends Origin even on same-host
// requests, so compare the origin's host to the request's own host).
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next(); // curl / server-to-server
  let allowed = ALLOWED_ORIGINS.includes(origin);
  if (!allowed) {
    try {
      allowed = new URL(origin).host === req.headers.host;
    } catch { /* not a URL — not allowed */ }
  }
  if (!allowed) return res.status(403).json({ error: 'origin not allowed' });
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Stripe webhook needs the raw body for signature verification — mount raw
// parsing for that path BEFORE the JSON parser.
app.use('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Tiny in-memory rate limiter (per key, sliding window).
const rlBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (rlBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  rlBuckets.set(key, arr);
  return true;
}

// Tier → expected Stripe amount (in pence) for webhook verification.
const TIER_PRICE_PENCE = { trail: 499, hide: 999, set: 1900 };

function verifyStripeSignature(payload, header, secret) {
  try {
    const parts = Object.fromEntries(
      String(header || '').split(',').map((p) => p.split('=')),
    );
    const t = parts.t;
    const v1 = parts.v1;
    if (!t || !v1) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${t}.${payload}`)
      .digest('hex');
    const a = Buffer.from(v1, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = join(UPLOADS_DIR, req.giftId);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = (file.originalname.match(/\.[^.]+$/) || ['.jpg'])[0].toLowerCase();
      const e = IMAGE_EXT.test(ext) ? ext : '.jpg';
      // zero-padded upload order → sorted filenames === upload order,
      // so photoIndex (sorted order) matches what the buyer saw first
      const n = ((req._uploadN = (req._uploadN || 0) + 1) || 1) - 1;
      cb(null, `${String(n).padStart(3, '0')}_${crypto.randomBytes(4).toString('hex')}${e}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    cb(null, IMAGE_EXT.test(file.originalname) || IMAGE_EXT.test(file.mimetype));
  },
});

function getGift(id) {
  return db.prepare('SELECT * FROM gifts WHERE id = ?').get(id);
}

// Fire-and-forget: build the 3D world for a gift. Safe to call repeatedly —
// buildWorld is idempotent and skips if one is already in flight or done.
function startWorldBuild(giftId) {
  buildWorld(giftId).catch((e) => {
    console.error(`[world ${giftId}] trigger error:`, e);
  });
}

// Same fire-and-forget pattern for the keepsake portrait — skipped quietly
// when no Recraft key is configured.
function startPortraitBuild(giftId) {
  buildPortrait(giftId).catch((e) => {
    console.error(`[portrait ${giftId}] trigger error:`, e);
  });
}

function giftPayload(g) {
  if (!g) return null;
  const clues = db.prepare('SELECT id, position, text, meta FROM clues WHERE gift_id=? ORDER BY position').all(g.id)
    .map((c) => ({ id: c.id, text: c.text, ...safeParse(c.meta) }));
  const hideSpots = db.prepare('SELECT id, position, data FROM hide_spots WHERE gift_id=? ORDER BY position').all(g.id)
    .map((h) => ({ id: h.id, ...safeParse(h.data) }));
  const observations = db.prepare('SELECT photo_index, data FROM observations WHERE gift_id=? ORDER BY photo_index').all(g.id)
    .map((o) => ({ photoIndex: o.photo_index, ...safeParse(o.data) }));
  return {
    id: g.id,
    status: g.status,
    direction: g.direction,
    photoCount: g.photo_count,
    // the read is streaming: how many photos have landed so far. The buyer
    // watches this tick up instead of staring at a spinner.
    photosObserved: g.status === 'reading' ? (g.photos_observed ?? 0) : g.photo_count,
    // partial observations stream in as each photo is read — the buyer sees
    // the agent discover their place in real time while still 'reading'.
    observations,
    clues: clues.length ? clues : undefined,
    hideSpots: hideSpots.length ? hideSpots : undefined,
    throughline: g.throughline ?? undefined,
    placeGuess: g.place_guess ?? undefined,
    hide: safeParse(g.hides),
    paid: !!g.paid,
    worldStatus: g.world_status ?? 'pending',
    worldSource: g.world_source ?? null,
    mode: g.mode ?? 'physical',
    tier: g.tier ?? null,
    packId: g.pack_id ?? null,
    reclueCount: g.reclue_count ?? 0,
    createdAt: g.created_at,
  };
}

function safeParse(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
}

// Privacy-respecting funnel events (no third-party trackers).
function logEvent(giftId, token, name, data) {
  try {
    db.prepare('INSERT INTO events (gift_id, token, name, data) VALUES (?,?,?,?)')
      .run(giftId ?? null, token ?? null, String(name), data ? JSON.stringify(data) : null);
  } catch { /* events are best-effort */ }
}

// uploaded originals, sorted — the index is the photoIndex the pipeline used.
// Filter to image extensions: the gift dir also holds world.glb (and its temp)
// once the 3D world is built, and that must never be served as a "photo".
function photoFiles(giftId) {
  try {
    return readdirSync(join(UPLOADS_DIR, giftId)).filter((f) => IMAGE_EXT.test(f)).sort();
  } catch { return []; }
}

function photoUrl(giftId, i) {
  return `/api/photo/${giftId}/${i}`;
}

function trailPayload(t, gift) {
  const files = gift ? photoFiles(gift.id) : [];
  return {
    token: t.token,
    rounds: safeParse(t.rounds),
    // token-scoped photo URLs — the recipient only ever holds the token
    photoUrls: files.map((_, i) => `/api/trail/${t.token}/photo/${i}`),
    throughline: gift?.throughline ?? null,
    placeGuess: gift?.place_guess ?? null,
    unlocked: !!t.unlocked,
    // digital gifts (The Trail) open the keepsake without a code; the Hide
    // tier keeps the physical code gate
    requiresCode: (gift?.mode ?? 'physical') === 'physical',
    mode: gift?.mode ?? 'physical',
    tier: gift?.tier ?? null,
    // the 3D world of the place — built after sealing; the recipient can
    // orbit it in the reveal and keep a copy
    worldStatus: gift?.world_status ?? 'pending',
    worldUrl: gift?.world_status === 'ready' ? `/api/trail/${t.token}/world` : null,
    // the keepsake portrait — painted from the same photo at seal time
    portraitStatus: gift?.portrait_status ?? 'pending',
    portraitUrl: gift?.portrait_status === 'ready' ? `/api/trail/${t.token}/portrait` : null,
  };
}

// ---------- routes ----------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

function handleGiftCreate(req, res, packId = null) {
  req.giftId = crypto.randomUUID();
  upload.array('photos', 12)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const files = req.files || [];
    if (files.length < 5) return res.status(400).json({ error: 'Need 5-12 photos' });
    if (files.length > 12) return res.status(400).json({ error: 'Max 12 photos' });
    const direction = req.body?.direction === 'me' ? 'me' : 'someone';
    // digital-first: The Trail (digital) is the default; The Hide is physical.
    const mode = req.body?.mode === 'physical' ? 'physical' : 'digital';
    const tier = ['trail', 'hide', 'set'].includes(req.body?.tier) ? req.body.tier : null;
    if (packId) {
      const pack = db.prepare('SELECT * FROM packs WHERE id=?').get(packId);
      if (!pack) return res.status(404).json({ error: 'pack not found' });
      if ((pack.credits_left || 0) < 1) return res.status(409).json({ error: 'pack has no hunts left' });
      db.prepare('UPDATE packs SET credits_left = credits_left - 1 WHERE id=?').run(packId);
    }
    db.prepare('INSERT INTO gifts (id, direction, status, photo_count, mode, tier, pack_id) VALUES (?,?,?,?,?,?,?)')
      .run(req.giftId, direction, 'reading', files.length, mode, tier, packId);
    logEvent(req.giftId, null, 'uploaded', { photos: files.length, mode, tier });
    // async pipeline — do not await
    runPipeline(req.giftId).catch((e) => {
      console.error(`[pipeline ${req.giftId}] fatal:`, e);
      try { db.prepare("UPDATE gifts SET status='error' WHERE id=?").run(req.giftId); } catch {}
    });
    res.status(201).json({ giftId: req.giftId, status: 'reading', mode, tier, packId });
  });
}

app.post('/api/gifts', (req, res) => {
  // draft-cost control: per-IP sliding window on gift creation
  if (!rateLimit(`gifts:${req.ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too many drafts — try again in an hour' });
  }
  handleGiftCreate(req, res, null);
});

app.get('/api/gifts/:id', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  res.json(giftPayload(g));
});

app.patch('/api/gifts/:id/clues', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const { keepIds = [], edits = {} } = req.body || {};
  const all = db.prepare('SELECT id, position, text, meta FROM clues WHERE gift_id=? ORDER BY position').all(g.id);
  // apply edits
  const upd = db.prepare('UPDATE clues SET text=? WHERE id=? AND gift_id=?');
  for (const [id, text] of Object.entries(edits)) {
    if (typeof text === 'string' && text.trim()) upd.run(text.trim(), id, g.id);
  }
  // if keepIds provided, drop non-kept clues and re-position
  if (Array.isArray(keepIds) && keepIds.length) {
    const keep = new Set(keepIds);
    let pos = 0;
    for (const c of all) {
      if (keep.has(c.id)) {
        db.prepare('UPDATE clues SET position=? WHERE id=?').run(pos++, c.id);
      } else {
        db.prepare('DELETE FROM clues WHERE id=?').run(c.id);
      }
    }
  }
  res.json(giftPayload(getGift(g.id)));
});

app.post('/api/gifts/:id/reclue', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (!rateLimit(`reclue:${req.params.id}`, g.paid ? 10 : 2, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'reclue limit reached (2 before payment)' });
  }
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : '';
  reclue(g.id, notes)
    .then((applied) => {
      logEvent(g.id, null, 'reclue', { notes: !!notes });
      res.json({ ok: true, ...applied, gift: giftPayload(getGift(g.id)) });
    })
    .catch((e) => {
      const status = e.status || 500;
      res.status(status).json({ error: e.message || 'reclue failed' });
    });
});

app.post('/api/gifts/:id/world-source', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const idx = parseInt(req.body?.index, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= g.photo_count) {
    return res.status(400).json({ error: 'index out of range' });
  }
  const wasBuilt = g.world_status === 'ready' || g.world_status === 'worlding';
  db.prepare('UPDATE gifts SET world_source=? WHERE id=?').run(idx, g.id);
  if (wasBuilt) {
    // rebuild from the newly chosen photo
    db.prepare("UPDATE gifts SET world_status='pending', world_file=NULL, world_started_at=NULL, world_ready_at=NULL WHERE id=?").run(g.id);
    if (g.status === 'sealed' || g.status === 'paid') startWorldBuild(g.id);
  }
  logEvent(g.id, null, 'world_source', { index: idx });
  res.json({ ok: true, worldSource: idx, rebuilding: wasBuilt });
});

app.post('/api/gifts/:id/event', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  logEvent(g.id, null, req.body?.name, req.body?.data);
  res.json({ ok: true });
});

app.delete('/api/gifts/:id', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  // delete the gift, its trail(s), derived rows and uploaded files
  db.prepare('DELETE FROM observations WHERE gift_id=?').run(g.id);
  db.prepare('DELETE FROM clues WHERE gift_id=?').run(g.id);
  db.prepare('DELETE FROM hide_spots WHERE gift_id=?').run(g.id);
  db.prepare('DELETE FROM trails WHERE gift_id=?').run(g.id);
  db.prepare('DELETE FROM gifts WHERE id=?').run(g.id);
  try { rmSync(join(UPLOADS_DIR, g.id), { recursive: true, force: true }); } catch {}
  logEvent(g.id, null, 'deleted', { status: g.status });
  res.json({ ok: true });
});

// ---------- packs (The Set, £19 = 3 hunts) ----------

app.get('/api/packs/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM packs WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const children = db.prepare('SELECT id, status, mode, tier, created_at FROM gifts WHERE pack_id=? ORDER BY created_at').all(p.id);
  res.json({ id: p.id, creditsLeft: p.credits_left, purchaseGiftId: p.purchase_gift_id, children, createdAt: p.created_at });
});

app.post('/api/packs/:id/gifts', (req, res) => {
  if (!rateLimit(`gifts:${req.ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too many drafts — try again in an hour' });
  }
  handleGiftCreate(req, res, req.params.id);
});

app.post('/api/gifts/:id/hide', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const { hideSpotId, hideNote, hiddenAt } = req.body || {};
  const hides = safeParse(g.hides);
  const entry = {
    hideSpotId: hideSpotId || null,
    hideNote: hideNote || null,
    hiddenAt: hiddenAt || new Date().toISOString(),
    at: new Date().toISOString(),
  };
  const list = Array.isArray(hides.history) ? hides.history : [];
  list.push(entry);
  db.prepare('UPDATE gifts SET hides=? WHERE id=?').run(JSON.stringify({ ...hides, current: entry, history: list }), g.id);
  res.json({ ok: true, hide: entry });
});

app.post('/api/gifts/:id/seal', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (g.status === 'reading') return res.status(409).json({ error: 'still reading' });
  // idempotent: return existing trail if already sealed
  const existing = db.prepare('SELECT token, unlock_code FROM trails WHERE gift_id=?').get(g.id);
  if (existing) {
    // sealing is idempotent, but the world build may not have started yet
    startWorldBuild(g.id);
    startPortraitBuild(g.id);
    return res.json({
      trailToken: existing.token,
      trailUrl: `/t/${existing.token}`,
      unlockCode: existing.unlock_code,
    });
  }
  const token = crypto.randomBytes(12).toString('base64url');
  const unlockCode = (() => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[crypto.randomInt(chars.length)];
    return s;
  })();
  const rounds = safeParse(g.rounds);
  // the code is stored as a scrypt hash only — the plaintext exists solely in
  // the response so the buyer can write it into the hidden thing (Hide tier)
  db.prepare('INSERT INTO trails (token, gift_id, rounds, unlock_code, unlock_hash) VALUES (?,?,?,?,?)')
    .run(token, g.id, JSON.stringify(rounds), '', hashCode(unlockCode));
  if (g.status !== 'paid') {
    db.prepare("UPDATE gifts SET status='sealed' WHERE id=?").run(g.id);
  }
  logEvent(g.id, token, 'sealed', { mode: g.mode, tier: g.tier });
  // the recipient's payoff: build the 3D world of their place now, while they
  // follow the trail. Non-blocking — the reveal polls for it. Same for the
  // keepsake portrait (best-effort — needs RECRAFT_API_KEY, API units).
  startWorldBuild(g.id);
  startPortraitBuild(g.id);
  res.json({
    trailToken: token,
    trailUrl: `/t/${token}`,
    unlockCode, // the buyer writes this into the hidden thing
  });
});

app.post('/api/gifts/:id/mark-paid', async (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  // Called on the Stripe Payment Link return (client_reference_id = gift id).
  // The webhook is the source of truth; this fallback verifies the checkout
  // session server-side when STRIPE_API_KEY is set, otherwise trusts the
  // return URL (legacy behaviour).
  const sessionId = req.body?.sessionId || null;
  let verified = false;
  if (sessionId && process.env.STRIPE_API_KEY) {
    try {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_API_KEY}` },
      });
      if (r.ok) {
        const s = await r.json();
        verified = s.payment_status === 'paid' && s.client_reference_id === g.id;
      }
    } catch (e) {
      console.error(`[mark-paid ${g.id}] stripe verify failed:`, e.message);
    }
  } else if (sessionId) {
    verified = true; // legacy: no secret key configured
    console.warn(`[mark-paid ${g.id}] no STRIPE_API_KEY — trusting client return`);
  }
  if (sessionId && !verified) {
    return res.status(402).json({ ok: false, paid: false, error: 'session not paid' });
  }
  db.prepare('UPDATE gifts SET paid=1, status=CASE WHEN status=\'sealed\' THEN \'paid\' ELSE status END WHERE id=?').run(g.id);
  logEvent(g.id, null, 'paid', { tier: g.tier, verified: !!(sessionId && process.env.STRIPE_API_KEY) });
  res.json({ ok: true, paid: true });
});

// ---------- Stripe webhook — the source of truth for `paid` ----------

app.post('/api/stripe/webhook', (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe webhook] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'webhook not configured' });
  }
  const sig = req.headers['stripe-signature'];
  if (!verifyStripeSignature(req.body, sig, secret)) {
    return res.status(400).json({ error: 'bad signature' });
  }
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'bad payload' });
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data?.object || {};
    const giftId = s.client_reference_id || null;
    const g = giftId ? getGift(giftId) : null;
    if (g) {
      const expected = TIER_PRICE_PENCE[g.tier] ?? null;
      if (expected != null && s.amount_total !== expected) {
        console.error(`[stripe webhook] amount mismatch gift=${g.id} tier=${g.tier} got=${s.amount_total} want=${expected}`);
        return res.status(400).json({ error: 'amount mismatch' });
      }
      db.prepare('UPDATE gifts SET paid=1, status=CASE WHEN status=\'sealed\' THEN \'paid\' ELSE status END WHERE id=?').run(g.id);
      logEvent(g.id, null, 'paid', { tier: g.tier, via: 'webhook', session: s.id });
      // a Set payment creates the 3-credit pack (idempotent)
      if (g.tier === 'set' && !g.pack_id) {
        const packId = crypto.randomUUID();
        db.prepare('INSERT INTO packs (id, purchase_gift_id, credits_left) VALUES (?,?,3)').run(packId, g.id);
        db.prepare('UPDATE gifts SET pack_id=? WHERE id=?').run(packId, g.id);
        logEvent(g.id, null, 'pack_created', { packId });
      }
    } else {
      console.warn('[stripe webhook] checkout.session.completed without a known gift:', giftId);
    }
  }
  res.json({ received: true });
});

// ---------- trail ----------

function getTrail(token) {
  return db.prepare('SELECT * FROM trails WHERE token=?').get(token);
}

app.get('/api/trail/:token', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const gift = getGift(t.gift_id);
  logEvent(t.gift_id, t.token, 'opened', null);
  res.json(trailPayload(t, gift));
});

app.post('/api/trail/:token/answer', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const { round, choice } = req.body || {};
  const rounds = safeParse(t.rounds);
  const r = rounds[round];
  if (!r) return res.status(400).json({ error: 'bad round' });
  const correct = choice === r.correct;
  const answers = safeParse(t.answers);
  const arr = Array.isArray(answers) ? answers : [];
  arr[round] = { choice, correct, at: new Date().toISOString() };
  db.prepare('UPDATE trails SET answers=? WHERE token=?').run(JSON.stringify(arr), t.token);
  const answered = arr.filter(Boolean).length;
  res.json({ correct, finished: answered >= rounds.length });
});

app.post('/api/trail/:token/unlock', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const { code } = req.body || {};
  // codes are stored as scrypt hashes (unlock_hash); legacy plaintext rows
  // were migrated at boot and verifyCode still accepts them as a fallback
  if (verifyCode(code || '', t.unlock_hash || t.unlock_code)) {
    db.prepare('UPDATE trails SET unlocked=1 WHERE token=?').run(t.token);
    const gift = getGift(t.gift_id);
    logEvent(gift?.id ?? null, t.token, 'unlocked', null);
    return res.json({
      unlocked: true,
      keepsake: {
        throughline: gift?.throughline || null,
        placeGuess: gift?.place_guess || null,
        message: 'The hunt is done. What you found was only ever yours.',
      },
    });
  }
  res.json({ unlocked: false });
});

app.post('/api/trail/:token/event', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  logEvent(t.gift_id, t.token, req.body?.name, req.body?.data);
  res.json({ ok: true });
});

// token-scoped photo — the recipient only ever holds the trail token
app.get('/api/trail/:token/photo/:i', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const g = getGift(t.gift_id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const i = Math.max(0, Math.min(11, parseInt(req.params.i, 10) || 0));
  const files = photoFiles(g.id);
  if (i >= files.length) return res.status(404).json({ error: 'no photo' });
  res.sendFile(join(UPLOADS_DIR, g.id, files[i]), {
    headers: { 'Cache-Control': 'private, max-age=86400' },
  });
});

// original photo (sorted index) — serves crops to both buyer editor and trail
app.get('/api/photo/:giftId/:i', (req, res) => {
  const g = getGift(req.params.giftId);
  if (!g) return res.status(404).json({ error: 'not found' });
  const i = Math.max(0, Math.min(11, parseInt(req.params.i, 10) || 0));
  const files = photoFiles(g.id);
  if (i >= files.length) return res.status(404).json({ error: 'no photo' });
  res.sendFile(join(UPLOADS_DIR, g.id, files[i]));
});

// ---------- the 3D world of the place ----------
// Keyed by trail token — the recipient only holds the token, not the gift id.
// world-status is a cheap poll; /world streams the GLB once the build is done.

app.get('/api/trail/:token/world-status', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const g = getGift(t.gift_id);
  res.json({ worldStatus: g?.world_status ?? 'pending' });
});

app.get('/api/trail/:token/world', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const g = getGift(t.gift_id);
  // self-heal a stale 'worlding' (the machine that was building it is gone)
  if (g && g.world_status === 'worlding' && !g.world_file) {
    const started = g.world_started_at ? Date.parse(g.world_started_at) : NaN;
    if (Number.isNaN(started) || Date.now() - started > 10 * 60 * 1000) {
      startWorldBuild(g.id);
    }
  }
  if (!g || g.world_status !== 'ready' || !g.world_file) {
    // still building — the client keeps polling world-status
    return res.status(202).json({ worldStatus: g?.world_status ?? 'building' });
  }
  if (!existsSync(g.world_file)) {
    // status says ready but the file is gone (volume reset) — rebuild
    startWorldBuild(g.id);
    return res.status(202).json({ worldStatus: 'rebuilding' });
  }
  res.sendFile(g.world_file, {
    headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'private, max-age=86400' },
  });
});

// the keepsake portrait — streams the painted "portrait of the place" once
// the seal-time build has finished. Best-effort: 202 while it's painting.
app.get('/api/trail/:token/portrait', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const g = getGift(t.gift_id);
  // self-heal a stale 'painting' (the machine that was painting it is gone)
  if (g && g.portrait_status === 'painting' && !g.portrait_file) {
    const started = g.portrait_started_at ? Date.parse(g.portrait_started_at) : NaN;
    if (Number.isNaN(started) || Date.now() - started > 10 * 60 * 1000) {
      startPortraitBuild(g.id);
    }
  }
  if (!g || g.portrait_status !== 'ready' || !g.portrait_file) {
    return res.status(202).json({ portraitStatus: g?.portrait_status ?? 'pending' });
  }
  if (!existsSync(g.portrait_file)) {
    startPortraitBuild(g.id);
    return res.status(202).json({ portraitStatus: 'rebuilding' });
  }
  res.sendFile(g.portrait_file, {
    headers: { 'Content-Type': portraitMime(g.portrait_file), 'Cache-Control': 'private, max-age=86400' },
  });
});

// ---------- static (prod: server hosts the build) ----------
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback for deep links like /?t=token — keep /api/* and /api/photo/* off
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')));
}

// ---------- housekeeping: purge unsealed drafts older than 7 days ----------
// Drafts cost vision money at upload; anything never sealed is abandoned.
function purgeStaleDrafts() {
  try {
    const stale = db
      .prepare("SELECT id FROM gifts WHERE status IN ('reading','ready','error') AND created_at < datetime('now', '-7 days')")
      .all();
    for (const g of stale) {
      db.prepare('DELETE FROM observations WHERE gift_id=?').run(g.id);
      db.prepare('DELETE FROM clues WHERE gift_id=?').run(g.id);
      db.prepare('DELETE FROM hide_spots WHERE gift_id=?').run(g.id);
      db.prepare('DELETE FROM trails WHERE gift_id=?').run(g.id);
      db.prepare('DELETE FROM gifts WHERE id=?').run(g.id);
      try { rmSync(join(UPLOADS_DIR, g.id), { recursive: true, force: true }); } catch {}
    }
    if (stale.length) console.log(`[purge] removed ${stale.length} stale draft(s)`);
  } catch (e) {
    console.error('[purge] failed:', e.message);
  }
}
purgeStaleDrafts();
setInterval(purgeStaleDrafts, 6 * 60 * 60 * 1000).unref?.();

app.listen(PORT, () => console.log(`[enigmagift-server] http://localhost:${PORT}`));
