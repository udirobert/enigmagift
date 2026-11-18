import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import { join, dirname } from 'node:path';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR } from './db.js';
import { runPipeline } from './pipeline.js';
import { buildWorld } from './world.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, '..', 'dist');

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors({ origin: true })); // open CORS — tighten to deployed domain later
app.use(express.json({ limit: '1mb' }));

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
    createdAt: g.created_at,
  };
}

function safeParse(s) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { return {}; }
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
    photoUrls: files.map((_, i) => photoUrl(gift.id, i)),
    throughline: gift?.throughline ?? null,
    placeGuess: gift?.place_guess ?? null,
    unlocked: !!t.unlocked,
    // the 3D world of the place — built after sealing; the recipient can
    // orbit it in the reveal and keep a copy
    worldStatus: gift?.world_status ?? 'pending',
    worldUrl: gift?.world_status === 'ready' ? `/api/trail/${t.token}/world` : null,
  };
}

// ---------- routes ----------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/gifts', (req, res) => {
  req.giftId = crypto.randomUUID();
  upload.array('photos', 12)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const files = req.files || [];
    if (files.length < 5) return res.status(400).json({ error: 'Need 5-12 photos' });
    if (files.length > 12) return res.status(400).json({ error: 'Max 12 photos' });
    const direction = req.body?.direction === 'me' ? 'me' : 'someone';
    db.prepare('INSERT INTO gifts (id, direction, status, photo_count) VALUES (?,?,?,?)')
      .run(req.giftId, direction, 'reading', files.length);
    // async pipeline — do not await
    runPipeline(req.giftId).catch((e) => {
      console.error(`[pipeline ${req.giftId}] fatal:`, e);
      try { db.prepare("UPDATE gifts SET status='error' WHERE id=?").run(req.giftId); } catch {}
    });
    res.status(201).json({ giftId: req.giftId, status: 'reading' });
  });
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
  db.prepare('INSERT INTO trails (token, gift_id, rounds, unlock_code) VALUES (?,?,?,?)')
    .run(token, g.id, JSON.stringify(rounds), unlockCode);
  if (g.status !== 'paid') {
    db.prepare("UPDATE gifts SET status='sealed' WHERE id=?").run(g.id);
  }
  // the recipient's payoff: build the 3D world of their place now, while they
  // follow the trail. Non-blocking — the reveal polls for it.
  startWorldBuild(g.id);
  res.json({
    trailToken: token,
    trailUrl: `/t/${token}`,
    unlockCode, // the buyer writes this into the hidden thing
  });
});

app.post('/api/gifts/:id/mark-paid', (req, res) => {
  const g = getGift(req.params.id);
  if (!g) return res.status(404).json({ error: 'not found' });
  // MVP: frontend calls this on Stripe Payment Link return (client_reference_id = gift id).
  // A real webhook with signature verification is deferred.
  const sessionId = req.body?.sessionId || null;
  db.prepare('UPDATE gifts SET paid=1, status=CASE WHEN status=\'sealed\' THEN \'paid\' ELSE status END WHERE id=?').run(g.id);
  res.json({ ok: true, paid: true });
});

// ---------- trail ----------

function getTrail(token) {
  return db.prepare('SELECT * FROM trails WHERE token=?').get(token);
}

app.get('/api/trail/:token', (req, res) => {
  const t = getTrail(req.params.token);
  if (!t) return res.status(404).json({ error: 'not found' });
  const gift = getGift(t.gift_id);
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
  // MVP: unlock code stored plaintext — hash (e.g. scrypt) before launch.
  if (typeof code === 'string' && code.trim().toUpperCase() === t.unlock_code) {
    db.prepare('UPDATE trails SET unlocked=1 WHERE token=?').run(t.token);
    const gift = getGift(t.gift_id);
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

// ---------- static (prod: server hosts the build) ----------
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback for deep links like /?t=token — keep /api/* and /api/photo/* off
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(DIST, 'index.html')));
}

app.listen(PORT, () => console.log(`[enigmagift-server] http://localhost:${PORT}`));
