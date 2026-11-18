// Gift pipeline: photos -> per-image observations (parallel) -> cross-image
// aggregate -> clues + hideSpots + trail rounds -> status=ready.
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { imageSize } from 'image-size';
import crypto from 'node:crypto';
import { db, UPLOADS_DIR } from './db.js';
import { getCandidates, observeImage, crossImage, mimeFor } from './gemini.js';

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

/**
 * Pick the photo that best shows what the throughline points at. The 3D world
 * is built from that shot, so the world and the throughline line up exactly.
 * Scores each photo by observation salience + word overlap with the
 * throughline; falls back to salience alone if there's no throughline, and to
 * null (→ world.js uses the first supported photo) if there's nothing to rank.
 */
function pickWorldSource(throughline, byPhoto) {
  if (!byPhoto || !byPhoto.size) return null;
  const tokens = new Set(
    String(throughline || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4), // drop stopwords
  );
  let best = null;
  let bestScore = -Infinity;
  for (const [photoIndex, obsList] of byPhoto) {
    let score = 0;
    for (const ob of obsList) {
      score += ob.confidence ?? 0; // salience
      const desc = String(ob.description || '').toLowerCase();
      for (const t of tokens) if (desc.includes(t)) score += 2; // throughline overlap
      if (ob.hideSpotPotential) score += 0.5;
    }
    // tie-break toward earlier photos (upload order ≈ intent)
    if (score > bestScore) { bestScore = score; best = photoIndex; }
  }
  return best;
}

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

// Generic scene categories read badly in the recipient letter ("you stood where
// urban streetscapes stand"). A specific place names a building or spot; a
// generic one just names a category of scene.
// Words that name a *category of place* rather than the place itself.
const CATEGORY_WORDS = new Set([
  'streetscape', 'streetscapes', 'cityscape', 'landscapes', 'areas', 'districts',
  'neighborhoods', 'neighbourhoods', 'zones', 'plazas', 'squares',
  'outdoor', 'public', 'spaces', 'scenes', 'street', 'streets', 'urban',
  'entrances', 'building', 'buildings',
  // singular category nouns — generic only when short and un-anchored
  'area', 'zone', 'plaza', 'square', 'scene', 'streetscape', 'space',
]);
const GENERIC_PLACE_PATTERNS = [
  /^(urban|historic|residential|commercial|suburban|industrial|open|public|outdoor)\s+(and\s+)?(streetscapes?|areas?|districts?|buildings?|entrances?|streets?|plazas?|scenes?|public spaces?|outdoor spaces?|spaces?)/i,
  /featuring\s+(cafes|shops|restaurants|parks|outdoor|public)/i,
  /outdoor public spaces/i,
];
function hasProperNoun(t) {
  // an internal capitalised word, or a quote (possessive) — a name, not a category
  const words = t.split(/\s+/).filter(Boolean);
  return words.slice(1).some((w) => /[A-Z]/.test(w)) || /['’]/.test(t);
}
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'with', 'near', 'at', 'on', 'in', 'by',
  'of', 'to', 'over', 'under', 'beside', 'next', 'between', 'along', 'from',
]);
function isGenericPlaceGuess(g) {
  if (!g || typeof g !== 'string') return true;
  const t = g.toLowerCase().trim();
  if (t.length > 90) return true; // a paragraph, not a place
  if (GENERIC_PLACE_PATTERNS.some((re) => re.test(t))) return true;
  if (hasProperNoun(g)) return false; // named place — keep
  const words = t.split(/[^a-z]+/).filter(Boolean);
  const cat = words.filter((w) => CATEGORY_WORDS.has(w)).length;
  const concrete = words.filter((w) => !CATEGORY_WORDS.has(w) && !STOP_WORDS.has(w)).length;
  // generic when it's mostly category words with (almost) nothing concrete
  return cat >= 2 && cat >= concrete;
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

// Schema-key / stub strings a weak model sometimes echoes back as "answers".
const JUNK_OPTION = /^(correct|options?|questions?|answers?|true|false|r\d|round\s*\d)[\s:._-]*$/i;
const cleanOpt = (s) => {
  const t = String(s || '').trim();
  return t.length >= 6 && !JUNK_OPTION.test(t) && !/[{}<>]/.test(t) ? t : null;
};

// Normalise roundMaterial for one round ('r2'|'r3'). Models sometimes nest the
// quiz as {question, options, correct} instead of the flat documented shape.
function pickRoundQuiz(rm, prefix) {
  const flat = {
    question: rm[`${prefix}Question`],
    correct: rm[`${prefix}Correct`],
    distractors: rm[`${prefix}Distractors`],
  };
  const nested = rm[prefix];
  if (nested && typeof nested === 'object') {
    flat.question = flat.question || nested.question;
    flat.correct = flat.correct || (typeof nested.correct === 'string' ? nested.correct : nested.answer);
    flat.distractors = flat.distractors || nested.distractors || nested.wrongAnswers;
    if (!flat.distractors && Array.isArray(nested.options)) {
      // options array: drop the entry matching `correct` (string or index)
      const opts = nested.options.filter(cleanOpt);
      const ci = typeof nested.correct === 'number' ? nested.correct
        : opts.findIndex((o) => o.toLowerCase() === String(nested.correct || '').toLowerCase());
      flat.distractors = ci >= 0 ? opts.filter((_, i) => i !== ci) : opts.slice(1);
      if (!flat.correct && typeof nested.correct === 'number') flat.correct = opts[nested.correct];
    }
  }
  const q = cleanOpt(flat.question);
  const correct = cleanOpt(flat.correct);
  const distractors = (Array.isArray(flat.distractors) ? flat.distractors : [])
    .map(cleanOpt).filter(Boolean);
  return { question: q, correct, distractors };
}

// Build a 4-option quiz round: correct answer + distractors (LLM-provided first,
// then fallback fillers), deduped and shuffled. Returns null-safe shape.
function buildOptions(correctText, llmDistractors, fallbackCorrect, fallbackDistractors, question) {
  const correct = cleanOpt(correctText) || cleanOpt(fallbackCorrect);
  if (!correct) return { options: [], correct: -1, question: null };
  const seen = new Set([correct.toLowerCase()]);
  const distractors = [];
  for (const d of [...(llmDistractors || []), ...(fallbackDistractors || [])]) {
    if (distractors.length >= 3) break;
    const t = cleanOpt(d);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    distractors.push(t);
  }
  const options = shuffle([correct, ...distractors]);
  return {
    options,
    correct: options.indexOf(correct),
    question: cleanOpt(question),
  };
}

function buildRounds(observations, throughline, placeGuess, roundMaterial = null) {
  const rm = roundMaterial && typeof roundMaterial === 'object' ? roundMaterial : {};
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
    const r2q = pickRoundQuiz(rm, 'r2');
    const opts = buildOptions(
      r2q.correct,
      r2q.distractors,
      // clean fallback — never dumps raw throughline/placeGuess into the option
      `Both photos were taken at ${placeGuess || 'the same place'} — they share one continuous story.`,
      ['The two photos are from completely different places with nothing in common.',
       'One photo is a close-up of a person; the other is a wide landscape.',
       'The colours in both photos are identical because they were taken in black and white.'],
      r2q.question
    );
    rounds.push({
      kicker: 'Round 2 · The connection',
      question: opts.question || 'Two crops, two moments. What ties them together?',
      options: opts.options,
      cropPhotoIndex: o1.photoIndex,
      crop: o1.obs.bbox,
      cropPhotoIndex2: o2.photoIndex,
      crop2: o2.obs.bbox,
      correct: opts.correct,
    });
  }

  // R3 — throughline reveal
  const r3q = pickRoundQuiz(rm, 'r3');
  const r3 = buildOptions(
    r3q.correct,
    r3q.distractors,
    throughline || (placeGuess ? `The photos were all taken at ${placeGuess}.` : null),
    ['A generic pretty place with no particular story.',
     'A random street that happens to look nice in photos.',
     'An advertisement or stock photo, not a real visit.'],
    r3q.question
  );
  if (r3.options.length) {
    rounds.push({
      kicker: 'Round 3 · The reveal',
      question: r3.question || 'Every clue so far points to one thing. What is it?',
      options: r3.options,
      cropPhotoIndex: r1Correct ? r1Correct.photoIndex : 0,
      crop: r1Correct ? r1Correct.obs.bbox : [0, 0, 1, 1],
      correct: r3.correct,
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

// Bounded-concurrency map that preserves order and returns Promise.allSettled results.
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try { results[i] = { status: 'fulfilled', value: await fn(items[i], i) }; }
      catch (reason) { results[i] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ---------- pipeline ----------
const WATCHDOG_MS = 4 * 60 * 1000; // never hang in 'reading'
const OBSERVE_CONCURRENCY = 3;     // Gemini free tier 429s under parallel load

export async function runPipeline(giftId) {
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(giftId);
  if (!gift) return;

  // Watchdog: if the pipeline stalls (hangs, retries forever), fail the gift
  // rather than leaving it in 'reading'. Only fires while still 'reading'.
  const watchdog = setTimeout(() => {
    try {
      const r = db.prepare("UPDATE gifts SET status='error' WHERE id=? AND status='reading'").run(giftId);
      if (r.changes) console.error(`[pipeline ${giftId}] watchdog: timed out after ${WATCHDOG_MS}ms`);
    } catch {}
  }, WATCHDOG_MS);
  watchdog.unref?.();

  try {
    await runPipelineInner(giftId);
  } finally {
    clearTimeout(watchdog);
  }
}

async function runPipelineInner(giftId) {
  const gift = db.prepare('SELECT * FROM gifts WHERE id = ?').get(giftId);
  if (!gift) return;
  const photos = listPhotos(giftId);

  try {
    const cands = await getCandidates();
    if (!cands.length) throw new Error('no working gemini key/model');
  } catch (e) {
    db.prepare("UPDATE gifts SET status='error' WHERE id=?").run(giftId);
    console.error(`[pipeline ${giftId}] no gemini client:`, e.message);
    return;
  }

  // per-image observation, bounded worker pool (concurrency 3). Each photo
  // lands in the DB the moment it's read and the gift's photos_observed
  // counter ticks — the buyer watches the reads arrive live, not a spinner.
  const insObs = db.prepare('INSERT INTO observations (gift_id, photo_index, data) VALUES (?,?,?)');
  const settled = await mapPool(photos, OBSERVE_CONCURRENCY, async (p, photoIndex) => {
    const buf = readFileSync(p.path);
    let data = await observeImage(buf, mimeFor(p.file));
    data = normalizeBboxes(data, p.path);
    if (data && Array.isArray(data.observations)) {
      insObs.run(giftId, photoIndex, JSON.stringify({ placeType: data.placeType, observations: data.observations }));
      db.prepare('UPDATE gifts SET photos_observed = photos_observed + 1 WHERE id=?').run(giftId);
    }
    return { photoIndex, photoFile: p.file, data };
  });

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

  // tolerate partial failure: need at least 3 photos observed successfully
  if (obsRows.length < 3) {
    db.prepare("UPDATE gifts SET status='error' WHERE id=?").run(giftId);
    console.error(`[pipeline ${giftId}] only ${obsRows.length}/${photos.length} photos observed — below minimum`);
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

  // cross-image aggregate: a hollow result (no throughline/hideSpots) is worse
  // than an error, so retry a few times then fail the gift honestly.
  let cross = null;
  let crossErr = null;
  const CROSS_RETRIES = 3;
  for (let attempt = 1; attempt <= CROSS_RETRIES; attempt++) {
    try {
      const c = await crossImage(bundleLines.join('\n'));
      if (c && (c.throughline || c.placeGuess || c.hideSpots?.length || c.roundMaterial)) {
        cross = c;
        break;
      }
      crossErr = new Error('cross-image returned empty/partial JSON');
    } catch (e) {
      crossErr = e;
    }
    console.warn(`[pipeline ${giftId}] cross-image attempt ${attempt}/${CROSS_RETRIES} failed: ${crossErr?.message?.slice(0, 140)}`);
    if (attempt < CROSS_RETRIES) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  if (!cross) {
    db.prepare("UPDATE gifts SET status='error' WHERE id=?").run(giftId);
    console.error(`[pipeline ${giftId}] cross-image call failed after ${CROSS_RETRIES} tries: ${crossErr?.message}`);
    return;
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
  let placeGuess = cross?.placeGuess || null;
  const roundMaterial = cross?.roundMaterial || null;
  if (placeGuess && isGenericPlaceGuess(placeGuess)) {
    // generic scene categories read badly in the recipient letter — fall back
    // to the throughline's concrete phrasing
    placeGuess = (throughline || '').toLowerCase()
      .replace(/^the /, '')
      .replace(/[.!?]+$/, '');
    console.warn(`[pipeline ${giftId}] generic placeGuess replaced with throughline`);
  }

  const rounds = buildRounds(flat, throughline, placeGuess, roundMaterial);

  // the world is built from the shot the throughline points at (see
  // pickWorldSource) — null means "let world.js pick the first supported photo"
  const worldSource = pickWorldSource(throughline, byPhoto);

  const insClue = db.prepare('INSERT INTO clues (id, gift_id, position, text, meta) VALUES (?,?,?,?,?)');
  const insHide = db.prepare('INSERT INTO hide_spots (id, gift_id, position, data) VALUES (?,?,?,?)');
  // duration measurement (created_at → ready) — computed before the tx so it's
  // in scope for the log after commit
  const readMs = Date.now() - Date.parse(gift.created_at || 0);
  db.exec('BEGIN');
  try {
    for (const c of clues) insClue.run(c.id, giftId, c.position, c.text, c.meta);
    for (const h of hideSpots) insHide.run(h.id, giftId, h.position, h.data);
    // stamp read_ready_at; guard: don't overwrite 'error' if the watchdog fired
    db.prepare("UPDATE gifts SET status=?, throughline=?, place_guess=?, rounds=?, read_ready_at=?, world_source=? WHERE id=? AND status='reading'")
      .run('ready', throughline, placeGuess, JSON.stringify(rounds), new Date().toISOString(), worldSource, giftId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }

  console.log(`[pipeline ${giftId}] ready in ${Math.round(readMs / 1000)}s: ${obsRows.length} photos observed, ${flat.length} observations, ${clues.length} clues, ${hideSpots.length} hide spots, ${rounds.length} rounds`);
}

export { buildRounds };
