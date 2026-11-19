// World generation: turn a photograph of the place into an orbitable 3D world.
// Uses SandBase's async Run API with TRELLIS.2 (image → GLB). The source photo
// is read straight from the gift's upload dir and sent as a base64 data URL —
// self-contained, no public-URL dependency, identical on Fly and locally. The
// resulting GLB is saved to the gift's volume dir so the recipient can orbit it
// (the reveal) and keep a copy (a download). Idempotent — one world per gift.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SANDBASE_BASE = 'https://api.sandbase.ai/v1';
const TRELLIS_MODEL = 'trellis/trellis-2';
// web-friendly size: ~20k verts, 1024 texture → ~2-3MB GLB
const RESOLUTION = 1024;
const DECIMATION = 20000;
const WORLD_TIMEOUT_MS = 5 * 60 * 1000; // never sit in 'worlding' forever

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

function getSandbaseKey() {
  if (process.env.SANDBASE_API_KEY) return process.env.SANDBASE_API_KEY;
  // local-dev fallback: read the first key out of a server *.env file
  try {
    for (const f of readdirSync(__dirname)) {
      if (f.endsWith('.env') || f === '.env') {
        const txt = readFileSync(join(__dirname, f), 'utf8');
        const m = txt.match(/^SANDBASE_API_KEY\s*=\s*["']?([^"'\n]+)/m);
        if (m && m[1].trim().length >= 15) return m[1].trim();
      }
    }
  } catch {}
  return null;
}

/** The photo to turn into the world — the shot the pipeline picked as most
 *  iconic (world_source: the one the throughline points at), so the world and
 *  the throughline line up. Falls back to the first readable photo. Photos are
 *  the gift's originals; we send the bytes as a base64 data URL. Skips HEIC
 *  (no texture pipeline for it). */
export function worldPhotoDataUrl(giftId, preferredIndex = null) {
  let files = [];
  try { files = readdirSync(join(UPLOADS_DIR, giftId)).sort(); } catch {}
  const usable = files.filter((f) => {
    const ext = (f.match(/\.[^.]+$/) || [''])[0].toLowerCase().replace('.', '');
    return !!MIME_BY_EXT[ext];
  });
  // upload order: the Nth file is photo index N-1 (zero-padded filenames)
  const indexToPhoto = (f) => {
    const m = f.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  };
  const pick = usable.find((f) => indexToPhoto(f) === preferredIndex)
    ?? usable[0]; // fall back to the first readable photo
  if (!pick) return null; // nothing TRELLIS can read
  const buf = readFileSync(join(UPLOADS_DIR, giftId, pick));
  const mime = MIME_BY_EXT[(pick.match(/\.[^.]+$/) || [''])[0].toLowerCase().replace('.', '')];
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function worldFile(giftId) {
  return join(UPLOADS_DIR, giftId, 'world.glb');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build (or re-build) the 3D world for a gift. Fire-and-forget. Sets
 * gifts.world_status to 'worlding' → 'ready'|'failed' and gifts.world_file to
 * the on-disk GLB path when done. Idempotent: a completed world is reused.
 */
export async function buildWorld(giftId) {
  const key = getSandbaseKey();
  if (!key) {
    db.prepare("UPDATE gifts SET world_status='failed' WHERE id=?").run(giftId);
    console.warn(`[world ${giftId}] no SandBase key — world skipped`);
    return;
  }

  const gift = db.prepare('SELECT id, world_file, world_status, world_started_at, world_source FROM gifts WHERE id=?').get(giftId);
  if (!gift) return;
  // idempotent — already built
  if (gift.world_file && existsSync(gift.world_file)) {
    db.prepare("UPDATE gifts SET world_status='ready' WHERE id=?").run(giftId);
    return;
  }
  // the photo the pipeline picked as the place's icon (null → first photo)
  const preferred = typeof gift.world_source === 'number' ? gift.world_source : null;
  // nothing TRELLIS can read → fail now, don't sit in 'worlding'
  const dataUrl = worldPhotoDataUrl(giftId, preferred);
  if (!dataUrl) {
    db.prepare("UPDATE gifts SET world_status='failed' WHERE id=?").run(giftId);
    console.warn(`[world ${giftId}] no usable photo — world skipped`);
    return;
  }
  // A build is in flight — but if it started a long ago it is stale: the
  // machine that was building it stopped (auto-stop or a redeploy) and the
  // in-memory run died, leaving world_status stuck at 'worlding'. Rebuild.
  const STALE_MS = 10 * 60 * 1000;
  if (gift.world_status === 'worlding') {
    const started = gift.world_started_at ? Date.parse(gift.world_started_at) : NaN;
    if (!Number.isNaN(started) && Date.now() - started < STALE_MS) return; // fresh, still running
    console.warn(`[world ${giftId}] stale 'worlding' — rebuilding`);
  }

  const startedIso = new Date().toISOString();
  db.prepare("UPDATE gifts SET world_status='worlding', world_file=NULL, world_started_at=? WHERE id=?")
    .run(startedIso, giftId);
  const started = Date.now();

  try {
    // 1) submit the run — the photo as a base64 data URL (self-contained)
    const sub = await fetch(`${SANDBASE_BASE}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: TRELLIS_MODEL,
        image: dataUrl,
        resolution: RESOLUTION,
        decimation_target: DECIMATION,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const subJson = await sub.json().catch(() => ({}));
    if (!sub.ok || !subJson.id) {
      throw new Error(`run submit failed (${sub.status}): ${subJson.error || 'no id'}`);
    }
    const runId = subJson.id;

    // 2) poll until it settles
    let outputs = null;
    while (Date.now() - started < WORLD_TIMEOUT_MS) {
      await sleep(12_000);
      const r = await fetch(`${SANDBASE_BASE}/run/${runId}`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(30_000),
      });
      const j = await r.json().catch(() => ({}));
      const status = j.status;
      if (status === 'completed') {
        outputs =
          j.outputs?.find((o) => (o.content_type || '').includes('gltf')) || j.outputs?.[0];
        break;
      }
      if (status === 'failed' || status === 'timeout' || status === 'error') {
        // j.error may be an object ({type, message}) or a string
        const err = typeof j.error === 'string' ? j.error : j.error?.message || j.error?.type || JSON.stringify(j.error);
        throw new Error(`run ${status}: ${err}`);
      }
      // 'pending' | 'running' — keep polling
    }
    if (!outputs?.url) throw new Error('run did not produce a GLB in time');

    // 3) download the GLB into the gift's dir
    const glb = await fetch(outputs.url, { signal: AbortSignal.timeout(60_000) });
    if (!glb.ok) throw new Error(`GLB download failed (${glb.status})`);
    const buf = Buffer.from(await glb.arrayBuffer());
    if (buf.byteLength < 1000) throw new Error('GLB too small to be real');

    const dir = join(UPLOADS_DIR, giftId);
    mkdirSync(dir, { recursive: true });
    const target = worldFile(giftId);
    // write to a temp name then rename — never leaves a half-written world
    const tmp = `${target}.${Math.random().toString(16).slice(2)}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, target);

    db.prepare("UPDATE gifts SET world_status='ready', world_file=?, world_ready_at=? WHERE id=?")
      .run(target, new Date().toISOString(), giftId);
    console.log(`[world ${giftId}] ready: ${(buf.byteLength / 1e6).toFixed(2)}MB in ${((Date.now() - started) / 1000).toFixed(0)}s (source photo ${preferred ?? 0})`);
  } catch (e) {
    db.prepare("UPDATE gifts SET world_status='failed' WHERE id=?").run(giftId);
    console.error(`[world ${giftId}] failed:`, e.message);
  }
}
