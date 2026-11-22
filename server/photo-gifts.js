import crypto from 'node:crypto';
import multer from 'multer';
import sharp from 'sharp';
import { roomCreateRateKey } from './room-gifts.js';

// Personal-photo gift links: one photograph, one hiding spot, one note.
// Same public token / private management-key separation as room-gifts;
// the management key is only ever stored as a SHA-256 hash. The normalized
// JPEG lives in the gift row so creation and revocation stay atomic.
const LIMITS = { to: 40, from: 40, message: 600, clue: 200 };
const tokenShape = /^[A-Za-z0-9_-]{43}$/;
const MAX_UPLOAD = 3 * 1024 * 1024;   // multer memory ceiling before decode
const MAX_STORED = 2 * 1024 * 1024;   // normalized JPEG ceiling
const MAX_PIXELS = 16_000_000;
const MAX_SIDE = 1600;
const EDITION_FIELD_MAX = 8192;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD, files: 1, fields: 1, parts: 3, fieldSize: EDITION_FIELD_MAX },
});

function ownerHash(req) {
  const match = req.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/i);
  return match ? crypto.createHash('sha256').update(match[1].toLowerCase()).digest('hex') : null;
}

// Normalize in the exact PhotoEdition field order. Raw strings are rejected
// over-limit BEFORE trimming; unrecognized properties are dropped.
function normalizeEdition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1) return null;
  const out = { version: 1 };
  for (const field of ['to', 'from', 'message', 'clue']) {
    const raw = input[field];
    if (typeof raw !== 'string' || raw.length > LIMITS[field]) return null;
    const trimmed = raw.trim();
    if (field !== 'clue' && !trimmed) return null;
    out[field] = trimmed;
  }
  const spot = input.hidingSpot;
  if (!spot || typeof spot !== 'object' || Array.isArray(spot)
    || typeof spot.x !== 'number' || typeof spot.y !== 'number'
    || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)
    || spot.x < 0 || spot.x > 1 || spot.y < 0 || spot.y > 1) return null;
  out.hidingSpot = { x: spot.x, y: spot.y };
  return out;
}

/* Image normalization is bounded: the 512 MiB machine keeps one active
   decode and at most four waiting jobs; anything more is a clean 503. */
let activeDecodes = 0;
const decodeQueue = [];
const acquireDecode = () => new Promise((resolve) => {
  if (activeDecodes < 1) { activeDecodes++; resolve(true); return; }
  if (decodeQueue.length < 4) { decodeQueue.push(resolve); return; }
  resolve(false); // queue full — caller answers 503
});
const releaseDecode = () => {
  const next = decodeQueue.shift();
  if (next) { next(true); return; } // slot passes to the waiter
  activeDecodes--;
};

const fail = (res, status, error) => res.status(status).json({ error });

export function mountPhotoGiftRoutes(app, { db, limitOr429 }) {
  app.use('/api/photo-gifts', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const selectByOwner = db.prepare(
    'SELECT token, edition_json, image_width, image_height, content_hash, created_at, revoked_at FROM photo_gifts WHERE manage_hash = ?');
  const insert = db.prepare(
    'INSERT INTO photo_gifts (token, manage_hash, edition_json, image, image_width, image_height, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const selectPublic = db.prepare(
    'SELECT edition_json, image_width, image_height, created_at FROM photo_gifts WHERE token = ? AND revoked_at IS NULL');
  const selectImage = db.prepare(
    'SELECT image FROM photo_gifts WHERE token = ? AND revoked_at IS NULL');

  app.post('/api/photo-gifts', (req, res) => {
    const hash = ownerHash(req);
    if (!hash) return fail(res, 401, 'invalid_management_key');
    // separate upload-attempt budget bounds image processing per client
    const rateKey = roomCreateRateKey(req);
    res.setHeader('X-RateLimit-Scope', rateKey.startsWith('edge:') ? 'verified-client' : 'connection');
    if (limitOr429(res, `photo-upload:${rateKey}`, 60, 60 * 60 * 1000)) return;

    upload.single('photo')(req, res, async (err) => {
      try {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') return fail(res, 413, 'photo_too_large');
          if (err.code === 'LIMIT_FIELD_SIZE') return fail(res, 400, 'invalid_edition');
          return fail(res, 400, 'invalid_photo');
        }
        const rawField = req.body?.edition;
        if (typeof rawField !== 'string' || rawField.length > EDITION_FIELD_MAX) {
          return fail(res, 400, 'invalid_edition');
        }
        let parsed;
        try { parsed = JSON.parse(rawField); } catch { return fail(res, 400, 'invalid_edition'); }
        const edition = normalizeEdition(parsed);
        if (!edition) return fail(res, 400, 'invalid_edition');
        if (!req.file || !Buffer.isBuffer(req.file.buffer) || !req.file.buffer.length
          || req.file.buffer[0] !== 0xff || req.file.buffer[1] !== 0xd8) {
          return fail(res, 400, 'invalid_photo'); // JPEG bytes only — never the filename's word
        }

        const slot = await acquireDecode();
        if (!slot) return fail(res, 503, 'save_unavailable');
        let image; let meta;
        try {
          /* header read first (no raster decode): reject non-JPEG and huge
             canvases before the real decode runs with the pixel guard on */
          const head = await sharp(req.file.buffer, { limitInputPixels: false }).metadata();
          if (head.format !== 'jpeg' || !head.width || !head.height) {
            return fail(res, 400, 'invalid_photo');
          }
          if (head.width * head.height > MAX_PIXELS) {
            return fail(res, 413, 'photo_too_large');
          }
          ({ data: image, info: meta } = await sharp(req.file.buffer, { limitInputPixels: MAX_PIXELS })
            .rotate()                       // honour EXIF orientation, then drop all metadata
            .flatten({ background: '#ffffff' })
            .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer({ resolveWithObject: true }));
        } catch (e) {
          if (res.writableEnded) return;
          return fail(res, 400, 'invalid_photo');
        } finally {
          releaseDecode();
        }
        if (image.length > MAX_STORED) return fail(res, 413, 'photo_too_large');

        const editionJson = JSON.stringify(edition);
        const contentHash = crypto.createHash('sha256')
          .update(editionJson).update('\n').update(image).digest('hex');

        /* final owner check + quota + insert is one transaction — no awaits
           while it is open; concurrent identical retries serialize cleanly */
        db.exec('BEGIN IMMEDIATE');
        try {
          const existing = selectByOwner.get(hash);
          if (existing) {
            db.exec('COMMIT');
            if (existing.revoked_at) return fail(res, 410, 'gift_revoked');
            if (existing.content_hash !== contentHash) return fail(res, 409, 'edition_already_created');
            return res.json({ recipientToken: existing.token, createdAt: existing.created_at });
          }
          if (limitOr429(res, `room-create:${rateKey}`, 10, 60 * 60 * 1000)) {
            db.exec('ROLLBACK');
            return; // the 429 was already sent
          }
          const token = crypto.randomBytes(32).toString('base64url');
          const createdAt = new Date().toISOString();
          insert.run(token, hash, editionJson, image, meta.width, meta.height, contentHash, createdAt);
          db.exec('COMMIT');
          return res.status(201).json({ recipientToken: token, createdAt });
        } catch (txErr) {
          try { db.exec('ROLLBACK'); } catch { /* already closed */ }
          throw txErr;
        }
      } catch {
        return fail(res, 503, 'save_unavailable');
      }
    });
  });

  app.get('/api/photo-gifts/manage', (req, res) => {
    const hash = ownerHash(req);
    if (!hash) return fail(res, 401, 'invalid_management_key');
    const row = selectByOwner.get(hash);
    if (!row) return fail(res, 404, 'gift_unavailable');
    res.json({
      recipientToken: row.token,
      createdAt: row.created_at,
      revoked: !!row.revoked_at,
      edition: row.revoked_at ? null : JSON.parse(row.edition_json),
      image: row.revoked_at ? null : { width: row.image_width, height: row.image_height },
    });
  });

  app.delete('/api/photo-gifts/manage', (req, res) => {
    const hash = ownerHash(req);
    if (!hash) return fail(res, 401, 'invalid_management_key');
    const row = selectByOwner.get(hash);
    if (!row) return fail(res, 404, 'gift_unavailable');
    db.prepare(`UPDATE photo_gifts
      SET revoked_at = COALESCE(revoked_at, ?), edition_json = NULL, image = NULL,
          image_width = NULL, image_height = NULL
      WHERE manage_hash = ?`).run(new Date().toISOString(), hash);
    res.json({ revoked: true });
  });

  // registered AFTER the manage routes so 'manage' is never read as a token
  app.get('/api/photo-gifts/:token', (req, res) => {
    if (!tokenShape.test(req.params.token)) return fail(res, 404, 'gift_unavailable');
    const row = selectPublic.get(req.params.token);
    if (!row) return fail(res, 404, 'gift_unavailable');
    res.json({
      edition: JSON.parse(row.edition_json),
      image: { width: row.image_width, height: row.image_height },
      createdAt: row.created_at,
    });
  });

  app.get('/api/photo-gifts/:token/image', (req, res) => {
    if (!tokenShape.test(req.params.token)) return fail(res, 404, 'gift_unavailable');
    const row = selectImage.get(req.params.token);
    if (!row || !row.image) return fail(res, 404, 'gift_unavailable');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(row.image)); // node:sqlite hands back Uint8Array, not Buffer
  });
}
