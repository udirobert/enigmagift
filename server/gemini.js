// Gemini vision calls: per-image observation + cross-image aggregate.
// Key discovery mirrors /tmp/enigmabox-spike/vision_spike.py.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Ordered preference; getClient picks the first key+model pair that answers.
// 2.5-flash has a small free-tier daily quota — newer flash models are the fallback.
const MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash',
];
const DEV_DIR = '/Users/udingethe/Dev';

let cachedList = null; // [{key, model}] — working pairs, best first
let lastGood = 0;         // index into cachedList that last succeeded

function* envFiles() {
  try {
    for (const d of readdirSync(DEV_DIR)) {
      for (const f of ['.env', '.env.local']) {
        const p = join(DEV_DIR, d, f);
        if (existsSync(p)) yield p;
      }
      // also .env.* variants one level deep
      try {
        for (const f of readdirSync(join(DEV_DIR, d))) {
          if (f.startsWith('.env') && f !== '.env' && f !== '.env.local') {
            const p = join(DEV_DIR, d, f);
            if (existsSync(p)) yield p;
          }
        }
      } catch {}
    }
  } catch {}
}

function candidateKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GOOGLE_API_KEY) keys.push(process.env.GOOGLE_API_KEY);
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) keys.push(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const seen = new Set(keys);
  for (const f of envFiles()) {
    let txt;
    try { txt = readFileSync(f, 'utf8'); } catch { continue; }
    const re = /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)\s*=\s*["']?([^"'\n]+)/gm;
    let m;
    while ((m = re.exec(txt))) {
      const v = m[2].trim().replace(/["']$/, '');
      if (v.length >= 15 && !seen.has(v)) { seen.add(v); keys.push(v); }
    }
  }
  return keys;
}

async function testModel(key, model) {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }] }),
        signal: AbortSignal.timeout(30000),
      }
    );
    return r.status === 200;
  } catch { return false; }
}

// All working key+model pairs, best first. Quota is per-key-per-model, so a
// dead pair (daily 429) doesn't poison the others — failover walks this list.
export async function getCandidates() {
  if (cachedList) return cachedList;
  const out = [];
  for (const key of candidateKeys()) {
    for (const model of MODELS) {
      if (await testModel(key, model)) out.push({ key, model });
    }
  }
  cachedList = out;
  if (out.length) console.log(`[gemini] ${out.length} working pair(s): ${out.map(c=>c.model+'...'+c.key.slice(-4)).join(', ')}`);
  return out;
}

// Kept for callers that want a single client — first working pair.
export async function getClient() {
  const list = await getCandidates();
  if (!list.length) throw new Error('No working Gemini API key found (set GEMINI_API_KEY)');
  return list[lastGood];
}

// Try candidates in order (last-success first), fail over on any error.
async function callVision(parts, opts) {
  const list = await getCandidates();
  if (!list.length) throw new Error('No working Gemini API key found (set GEMINI_API_KEY)');
  const order = [...list.slice(lastGood), ...list.slice(0, lastGood)];
  let lastErr = null;
  for (let i = 0; i < order.length; i++) {
    const c = order[i];
    try {
      const r = await generateContent(c, parts, opts);
      lastGood = list.indexOf(c);
      return r;
    } catch (e) {
      lastErr = e;
      console.warn(`[gemini] ${c.model}...${c.key.slice(-4)} failed: ${e.message?.slice(0,120)}`);
    }
  }
  throw lastErr || new Error('All Gemini candidates failed');
}

// ---------- JSON repair ----------
export function repairJson(txt) {
  let t = String(txt).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i === -1 || j === -1 || j <= i) return null;
  const frag = t.slice(i, j + 1).replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(frag); } catch {}
  // last resort: try jsonrepair-style via Function? keep it strict — return null
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CALL_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = [2_000, 5_000, 10_000]; // exponential-ish, per spec

function isRetryableStatus(status) {
  return status === 429 || status === 503 || status === 500;
}

async function generateContent({ key, model }, parts, { temperature = 0.2, maxOutputTokens = 4096 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const genConfig = { responseMimeType: 'application/json', temperature, maxOutputTokens };
  const post = (body) => fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  let lastErr = null;
  const maxAttempts = RETRY_BACKOFF_MS.length + 1; // 3 attempts total
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const r = await post({
        contents: [{ parts }],
        generationConfig: genConfig,
      });
      if (!r.ok) {
        if (isRetryableStatus(r.status) && attempt < maxAttempts - 1) {
          lastErr = new Error(`Gemini HTTP ${r.status}`);
          await sleep(RETRY_BACKOFF_MS[attempt]);
          continue;
        }
        const t = await r.text();
        throw new Error(`Gemini HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      const txt = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      const data = repairJson(txt);
      if (data !== null) return data;
      // malformed JSON: one nudge retry
      const nudgeBody = {
        contents: [{ parts: [...parts, { text: 'Your previous reply was not valid JSON. Reply again with ONLY the JSON object, no markdown fences, no commentary.' }] }],
        generationConfig: genConfig,
      };
      const r2 = await post(nudgeBody);
      if (r2.ok) {
        const j2 = await r2.json();
        const txt2 = j2?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        const data2 = repairJson(txt2);
        if (data2 !== null) return data2;
        lastErr = new Error(`Gemini returned unparseable JSON: ${txt2.slice(0, 120)}`);
        return null; // give up on this call after nudge fails
      }
      if (isRetryableStatus(r2.status) && attempt < maxAttempts - 1) {
        lastErr = new Error(`Gemini nudge retry HTTP ${r2.status}`);
        await sleep(RETRY_BACKOFF_MS[attempt]);
        continue;
      }
      lastErr = new Error(`Gemini nudge retry HTTP ${r2.status}`);
      return null;
    } catch (e) {
      lastErr = e;
      // retry timeouts/aborts and network errors; don't retry non-retryable HTTP errors
      const retryable = e.name === 'TimeoutError' || e.name === 'AbortError'
        || e.cause?.name === 'TimeoutError' || /fetch failed|ECONN|ETIMEDOUT|socket/i.test(e.message || '');
      if (!retryable || attempt >= maxAttempts - 1) break;
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
  throw lastErr || new Error('Gemini call failed');
}

// ---------- prompts (observation prompt verbatim from vision_spike.py) ----------
export const OBSERVE_PROMPT = `You are analyzing a photo of a real-world place (street, shop, park, cafe) for a gift-hiding game.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "placeType": "...",
  "observations": [
    {
      "description": "short specific visual detail a person could recognise, e.g. 'blue painted door', 'chalkboard menu', 'red bench', 'hanging sign with yellow text'",
      "category": "detail|object|sign|text|lighting|layout",
      "bbox": [x, y, w, h],
      "confidence": 0.0,
      "hideSpotPotential": true
    }
  ]
}

Rules:
- bbox is [x, y, width, height] normalised to 0-1 of the image, tightly framing the described detail (include a small margin, not the whole scene).
- Give 8-15 observations, prioritising distinctive, memorable details over generic ones.
- confidence is your certainty the bbox correctly localises the described object.
- hideSpotPotential = true if a small gift could plausibly be hidden at/near this spot (behind it, under it, taped to it, in a gap near it).
- If the image has readable text, transcribe it in the description.`;

export const CROSS_PROMPT = `You are designing a gift-hunt trail for a real-world place, from observations made of photos taken there.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "throughline": "one short sentence, max ~15 words, naming the concrete observed detail(s) that unite the photos, e.g. 'every shot centres the same blue door on a brick wall'",
  "placeGuess": "short specific place name or type, e.g. 'a blue-doored cafe in Seongsu' — not a list, not a paragraph",
  "hideSpots": [
    {
      "description": "a concrete physical hiding spot for a small gift, specific enough to find in person",
      "basedOnObservation": "index of the photo (0-based as listed below) whose observation inspired this",
      "confidence": 0.0
    }
  ],
  "roundMaterial": {
    "r2Question": "a natural quiz question asking what ties two different shots of this place together",
    "r2Correct": "the correct answer, one clean natural sentence a person would actually say — NO raw field names, no 'placeGuess', no observation dumps",
    "r2Distractors": ["wrong answer 1", "wrong answer 2", "wrong answer 3"],
    "r3Question": "a natural quiz question whose answer is what this place is",
    "r3Correct": "the correct answer naming the place, one clean sentence",
    "r3Distractors": ["wrong answer 1", "wrong answer 2", "wrong answer 3"]
  }
}

Rules:
- hideSpots: 3-5 proposals, ordered best-first. Prefer durable, concealed, public/semi-public spots. Ground each in a specific observed detail (name the detail, not just the photo).
- basedOnObservation is the 0-based photo index shown below.
- throughline must be CONCRETE and photo-grounded: name the actual observed details (objects, colours, text, repeated elements). Max ~15 words. No poetry, no metaphor, no meta-commentary, nothing generic.
- placeGuess: a short specific place name or description grounded in the observations. Do NOT list observations; do NOT hedge at length.
- roundMaterial: write it like a real quiz master who has seen the photos — natural questions and answers grounded in the actual observations. r2Distractors/r3Distractors must be plausible but clearly wrong. Never leak internal field names or dump raw observation text into answers.
- Do NOT invent details not supported by the observations below; mark guesses inside placeGuess if unsure.`;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif',
};
export function mimeFor(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return MIME_BY_EXT[ext] || 'image/jpeg';
}

export async function observeImage(imgBuffer, mime) {
  const b64 = imgBuffer.toString('base64');
  return callVision([
    { inline_data: { mime_type: mime, data: b64 } },
    { text: OBSERVE_PROMPT },
  ], { temperature: 0.2, maxOutputTokens: 4096 });
}

export async function crossImage(bundle) {
  const prompt = CROSS_PROMPT + '\n\nPHOTOS AND OBSERVATIONS:\n' + bundle;
  return callVision([{ text: prompt }], { temperature: 0.3, maxOutputTokens: 2048 });
}
