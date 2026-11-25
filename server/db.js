import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = here;
// Persisted paths can be redirected via env (Fly.io volume mounts at /data).
export const UPLOADS_DIR = process.env.UPLOADS_DIR || join(here, 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || join(here, 'enigmagift.db');
mkdirSync(dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL DEFAULT 'someone',
  status TEXT NOT NULL DEFAULT 'reading',
  photo_count INTEGER NOT NULL DEFAULT 0,
  throughline TEXT,
  place_guess TEXT,
  rounds TEXT,
  hides TEXT,
  paid INTEGER NOT NULL DEFAULT 0,
  delivery_entitled INTEGER NOT NULL DEFAULT 0,
  photos_observed INTEGER NOT NULL DEFAULT 0,
  read_ready_at TEXT,
  world_status TEXT NOT NULL DEFAULT 'pending',
  world_file TEXT,
  world_source INTEGER,
  world_started_at TEXT,
  world_ready_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  photo_index INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clues (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS hide_spots (
  id TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  position INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trails (
  token TEXT PRIMARY KEY,
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  rounds TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '[]',
  unlock_code TEXT NOT NULL,
  unlock_hash TEXT,
  unlocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  purchase_gift_id TEXT NOT NULL REFERENCES gifts(id),
  credits_left INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id TEXT,
  token TEXT,
  name TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_gifts (
  token TEXT PRIMARY KEY,
  manage_hash TEXT NOT NULL UNIQUE,
  room_id TEXT NOT NULL,
  room_revision TEXT NOT NULL,
  edition_json TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS photo_gifts (
  token TEXT PRIMARY KEY,
  manage_hash TEXT NOT NULL UNIQUE,
  edition_json TEXT,
  image BLOB,
  image_width INTEGER,
  image_height INTEGER,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
`);

/* Unlock codes: stored as scrypt hashes, never plaintext. The legacy
   unlock_code column stays (NOT NULL) but is emptied once hashed. */
export function hashCode(code) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(code).trim().toUpperCase(), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyCode(code, stored) {
  if (!stored || typeof code !== 'string') return false;
  const norm = code.trim().toUpperCase();
  if (stored.startsWith('scrypt$')) {
    const [, salt, hash] = stored.split('$');
    const calc = crypto.scryptSync(norm, salt, 32);
    const ref = Buffer.from(hash, 'hex');
    return calc.length === ref.length && crypto.timingSafeEqual(calc, ref);
  }
  // legacy plaintext row that predates hashing (shouldn't happen post-migration)
  return norm === String(stored).trim().toUpperCase();
}

// Lightweight migration — add the world columns if an older DB is missing
// them (CREATE TABLE IF NOT EXISTS does not alter existing tables).
function addColumnIfMissing(table, col, def) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  } catch {
    // "duplicate column name" — already there; ignore
  }
}
addColumnIfMissing('gifts', 'world_status', "TEXT NOT NULL DEFAULT 'pending'");
addColumnIfMissing('gifts', 'world_file', 'TEXT');
addColumnIfMissing('gifts', 'world_started_at', 'TEXT');
addColumnIfMissing('gifts', 'photos_observed', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('gifts', 'read_ready_at', 'TEXT');
addColumnIfMissing('gifts', 'world_source', 'INTEGER');
addColumnIfMissing('gifts', 'world_ready_at', 'TEXT');
addColumnIfMissing('gifts', 'portrait_status', "TEXT NOT NULL DEFAULT 'pending'");
addColumnIfMissing('gifts', 'portrait_file', 'TEXT');
addColumnIfMissing('gifts', 'portrait_started_at', 'TEXT');
addColumnIfMissing('gifts', 'delivery_entitled', 'INTEGER NOT NULL DEFAULT 0');
// tier/mode (Trail £4.99 digital default · Hide £9.99 physical · Set £19 pack)
addColumnIfMissing('gifts', 'mode', "TEXT NOT NULL DEFAULT 'physical'");
addColumnIfMissing('gifts', 'tier', 'TEXT');
addColumnIfMissing('gifts', 'pack_id', 'TEXT');
// Backfill existing entitlement separately from revenue analytics: direct Stripe
// payments are paid=1; pack children were entitled when their credit was consumed.
db.exec(`
UPDATE gifts SET delivery_entitled=1 WHERE paid=1;
UPDATE gifts SET delivery_entitled=1
WHERE pack_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM packs
    WHERE packs.id = gifts.pack_id
      AND packs.purchase_gift_id != gifts.id
  );
`);
addColumnIfMissing('gifts', 'reclue_count', 'INTEGER NOT NULL DEFAULT 0');
// the giver's own words — the letter the recipient reads at the reveal
addColumnIfMissing('gifts', 'message', 'TEXT');
addColumnIfMissing('gifts', 'signature', 'TEXT');
addColumnIfMissing('trails', 'unlock_hash', 'TEXT');
addColumnIfMissing('trails', 'expires_at', 'TEXT');
// scheduled send — the trail row exists but does not open until send_at passes
addColumnIfMissing('trails', 'send_at', 'TEXT');
// Phase 4 — the Hide fallback: after this date the keepsake opens without the
// code ("if I don't hide it, open it on <date>"). Null = code is the only key.
addColumnIfMissing('trails', 'fallback_at', 'TEXT');
// referral — the trail token whose recipient's note-back led to this gift
addColumnIfMissing('gifts', 'referred_by', 'TEXT');
// Phase 1b — delivery and recovery: the buyer's email (transactional only,
// deleted with the gift) and the checkout intent that survives a lost tab.
addColumnIfMissing('gifts', 'buyer_email', 'TEXT');
addColumnIfMissing('gifts', 'email_sent_at', 'TEXT');
addColumnIfMissing('gifts', 'checkout_intent', 'TEXT'); // JSON: {sessionId, tier, startedAt}

// Indexes on every gift_id foreign-key lookup — without these each is a table
// scan (fine at tiny scale, free to fix, and the events table grows forever).
db.exec(`
CREATE INDEX IF NOT EXISTS idx_observations_gift ON observations(gift_id);
CREATE INDEX IF NOT EXISTS idx_clues_gift ON clues(gift_id);
CREATE INDEX IF NOT EXISTS idx_hide_spots_gift ON hide_spots(gift_id);
CREATE INDEX IF NOT EXISTS idx_trails_gift ON trails(gift_id);
CREATE INDEX IF NOT EXISTS idx_events_gift ON events(gift_id);
`);

// One-time migration: hash any legacy plaintext unlock codes, then clear the
// plaintext. The codes still verify (the hash is derived from them).
try {
  const legacy = db
    .prepare('SELECT token, unlock_code FROM trails WHERE unlock_hash IS NULL AND unlock_code != \'\'')
    .all();
  for (const row of legacy) {
    db.prepare('UPDATE trails SET unlock_hash=?, unlock_code=\'\' WHERE token=?')
      .run(hashCode(row.unlock_code), row.token);
  }
  if (legacy.length) console.log(`[db] hashed ${legacy.length} legacy unlock codes`);
} catch (e) {
  console.error('[db] unlock-code migration failed:', e.message);
}
