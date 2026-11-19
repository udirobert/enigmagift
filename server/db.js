import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
  unlocked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

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
