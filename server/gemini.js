// Vision calls: per-image observation + cross-image aggregate.
// Primary provider: SandBase (OpenAI-compatible, image_url vision, Bearer auth).
// Fallback: native Google Gemini (generativelanguage.googleapis.com) when a
// working key is available. getCandidates tests each key+model pair with a real
// call, so a dead quota / unknown model never poisons the others — failover
// walks the ordered list, last-success first.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SANDBASE_BASE = 'https://api.sandbase.ai/v1';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Ordered preference per provider. Each is vision-capable; the candidate test
// below confirms it with a tiny image so a non-vision model gets skipped.
const SANDBASE_MODELS = [
  'google/gemini-3.5-flash',
  'google/gemini-3.6-flash',
  'google/gemini-3.5-flash-lite',
  'google/gemini-3.1-flash-lite',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
];
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// 1x1 transparent PNG — cheap proof that a model accepts image input.
const TEST_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let cachedList = null; // [{provider, key, model}] — working pairs, best first
let lastGood = 0;       // index into cachedList that last succeeded

function* envFiles() {
  // Explicit project-local compatibility files only. Never scan sibling
  // projects: credentials must come from this deployment's own configuration.
  for (const f of ['.env', 'sandbase.env']) {
    const p = join(__dirname, f);
    if (existsSync(p)) yield p;
  }
}

// Collect keys per provider. SandBase keys are never sent to the Gemini host
// and vice-versa, so a wrong host for a key is never attempted.
function candidateKeys() {
  const sand = [];
  const gem = [];
  if (process.env.SANDBASE_API_KEY) sand.push(process.env.SANDBASE_API_KEY);
  if (process.env.GEMINI_API_KEY) gem.push(process.env.GEMINI_API_KEY);
  if (process.env.GOOGLE_API_KEY) gem.push(process.env.GOOGLE_API_KEY);
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) gem.push(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

  const seenS = new Set(sand);
  const seenG = new Set(gem);
  for (const f of envFiles()) {
    let txt;
    try { txt = readFileSync(f, 'utf8'); } catch { continue; }
    let m;
    const reS = /^SANDBASE_API_KEY\s*=\s*["']?([^"'\n]+)/gm;
    while ((m = reS.exec(txt))) {
      const v = m[1].trim().replace(/["']$/, '');
      if (v.length >= 15 && !seenS.has(v)) { seenS.add(v); sand.push(v); }
    }
    const reG = /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY)\s*=\s*["']?([^"'\n]+)/gm;
    while ((m = reG.exec(txt))) {
      const v = m[2].trim().replace(/["']$/, '');
      if (v.length >= 15 && !seenG.has(v)) { seenG.add(v); gem.push(v); }
    }
  }
  return { sand, gem };
}

async function testSandbase(key, model) {
  try {
    const r = await fetch(`${SANDBASE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${TEST_PNG_B64}` } },
          { type: 'text', text: 'Reply with the single word: ok' },
        ] }],
        max_tokens: 8,
      }),
      signal: AbortSignal.timeout(30000),
    });
    return r.status === 200;
  } catch { return false; }
}

async function testGemini(key, model) {
  try {
    const r = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word: ok' }] }] }),
      signal: AbortSignal.timeout(30000),
    });
    return r.status === 200;
  } catch { return false; }
}

// All working key+model pairs, best first. SandBase is tried before native
// Gemini so the paid key is used first; native free-tier keys remain as an
// automatic fallback if SandBase is unavailable.
export async function getCandidates() {
  if (cachedList) return cachedList;
  const { sand, gem } = candidateKeys();
  const out = [];
  for (const key of sand) {
    for (const model of SANDBASE_MODELS) {
      if (await testSandbase(key, model)) out.push({ provider: 'sandbase', key, model });
    }
  }
  for (const key of gem) {
    for (const model of GEMINI_MODELS) {
      if (await testGemini(key, model)) out.push({ provider: 'gemini', key, model });
    }
  }
  cachedList = out;
  if (out.length) console.log(`[vision] ${out.length} working pair(s): ${out.map(c => c.provider + ':' + c.model + '...' + c.key.slice(-4)).join(', ')}`);
  return out;
}

// Kept for callers that want a single client — first working pair.
export async function getClient() {
  const list = await getCandidates();
  if (!list.length) throw new Error('No working vision key found (set SANDBASE_API_KEY or GEMINI_API_KEY)');
  return list[lastGood];
}

// Try candidates in order (last-success first), fail over on any error.
async function callVision(parts, opts) {
  const list = await getCandidates();
  if (!list.length) throw new Error('No working vision key found (set SANDBASE_API_KEY or GEMINI_API_KEY)');
  const order = [...list.slice(lastGood), ...list.slice(0, lastGood)];
  let lastErr = null;
  for (let i = 0; i < order.length; i++) {
    const c = order[i];
    try {
      const r = c.provider === 'sandbase' ? await callSandbase(c, parts, opts) : await callGemini(c, parts, opts);
      lastGood = list.indexOf(c);
      return r;
    } catch (e) {
      lastErr = e;
      console.warn(`[vision] ${c.provider}:${c.model}...${c.key.slice(-4)} failed: ${e.message?.slice(0, 120)}`);
    }
  }
  throw lastErr || new Error('All vision candidates failed');
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
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CALL_TIMEOUT_MS = 60_000;
const RETRY_BACKOFF_MS = [2_000, 5_000, 10_000]; // exponential-ish, per spec

function isRetryableStatus(status) {
  return status === 429 || status === 503 || status === 500;
}

// Shared retry + JSON-nudge logic. `doPost(body)` returns a Response; `extract`
// pulls the raw text out of the parsed JSON; `buildBody` maps a nudge flag to a
// body. Returns the repaired JSON object, or throws after exhausting retries.
async function generateWithRetry({ doPost, extract, buildBody, label }) {
  let lastErr = null;
  const maxAttempts = RETRY_BACKOFF_MS.length + 1; // 3 attempts total
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const r = await doPost(buildBody(false));
      if (!r.ok) {
        if (isRetryableStatus(r.status) && attempt < maxAttempts - 1) {
          lastErr = new Error(`${label} HTTP ${r.status}`);
          await sleep(RETRY_BACKOFF_MS[attempt]);
          continue;
        }
        const t = await r.text();
        throw new Error(`${label} HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      const txt = extract(j);
      const data = repairJson(txt);
      if (data !== null) return data;
      // malformed JSON: one nudge retry
      const r2 = await doPost(buildBody(true));
      if (r2.ok) {
        const j2 = await r2.json();
        const data2 = repairJson(extract(j2));
        if (data2 !== null) return data2;
        lastErr = new Error(`${label} returned unparseable JSON: ${extract(j2).slice(0, 120)}`);
        throw lastErr; // surface to caller so failover can try the next candidate
      }
      if (isRetryableStatus(r2.status) && attempt < maxAttempts - 1) {
        lastErr = new Error(`${label} nudge retry HTTP ${r2.status}`);
        await sleep(RETRY_BACKOFF_MS[attempt]);
        continue;
      }
      lastErr = new Error(`${label} nudge retry HTTP ${r2.status}`);
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
  throw lastErr || new Error(`${label} call failed`);
}

async function callSandbase({ key, model }, parts, { temperature = 0.2, maxOutputTokens = 4096 } = {}) {
  const content = [];
  for (const p of parts) {
    if (p.text) content.push({ type: 'text', text: p.text });
    else if (p.inline_data) content.push({ type: 'image_url', image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } });
  }
  const nudge = { type: 'text', text: 'Your previous reply was not valid JSON. Reply again with ONLY the JSON object, no markdown fences, no commentary.' };
  const buildBody = (nudged) => ({
    model,
    messages: [{ role: 'user', content: nudged ? [...content, nudge] : content }],
    temperature,
    max_tokens: maxOutputTokens,
  });
  return generateWithRetry({
    label: 'Sandbase',
    extract: (j) => j?.choices?.[0]?.message?.content || '',
    buildBody,
    doPost: (body) => fetch(`${SANDBASE_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    }),
  });
}

async function callGemini({ key, model }, parts, { temperature = 0.2, maxOutputTokens = 4096 } = {}) {
  const genConfig = { responseMimeType: 'application/json', temperature, maxOutputTokens };
  const nudge = { text: 'Your previous reply was not valid JSON. Reply again with ONLY the JSON object, no markdown fences, no commentary.' };
  const buildBody = (nudged) => ({
    contents: [{ parts: nudged ? [...parts, nudge] : parts }],
    generationConfig: genConfig,
  });
  return generateWithRetry({
    label: 'Gemini',
    extract: (j) => j?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '',
    buildBody,
    doPost: (body) => fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    }),
  });
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
  "placeGuess": "a concrete, specific place a person could point at — name it if you can read it (signs, plaques, street names), otherwise describe the exact building with its most distinctive observed features. e.g. 'Fort Point under the Golden Gate Bridge', 'the cafe under the blue-doored entrance on the corner'. NEVER a generic scene category ('urban streetscapes', 'a cafe area', 'outdoor public spaces') — that is a wrong answer",
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
- placeGuess: concrete and specific — name the actual place (from any readable sign/plaque/street name in the photos), or describe the exact building with its most distinctive observed features. A generic scene category ('urban streetscapes', 'a cafe area', 'outdoor public spaces', 'historic brick walls') is a WRONG answer; if you cannot name a specific place, say so in one clause (e.g. 'a small plaza with a white-columned entrance'). Do NOT list observations; do NOT hedge at length.
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

export const LETTER_PROMPT = `You are helping someone write the short letter a person will read at the end of a photo trail about a place they share.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "drafts": ["...", "...", "..."]
}

Rules:
- Three drafts, each 2-4 sentences, first person, speaking to the reader as "you".
- Voice: spoken, not written. Plain words, short sentences. The page already prints the greeting and the signature, so include neither.
- Warm, specific and a little restrained. Never use sentimental filler ("words cannot express", "you mean the world to me").
- Ground every draft in the observed details below: name one or two concrete things actually seen in the photos.
- Do NOT invent shared memories, names, dates, events or feelings that are not in the observations or the writer's notes.
- Three different registers: (1) plain and warm, (2) playful, (3) short and quiet.
- Never mention AI, analysis, clues, puzzles, rounds or the gift mechanism. Only the place and the person.
- No emoji, no exclamation marks, no em dashes.`;

export async function letterDrafts({ bundle, direction = 'someone', notes = '' }) {
  const who =
    direction === 'me'
      ? 'The writer and the reader are the same person: this is a letter to their future self.'
      : 'The writer shared this place with the reader.';
  const prompt = [
    LETTER_PROMPT,
    '',
    who,
    notes ? `The writer's own note about what they want to say:\n${notes}` : '',
    '',
    'PLACE OBSERVATIONS:',
    bundle,
  ].join('\n');
  const data = await callVision([{ text: prompt }], { temperature: 0.85, maxOutputTokens: 900 });
  const drafts = Array.isArray(data?.drafts)
    ? data.drafts.filter((d) => typeof d === 'string' && d.trim()).slice(0, 3)
    : [];
  if (!drafts.length) throw new Error('no drafts returned');
  return drafts.map((d) => d.trim());
}

export async function crossImage(bundle) {
  const prompt = CROSS_PROMPT + '\n\nPHOTOS AND OBSERVATIONS:\n' + bundle;
  return callVision([{ text: prompt }], { temperature: 0.3, maxOutputTokens: 2048 });
}
