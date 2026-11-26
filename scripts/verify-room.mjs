#!/usr/bin/env node
/* Deploy gate: build → serve the room dist locally (with /api proxied to the
   production API, exactly like the deployed worker) → replay the Kane suite →
   block the deploy on any failure with an agent-readable digest.

   The suite's fixture URLs are regenerated each run from spec/fixtures.json
   plus the served origin, so the same tests work against any local port. */

import { spawn } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dog-gift-tabletop/dist');
const API_ORIGIN = 'https://enigmagift-api.fly.dev';
const VARIABLES_OUT = resolve(ROOT, '.testmuai/variables/assurance.json');
const TESTS_DIR = resolve(ROOT, '.testmuai/tests');
const STAGED_TESTS_DIR = resolve(ROOT, '.testmuai/testruns/submission');
const REPORT = resolve(ROOT, '.testmuai/verify-report.json');
const NDJSON_LOG = resolve(ROOT, '.testmuai/verify.ndjson');
const PORT = Number(process.env.EG_VERIFY_PORT || 4299);

const fixtures = JSON.parse(
  readFileSync(resolve(ROOT, 'spec/fixtures.json'), 'utf8'),
);
const origin = `http://127.0.0.1:${PORT}`;
const giftUrl = (token) => `${origin}/?photo=1#gift=${token}`;

const variableValues = () => ({
  start_url: `${origin}/?photo=1`,
  jpeg_photo: resolve(ROOT, fixtures.jpegPhoto),
  non_jpeg_photo: resolve(ROOT, fixtures.nonJpegPhoto),
  png_photo: resolve(ROOT, fixtures.pngPhoto),
  webp_photo: resolve(ROOT, fixtures.webpPhoto),
  unsupported_photo: resolve(ROOT, fixtures.unsupportedPhoto),
  valid_gift_url: giftUrl(fixtures.validGiftToken),
  revoked_gift_url: giftUrl(fixtures.revokedGiftToken),
  unknown_gift_url: giftUrl(fixtures.unknownGiftToken),
  broken_photo_gift_url: giftUrl(fixtures.brokenPhotoGiftToken),
  gift_clue: fixtures.gift.clue,
  recipient_name: fixtures.gift.to,
  gift_message: fixtures.gift.message,
  sender_name: fixtures.gift.from,
  hiding_spot_location: fixtures.hidingSpotLocation,
  outside_spot_location: fixtures.outsideSpotLocation,
});

const VAR_DEScriptions = {
  start_url: 'Product browser URL for EnigmaGift; the creator is accessible with ?photo=1.',
  jpeg_photo: 'Path to a JPEG photo fixture accessible to the browser\'s file picker.',
  non_jpeg_photo: 'Path to a legacy non-JPEG fixture retained for superseded audit tests.',
  png_photo: 'Path to a PNG photo fixture accessible to the browser\'s file picker.',
  webp_photo: 'Path to a WebP photo fixture accessible to the browser\'s file picker.',
  unsupported_photo: 'Path to an unsupported image fixture accessible to the browser\'s file picker.',
  valid_gift_url: 'Browser URL for a shareable EnigmaGift recipient gift.',
  revoked_gift_url: 'Browser recipient URL for a revoked EnigmaGift gift.',
  unknown_gift_url: 'Browser recipient URL for an unknown EnigmaGift gift.',
  broken_photo_gift_url: 'Browser recipient URL for a gift with a photo that cannot load but an accessible note.',
  gift_clue: 'Exact clue on the valid recipient gift.',
  recipient_name: 'Recipient name in the seeded gift note.',
  gift_message: 'Exact message in the seeded gift note.',
  sender_name: 'Sender name in the seeded gift note.',
  hiding_spot_location: 'Unambiguous visible location of the hiding spot on the valid gift photo.',
  outside_spot_location: 'Unambiguous visible location on the valid gift photo outside its hiding spot.',
};

function writeVariables() {
  const values = variableValues();
  const vars = {};
  for (const [k, val] of Object.entries(values)) {
    vars[k] = { value: val, secret: false, description: VAR_DEScriptions[k] || '', ...(k.endsWith('_url') ? { start_page: true } : {}) };
  }
  mkdirSync(dirname(VARIABLES_OUT), { recursive: true });
  writeFileSync(VARIABLES_OUT, JSON.stringify(vars, null, 2) + '\n');
}

/* Run copies of the committed tests rather than the source files. Kane's
   replay cache is machine-local sidecar state; when a step's prose changes the
   cascade re-authors from that step onward, while unchanged steps can replay
   quickly. The committed sources stay clean enough that a fresh clone — or a
   judge — never depends on another org's identity. */
function stageTests() {
  mkdirSync(STAGED_TESTS_DIR, { recursive: true });
  for (const stale of readdirSync(STAGED_TESTS_DIR).filter((n) => n.endsWith('_test.md'))) {
    unlinkSync(join(STAGED_TESTS_DIR, stale));
  }
  const match = process.env.EG_VERIFY_MATCH ? new RegExp(process.env.EG_VERIFY_MATCH) : null;
  const staged = new Map();
  for (const f of readdirSync(TESTS_DIR).filter((n) => n.endsWith('_test.md') && (!match || match.test(n)))) {
    const out = join(STAGED_TESTS_DIR, f);
    copyFileSync(join(TESTS_DIR, f), out);
    staged.set(f, out);
  }
  return staged;
}

/* Group suite members by the URL their Step 1 opens — replays need
   --override-start-url and each group's start differs. */
function groupTests(staged) {
  const values = variableValues();
  const groups = new Map();
  const skipped = [];
  for (const [f, stagedPath] of staged) {
    const body = readFileSync(join(TESTS_DIR, f), 'utf8');
    const m = body.match(/\{\{([a-z_]+)\}\}/);
    const url = m ? values[m[1]] : undefined;
    if (!url) { skipped.push({ test: f, reason: m ? `no value for ${m[1]}` : 'no start variable found' }); continue; }
    if (!groups.has(url)) groups.set(url, []);
    groups.get(url).push(stagedPath);
  }
  return { groups, skipped };
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary',
};

/* Static dist + /api proxy to the production API — the same shape the
   deployed worker serves, without needing workerd. The API reads caller
   identity from headers it already gets from browsers; nothing extra is
   injected here. */
function startServer() {
  return new Promise((res, rej) => {
    const server = http.createServer(async (req, r) => {
      try {
        const u = new URL(req.url, 'http://local');
        if (u.pathname.startsWith('/api/')) {
          /* Broken-photo fixture: metadata is proxied from the seeded valid
             gift, while its image is deliberately unavailable. That creates
             the exact state the resilience test needs without mutating the
             production database. */
          const brokenMeta = `/api/photo-gifts/${fixtures.brokenPhotoGiftToken}`;
          const brokenImage = `${brokenMeta}/image`;
          if (u.pathname === brokenImage) {
            r.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            r.end(JSON.stringify({ error: 'gift_unavailable' }));
            return;
          }
          const upstreamPath = u.pathname === brokenMeta
            ? `/api/photo-gifts/${fixtures.validGiftToken}`
            : u.pathname;
          const headers = new Headers(req.headers);
          headers.delete('host'); headers.delete('origin');
          headers.delete('cookie'); headers.delete('content-length');
          const body = req.method === 'GET' || req.method === 'HEAD'
            ? undefined : await new Promise((b, e) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => b(Buffer.concat(chunks)));
              req.on('error', e);
            });
          const up = await fetch(API_ORIGIN + upstreamPath + u.search, {
            method: req.method, headers, body, redirect: 'manual',
          });
          const outHeaders = Object.fromEntries(up.headers.entries());
          /* undici already decoded the body — don't advertise the wire
             encoding or its byte count. */
          delete outHeaders['content-encoding'];
          delete outHeaders['content-length'];
          delete outHeaders['transfer-encoding'];
          r.writeHead(up.status, outHeaders);
          r.end(Buffer.from(await up.arrayBuffer()));
          return;
        }
        let file = normalize(join(DIST, u.pathname === '/' ? 'index.html' : u.pathname));
        if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
          file = join(DIST, 'index.html'); // SPA fallback
        }
        r.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        r.end(readFileSync(file));
      } catch (e) {
        r.writeHead(502); r.end(String(e));
      }
    });
    server.listen(PORT, '127.0.0.1', () => res(server));
    server.on('error', rej);
  });
}

const waitReady = (url, tries = 60) => new Promise((res, rej) => {
  const attempt = (n) => {
    const req = http.get(url, (r) => {
      r.resume();
      if (r.statusCode === 200) return res();
      if (n <= 0) return rej(new Error(`${url} -> ${r.statusCode}`));
      setTimeout(() => attempt(n - 1), 500);
    });
    req.on('error', () => {
      if (n <= 0) return rej(new Error(`${url} unreachable`));
      setTimeout(() => attempt(n - 1), 500);
    });
  };
  attempt(tries);
});

async function main() {
  if (process.env.EG_SKIP_VERIFY === '1') {
    console.log('verify: skipped by EG_SKIP_VERIFY=1');
    return;
  }
  if (!existsSync(TESTS_DIR)) {
    console.error('verify: no .testmuai/tests suite found');
    process.exit(1);
  }

  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('verify: no room build found — run npm run build:room first');
    process.exit(1);
  }
  const server = await startServer();
  const stop = () => {
    try { server.close(); server.closeAllConnections?.(); } catch { /* already gone */ }
  };
  console.log(`verify: serving the room build on ${origin}`);

  try {
    await waitReady(`${origin}/`);
  } catch (e) {
    console.error(`verify: local room did not come up — ${e.message}`);
    process.exit(1);
  }

  const failures = [];

  writeVariables();
  const staged = stageTests();
  const { groups, skipped } = groupTests(staged);
  const selectedCount = [...groups.values()].reduce((n, files) => n + files.length, 0);
  if (selectedCount === 0) {
    console.error('verify: no runnable tests selected');
    process.exit(1);
  }

  /* Replays target a start URL per group (a member's recorded first navigate
     is a start-page placeholder — --override-start-url retargets it). */
  const events = [];
  const groupResults = [];
  let code = 0;
  for (const [url, files] of groups) {
    console.log(`verify: ${files.length} test(s) against ${url}`);
    const eventStart = events.length;
    const kane = spawn('kane-cli', [
      'testrun', 'run',
      '--agent', '--headless', '--on-failure', 'continue',
      '--parallel', process.env.EG_VERIFY_PARALLEL || '2',
      '--override-start-url', url,
      ...files,
    ], {
      cwd: ROOT,
      env: { ...process.env, KANE_CLI_USER_AGENT: process.env.KANE_CLI_USER_AGENT || 'devin' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const rl = createInterface({ input: kane.stdout });
    rl.on('line', (line) => {
      try { events.push(JSON.parse(line)); } catch { /* not json */ }
    });
    const c = await new Promise((res) => kane.on('close', res));
    rl.close();
    if (c !== 0) code = code || c;

    const groupEvents = events.slice(eventStart);
    const plan = groupEvents.find((e) => e.type === 'testrun_plan');
    const summary = groupEvents.find((e) => e.type === 'testrun_summary');
    const done = groupEvents.find((e) => e.type === 'testrun_done');
    const memberEnds = groupEvents.filter((e) =>
      (e.type === 'testrun_member_end' || e.type === 'testrun_authored_member_end'));
    const unresolved = groupEvents.flatMap((e) =>
      e.type === 'warning' && e.code === 'unresolved_variables' ? e.variables || [] : []);
    groupResults.push({
      url,
      tests: files.map((f) => f.split('/').pop()),
      exit_code: c,
      plan_valid: plan?.valid,
      member_end_count: memberEnds.length,
      expected_count: files.length,
      summary: summary?.totals,
      overall_status: done?.overall_status,
      unresolved_variables: unresolved.map((v) => v.name),
    });

    if (!plan || plan.valid !== true) {
      failures.push({ kind: 'plan', url, message: 'missing or invalid testrun plan', tests: files.map((f) => f.split('/').pop()) });
    }
    if (!summary) {
      failures.push({ kind: 'structure', url, message: 'missing testrun summary — cannot prove the suite completed' });
    }
    if (!done) {
      failures.push({ kind: 'structure', url, message: 'missing testrun completion event — cannot prove the suite completed' });
    } else if (done.overall_status !== 'passed') {
      failures.push({ kind: 'suite', url, status: done.overall_status, message: 'suite did not pass' });
    }
    if (memberEnds.length < files.length) {
      failures.push({
        kind: 'structure', url,
        message: `only ${memberEnds.length} of ${files.length} selected tests reported an end event`,
      });
    }
    for (const v of unresolved) {
      failures.push({ kind: 'variables', url, variable: v.name, reason: v.reason });
    }
  }
  writeFileSync(NDJSON_LOG, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

  /* Digest: pull every non-passing member plus the evidence pointers so an
     agent (or a human) can act on the failure without re-running. */
  for (const e of events) {
    const member = e.type === 'testrun_member_event' ? e.member?.path : e.path;
    const inner = e.type === 'testrun_member_event' ? e.event : e;
    if (!inner) continue;
    if (inner.type === 'test_md_step_end' && inner.status !== 'passed') {
      failures.push({ test: member, step: inner.step_index, kind: 'step', status: inner.status });
    }
    if (inner.type === 'test_md_summary' && inner.overall_status !== 'passed') {
      failures.push({
        test: member, kind: 'test', status: inner.overall_status,
        share_url: inner.share_url,
        steps: inner.steps,
      });
    }
    if ((inner.type === 'testrun_member_end' || inner.type === 'testrun_authored_member_end')
      && inner.status !== 'passed') {
      failures.push({
        test: inner.path || member, kind: 'member', status: inner.status,
        message: inner.failure?.message, step: inner.failure?.step_index,
        log: inner.log_path,
      });
    }
    if (inner.type === 'run_end' && inner.status !== 'passed') {
      failures.push({
        test: member, kind: 'run', status: inner.status,
        reason: inner.reason, reason_code: inner.reason_code,
        session_dir: inner.session_dir,
      });
    }
  }
  const failed = failures.length > 0 || code !== 0;
  writeFileSync(REPORT, JSON.stringify({
    ran_at: new Date().toISOString(),
    exit_code: code,
    failures,
    skipped,
    groups: groupResults,
    log: NDJSON_LOG,
  }, null, 2) + '\n');

  if (failed) {
    console.error('\nverify: FAILED — deploy blocked. Failure digest:');
    for (const f of failures) console.error(`  • ${JSON.stringify(f)}`);
    console.error(`  report: ${REPORT}\n  raw log: ${NDJSON_LOG}`);
    console.error('  Bypass (emergency only): EG_SKIP_VERIFY=1 npm run deploy:room');
    stop();
    process.exit(1);
  }
  console.log('verify: suite passed — deploy may proceed.');
  stop();
}

main().catch((e) => {
  console.error(`verify: gate error — ${e.message}`);
  process.exit(1);
});
