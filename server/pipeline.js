// Gift pipeline: photos -> per-image observations (parallel) -> cross-image
// aggregate -> clues + hideSpots + trail rounds -> status=ready.
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { imageSize } from 'image-size';
import crypto from 'node:crypto';
import { db, UPLOADS_DIR } from './db.js';
import { getClient, observeImage, crossImage, mimeFor } from './gemini.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
const rand = (n) => crypto.randomBytes(n).toString('hex');

function listPhotos(giftId) {
  const dir = join(UPLOADS_DIR, giftId);
  try {
    return readdirSync(dir)
      .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
      .sort()
      .map((f) => ({ file: f, path: join(dir, f) }));
  } catch { return []; }
}

// ---------- derivation (deterministic, no extra LLM calls) ----------
const CLUE_CATS = new Set(['detail', 'sign', 'text']);

function deriveClues(observations, n = 3) {
  // observations: [{photoIndex, obs:{description,category,bbox,confidence,hideSpotPotential}}]
  const scored = observations.map((o) => {
    const ob = o.obs || {};
    let score = (ob.confidence || 0) * 10;
    if (CLUE_CATS.has(ob.category)) score += 5;
    if (ob.hideSpotPotential) score += 1;
    // prefer distinctive over generic layout/lighting
    if (ob.category === 'layout' || ob.category === 'lighting') score -= 3;
    return { ...o, score };
  }).sort((a, b) => b.score - a.score);

  // pick top n with photo variety
  const picked = [];
  const usedPhotos = new Set();
  for (const c of scored) {
    if (picked.length >= n) break;
    if (usedPhotos.has(c.photoIndex) && scored.length > n) continue;
    picked.push(c); usedPhotos.add(c.photoIndex);
  }
  for (const c of scored) { // fill if variety starved us
    if (picked.length >= n) break;
    if (!picked.includes(c)) picked.push(c);
  }
  return picked.slice(0, n).map((c, i) => ({
    id: `clue_${rand(6)}`,
    position: i,
    text: c.obs.description,
    meta: JSON.stringify({
      photoIndex: c.photoIndex,
      category: c.obs.category,
      confidence: c.obs.confidence,
      bbox: c.obs.bbox,
      basis: 'seen',
    }),
  }));
}

function deriveHideSpots(cross, photoCount) {
  const spots = Array.isArray(cross?.hideSpots) ? cross.hideSpots : [];
  return spots.slice(0, 5).map((s, i) => ({
    id: `hide_${rand(6)}`,
    position: i,
    data: JSON.stringify({
      description: s.description || '',
      basedOnObservation: typeof s.basedOnObservation === 'number' ? s.basedOnObservation : null,
      confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
    }),
  }));
}

// ---------- trail rounds (deterministic templates) ----------
function pickDistractors(pool, correct, k, usedPhotos) {
  const out = [];
  for (const c of pool) {
    if (out.length >= k) break;
    if (c === correct) continue;
    if (c.obs.description === correct.obs.description) continue;
    if (usedPhotos.has(c.photoIndex)) continue;
    out.push(c); usedPhotos.add(c.photoIndex);
  }
  for (const c of pool) { // relax photo-variety if needed
    if (out.length >= k) break;
    if (c === correct || out.includes(c)) continue;
    if (c.obs.description === correct.obs.description) continue;
    out.push(c);
  }
  return out;
}

function shuffle(arr, seedRand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(seedRand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRounds(observations, throughline, placeGuess) {
  // flat pool of {photoIndex, obs}
  const pool = observations
    .map((o) => ({ photoIndex: o.photoIndex, obs: o.obs }))
    .filter((o) => o.obs && o.obs.description && Array.isArray(o.obs.bbox) && o.obs.bbox.length === 4);
  const byConf = [...pool].sort((a, b) => (b.obs.confidence || 0) - (a.obs.confidence || 0));

  const rounds = [];

  // R1 — single-detail crop question
  const r1Correct = byConf.find((o) => o.obs.bbox[2] > 0.02 && o.obs.bbox[3] > 0.02) || byConf[0];
  if (r1Correct) {
    const used = new Set([r1Correct.photoIndex]);
    const distract = pickDistractors(byConf, r1Correct, 3, used);
    const options = shuffle([r1Correct.obs.description, ...distract.map((d) => d.obs.description)]);
    rounds.push({
      kicker: 'Round 1 · The detail',
      question: 'One small part of this place was cropped out. What is it?',
      options,
      cropPhotoIndex: r1Correct.photoIndex,
      crop: r1Correct.obs.bbox,
      correct: options.indexOf(r1Correct.obs.description),
    });
  }

  // R2 — two-image connection
  const photos = [...new Set(pool.map((o) => o.photoIndex))];
  if (photos.length >= 2) {
    const p1 = photos[0], p2 = photos[1];
    const o1 = byConf.find((o) => o.photoIndex === p1) || pool[0];
    const o2 = byConf.find((o) => o.photoIndex === p2) || pool[1];
    const opts = shuffle([
      `Both photos show ${placeGuess || 'the same place'} — the thread connecting them is ${throughline || 'a shared story'}.`,
      'The two photos are from completely different places with nothing in common.',
      'One photo is a close-up of a person; the other is a wide landscape.',
      'The colours in both photos are identical because they were taken in black and white.',
    ]);
    rounds.push({
      kicker: 'Round 2 · The connection',
      question: 'Two crops, two moments. What ties them together?',
      options: opts,
      cropPhotoIndex: o1.photoIndex,
      crop: o1.obs.bbox,
      cropPhotoIndex2: o2.photoIndex,
      crop2: o2.obs.bbox,
      correct: opts.indexOf(opts.find((o) => o.startsWith('Both photos show'))),
    });
  }

  // R3 — throughline reveal
  if (throughline) {
    const opts = shuffle([
      throughline,
      'A generic pretty place with no particular story.',
      'A random street that happens to look nice in photos.',
      'An advertisement or stock photo, not a real visit.',
    ]);
    rounds.push({
      kicker: 'Round 3 · The reveal',
      question: 'Every clue so far points to one thing. What is it?',
      options: opts,
      cropPhotoIndex: r1Correct ? r1Correct.photoIndex : 0,
      crop: r1Correct ? r1Correct.obs.bbox : [0, 0, 1, 1],
      correct: opts.indexOf(opts.find((o) => o === throughline)),
    });
  }

  return rounds;
}

// Some models return pixel bboxes despite the 0-1 prompt — normalise defensively.
function normalizeBboxes(data, imgPath) {
  if (!data || !Array.isArray(data.observations)) return data;
  let dims = null;
  try { dims = imageSize(readFileSync(imgPath)); } catch {}
  for (const ob of data.observations) {
    const b = ob?.bbox;
    if (!Array.isArray(b) || b.length !== 4 || b.some((v) => typeof v !== 'number')) continue;
    const looksPixel = b.some((v) => v > 1.5);
    if (looksPixel && dims && dims.width && dims.height) {
      ob.bbox = [
        clamp01(b[0] / dims.width), clamp01(b[1] / dims.height),
        clamp01(b[2] / dims.width), clamp01(b[3] / dims.height),
      ];
    } else {
      ob.bbox = b.map(clamp01);
    }
  }
  return data;
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// ---------- pipeline ----------
export async function runPipeline(giftId) {
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(giftId);
  if (!gift) return;
  const photos = listPhotos(giftId);

  let client;
  try { client = await getClient(); }
  catch (e) {
    db.prepare("UPDATE gifts SET status='error' WHERE id=?").run(giftId);
    console.error(`[pipeline ${giftId}] no gemini client:`, e.message);
    return;
  }

  // per-image observation, parallel
  const settled = await Promise.allSettled(
    photos.map(async (p, photoIndex) => {
      const buf = readFileSync(p.path);
      let data = await observeImage(client, buf, mimeFor(p.file));
      data = normalizeBboxes(data, p.path);
      return { photoIndex, photoFile: p.file, data };
    })
  );

  const obsRows = [];
  const flat = [];
  settled.forEach((res, idx) => {
    if (res.status !== 'fulfilled') {
      console.error(`[pipeline ${giftId}] photo ${idx} failed:`, res.reason?.message);
      return;
    }
    const { photoIndex, photoFile, data } = res.value;
    if (!data || !Array.isArray(data.observations)) {
      console.error(`[pipeline ${giftId}] photo ${photoIndex} bad result`);
      return;
    }
    obsRows.push({ giftId, photoIndex, data: JSON.stringify({ placeType: data.placeType, observations: data.observations }) });
    for (const ob of data.observations) flat.push({ photoIndex, photoFile, obs: ob });
  });

  const insObs = db.prepare('INSERT INTO observations (gift_id, photo_index, data) VALUES (?,?,?)');
  db.exec('BEGIN');
  try {
    for (const r of obsRows) insObs.run(r.giftId, r.photoIndex, r.data);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  if (flat.length === 0) {
    db.prepare("UPDATE gifts SET status='error' WHERE id=?").run(giftId);
    console.error(`[pipeline ${giftId}] no observations survived`);
    return;
  }

  // cross-image aggregate
  const bundleLines = [];
  const byPhoto = new Map();
  for (const o of flat) {
    if (!byPhoto.has(o.photoIndex)) byPhoto.set(o.photoIndex, []);
    byPhoto.get(o.photoIndex).push(o.obs);
  }
  let pi = 0;
  for (const [photoIndex, obsList] of [...byPhoto.entries()].sort((a, b) => a[0] - b[0])) {
    const placeType = obsRows.find((r) => r.photoIndex === photoIndex);
    let pt = '?';
    try { pt = JSON.parse(placeType?.data || '{}').placeType || '?'; } catch {}
    bundleLines.push(`PHOTO ${pi}: index=${photoIndex} (placeType: ${pt})`);
    for (const ob of obsList) {
      bundleLines.push(
        `  - [${ob.category || '?'}] ${ob.description || ''} conf=${ob.confidence ?? 0} hide=${!!ob.hideSpotPotential} bbox=${JSON.stringify(ob.bbox)}`
      );
    }
    pi++;
  }
  // NOTE: basedOnObservation in the cross prompt refers to the PHOTO n ordering above;
  // we map back via the sorted photoIndex list.
  const photoOrder = [...byPhoto.keys()].sort((a, b) => a - b);

  let cross = null;
  try {
    cross = await crossImage(client, bundleLines.join('\n'));
  } catch (e) {
    console.error(`[pipeline ${giftId}] cross-image call failed:`, e.message);
  }

  // map hideSpots' basedOnObservation (bundle photo ordinal) back to real photoIndex
  const hideSpots = deriveHideSpots(cross, photos.length).map((h) => {
    try {
      const d = JSON.parse(h.data);
      if (typeof d.basedOnObservation === 'number' && photoOrder[d.basedOnObservation] !== undefined) {
        d.basedOnObservation = photoOrder[d.basedOnObservation];
      }
      return { ...h, data: JSON.stringify(d) };
    } catch { return h; }
  });

  const clues = deriveClues(flat, 3);
  const throughline = cross?.throughline || null;
  const placeGuess = cross?.placeGuess || null;

  const rounds = buildRounds(flat, throughline, placeGuess);

  const insClue = db.prepare('INSERT INTO clues (id, gift_id, position, text, meta) VALUES (?,?,?,?,?)');
  const insHide = db.prepare('INSERT INTO hide_spots (id, gift_id, position, data) VALUES (?,?,?,?)');
  db.exec('BEGIN');
  try {
    for (const c of clues) insClue.run(c.id, giftId, c.position, c.text, c.meta);
    for (const h of hideSpots) insHide.run(h.id, giftId, h.position, h.data);
    db.prepare('UPDATE gifts SET status=?, throughline=?, place_guess=?, rounds=? WHERE id=?')
      .run('ready', throughline, placeGuess, JSON.stringify(rounds), giftId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  console.log(`[pipeline ${giftId}] ready: ${obsRows.length} photos observed, ${flat.length} observations, ${clues.length} clues, ${hideSpots.length} hide spots, ${rounds.length} rounds`);
}

export { buildRounds };
