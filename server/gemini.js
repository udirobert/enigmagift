// Gemini vision calls: per-image observation + cross-image aggregate.
// Key discovery mirrors /tmp/enigmabox-spike/vision_spike.py.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];
const DEV_DIR = '/Users/udingethe/Dev';

let cached = null; // {key, model}

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

export async function getClient() {
  if (cached) return cached;
  for (const key of candidateKeys()) {
    for (const model of MODELS) {
      if (await testModel(key, model)) {
        cached = { key, model };
        console.log(`[gemini] using ${model} key...${key.slice(-4)}`);
        return cached;
      }
    }
  }
  throw new Error('No working Gemini API key found (set GEMINI_API_KEY)');
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

async function generateContent({ key, model }, parts, { temperature = 0.2, maxOutputTokens = 4096 } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens },
  };
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(150000),
      });
      if (r.status === 429 || r.status === 503) {
        lastErr = new Error(`Gemini HTTP ${r.status}`);
        await sleep(20000 * (attempt + 1));
        continue;
      }
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Gemini HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      const txt = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      const data = repairJson(txt);
      if (data !== null) return data;
      // malformed JSON: one nudge retry inside the same attempt budget
      const nudgeBody = {
        contents: [{ parts: [...parts, { text: 'Your previous reply was not valid JSON. Reply again with ONLY the JSON object, no markdown fences, no commentary.' }] }],
        generationConfig: body.generationConfig,
      };
      const r2 = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nudgeBody),
        signal: AbortSignal.timeout(150000),
      });
      if (r2.ok) {
        const j2 = await r2.json();
        const txt2 = j2?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        const data2 = repairJson(txt2);
        if (data2 !== null) return data2;
        lastErr = new Error(`Gemini returned unparseable JSON: ${txt2.slice(0, 120)}`);
      } else {
        lastErr = new Error(`Gemini nudge retry HTTP ${r2.status}`);
        if (r2.status === 429 || r2.status === 503) { await sleep(20000 * (attempt + 1)); continue; }
      }
      return null; // give up on this call after nudge fails
    } catch (e) {
      lastErr = e;
      await sleep(5000 * (attempt + 1));
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
  "throughline": "one-sentence poetic thread that unites the place and what the observations reveal",
  "placeGuess": "best guess of the actual place name or description",
  "hideSpots": [
    {
      "description": "a concrete physical hiding spot for a small gift, specific enough to find in person",
      "basedOnObservation": "index of the photo (0-based as listed below) whose observation inspired this",
      "confidence": 0.0
    }
  ]
}

Rules:
- hideSpots: 3-5 proposals, ordered best-first. Prefer durable, concealed, public/semi-public spots. Ground each in a specific observed detail (name the detail, not just the photo).
- basedOnObservation is the 0-based photo index shown below.
- throughline must feel personal and specific to THIS place, not generic.
- Do NOT invent details not supported by the observations below; mark guesses inside placeGuess if unsure.`;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.heic': 'image/heic', '.heif': 'image/heif',
};
export function mimeFor(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return MIME_BY_EXT[ext] || 'image/jpeg';
}

export async function observeImage(client, imgBuffer, mime) {
  const b64 = imgBuffer.toString('base64');
  return generateContent(client, [
    { inline_data: { mime_type: mime, data: b64 } },
    { text: OBSERVE_PROMPT },
  ], { temperature: 0.2, maxOutputTokens: 4096 });
}

export async function crossImage(client, bundle) {
  const prompt = CROSS_PROMPT + '\n\nPHOTOS AND OBSERVATIONS:\n' + bundle;
  return generateContent(client, [{ text: prompt }], { temperature: 0.3, maxOutputTokens: 2048 });
}
