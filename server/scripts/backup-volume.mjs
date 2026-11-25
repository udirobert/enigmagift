// Create a consistent point-in-time backup of the SQLite database plus the
// uploaded/generated gift files. Designed to run inside the Fly machine, but
// works locally with the same DB_PATH / UPLOADS_DIR environment variables.
import { DatabaseSync } from 'node:sqlite';
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..');
const DB_PATH = resolve(process.env.DB_PATH || join(SERVER, 'enigmagift.db'));
const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR || join(SERVER, 'uploads'));
const BACKUP_ROOT = resolve(process.env.BACKUP_DIR || join(dirname(DB_PATH), 'backups'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const finalDir = join(BACKUP_ROOT, stamp);
const tmpDir = join(BACKUP_ROOT, `.tmp-${stamp}-${process.pid}`);

function sqlQuote(path) {
  return `'${path.replaceAll("'", "''")}'`;
}

function countRows(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
  } catch {
    return null;
  }
}

function dirBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += dirBytes(p);
    else if (entry.isFile()) total += statSync(p).size;
  }
  return total;
}

if (!existsSync(DB_PATH)) {
  console.error(`database not found: ${DB_PATH}`);
  process.exit(1);
}
if (existsSync(finalDir)) {
  console.error(`backup already exists: ${finalDir}`);
  process.exit(1);
}

mkdirSync(tmpDir, { recursive: true });
try {
  const backupDbPath = join(tmpDir, 'enigmagift.db');
  const source = new DatabaseSync(DB_PATH);
  const countsBefore = Object.fromEntries(
    ['gifts', 'trails', 'packs', 'events', 'room_gifts', 'photo_gifts'].map((t) => [t, countRows(source, t)]),
  );
  // VACUUM INTO uses SQLite's own copy machinery, so this is consistent even
  // while the live server has the source database open.
  source.exec(`VACUUM INTO ${sqlQuote(backupDbPath)}`);

  const backupDb = new DatabaseSync(backupDbPath);
  const countsAfter = Object.fromEntries(
    Object.keys(countsBefore).map((t) => [t, countRows(backupDb, t)]),
  );
  backupDb.close();
  source.close();
  for (const [table, before] of Object.entries(countsBefore)) {
    if (before !== countsAfter[table]) {
      throw new Error(`backup verification failed for ${table}: source=${before} backup=${countsAfter[table]}`);
    }
  }

  if (existsSync(UPLOADS_DIR)) {
    cpSync(UPLOADS_DIR, join(tmpDir, 'uploads'), { recursive: true });
  }
  const manifest = {
    createdAt: new Date().toISOString(),
    dbPath: DB_PATH,
    uploadsDir: UPLOADS_DIR,
    tables: countsAfter,
    bytes: {
      database: statSync(backupDbPath).size,
      uploads: dirBytes(join(tmpDir, 'uploads')),
    },
  };
  writeFileSync(join(tmpDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(tmpDir, finalDir);
  console.log(JSON.stringify({ ok: true, backup: finalDir, ...manifest }, null, 2));
} catch (e) {
  rmSync(tmpDir, { recursive: true, force: true });
  console.error(`backup failed: ${e.message}`);
  process.exit(1);
}
