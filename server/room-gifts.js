import crypto from 'node:crypto';

// Private recipient links for the tabletop room pilot. Editions are immutable
// snapshots keyed by a public token; the sender's management key is only ever
// stored as a SHA-256 hash. No accounts, no email, no checkout.
const APPROVED_ROOMS = new Map([['dog-dining-room', '44124720']]);
const LIMITS = { to: 40, from: 40, dog: 160, chair: 160, postcard: 160, memory: 160, invitation: 200 };
const tokenShape = /^[A-Za-z0-9_-]{43}$/;

function normalizeEdition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.roomId !== 'string' || typeof input.revision !== 'string'
    || !APPROVED_ROOMS.has(input.roomId)
    || APPROVED_ROOMS.get(input.roomId) !== input.revision) return null;
  const edition = { roomId: input.roomId, revision: input.revision };
  for (const [field, max] of Object.entries(LIMITS)) {
    if (typeof input[field] !== 'string' || input[field].length > max) return null;
    edition[field] = input[field].trim();
    if (!edition[field]) return null;
  }
  return edition;
}

function ownerHash(req) {
  const match = req.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/i);
  return match ? crypto.createHash('sha256').update(match[1].toLowerCase()).digest('hex') : null;
}

// limitOr429 is the shared index.js helper: it returns true (having sent a
// 429) when the caller must stop — same convention as every other route.
export function mountRoomGiftRoutes(app, { db, limitOr429 }) {
  app.use('/api/room-gifts', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.post('/api/room-gifts', (req, res) => {
    const hash = ownerHash(req);
    if (!hash) return res.status(401).json({ error: 'invalid_management_key' });
    const edition = normalizeEdition(req.body?.edition);
    if (!edition) return res.status(400).json({ error: 'invalid_edition' });
    const json = JSON.stringify(edition);
    const existing = db.prepare('SELECT * FROM room_gifts WHERE manage_hash=?').get(hash);
    if (existing) {
      if (existing.revoked_at) return res.status(410).json({ error: 'gift_revoked' });
      if (existing.edition_json !== json) return res.status(409).json({ error: 'edition_already_created' });
      return res.json({ recipientToken: existing.token, createdAt: existing.created_at });
    }
    if (limitOr429(res, `room-create:${req.ip}`, 10, 60 * 60 * 1000)) return;
    const token = crypto.randomBytes(32).toString('base64url');
    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO room_gifts(token,manage_hash,room_id,room_revision,edition_json,created_at) VALUES (?,?,?,?,?,?)')
      .run(token, hash, edition.roomId, edition.revision, json, createdAt);
    return res.status(201).json({ recipientToken: token, createdAt });
  });

  app.get('/api/room-gifts/manage', (req, res) => {
    const hash = ownerHash(req);
    if (!hash) return res.status(401).json({ error: 'invalid_management_key' });
    const row = db.prepare('SELECT * FROM room_gifts WHERE manage_hash=?').get(hash);
    if (!row) return res.status(404).json({ error: 'gift_unavailable' });
    res.json({
      recipientToken: row.token,
      createdAt: row.created_at,
      revoked: !!row.revoked_at,
      edition: row.revoked_at ? null : JSON.parse(row.edition_json),
    });
  });

  app.delete('/api/room-gifts/manage', (req, res) => {
    const hash = ownerHash(req);
    if (!hash) return res.status(401).json({ error: 'invalid_management_key' });
    const row = db.prepare('SELECT token FROM room_gifts WHERE manage_hash=?').get(hash);
    if (!row) return res.status(404).json({ error: 'gift_unavailable' });
    db.prepare('UPDATE room_gifts SET revoked_at=COALESCE(revoked_at,?),edition_json=NULL WHERE manage_hash=?')
      .run(new Date().toISOString(), hash);
    res.json({ revoked: true });
  });

  // registered AFTER the manage routes so 'manage' is never read as a token
  app.get('/api/room-gifts/:token', (req, res) => {
    if (!tokenShape.test(req.params.token)) return res.status(404).json({ error: 'gift_unavailable' });
    const row = db.prepare('SELECT * FROM room_gifts WHERE token=?').get(req.params.token);
    if (!row || row.revoked_at || APPROVED_ROOMS.get(row.room_id) !== row.room_revision) {
      return res.status(404).json({ error: 'gift_unavailable' });
    }
    res.json({ edition: JSON.parse(row.edition_json), createdAt: row.created_at });
  });
}
