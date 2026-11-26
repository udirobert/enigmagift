#!/usr/bin/env node
/* Build the hackathon demo video from real product recordings plus generated
   explainer slides. Re-run after verification so evidence facts are current. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'build');
const SLIDES = join(OUT, 'slides');
const SEGMENTS = join(OUT, 'segments');
const WIDTH = 1280;
const HEIGHT = 720;
const FONT = 'Helvetica, Arial, sans-serif';
const MONO = 'Menlo, Monaco, monospace';
const BG = '#120d0a';
const PANEL = '#211711';
const CREAM = '#fff1dc';
const MUTED = '#c8aa86';
const ORANGE = '#dc7138';
const GREEN = '#75c982';
const RED = '#e26d5c';

mkdirSync(SLIDES, { recursive: true });
mkdirSync(SEGMENTS, { recursive: true });

const factsPath = join(ROOT, 'video-facts.json');
const facts = existsSync(factsPath) ? JSON.parse(readFileSync(factsPath, 'utf8')) : {
  status: 'verification in progress',
  passed: '—', total: '13', coverage: '—', criteria: '—',
  evidenceLine: 'Public Test Manager evidence links are indexed in notes/KANECLI-EVIDENCE.md',
  digestLine: 'The final gate digest is written to .testmuai/verify-report.json',
};

const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function wrap(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars && line) { lines.push(line); line = w; }
    else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(lines, x, y, size, color, opts = {}) {
  const lh = opts.lineHeight || Math.round(size * 1.35);
  const family = opts.mono ? MONO : FONT;
  const weight = opts.weight || 400;
  return lines.map((line, i) =>
    `<text x="${x}" y="${y + i * lh}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(line)}</text>`
  ).join('\n');
}

function bulletBlock(items, x, y, size = 28, color = CREAM, maxChars = 66) {
  let out = '';
  let cy = y;
  for (const item of items) {
    const lines = wrap(item, maxChars);
    out += `<circle cx="${x}" cy="${cy - size * .32}" r="5" fill="${ORANGE}"/>`;
    out += textBlock(lines, x + 22, cy, size, color, { lineHeight: Math.round(size * 1.28) });
    cy += lines.length * Math.round(size * 1.28) + 18;
  }
  return out;
}

function slide(name, title, body, opts = {}) {
  const subtitle = opts.subtitle ? `<text x="72" y="142" font-family="${FONT}" font-size="30" fill="${MUTED}">${esc(opts.subtitle)}</text>` : '';
  const kicker = opts.kicker ? `<text x="72" y="64" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="3" fill="${ORANGE}">${esc(opts.kicker.toUpperCase())}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${BG}"/>
  <circle cx="1120" cy="-80" r="330" fill="#30190f" opacity=".72"/>
  <circle cx="-120" cy="700" r="270" fill="#24150e" opacity=".72"/>
  ${kicker}
  <text x="72" y="112" font-family="${FONT}" font-size="48" font-weight="700" fill="${CREAM}">${esc(title)}</text>
  ${subtitle}
  ${body}
  <text x="72" y="680" font-family="${FONT}" font-size="18" fill="${MUTED}">EnigmaGift × KaneCLI Online Hackathon</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toFile(join(SLIDES, name));
}

async function renderSlides() {
  await slide('01-title.png', 'EnigmaGift', textBlock([
    'A photograph becomes a private treasure hunt.',
    'KaneCLI decides whether it deploys.',
  ], 72, 280, 42, CREAM, { lineHeight: 64 }), {
    kicker: 'KaneCLI Online Hackathon', subtitle: 'A live product with a real browser-evidence deployment gate',
  });

  await slide('02-create-intro.png', 'First: create a real gift', textBlock([
    'The giver chooses a meaningful photo, places the hiding spot,',
    'writes the clue and note, then creates a private recipient link.',
  ], 72, 250, 34, CREAM, { lineHeight: 54 }), { kicker: 'Live product' });

  await slide('03-recipient-intro.png', 'Then: the recipient hunts', textBlock([
    'The recipient sees only the photo and clue.',
    'A correct tap reveals the folded note; wrong guesses stay gentle.',
  ], 72, 250, 34, CREAM, { lineHeight: 54 }), { kicker: 'Live product' });

  await slide('04-architecture.png', 'Verification is release authority', bulletBlock([
    'spec/photo-gift.md is the requirements source',
    'KaneCLI assurance tests carry acceptance-criteria tags',
    'Real Chrome replays creation, recipient, wrong-link, closed-link, broken-image and edit paths',
    'scripts/verify-room.mjs validates the evidence stream before deploy',
  ], 92, 235, 28, CREAM, 70) + textBlock([
    'npm run deploy:room  →  build  →  verify  →  deploy',
  ], 92, 585, 28, GREEN, { mono: true, weight: 700 }), { kicker: 'Closed loop' });

  await slide('05-gate.png', 'The gate is designed not to lie green', bulletBlock([
    'Groups tests by start URL and replays them against the exact production-shaped build',
    'Requires a valid Kane plan, suite summary, done event and one ending per selected member',
    'Treats unresolved fixtures and unresolved variables as failures',
    'Writes an agent-readable digest instead of hiding red rows',
  ], 92, 220, 27, CREAM, 70) + textBlock([
    facts.digestLine,
  ], 92, 610, 21, MUTED, { mono: true }), { kicker: 'Fail closed' });

  await slide('06-drift.png', 'What Kane caught on deadline day', bulletBlock([
    'JPEG-only language drifted from intentional PNG/WebP/HEIC acceptance and JPEG normalization',
    '“local storage” drifted from the actual IndexedDB persistent-draft implementation',
    'Generated tests expected Open the note before discovery, contrary to the shipped UX',
    'One edit test used ambiguous stored-link extraction; the repaired design uses the isolated test clipboard',
    'Red rows were triaged openly — requirements, tests and small product details were corrected',
  ], 92, 202, 25, CREAM, 76), { kicker: 'Evidence over theatre' });

  await slide('07-evidence.png', 'Fresh public evidence', `
  <rect x="72" y="190" width="1136" height="150" rx="18" fill="${PANEL}"/>
  <text x="104" y="242" font-family="${FONT}" font-size="34" font-weight="700" fill="${GREEN}">${esc(facts.status)}</text>
  <text x="104" y="292" font-family="${MONO}" font-size="26" fill="${CREAM}">${esc(`${facts.passed}/${facts.total} browser tests passed · ${facts.coverage} criteria coverage`)}</text>
  ` + bulletBlock([
    'Public Test Manager links are committed in notes/KANECLI-EVIDENCE.md',
    'The evidence index separates green proof, repaired drift and explicit coverage debt',
    'Kane coverage is read back with kane-cli cover — not inferred from local terminal output',
  ], 92, 405, 25, CREAM, 75) + textBlock([facts.evidenceLine], 92, 610, 19, MUTED, { mono: true }), { kicker: 'Judge evidence' });

  await slide('08-scope.png', 'A narrow claim, honestly enforced', bulletBlock([
    'Verified: the free single-photo gift creator and recipient journey',
    'Not claimed: Stripe checkout, paid trails, generated 3D worlds or painted keepsakes',
    'The point is the loop: product change → Kane evidence → agent repair → deployment allowed',
  ], 92, 245, 29, CREAM, 72) + `<text x="72" y="594" font-family="${FONT}" font-size="38" font-weight="700" fill="${ORANGE}">If Kane is red, EnigmaGift does not deploy.</text>`, { kicker: 'Scope' });
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

function slideSegment(png, out, duration) {
  run('ffmpeg', ['-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-t', String(duration), '-i', png,
    '-vf', `scale=${WIDTH}:${HEIGHT},format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '30', '-movflags', '+faststart', out]);
}

function recordingSegment(input, out, speed = 0.5) {
  const factor = 1 / speed;
  run('ffmpeg', ['-y', '-v', 'error', '-i', input,
    '-vf', `setpts=${factor}*PTS,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=#120d0a,format=yuv420p`,
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '30', '-movflags', '+faststart', out]);
}

async function main() {
  rmSync(join(OUT, 'concat.txt'), { force: true });
  await renderSlides();
  const plan = [
    ['01-title.png', 9],
    ['02-create-intro.png', 5],
    ['recording:creation', 0],
    ['03-recipient-intro.png', 5],
    ['recording:recipient', 0],
    ['04-architecture.png', 20],
    ['05-gate.png', 25],
    ['06-drift.png', 28],
    ['07-evidence.png', 28],
    ['08-scope.png', 18],
  ];
  const files = [];
  let i = 0;
  for (const [kind, duration] of plan) {
    i += 1;
    const out = join(SEGMENTS, `${String(i).padStart(2, '0')}.mp4`);
    if (kind === 'recording:creation') recordingSegment(join(ROOT, 'recordings/creation.webm'), out, 0.5);
    else if (kind === 'recording:recipient') recordingSegment(join(ROOT, 'recordings/recipient.webm'), out, 0.5);
    else slideSegment(join(SLIDES, kind), out, duration);
    files.push(out);
  }
  writeFileSync(join(OUT, 'concat.txt'), files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join('\n') + '\n');
  const silent = join(OUT, 'enigmagift-kane-demo-silent.mp4');
  run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(OUT, 'concat.txt'), '-c', 'copy', silent]);

  const narrationText = readFileSync(join(ROOT, 'narration.txt'), 'utf8');
  const aiff = join(OUT, 'narration.aiff');
  run('say', ['-r', '150', '-o', aiff, narrationText]);
  const wav = join(OUT, 'narration.wav');
  run('ffmpeg', ['-y', '-v', 'error', '-i', aiff, '-ar', '44100', '-ac', '1', wav]);
  const final = join(ROOT, 'enigmagift-kane-demo.mp4');
  const videoDuration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', silent], { encoding: 'utf8' }).trim());
  run('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', wav,
    '-filter_complex', `[1:a]apad=whole_dur=${videoDuration},atrim=0:${videoDuration}[a]`, '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', final]);
  console.log(final);
}

main().catch((e) => { console.error(e); process.exit(1); });
