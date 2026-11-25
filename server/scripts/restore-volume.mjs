// Restore a backup made by backup-volume.mjs. This is deliberately explicit:
// it refuses to run without --confirm-restore and preserves the current files
// beside the restored ones instead of deleting them.
//
// Run only when the application server is not using the target database:
//   node scripts/restore-volume.mjs --from /data/backups/<stamp> --confirm-restore
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..');
const args = process.argv.slice(2);
const fromIx = args.indexOf('--from');
const from = fromIx >= 0 ? resolve(args[fromIx + 1] || '') : null;
const confirmed = args.includes('--confirm-restore');
if (!from || !confirmed) {
  console.error('usage: node scripts/restore-volume.mjs --from <backup-dir> --confirm-restore');
  process.exit(2);
}

const DB_PATH = resolve(process.env.DB_PATH || join(SERVER, 'enigmagift.db'));
const UPLOADS_DIR = resolve(process.env.UPLOADS_DIR || join(SERVER, 'uploads'));
const backupDb = join(from, 'enigmagift.db');
const backupUploads = join(from, 'uploads');
if (!existsSync(backupDb)) {
  console.error(`backup database not found: ${backupDb}`);
  process.exit(1);
}
try {
  const manifest = JSON.parse(readFileSync(join(from, 'manifest.json'), 'utf8'));
  console.log(`restoring backup from ${manifest.createdAt}; tables: ${JSON.stringify(manifest.tables)}`);
} catch {
  console.warn('manifest missing/unreadable — continuing only because --confirm-restore was supplied');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(dirname(DB_PATH), { recursive: true });
mkdirSync(dirname(UPLOADS_DIR), { recursive: true });

if (existsSync(DB_PATH)) {
  const kept = `${DB_PATH}.pre-restore-${stamp}`;
  renameSync(DB_PATH, kept);
  console.log(`current database preserved at ${kept}`);
}
cpSync(backupDb, DB_PATH);

if (existsSync(backupUploads)) {
  if (existsSync(UPLOADS_DIR)) {
    const kept = `${UPLOADS_DIR}.pre-restore-${stamp}`;
    renameSync(UPLOADS_DIR, kept);
    console.log(`current uploads preserved at ${kept}`);
  }
  cpSync(backupUploads, UPLOADS_DIR, { recursive: true });
}
console.log(JSON.stringify({ ok: true, restoredDatabase: DB_PATH, restoredUploads: existsSync(backupUploads) ? UPLOADS_DIR : null }));
console.log('restart the application before serving traffic from the restored files');
