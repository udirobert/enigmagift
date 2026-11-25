import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { join, dirname } from 'node:path';
import { mkdirSync, existsSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR, hashCode, verifyCode } from './db.js';
import { runPipeline, reclue, giftLetterDrafts } from './pipeline.js';
import { buildWorld } from './world.js';
import { buildPortrait, portraitMime } from './portrait.js';
import { stripExif } from './exif.js';
import { isEmail, sendGiftLink, sendLookup } from './mailer.js';
import { mountRoomGiftRoutes } from './room-gifts.js';
import { mountPhotoGiftRoutes } from './photo-gifts.js';

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
  'https://tabletop-letter--enigmagift.netlify.app',
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Security headers on every response (the API also serves the SPA in prod).
// CSP mirrors what the Pages `_headers` file sets; picsum is demo-only imagery,
// Google Fonts is the typeface, and the API origin is allowed for direct
// VITE_API_URL deploys (the normal Pages path is same-origin /api).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://picsum.photos",
      "media-src 'self' blob:",
      'connect-src \'self\' blob: https://enigmagift-api.fly.dev',
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

// API responses are private by default — never let a shared cache store them.
// Asset routes (photos, world, portrait) override this at send time with their
// own `private, max-age=86400` policy via res.sendFile headers.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Stripe webhook needs the raw body for signature verification — mount raw
// parsing for that path BEFORE the JSON parser.
app.use('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Tiny in-memory rate limiter (per key, sliding window), with a hard bound on
// the number of tracked keys so a flood of distinct IPs can't grow it forever.
const rlBuckets = new Map();
const RL_MAX_KEYS = 20000;
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  if (rlBuckets.size >= RL_MAX_KEYS) {
    const drop = Math.floor(RL_MAX_KEYS / 4);
    let i = 0;
    for (const k of rlBuckets.keys()) {
      if (i++ >= drop) break;
      rlBuckets.delete(k);
    }
  }
  const arr = (rlBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  rlBuckets.set(key, arr);
  return true;
}

/** Rate-limit helper for route handlers — returns true (and sends 429) when limited. */
function limitOr429(res, key, max, windowMs) {
  if (rateLimit(key, max, windowMs)) return false;
  res.status(429).json({ error: 'too many requests — slow down' });
  return true;
}

// Tier → accepted Stripe amount (in pence), shared by the webhook and the
// mark-paid verification path. A null tier is a legacy physical gift (priced
// like The Hide); an unknown non-null tier is rejected. The £1 referral
// discount is only accepted when the gift carries a recorded referral —
// promo codes must be configured separately in Stripe.
const TIER_PRICE_PENCE = {
  trail: 499,
  hide: 999,
  set: 1900,
};

function validGiftPayment(gift, session) {
  const fullPrice =
    TIER_PRICE_PENCE[gift.tier] ??
    (gift.tier == null ? TIER_PRICE_PENCE.hide : null);
  return (
    fullPrice != null &&
    session.payment_status === 'paid' &&
    session.currency === 'gbp' &&
    (session.amount_total === fullPrice ||
      (!!gift.referred_by && session.amount_total === fullPrice - 100))
  );
}

// EXIF stripping lives in exif.js (imported below) so it can be unit-tested.

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
    // the giver's own words — empty until they write the letter
    message: g.message ?? null,
    signature: g.signature ?? null,
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

// The Set is a pack of three hunts, and the pack row is minted when the money
// lands rather than at creation — so EVERY payment path has to call this, and
// the gift may only ever own one pack. Idempotent: the guarded INSERT fires
// only for a set gift with no pack yet, inside one immediate transaction so a
// webhook racing the verified mark-paid path cannot mint two packs.
function ensureSetPack(giftId) {
  const packId = crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    const minted = db.prepare(
      `INSERT INTO packs (id, purchase_gift_id, credits_left)
       SELECT ?, id, 3 FROM gifts WHERE id=? AND tier='set' AND pack_id IS NULL`,
    ).run(packId, giftId).changes;
    if (!minted) {
      db.exec('ROLLBACK');
      return null;
    }
    db.prepare('UPDATE gifts SET pack_id=? WHERE id=?').run(packId, giftId);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* already unwound */ }
    throw e;
  }
  logEvent(giftId, null, 'pack_created', { packId });
  return packId;
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
  // For The Hide, the recipient needs the destination clue: which hide spot
  // the giver actually used (buyer's hides.current.hideSpotId), else the best
  // pipeline-proposed spot. Never the answer key — just where to look.
  let hideHint = null;
  if (gift && (gift.mode ?? 'physical') === 'physical') {
    const hides = safeParse(gift.hides);
    const spots = db.prepare('SELECT id, data FROM hide_spots WHERE gift_id=? ORDER BY position').all(gift.id);
    const chosenId = hides?.current?.hideSpotId || null;
    const chosen = spots.find((s) => s.id === chosenId) || spots[0] || null;
    if (chosen) {
      const d = safeParse(chosen.data);
      if (d?.description) hideHint = String(d.description);
    }
    if (!hideHint && hides?.current?.hideNote) hideHint = String(hides.current.hideNote).slice(0, 200);
  }
  // digital gifts (The Trail) open the keepsake without a code; the Hide
  // tier keeps the physical code gate
  const requiresCode = (gift?.mode ?? 'physical') === 'physical';
  return {
    token: t.token,
    hideHint,
    // the answer key never leaves the server — /answer checks it
    rounds: safeParse(t.rounds).map((r) => {
      if (!r || typeof r !== 'object') return r;
      const { correct, ...rest } = r;
      return rest;
    }),
    // token-scoped photo URLs — the recipient only ever holds the token
    photoUrls: files.map((_, i) => `/api/trail/${t.token}/photo/${i}`),
    throughline: gift?.throughline ?? null,
    placeGuess: gift?.place_guess ?? null,
    unlocked: !!t.unlocked,
    // the giver's own words — the letter the recipient reads at the reveal.
    // For a digital gift the rounds are the only gate, so it travels with the
    // trail. For The Hide it stays out of the payload until the code unlocks
    // (see /api/trail/:token/unlock) so the physical ending still means something.
    ...(requiresCode ? {} : { message: gift?.message ?? null, signature: gift?.signature ?? null }),
    requiresCode,
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

// Tabletop room-gift pilot links: private recipient links + owner management.
mountRoomGiftRoutes(app, { db, limitOr429 });
mountPhotoGiftRoutes(app, { db, limitOr429 });

function handleGiftCreate(req, res, packIdParam = null) {
  req.giftId = crypto.randomUUID();
  upload.array('photos', 12)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const files = req.files || [];
    if (files.length < 1) return res.status(400).json({ error: 'Need 1-12 photos' });
    if (files.length > 12) return res.status(400).json({ error: 'Max 12 photos' });
    // strip EXIF (GPS etc.) from stored copies before anything reads them
    for (const f of files) {
      try {
        const p = join(UPLOADS_DIR, req.giftId, f.filename);
        const orig = readFileSync(p);
        const stripped = stripExif(orig);
        if (!stripped.equals(orig)) writeFileSync(p, stripped);
      } catch { /* best-effort */ }
    }
    const direction = req.body?.direction === 'me' ? 'me' : 'someone';
    // digital-first: The Trail (digital) is the default; The Hide is physical.
    const mode = req.body?.mode === 'physical' ? 'physical' : 'digital';
    const tier = ['trail', 'hide', 'set'].includes(req.body?.tier) ? req.body.tier : null;
    // packId comes from the route (/api/packs/:id/gifts) or the multipart body
    const packId = packIdParam ?? (typeof req.body?.packId === 'string' && req.body.packId ? req.body.packId : null);
    if (packId) {
      const pack = db.prepare('SELECT * FROM packs WHERE id=?').get(packId);
      if (!pack) return res.status(404).json({ error: 'pack not found' });
      if ((pack.credits_left || 0) < 1) return res.status(409).json({ error: 'pack has no hunts left' });
      db.prepare('UPDATE packs SET credits_left = credits_left - 1 WHERE id=?').run(packId);
    }
    // referral — optional multipart `ref` field carrying a source trail token
    // (frontend forwarding is not implemented; the field exists for direct
    // API use). The ref is a trail token: scoped, revocable, and never the
    // giver's gift id. Unknown, expired, revoked or not-yet-live (scheduled)
    // refs are ignored — never a hard error.
    const ref = typeof req.body?.ref === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(req.body.ref)
      ? req.body.ref
      : null;
    const referredBy = ref && liveTrail(ref) ? ref : null;
    db.prepare('INSERT INTO gifts (id, direction, status, photo_count, mode, tier, pack_id, referred_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.giftId, direction, 'reading', files.length, mode, tier, packId, referredBy);
    logEvent(req.giftId, null, 'uploaded', { photos: files.length, mode, tier, referred: !!referredBy });
    if (referredBy) {
      logEvent(req.giftId, null, 'referred', { ref: referredBy });
      // the source owner sees the conversion — never the destination gift id:
      // the overview returns event data to the source owner, and the new gift
      // id is the destination owner's delete/edit capability
      const source = liveTrail(referredBy);
      if (source) logEvent(source.gift_id, source.token, 'referred_conversion', null);
    }
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
  // packId in the multipart body is honoured inside handleGiftCreate (multer
  // parses the body there); the pack route passes it as a param instead
  handleGiftCreate(req, res, null);
});

app.get('/api/gifts/:id', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  res.json(giftPayload(g));
});

// Giver dashboard overview — the gift id is the bearer capability (same trust
// model as GET /api/gifts/:id). Deliberately excludes clues/rounds/answers/
// unlock hashes: this payload is for status, link management and the event
// feed, never for the answer key.
app.get('/api/gifts/:id/overview', (req, res) => {
  if (limitOr429(res, `overview:${req.params.id}`, 30, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const trail = db
    .prepare('SELECT token, unlocked, expires_at, send_at, created_at FROM trails WHERE gift_id=?')
    .get(g.id);
  const pack = g.pack_id
    ? db.prepare('SELECT id, credits_left FROM packs WHERE id=?').get(g.pack_id)
    : db.prepare('SELECT id, credits_left FROM packs WHERE purchase_gift_id=?').get(g.id);
  const events = db
    .prepare('SELECT name, data, created_at FROM events WHERE gift_id=? ORDER BY id DESC LIMIT 100')
    .all(g.id)
    .map((e) => ({ name: e.name, data: safeParse(e.data), at: e.created_at }));
  // recipient progress, derived from the funnel events
  const picks = [];
  let shared = null;
  let opened = 0;
  let unlockedEvent = false;
  for (const e of events) {
    const m = e.name.match(/^round_(\d+)_picked$/);
    if (m && e.data) {
      picks.push({
        round: Number(m[1]),
        correct: !!e.data.correct,
        attempts: Number(e.data.attempts ?? 1),
      });
    } else if (e.name === 'shared_back') {
      shared = e.data || {};
    } else if (e.name === 'opened') {
      opened += 1;
    } else if (e.name === 'unlocked') {
      unlockedEvent = true;
    }
  }
  res.json({
    gift: {
      id: g.id,
      status: g.status,
      direction: g.direction,
      tier: g.tier ?? null,
      mode: g.mode ?? 'physical',
      paid: !!g.paid,
      photoCount: g.photo_count,
      worldStatus: g.world_status ?? 'pending',
      portraitStatus: g.portrait_status ?? 'pending',
      packId: g.pack_id ?? null,
      // has the giver written their own letter yet? (never the words themselves
      // — the dashboard payload stays free of recipient-facing content)
      hasLetter: !!g.message,
      referredBy: g.referred_by ?? null,
      createdAt: g.created_at,
    },
    trail: trail
      ? {
          token: trail.token,
          url: `/t/${trail.token}`,
          unlocked: !!trail.unlocked,
          expiresAt: trail.expires_at ?? null,
          sendAt: trail.send_at ?? null,
          scheduled: !!(trail.send_at && new Date(trail.send_at).getTime() > Date.now()),
          createdAt: trail.created_at,
        }
      : null,
    pack: pack ? { id: pack.id, creditsLeft: pack.credits_left } : null,
    stats: {
      opened,
      picks: picks.reverse(), // chronological
      sharedBack: !!shared,
      looks: shared?.looks ?? null,
      mins: shared?.mins ?? null,
      unlocked: !!trail?.unlocked || unlockedEvent,
    },
    events: events.reverse(), // chronological, latest at the end
  });
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

// ---------- the giver's letter (their own words, read at the reveal) ----------
const MAX_LETTER = 1200;
const MAX_SIGNATURE = 60;

// Editable until the gift is sealed. Once a trail link exists the recipient
// may already hold it, so the words are locked (delete and remake to change).
function letterLocked(g) {
  if (!g) return false;
  if (g.status === 'sealed') return true;
  return !!db.prepare('SELECT 1 FROM trails WHERE gift_id=?').get(g.id);
}

app.patch('/api/gifts/:id/letter', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (letterLocked(g)) return res.status(409).json({ error: 'this gift is already sealed' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, MAX_LETTER) : '';
  const signature = typeof req.body?.signature === 'string' ? req.body.signature.trim().slice(0, MAX_SIGNATURE) : '';
  if (message.length < 20) return res.status(400).json({ error: 'the letter needs a few more words' });
  db.prepare('UPDATE gifts SET message=?, signature=? WHERE id=?').run(message, signature || null, g.id);
  logEvent(g.id, null, 'letter_written', { chars: message.length, signed: !!signature });
  res.json(giftPayload(getGift(g.id)));
});

// Three opening drafts from the observations — the giver edits or ignores
// them. Bounded: this is a paid model call on an unsealed draft.
app.post('/api/gifts/:id/letter-drafts', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (!limitOr429(res, `letter:${g.id}`, 6, 60 * 60 * 1000)) return;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : '';
  giftLetterDrafts(g.id, notes)
    .then((drafts) => {
      logEvent(g.id, null, 'letter_drafts', { count: drafts.length });
      res.json({ drafts });
    })
    .catch((e) => {
      res.status(e.status || 500).json({ error: e.message || 'could not write drafts' });
    });
});

app.post('/api/gifts/:id/world-source', (req, res) => {
  if (limitOr429(res, `worldsource:${req.params.id}`, 10, 60 * 60 * 1000)) return;
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

// Change tier pre-seal (the upsell swaps the payment link and mode before
// anything is sealed/paid; the till uses the same route, so a buyer who only
// decides at the end can still buy The Set). Sealed/paid gifts are immutable.
const TIERS = ['trail', 'hide', 'set'];

app.patch('/api/gifts/:id/tier', (req, res) => {
  if (limitOr429(res, `tier:${req.params.id}`, 10, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (g.status === 'sealed' || g.status === 'paid') {
    return res.status(409).json({ error: 'already sealed — tier is locked' });
  }
  const tier = TIERS.includes(req.body?.tier) ? req.body.tier : null;
  if (!tier) return res.status(400).json({ error: 'tier must be trail|hide|set' });
  // A hunt spawned from a pack was already paid for inside that pack — letting
  // it become a set purchase would sell the same pack twice, and it owns no
  // pack of its own to mint.
  if (tier === 'set' && g.pack_id) {
    return res.status(409).json({ error: 'this hunt came from a set — it cannot become one' });
  }
  // The Set is digital: the two extra hunts choose their own mode when they are
  // made. Only a physical trail/hide carries the hide-and-code mode.
  const mode = tier !== 'set' && req.body?.mode === 'physical' ? 'physical' : 'digital';
  db.prepare('UPDATE gifts SET tier=?, mode=? WHERE id=?').run(tier, mode, g.id);
  logEvent(g.id, null, 'tier_changed', { tier, mode });
  res.json({ ok: true, tier, mode });
});

app.post('/api/gifts/:id/event', (req, res) => {
  if (limitOr429(res, `event:${req.ip}`, 240, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 64) : 'event';
  logEvent(g.id, null, name, req.body?.data);
  res.json({ ok: true });
});

app.delete('/api/gifts/:id', (req, res) => {
  if (limitOr429(res, `delete:${req.ip}`, 10, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  // delete the gift, its trail(s), derived rows and uploaded files
  db.prepare('DELETE FROM observations WHERE gift_id=?').run(g.id);
  db.prepare('DELETE FROM clues WHERE gift_id=?').run(g.id);
  db.prepare('DELETE FROM hide_spots WHERE gift_id=?').run(g.id);
  db.prepare('DELETE FROM trails WHERE gift_id=?').run(g.id);
  // a Set purchase gift owns a pack row (FK) — remove it, and detach any
  // child hunts that were spawned from that pack
  db.prepare('UPDATE gifts SET pack_id=NULL WHERE pack_id IN (SELECT id FROM packs WHERE purchase_gift_id=?)').run(g.id);
  db.prepare('DELETE FROM packs WHERE purchase_gift_id=?').run(g.id);
  db.prepare('DELETE FROM gifts WHERE id=?').run(g.id);
  try { rmSync(join(UPLOADS_DIR, g.id), { recursive: true, force: true }); } catch {}
  logEvent(g.id, null, 'deleted', { status: g.status });
  // erasure means erasure — no event rows left behind for a deleted gift
  db.prepare('DELETE FROM events WHERE gift_id=?').run(g.id);
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
  if (limitOr429(res, `hide:${req.params.id}`, 30, 60 * 60 * 1000)) return;
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
  if (limitOr429(res, `seal:${req.params.id}`, 20, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  if (g.status === 'reading') return res.status(409).json({ error: 'still reading' });
  // idempotent: return existing trail if already sealed
  const existing = db.prepare('SELECT token, unlock_code, send_at FROM trails WHERE gift_id=?').get(g.id);
  if (existing) {
    // sealing is idempotent, but the world build may not have started yet.
    // NB: unlock_code is stored hashed ('' post-migration) — the plaintext is
    // only ever returned by the FIRST seal, so return null here, not ''.
    startWorldBuild(g.id);
    startPortraitBuild(g.id);
    return res.json({
      trailToken: existing.token,
      trailUrl: `/t/${existing.token}`,
      unlockCode: existing.unlock_code || null,
      sendAt: existing.send_at ?? null,
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
  const now = Date.now();
  // optional scheduled availability — the link is issued now but does not
  // open until send_at passes (enforced at read time in liveTrail; with
  // Phase 1b the email arrives on the scheduled morning). Bounded: must be a
  // future date, at most a year out.
  // Phase 1b — the buyer's email, captured at seal. Transactional only: used
  // to deliver the link, power /api/lookup recovery, and schedule the send.
  // Deleted with the gift (see DELETE /api/gifts/:id and purgeStaleDrafts).
  const buyerEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (buyerEmail && !isEmail(buyerEmail)) {
    return res.status(400).json({ error: 'that email doesn’t look right' });
  }
  if (buyerEmail && buyerEmail !== g.buyer_email) {
    db.prepare('UPDATE gifts SET buyer_email=? WHERE id=?').run(buyerEmail, g.id);
    g.buyer_email = buyerEmail;
  }
  const requestedSendAt = req.body?.sendAt;
  let sendAt = null;
  if (requestedSendAt != null && requestedSendAt !== '') {
    const timestamp = typeof requestedSendAt === 'string' ? Date.parse(requestedSendAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= now || timestamp > now + 366 * 86400000) {
      return res.status(400).json({ error: 'sendAt must be a future date within a year' });
    }
    sendAt = new Date(timestamp).toISOString();
  }
  // optional link expiry (days) chosen by the buyer — 0/absent = never
  // expires. For a scheduled link the countdown starts when it opens, not at
  // seal time.
  const expireDays = parseInt(req.body?.expireDays, 10);
  const expiresAt = Number.isInteger(expireDays) && expireDays > 0
    ? new Date((sendAt ? Date.parse(sendAt) : now) + expireDays * 86400000).toISOString()
    : null;
  // Phase 4 — the Hide fallback: the giver promises an "open anyway" date in
  // case the thing never gets hidden. Bounded like sendAt.
  const requestedFallback = req.body?.fallbackAt;
  let fallbackAt = null;
  if (requestedFallback != null && requestedFallback !== '') {
    const ts = Date.parse(typeof requestedFallback === 'string' ? requestedFallback : '');
    if (!Number.isFinite(ts) || ts <= now || ts > now + 366 * 86400000) {
      return res.status(400).json({ error: 'fallbackAt must be a future date within a year' });
    }
    fallbackAt = new Date(ts).toISOString();
  }
  // the code is stored as a scrypt hash only — the plaintext exists solely in
  // the response so the buyer can write it into the hidden thing (Hide tier)
  db.prepare('INSERT INTO trails (token, gift_id, rounds, unlock_code, unlock_hash, expires_at, send_at, fallback_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(token, g.id, JSON.stringify(rounds), '', hashCode(unlockCode), expiresAt, sendAt, fallbackAt);
  if (g.status !== 'paid') {
    db.prepare("UPDATE gifts SET status='sealed' WHERE id=?").run(g.id);
  }
  logEvent(g.id, token, 'sealed', { mode: g.mode, tier: g.tier, scheduled: !!sendAt, emailed: !!g.buyer_email });
  // deliver immediately unless scheduled — the scheduler picks up the rest
  void deliverGiftLink(g.id);
  // the recipient's payoff: build the 3D world of their place now, while they
  // follow the trail. Non-blocking — the reveal polls for it. Same for the
  // keepsake portrait (best-effort — needs RECRAFT_API_KEY, API units).
  startWorldBuild(g.id);
  startPortraitBuild(g.id);
  res.json({
    trailToken: token,
    trailUrl: `/t/${token}`,
    unlockCode, // the buyer writes this into the hidden thing
    expiresAt,
    sendAt,
    fallbackAt,
  });
});

// Revoke the recipient link (buyer-side, gift-id scoped) — the trail token
// stops resolving immediately. Photos stay with the buyer's editor.
app.post('/api/gifts/:id/revoke', (req, res) => {
  if (limitOr429(res, `revoke:${req.params.id}`, 10, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  const t = db.prepare('SELECT token FROM trails WHERE gift_id=?').get(g.id);
  db.prepare('DELETE FROM trails WHERE gift_id=?').run(g.id);
  logEvent(g.id, t?.token ?? null, 'revoked', null);
  res.json({ ok: true, revoked: !!t });
});

app.post('/api/gifts/:id/mark-paid', async (req, res) => {
  if (limitOr429(res, `markpaid:${req.params.id}`, 20, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  // Called on the Stripe Payment Link return (client_reference_id = gift id).
  // The webhook is the source of truth for `paid`; this endpoint only sets it
  // when the checkout session can be verified server-side (STRIPE_API_KEY).
  // Without the key it FAILS CLOSED — a client-side claim is never enough.
  const sessionId = req.body?.sessionId || null;
  if (sessionId && process.env.STRIPE_API_KEY) {
    try {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_API_KEY}` },
      });
      if (r.ok) {
        const s = await r.json();
        if (s.client_reference_id === g.id && validGiftPayment(g, s)) {
          db.prepare('UPDATE gifts SET paid=1, status=CASE WHEN status=\'sealed\' THEN \'paid\' ELSE status END WHERE id=?').run(g.id);
          logEvent(g.id, null, 'paid', { tier: g.tier, verified: true });
          // the pack is owed the moment the money is verified — the webhook may
          // never arrive (unset secret, lost delivery), so don't wait for it
          ensureSetPack(g.id);
          return res.json({ ok: true, paid: true, verified: true });
        }
        return res.status(402).json({ ok: false, paid: false, error: 'session payment does not match gift' });
      }
    } catch (e) {
      console.error(`[mark-paid ${g.id}] stripe verify failed:`, e.message);
    }
  }
  // No key (or verification failed): report pending — only the signed webhook
  // can mark the gift paid.
  logEvent(g.id, null, 'markpaid_pending', { hasSession: !!sessionId });
  res.json({ ok: true, paid: !!g.paid, pending: !g.paid });
});

// ---------- Phase 1b — delivery, scheduling, recovery ----------

/** Send the gift-link email once. Idempotent via email_sent_at; never throws
 * (a failed send must not break sealing — the scheduler retries). */
async function deliverGiftLink(giftId) {
  const g = getGift(giftId);
  if (!g || !g.buyer_email || g.email_sent_at) return;
  const t = db.prepare('SELECT token, send_at FROM trails WHERE gift_id=?').get(giftId);
  if (!t) return;
  try {
    await sendGiftLink(g.buyer_email, {
      trailUrl: `/t/${t.token}`,
      direction: g.direction,
      sendAt: t.send_at,
  });
    db.prepare("UPDATE gifts SET email_sent_at=datetime('now') WHERE id=?").run(giftId);
    logEvent(giftId, t.token, 'email_sent', { scheduled: !!t.send_at });
  } catch (e) {
    console.error(`[deliver ${giftId}]`, e.message);
    logEvent(giftId, t.token, 'email_failed', { error: e.message.slice(0, 120) });
  }
}

/** Every 10 min: send scheduled gifts whose morning has arrived, and retry
 * any gift whose first email attempt failed. */
function deliverDueGifts() {
  try {
    const due = db
      .prepare(
        "SELECT g.id FROM gifts g JOIN trails t ON t.gift_id=g.id WHERE g.buyer_email IS NOT NULL AND g.email_sent_at IS NULL AND g.paid=1 AND (t.send_at IS NULL OR t.send_at <= datetime('now'))",
      )
      .all();
    for (const { id } of due) void deliverGiftLink(id);
    if (due.length) console.log(`[deliver] queued ${due.length} gift email(s)`);
  } catch (e) {
    console.error('[deliver] sweep failed:', e.message);
  }
}
deliverDueGifts();
setInterval(deliverDueGifts, 10 * 60 * 1000).unref?.();

/** GET /api/lookup?email= — mail back every gift owned by this address.
 * No accounts, no passwords: this is the "I paid and lost the tab" path.
 * Always 200 (never leaks whether an address has gifts). */
app.get('/api/lookup', async (req, res) => {
  if (!rateLimit(`lookup:${req.ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'too many lookups — try again in an hour' });
  }
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  if (!isEmail(email)) return res.status(400).json({ error: 'that email doesn’t look right' });
  const gifts = db
    .prepare(
      "SELECT id, status, tier, created_at, (SELECT token FROM trails WHERE gift_id=gifts.id) AS token FROM gifts WHERE buyer_email=? ORDER BY created_at DESC",
    )
    .all(email);
  try {
    await sendLookup(
      email,
      gifts.map((g) => ({ ...g, trailUrl: g.token ? `/t/${g.token}` : null })),
    );
    logEvent(null, null, 'lookup_sent', { count: gifts.length });
  } catch (e) {
    console.error('[lookup]', e.message);
    return res.status(502).json({ error: 'couldn’t send the email — try again' });
  }
  res.json({ ok: true });
});

// Record checkout intent when the Stripe tab opens — ops visibility into
// abandoned payments, and a marker that payment was attempted for this gift.
app.post('/api/gifts/:id/intent', (req, res) => {
  if (limitOr429(res, `intent:${req.params.id}`, 30, 60 * 60 * 1000)) return;
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE gifts SET checkout_intent=? WHERE id=?')
    .run(JSON.stringify({ tier: req.body?.tier ?? g.tier, startedAt: new Date().toISOString() }), g.id);
  logEvent(g.id, null, 'checkout_opened', { tier: g.tier });
  res.json({ ok: true });
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
  // health signal: every verified webhook is recorded, so ops-report can
  // compare Stripe-side deliveries against what actually landed here
  logEvent(null, null, 'webhook_ok', { type: event.type, id: event.id ?? null });
  if (event.type === 'checkout.session.completed') {
    const s = event.data?.object || {};
    const giftId = s.client_reference_id || null;
    const g = giftId ? getGift(giftId) : null;
    if (g) {
      if (!validGiftPayment(g, s)) {
        console.error('[stripe webhook] payment does not match gift', g.id);
        return res.status(400).json({ error: 'payment mismatch' });
      }
      db.prepare('UPDATE gifts SET paid=1, status=CASE WHEN status=\'sealed\' THEN \'paid\' ELSE status END WHERE id=?').run(g.id);
      logEvent(g.id, null, 'paid', { tier: g.tier, via: 'webhook', session: s.id, amount: s.amount_total, referred: !!g.referred_by });
      // the webhook may be the only survivor of a lost tab — deliver here too
      void deliverGiftLink(g.id);
      // a Set payment creates the 3-credit pack (idempotent, shared with the
      // verified mark-paid path so the pack exists whichever lands first)
      ensureSetPack(g.id);
    } else {
      console.warn('[stripe webhook] checkout.session.completed without a known gift:', giftId);
    }
  }
  res.json({ received: true });
});

// ---------- trail ----------

function getTrail(token) {
  const t = db.prepare('SELECT * FROM trails WHERE token=?').get(token);
  // an expired link is as good as revoked
  if (t && t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return null;
  return t;
}

// A scheduled gift exists but is not live yet — every mutating/media route
// must fail closed on it, exactly like a revoked link.
function scheduledUntil(t) {
  return t?.send_at && new Date(t.send_at).getTime() > Date.now() ? t.send_at : null;
}

function liveTrail(token) {
  const t = getTrail(token);
  if (t && scheduledUntil(t)) return null;
  return t;
}

app.get('/api/trail/:token', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  // scheduled send: tell the recipient when it opens instead of leaking rounds
  const soon = scheduledUntil(t);
  if (soon) return res.status(423).json({ error: 'scheduled', sendAt: soon });
  const gift = getGift(t.gift_id);
  logEvent(t.gift_id, t.token, 'opened', null);
  res.json(trailPayload(t, gift));
});

app.post('/api/trail/:token/answer', (req, res) => {
  if (limitOr429(res, `answer:${req.params.token}`, 120, 60 * 60 * 1000)) return;
  const t = liveTrail(req.params.token);
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
  // per-token attempt cap — the 6-char code must not be brute-forceable online
  if (limitOr429(res, `unlock:${req.params.token}`, 10, 60 * 60 * 1000)) return;
  const t = liveTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const { code } = req.body || {};
  // Phase 4 — the giver's fallback: if they set an "open anyway on" date and
  // it has passed, the code is no longer the only key. The most expensive
  // tier must not have the worst failure mode (a giver who never hid it).
  const fallback = t.fallback_at && new Date(t.fallback_at).getTime() <= Date.now();
  // codes are stored as scrypt hashes (unlock_hash); legacy plaintext rows
  // were migrated at boot and verifyCode still accepts them as a fallback
  if (fallback || verifyCode(code || '', t.unlock_hash || t.unlock_code)) {
    db.prepare('UPDATE trails SET unlocked=1 WHERE token=?').run(t.token);
    const gift = getGift(t.gift_id);
    logEvent(gift?.id ?? null, t.token, 'unlocked', { viaFallback: !!fallback && !verifyCode(code || '', t.unlock_hash || t.unlock_code) });
    return res.json({
      unlocked: true,
      viaFallback: !!fallback,
      keepsake: {
        throughline: gift?.throughline || null,
        placeGuess: gift?.place_guess || null,
        // the giver's own words; null when they never wrote a letter, so the
        // client falls back to its older template
        message: gift?.message || null,
        signature: gift?.signature || null,
      },
    });
  }
  res.json({ unlocked: false, fallbackAt: t.fallback_at ?? null });
});

app.post('/api/trail/:token/event', (req, res) => {
  if (limitOr429(res, `event:${req.ip}`, 240, 60 * 60 * 1000)) return;
  const t = liveTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 64) : 'event';
  logEvent(t.gift_id, t.token, name, req.body?.data);
  res.json({ ok: true });
});

// token-scoped photo — the recipient only ever holds the trail token
app.get('/api/trail/:token/photo/:i', (req, res) => {
  const t = liveTrail(req.params.token);
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
  res.sendFile(join(UPLOADS_DIR, g.id, files[i]), {
    headers: { 'Cache-Control': 'private, max-age=86400' },
  });
});

// ---------- the 3D world of the place ----------
// Keyed by trail token — the recipient only holds the token, not the gift id.
// world-status is a cheap poll; /world streams the GLB once the build is done.

app.get('/api/trail/:token/world-status', (req, res) => {
  const t = liveTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const g = getGift(t.gift_id);
  res.json({ worldStatus: g?.world_status ?? 'pending' });
});

app.get('/api/trail/:token/world', (req, res) => {
  const t = liveTrail(req.params.token);
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
  const t = liveTrail(req.params.token);
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
  app.use(
    express.static(DIST, {
      setHeaders(res, filePath) {
        // vite emits content-hashed files under /assets/ — cache them forever;
        // index.html and friends must always revalidate
        if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  // SPA fallback for deep links like /t/token — keep /api/* off
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(DIST, 'index.html'));
  });
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
      db.prepare('DELETE FROM events WHERE gift_id=?').run(g.id);
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
