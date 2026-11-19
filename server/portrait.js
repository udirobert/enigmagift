// Keepsake portrait: paints the gift's icon photo as an ink-and-wash
// "portrait of the place" via Recraft imageToImage — the same source photo
// the world build uses, so the portrait and the world depict one place.
// Recraft REST API bills API UNITS (RECRAFT_API_KEY), not subscription
// credits — with no key configured the portrait is simply skipped and the
// reveal renders without it. The photo goes up as a base64 data URL —
// self-contained, no public-URL dependency, identical on Fly and locally.
// The result lands in the gift's derived/ dir (NOT the upload root, which
// is enumerated as clue photos). Idempotent — one portrait per gift.
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR } from './db.js';
import { worldPhotoDataUrl } from './world.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECRAFT_BASE = 'https://external.api.recraft.ai/v1';
// the keepsake style — trained on wax-seal/keepsake refs via the Recraft MCP
const STYLE_ID = process.env.RECRAFT_STYLE_ID || '6ca2fe6d-6b81-4e27-9d6d-a528a6ba8da8';
const MODEL = process.env.RECRAFT_MODEL || 'recraftv4_1';
const STRENGTH = 0.45; // far enough to paint, close enough to stay THEIR place
const PORTRAIT_TIMEOUT_MS = 3 * 60 * 1000;
const PROMPT =
  'A cherished portrait of this exact place, drawn as a treasured memory: ' +
  'keep the composition and the objects recognizable, rendered as a keepsake ' +
  'illustration — soft light, cream and umber palette with a rust-amber ' +
  'accent, gentle film grain, precious and quiet';

function getRecraftKey() {
  if (process.env.RECRAFT_API_KEY) return process.env.RECRAFT_API_KEY;
  // local-dev fallback: read the key out of a server *.env file
  try {
    for (const f of readdirSync(__dirname)) {
      if (f.endsWith('.env') || f === '.env') {
        const txt = readFileSync(join(__dirname, f), 'utf8');
        const m = txt.match(/^RECRAFT_API_KEY\s*=\s*["']?([^"'\n]+)/m);
        if (m && m[1].trim().length >= 15) return m[1].trim();
      }
    }
  } catch {}
  return null;
}

export function portraitFile(giftId, contentType = 'image/webp') {
  const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[contentType] || 'webp';
  return join(UPLOADS_DIR, giftId, 'derived', `portrait.${ext}`);
}

const MIME_BY_EXT = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

export function portraitMime(file) {
  const ext = (file.match(/\.[^.]+$/) || [''])[0].toLowerCase().replace('.', '');
  return MIME_BY_EXT[ext] || 'image/webp';
}

/**
 * Paint (or re-paint) the keepsake portrait for a gift. Fire-and-forget.
 * Sets gifts.portrait_status 'painting' → 'ready'|'failed' and
 * gifts.portrait_file to the on-disk image when done.
 */
export async function buildPortrait(giftId) {
  const key = getRecraftKey();
  if (!key) {
    db.prepare("UPDATE gifts SET portrait_status='skipped' WHERE id=?").run(giftId);
    console.warn(`[portrait ${giftId}] no Recraft key — portrait skipped`);
    return;
  }

  const gift = db
    .prepare('SELECT id, portrait_file, portrait_status, portrait_started_at, world_source FROM gifts WHERE id=?')
    .get(giftId);
  if (!gift) return;
  // idempotent — already painted
  if (gift.portrait_file && existsSync(gift.portrait_file)) {
    db.prepare("UPDATE gifts SET portrait_status='ready' WHERE id=?").run(giftId);
    return;
  }
  const preferred = typeof gift.world_source === 'number' ? gift.world_source : null;
  const dataUrl = worldPhotoDataUrl(giftId, preferred);
  if (!dataUrl) {
    db.prepare("UPDATE gifts SET portrait_status='skipped' WHERE id=?").run(giftId);
    return;
  }
  // stale 'painting' (machine stopped mid-build) → rebuild
  const STALE_MS = 10 * 60 * 1000;
  if (gift.portrait_status === 'painting') {
    const started = gift.portrait_started_at ? Date.parse(gift.portrait_started_at) : NaN;
    if (!Number.isNaN(started) && Date.now() - started < STALE_MS) return;
    console.warn(`[portrait ${giftId}] stale 'painting' — rebuilding`);
  }

  db.prepare("UPDATE gifts SET portrait_status='painting', portrait_file=NULL, portrait_started_at=? WHERE id=?")
    .run(new Date().toISOString(), giftId);
  const started = Date.now();

  try {
    const res = await fetch(`${RECRAFT_BASE}/images/imageToImage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        image_url: dataUrl,
        prompt: PROMPT,
        strength: STRENGTH,
        model: MODEL,
        style_id: STYLE_ID,
        n: 1,
      }),
      signal: AbortSignal.timeout(PORTRAIT_TIMEOUT_MS),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = typeof j.error === 'string' ? j.error : j.error?.message || JSON.stringify(j);
      throw new Error(`imageToImage failed (${res.status}): ${err}`);
    }
    const url = j.data?.[0]?.url;
    if (!url) throw new Error('imageToImage returned no image url');

    // result URLs are temporary (~24h) — download into the gift dir now
    const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`portrait download failed (${img.status})`);
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.byteLength < 1000) throw new Error('portrait too small to be real');

    const target = portraitFile(giftId, img.headers.get('content-type') || '');
    mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.${Math.random().toString(16).slice(2)}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, target);

    db.prepare("UPDATE gifts SET portrait_status='ready', portrait_file=? WHERE id=?")
      .run(target, giftId);
    console.log(`[portrait ${giftId}] ready: ${(buf.byteLength / 1e6).toFixed(2)}MB in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  } catch (e) {
    db.prepare("UPDATE gifts SET portrait_status='failed' WHERE id=?").run(giftId);
    console.error(`[portrait ${giftId}] failed:`, e.message);
  }
}
