// World generation: turn a photograph of the place into an orbitable 3D world.
// Uses fal.ai's queued TRELLIS.2 API (image → GLB). The source photo is read
// straight from the gift's upload dir, uploaded to fal's CDN with a one-hour
// lifecycle, and deleted again after the run. The resulting GLB is saved to the
// gift's volume dir so the recipient can orbit it (the reveal) and keep a copy
// (a download). Idempotent — one world per gift.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, UPLOADS_DIR } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAL_REST_BASE = 'https://rest.fal.ai';
const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_MODEL = 'fal-ai/trellis-2';
// web-friendly size: ~20k verts, 1024 texture → ~2-3MB GLB
const RESOLUTION = 1024;
const DECIMATION = 20000;
const TEXTURE_SIZE = 1024;
const WORLD_TIMEOUT_MS = 5 * 60 * 1000; // never sit in 'worlding' forever
const FAL_MEDIA_TTL_SECONDS = 60 * 60;

const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

function getFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  // local-dev fallback: read the first key out of a server *.env file
  try {
    for (const f of readdirSync(__dirname)) {
      if (f.endsWith('.env') || f === '.env') {
        const txt = readFileSync(join(__dirname, f), 'utf8');
        const m = txt.match(/^FAL_KEY\s*=\s*["']?([^"'\n]+)/m);
        if (m && m[1].trim().length >= 15) return m[1].trim();
      }
    }
  } catch {}
  return null;
}

function falAuth(key) {
  return { authorization: `Key ${key}` };
}

function lifecycleHeader() {
  return JSON.stringify({ expiration_duration_seconds: FAL_MEDIA_TTL_SECONDS });
}

/** The photo to turn into the world — the shot the pipeline picked as most
 *  iconic (world_source: the one the throughline points at), so the world and
 *  the throughline line up. Falls back to the first readable photo. Photos are
 *  the gift's originals. Skips HEIC (no texture pipeline for it). */
function worldPhotoSource(giftId, preferredIndex = null) {
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
  return { buf, mime, filename: pick };
}

export function worldPhotoDataUrl(giftId, preferredIndex = null) {
  const photo = worldPhotoSource(giftId, preferredIndex);
  if (!photo) return null;
  return `data:${photo.mime};base64,${photo.buf.toString('base64')}`;
}

function worldFile(giftId) {
  return join(UPLOADS_DIR, giftId, 'world.glb');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uploadFalInput(key, photo) {
  const init = await fetch(`${FAL_REST_BASE}/storage/upload/initiate?storage_type=fal-cdn-v3`, {
    method: 'POST',
    headers: {
      ...falAuth(key),
      'content-type': 'application/json',
      'X-Fal-Object-Lifecycle-Preference': lifecycleHeader(),
    },
    body: JSON.stringify({ file_name: photo.filename, content_type: photo.mime }),
    signal: AbortSignal.timeout(30_000),
  });
  const initJson = await init.json().catch(() => ({}));
  if (!init.ok || !initJson.upload_url || !initJson.file_url) {
    throw new Error(`fal upload initiate failed (${init.status}): ${initJson.error?.message || initJson.error || 'no upload url'}`);
  }

  const put = await fetch(initJson.upload_url, {
    method: 'PUT',
    headers: { 'content-type': photo.mime },
    body: photo.buf,
    signal: AbortSignal.timeout(60_000),
  });
  if (!put.ok) throw new Error(`fal input upload failed (${put.status})`);
  return initJson.file_url;
}

async function deleteFalFile(key, fileUrl) {
  if (!fileUrl) return;
  try {
    const res = await fetch(`${FAL_REST_BASE}/storage/files/delete`, {
      method: 'POST',
      headers: { ...falAuth(key), 'content-type': 'application/json' },
      body: JSON.stringify({ file_url: fileUrl }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn(`[world] fal media delete failed (${res.status})`);
  } catch (e) {
    console.warn(`[world] fal media delete failed: ${e.message}`);
  }
}

async function submitFalWorld(key, imageUrl) {
  const sub = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL}`, {
    method: 'POST',
    headers: {
      ...falAuth(key),
      'content-type': 'application/json',
      'X-Fal-Store-IO': '0',
      'X-Fal-Object-Lifecycle-Preference': lifecycleHeader(),
    },
    body: JSON.stringify({
      image_url: imageUrl,
      resolution: RESOLUTION,
      decimation_target: DECIMATION,
      texture_size: TEXTURE_SIZE,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const subJson = await sub.json().catch(() => ({}));
  if (!sub.ok || !subJson.request_id) {
    throw new Error(`fal run submit failed (${sub.status}): ${subJson.error?.message || subJson.error || subJson.detail || 'no request id'}`);
  }
  return subJson;
}

async function waitForFalWorld(key, submission) {
  const started = Date.now();
  const statusUrl = submission.status_url;
  const responseUrl = submission.response_url;
  if (!statusUrl || !responseUrl) throw new Error('fal submit response omitted status/response urls');

  while (Date.now() - started < WORLD_TIMEOUT_MS) {
    await sleep(6_000);
    const r = await fetch(statusUrl, {
      headers: falAuth(key),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`fal status failed (${r.status}): ${j.error?.message || j.error || 'unknown'}`);
    if (j.status === 'COMPLETED') {
      const out = await fetch(responseUrl, {
        headers: falAuth(key),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await out.json().catch(() => ({}));
      if (!out.ok) throw new Error(`fal result failed (${out.status}): ${result.error?.message || result.error || 'unknown'}`);
      const url = result.model_glb?.url;
      if (!url) throw new Error('fal result did not include model_glb.url');
      return url;
    }
    if (j.status !== 'IN_QUEUE' && j.status !== 'IN_PROGRESS') {
      throw new Error(`fal run ${String(j.status || 'unknown').toLowerCase()}: ${j.error?.message || j.error || 'no error detail'}`);
    }
  }
  throw new Error('fal run did not produce a GLB in time');
}

/**
 * Build (or re-build) the 3D world for a gift. Fire-and-forget. Sets
 * gifts.world_status to 'worlding' → 'ready'|'failed' and gifts.world_file to
 * the on-disk GLB path when done. Idempotent: a completed world is reused.
 */
export async function buildWorld(giftId) {
  const key = getFalKey();
  if (!key) {
    db.prepare("UPDATE gifts SET world_status='failed' WHERE id=?").run(giftId);
    console.warn(`[world ${giftId}] no fal.ai key — world skipped`);
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
  const photo = worldPhotoSource(giftId, preferred);
  if (!photo) {
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
  let inputUrl = null;
  let outputUrl = null;

  try {
    // 1) upload the source photo, submit the run, then poll until it settles
    inputUrl = await uploadFalInput(key, photo);
    const submission = await submitFalWorld(key, inputUrl);
    outputUrl = await waitForFalWorld(key, submission);

    // 2) download the GLB into the gift's dir
    const glb = await fetch(outputUrl, { signal: AbortSignal.timeout(60_000) });
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
    console.log(`[world ${giftId}] ready: ${(buf.byteLength / 1e6).toFixed(2)}MB in ${((Date.now() - started) / 1000).toFixed(0)}s via fal.ai (source photo ${preferred ?? 0})`);
  } catch (e) {
    db.prepare("UPDATE gifts SET world_status='failed' WHERE id=?").run(giftId);
    console.error(`[world ${giftId}] failed:`, e.message);
  } finally {
    // Inputs and outputs are only needed while the provider is running. They are
    // short-lived CDN objects either way; explicit deletion narrows exposure.
    await Promise.allSettled([deleteFalFile(key, inputUrl), deleteFalFile(key, outputUrl)]);
  }
}
