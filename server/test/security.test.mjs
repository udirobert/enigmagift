// Security regression tests — boots the real server on a throwaway DB and
// asserts the auth/payment/scoping invariants. Run: node test/security.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { stripExif } from '../exif.js';
import { roomCreateRateKey } from '../room-gifts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..', 'index.js');
const PHOTO = join(HERE, '..', '..', 'public', 'showcase', '0.jpg');
const PORT = 8898;
const BASE = `http://127.0.0.1:${PORT}`;
// generated per run — no fixed fixture looking like a real whsec_ secret
const SECRET = crypto.randomBytes(24).toString('hex');
// same for the edge→API visitor-proof shared secret (generated, never a real value)
const ROOM_SECRET = crypto.randomBytes(32).toString('hex');

const tmp = mkdtempSync(join(tmpdir(), 'eg-sec-'));

// Module-load preload: provider modules (pipeline/world/portrait) can reach
// paid APIs and discover credentials from sibling .env files, so the test
// server must never import them. A resolve hook swaps each for a stub when
// index.js asks for them; fetch is disabled outright as a second guard.
const PRELOAD = join(tmp, 'isolate-providers.mjs');
writeFileSync(PRELOAD, `import { registerHooks } from 'node:module';
const modules = {
 './pipeline.js': 'export async function runPipeline(){}; export async function reclue(){};',
 './world.js': 'export async function buildWorld(){};',
 './portrait.js': 'export async function buildPortrait(){}; export function portraitMime(){return "image/webp";};'
};
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/server/index.js') && modules[specifier]) return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};
 return next(specifier,context);
}});
import { Server } from 'node:net';
const originalListen = Server.prototype.listen;
Server.prototype.listen = function (port, callback) {
 return originalListen.call(this, port, '127.0.0.1', callback);
};
globalThis.fetch = async () => { throw new Error('External HTTP disabled in security tests'); };
`);

// whitelisted env only — cwd is the temp dir so dotenv/config can never
// pick up server/*.env (provider credentials) or repo .env files
const env = {
  PATH: process.env.PATH,
  PORT: String(PORT),
  DB_PATH: join(tmp, 'test.db'),
  UPLOADS_DIR: join(tmp, 'uploads'),
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_API_KEY: '', // mark-paid must fail closed; also blocks stripe fetch
  ROOM_PROXY_SECRET: ROOM_SECRET,
};

let serverLog = '';
let spawnError = null;
const launchServer = () => {
  serverLog = '';
  spawnError = null;
  const child = spawn(process.execPath, ['--import', pathToFileURL(PRELOAD).href, SERVER], {
    cwd: tmp,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  child.on('error', (error) => { spawnError = error; });
  return child;
};
let srv = launchServer();

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log(`  ok — ${name}`); }
  catch (e) { results.push(['FAIL', name]); console.error(`  FAIL — ${name}: ${e.message}`); }
}

// readiness is gated on OUR child's startup marker, not on the port
// answering — a foreign service on :PORT must never satisfy waitUp
async function waitUp() {
  for (let i = 0; i < 50; i++) {
    if (spawnError || srv.exitCode !== null || srv.signalCode !== null) {
      throw new Error('test server exited before readiness\n' + serverLog, { cause: spawnError });
    }
    if (serverLog.includes(`[enigmagift-server] http://localhost:${PORT}`)) {
      try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
    }
    await new Promise((r) => setTimeout(() => r(), 200));
  }
  throw new Error('server did not start\n' + serverLog);
}

// stop our own child before removing its temp dir; subscribe to 'exit'
// BEFORE signalling so a fast exit can't slip past the await. Pass
// removeData=false to keep the DB/uploads for a same-dir restart test.
async function stopServer(removeData = true) {
  if (spawnError || srv.exitCode !== null || srv.signalCode !== null) {
    if (removeData) rmSync(tmp, { recursive: true, force: true });
    return;
  }
  const exited = new Promise((r) => srv.once('exit', r));
  srv.kill('SIGTERM');
  if (!(await Promise.race([exited.then(() => true), new Promise((r) => setTimeout(() => r(false), 3000))]))) {
    srv.kill('SIGKILL');
  }
  await exited;
  if (removeData) rmSync(tmp, { recursive: true, force: true });
}

function sign(payload) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`${ts}.${payload}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

async function main() {
  await waitUp();

  // --- EXIF unit tests ---
  await t('stripExif removes JPEG APP1 (Exif/GPS) but keeps SOI + image data', () => {
    const real = readFileSync(PHOTO);
    const exifSeg = Buffer.concat([Buffer.from([0xff, 0xe1]), (() => { const b = Buffer.alloc(2); b.writeUInt16BE(2 + 10); return b; })(), Buffer.from('Exif\0\0GPS!')]);
    const withExif = Buffer.concat([real.subarray(0, 2), exifSeg, real.subarray(2)]);
    const stripped = stripExif(withExif);
    assert.equal(stripped[0], 0xff); assert.equal(stripped[1], 0xd8);
    assert.ok(!stripped.includes(Buffer.from('Exif\0\0GPS!')), 'EXIF payload still present');
    // image data survives: SOS marker and the tail of the original file remain
    assert.ok(stripped.includes(Buffer.from([0xff, 0xda])), 'SOS marker lost');
    assert.ok(stripped.includes(real.subarray(real.length - 64)), 'image tail lost');
    assert.ok(stripped.length < withExif.length, 'segment not removed');
  });
  await t('stripExif removes PNG eXIf chunk, keeps IHDR', () => {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunk = (type, data) => {
      const b = Buffer.alloc(8 + data.length + 4);
      b.writeUInt32BE(data.length, 0);
      b.write(type, 4, 'ascii');
      data.copy(b, 8);
      return b; // crc omitted (we never validate it)
    };
    const ihdr = chunk('IHDR', Buffer.alloc(13));
    const exif = chunk('eXIf', Buffer.from('GPSDATA'));
    const png = Buffer.concat([sig, ihdr, exif]);
    const stripped = stripExif(png);
    assert.ok(!stripped.includes(Buffer.from('eXIf')));
    assert.ok(stripped.includes(Buffer.from('IHDR')));
  });
  await t('stripExif leaves non-JPEG/PNG buffers untouched', () => {
    const b = Buffer.from('GIF89a-not-really');
    assert.equal(stripExif(b), b);
  });

  // --- create a gift ---
  let giftId;
  await t('POST /api/gifts creates a draft (5 photos)', async () => {
    const fd = new FormData();
    for (let i = 0; i < 5; i++) fd.append('photos', new Blob([readFileSync(PHOTO)]), `p${i}.jpg`);
    fd.append('mode', 'digital'); fd.append('tier', 'trail'); fd.append('direction', 'someone');
    const r = await fetch(`${BASE}/api/gifts`, { method: 'POST', body: fd });
    assert.equal(r.status, 201);
    giftId = (await r.json()).giftId;
    assert.ok(giftId);
  });

  // force ready with known rounds (skip the vision pipeline)
  const ROUNDS = [{ kicker: 'r1', question: 'q?', options: ['a', 'b', 'c'], correct: 1, cropPhotoIndex: 0 }];
  {
    const db = new DatabaseSync(join(tmp, 'test.db'));
    db.prepare("UPDATE gifts SET status='ready', rounds=? WHERE id=?").run(JSON.stringify(ROUNDS), giftId);
    db.close();
  }

  await t('mark-paid without STRIPE_API_KEY fails closed (fake session id)', async () => {
    const r = await fetch(`${BASE}/api/gifts/${giftId}/mark-paid`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'cs_fake_123' }),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.paid, false); assert.equal(j.pending, true);
    const g = await (await fetch(`${BASE}/api/gifts/${giftId}`)).json();
    assert.equal(g.paid, false, 'paid must NOT be set by a client claim');
  });

  await t('mark-paid with empty body also fails closed', async () => {
    const r = await fetch(`${BASE}/api/gifts/${giftId}/mark-paid`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(r.status, 200);
    const g = await (await fetch(`${BASE}/api/gifts/${giftId}`)).json();
    assert.equal(g.paid, false);
  });

  await t('webhook with bad signature → 400', async () => {
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_x', client_reference_id: giftId, amount_total: 499, payment_status: 'paid', currency: 'gbp' } } });
    const r = await fetch(`${BASE}/api/stripe/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: payload,
    });
    assert.equal(r.status, 400);
  });

  await t('webhook with wrong amount → 400', async () => {
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_x', client_reference_id: giftId, amount_total: 1, payment_status: 'paid', currency: 'gbp' } } });
    const r = await fetch(`${BASE}/api/stripe/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload) }, body: payload,
    });
    assert.equal(r.status, 400);
  });

  await t('webhook with valid signature + correct amount sets paid', async () => {
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_ok', client_reference_id: giftId, amount_total: 499, payment_status: 'paid', currency: 'gbp' } } });
    const r = await fetch(`${BASE}/api/stripe/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload) }, body: payload,
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { received: true });
    const g = await (await fetch(`${BASE}/api/gifts/${giftId}`)).json();
    assert.equal(g.paid, true);
  });

  let token;
  await t('seal returns a trail token', async () => {
    const r = await fetch(`${BASE}/api/gifts/${giftId}/seal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 200);
    token = (await r.json()).trailToken;
    assert.ok(token);
  });

  await t('trail payload strips the answer key (no `correct` in rounds)', async () => {
    const tr = await (await fetch(`${BASE}/api/trail/${token}`)).json();
    assert.equal(tr.rounds.length, 1);
    assert.ok(!('correct' in tr.rounds[0]), 'correct leaked to client');
    assert.ok(!('answer' in tr.rounds[0]));
    assert.ok(!JSON.stringify(tr).includes('"correct"'));
    // digital gift: no hide hint
    assert.ok(!tr.hideHint, 'digital trail should not carry a hide hint');
  });

  await t('physical (Hide) trail carries the hide hint, still no answer key', async () => {
    const fd = new FormData();
    for (let i = 0; i < 5; i++) fd.append('photos', new Blob([readFileSync(PHOTO)]), `p${i}.jpg`);
    fd.append('mode', 'physical'); fd.append('tier', 'hide');
    const gid = (await (await fetch(`${BASE}/api/gifts`, { method: 'POST', body: fd })).json()).giftId;
    const db = new DatabaseSync(join(tmp, 'test.db'));
    db.prepare("UPDATE gifts SET status='ready', rounds=? WHERE id=?").run(JSON.stringify(ROUNDS), gid);
    db.prepare("INSERT INTO hide_spots (id, gift_id, position, data) VALUES ('hide_abc', ?, 0, ?)").run(
      gid, JSON.stringify({ description: 'behind the third stair', confidence: 0.9 }),
    );
    db.prepare("UPDATE gifts SET hides=? WHERE id=?").run(
      JSON.stringify({ current: { hideSpotId: 'hide_abc', hideNote: null, hiddenAt: 'x' } }), gid,
    );
    db.close();
    const seal = await (await fetch(`${BASE}/api/gifts/${gid}/seal`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    assert.ok(seal.unlockCode, 'first seal must return the plaintext code');
    const tr = await (await fetch(`${BASE}/api/trail/${seal.trailToken}`)).json();
    assert.equal(tr.hideHint, 'behind the third stair');
    assert.ok(!JSON.stringify(tr).includes('"correct"'));
    // re-seal: code must come back null, not ''
    const seal2 = await (await fetch(`${BASE}/api/gifts/${gid}/seal`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    assert.equal(seal2.unlockCode, null);
    assert.equal(seal2.trailToken, seal.trailToken);
    await fetch(`${BASE}/api/gifts/${gid}`, { method: 'DELETE' });
  });

  await t('answer route checks server-side (right + wrong)', async () => {
    const wrong = await (await fetch(`${BASE}/api/trail/${token}/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: 0, choice: 0 }),
    })).json();
    assert.equal(wrong.correct, false);
    const right = await (await fetch(`${BASE}/api/trail/${token}/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: 0, choice: 1 }),
    })).json();
    assert.equal(right.correct, true);
  });

  await t('unlock is rate-limited after 10 attempts', async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await fetch(`${BASE}/api/trail/${token}/unlock`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'WRONG1' }),
      });
    }
    assert.equal(last.status, 429);
  });

  await t('photo route sends nosniff + is token-scoped', async () => {
    const r = await fetch(`${BASE}/api/trail/${token}/photo/0`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    // gift-id-scoped photo must NOT be reachable via the token-less route without id… it is id-scoped; check token route 404s for unknown token
    const bad = await fetch(`${BASE}/api/trail/notarealtoken/photo/0`);
    assert.equal(bad.status, 404);
  });

  await t('security headers present on API responses', async () => {
    const r = await fetch(`${BASE}/api/health`);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.ok((r.headers.get('content-security-policy') || '').includes("default-src 'none'"));
  });

  await t('revoke kills the trail link', async () => {
    const r = await fetch(`${BASE}/api/gifts/${giftId}/revoke`, { method: 'POST' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).revoked, true);
    const tr = await fetch(`${BASE}/api/trail/${token}`);
    assert.equal(tr.status, 404);
  });

  await t('expired trail token → 404', async () => {
    const r = await fetch(`${BASE}/api/gifts/${giftId}/seal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expireDays: 30 }) });
    const tok2 = (await r.json()).trailToken;
    const db = new DatabaseSync(join(tmp, 'test.db'));
    db.prepare("UPDATE trails SET expires_at=? WHERE token=?").run(new Date(Date.now() - 1000).toISOString(), tok2);
    db.close();
    const tr = await fetch(`${BASE}/api/trail/${tok2}`);
    assert.equal(tr.status, 404);
  });

  await t('unknown gift id → 404 (not 500)', async () => {
    const r = await fetch(`${BASE}/api/gifts/nope`);
    assert.equal(r.status, 404);
  });

  // --- mid-flow tier upsell (Trail → Hide), locked once sealed ---
  let upsellId;
  await t('PATCH tier trail→hide on an unsealed gift → 200 and persists', async () => {
    const fd = new FormData();
    for (let i = 0; i < 5; i++) fd.append('photos', new Blob([readFileSync(PHOTO)]), `p${i}.jpg`);
    fd.append('mode', 'digital'); fd.append('tier', 'trail'); fd.append('direction', 'someone');
    const c = await fetch(`${BASE}/api/gifts`, { method: 'POST', body: fd });
    upsellId = (await c.json()).giftId;
    const r = await fetch(`${BASE}/api/gifts/${upsellId}/tier`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier: 'hide', mode: 'physical' }),
    });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, tier: 'hide', mode: 'physical' });
    const g = await (await fetch(`${BASE}/api/gifts/${upsellId}`)).json();
    assert.equal(g.tier, 'hide');
    assert.equal(g.mode, 'physical');
  });

  await t('PATCH tier rejects anything but trail|hide → 400', async () => {
    const r = await fetch(`${BASE}/api/gifts/${upsellId}/tier`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier: 'set', mode: 'digital' }),
    });
    assert.equal(r.status, 400);
  });

  await t('PATCH tier after seal → 409 (tier locked)', async () => {
    const db = new DatabaseSync(join(tmp, 'test.db'));
    const ROUNDS2 = [{ kicker: 'r1', question: 'q?', options: ['a', 'b', 'c'], correct: 1, cropPhotoIndex: 0 }];
    db.prepare("UPDATE gifts SET status='ready', rounds=? WHERE id=?").run(JSON.stringify(ROUNDS2), upsellId);
    db.close();
    const s = await fetch(`${BASE}/api/gifts/${upsellId}/seal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(s.status, 200);
    const r = await fetch(`${BASE}/api/gifts/${upsellId}/tier`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier: 'trail', mode: 'digital' }),
    });
    assert.equal(r.status, 409);
  });

  // --- giver dashboard overview ---
  await t('overview derives stats from events and never leaks the answer key', async () => {
    // recipient-side events on the sealed gift (gift-scoped route — the
    // trail token was revoked earlier in this suite, so trail-scoped events
    // would not link back to the gift)
    await fetch(`${BASE}/api/gifts/${giftId}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'opened' }) });
    await fetch(`${BASE}/api/gifts/${giftId}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'round_1_picked', data: { choice: 1, correct: true, attempts: 1 } }) });
    await fetch(`${BASE}/api/gifts/${giftId}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'shared_back', data: { looks: 2, mins: 4 } }) });
    const r = await fetch(`${BASE}/api/gifts/${giftId}/overview`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const o = await r.json();
    // the trail row may have been re-issued after the revoke test re-sealed —
    // assert structure, not a specific token
    assert.ok(o.trail.token, 'trail token present');
    assert.equal(o.trail.url, `/t/${o.trail.token}`);
    // earlier trail GETs in this suite also logged 'opened', so >= not ===
    assert.ok(o.stats.opened >= 1, 'opened count derived');
    assert.ok(o.stats.picks.length >= 1 && o.stats.picks.some((p) => p.correct), 'picks derived');
    assert.equal(o.stats.sharedBack, true);
    assert.equal(o.stats.mins, 4);
    assert.ok(Array.isArray(o.events) && o.events.length > 0);
    // no answer key / unlock material in the payload
    const raw = JSON.stringify(o);
    assert.ok(!raw.includes('unlock_hash'), 'unlock hash leaked');
    assert.ok(!raw.includes('"answers"'), 'trail answers leaked');
    assert.ok(!raw.includes('scrypt$'), 'scrypt hash leaked');
  });

  await t('overview of unknown gift → 404', async () => {
    const r = await fetch(`${BASE}/api/gifts/nope/overview`);
    assert.equal(r.status, 404);
  });

  await t('API JSON responses are no-store; static hashed assets are immutable', async () => {
    const h = await fetch(`${BASE}/api/health`);
    assert.equal(h.headers.get('cache-control'), 'no-store');
    // the test server serves ../dist when it exists (it does in the repo)
    const home = await fetch(`${BASE}/`);
    const m = (await home.text()).match(/\/assets\/(index-[^"]+\.js)/);
    if (m) {
      const a = await fetch(`${BASE}/assets/${m[1]}`);
      assert.equal(a.status, 200);
      assert.equal(a.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      const idx = await fetch(`${BASE}/`);
      assert.equal(idx.headers.get('cache-control'), 'no-cache');
    }
  });

  await t('deleting a gift erases its event rows too', async () => {
    const fd = new FormData();
    for (let i = 0; i < 5; i++) fd.append('photos', new Blob([readFileSync(PHOTO)]), `p${i}.jpg`);
    fd.append('mode', 'digital'); fd.append('tier', 'trail');
    const gid = (await (await fetch(`${BASE}/api/gifts`, { method: 'POST', body: fd })).json()).giftId;
    await fetch(`${BASE}/api/gifts/${gid}/event`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'test_event' }),
    });
    const db = new DatabaseSync(join(tmp, 'test.db'));
    const before = db.prepare('SELECT COUNT(*) c FROM events WHERE gift_id=?').get(gid).c;
    assert.ok(before >= 1, 'expected event rows before delete');
    db.close();
    await fetch(`${BASE}/api/gifts/${gid}`, { method: 'DELETE' });
    const db2 = new DatabaseSync(join(tmp, 'test.db'));
    const after = db2.prepare('SELECT COUNT(*) c FROM events WHERE gift_id=?').get(gid).c;
    db2.close();
    assert.equal(after, 0, 'event rows survived gift deletion');
  });

  // ---------- webhook payment validation matrix ----------
  // seeded drafts (no paid pipeline) — one independent gift per case
  const seed = (tier = 'trail', referredBy = null) => {
    const id = crypto.randomUUID();
    const db = new DatabaseSync(join(tmp, 'test.db'));
    db.prepare("INSERT INTO gifts(id,status,photo_count,mode,tier,rounds,referred_by) VALUES (?,'ready',0,'digital',?,?,?)").run(id, tier, JSON.stringify(ROUNDS), referredBy);
    db.close();
    return id;
  };
  const dbGet = (sql, ...args) => {
    const db = new DatabaseSync(join(tmp, 'test.db'));
    const row = db.prepare(sql).get(...args);
    db.close();
    return row;
  };
  const postWebhook = async (giftRef, overrides = {}) => {
    const session = {
      id: `cs_${crypto.randomUUID()}`,
      client_reference_id: giftRef,
      payment_status: 'paid',
      currency: 'gbp',
      amount_total: 499,
      ...overrides,
    };
    for (const k of Object.keys(session)) if (session[k] === undefined) delete session[k];
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
    const r = await fetch(`${BASE}/api/stripe/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload) }, body: payload,
    });
    return r.status;
  };
  const paidOf = (id) => !!dbGet('SELECT paid FROM gifts WHERE id=?', id)?.paid;

  await t('webhook accepts full price per tier and sets paid', async () => {
    for (const [tier, amount] of [['trail', 499], ['hide', 999], ['set', 1900]]) {
      const id = seed(tier);
      assert.equal(await postWebhook(id, { amount_total: amount }), 200, `${tier} @ ${amount}`);
      assert.equal(paidOf(id), true, `${tier} paid flag`);
    }
  });
  await t('webhook accepts £1 referral discount only with a recorded referral', async () => {
    for (const [tier, amount] of [['trail', 399], ['hide', 899], ['set', 1800]]) {
      const id = seed(tier, 'source-fixture');
      assert.equal(await postWebhook(id, { amount_total: amount }), 200, `${tier} @ ${amount} referred`);
      assert.equal(paidOf(id), true, `${tier} referred paid flag`);
    }
  });
  await t('webhook rejects discounted amount without referral → 400, not paid', async () => {
    for (const [tier, amount] of [['trail', 399], ['hide', 899], ['set', 1800]]) {
      const id = seed(tier);
      assert.equal(await postWebhook(id, { amount_total: amount }), 400, `${tier} @ ${amount} no-ref`);
      assert.equal(paidOf(id), false, `${tier} no-ref must stay unpaid`);
    }
  });
  await t('rejected Set discount creates no pack', async () => {
    const id = seed('set');
    assert.equal(await postWebhook(id, { amount_total: 1800 }), 400);
    assert.equal(dbGet('SELECT id FROM packs WHERE purchase_gift_id=?', id), undefined);
    assert.equal(dbGet('SELECT pack_id FROM gifts WHERE id=?', id)?.pack_id, null);
  });
  await t('webhook rejects unpaid/wrong-currency/wrong-or-missing amount → 400', async () => {
    const cases = [
      [{ payment_status: 'unpaid', amount_total: 499 }, 'unpaid'],
      [{ currency: 'usd', amount_total: 499 }, 'usd'],
      [{ amount_total: 1 }, 'amount 1'],
      [{ amount_total: undefined }, 'missing amount'],
    ];
    for (const [overrides, label] of cases) {
      const id = seed('trail');
      assert.equal(await postWebhook(id, overrides), 400, label);
      assert.equal(paidOf(id), false, label);
    }
  });
  await t('webhook rejects unknown tier; null tier priced as legacy hide', async () => {
    const bogus = seed('bogus');
    assert.equal(await postWebhook(bogus, { amount_total: 499 }), 400);
    assert.equal(paidOf(bogus), false);
    const legacy = seed(null);
    assert.equal(await postWebhook(legacy, { amount_total: 999 }), 200);
    assert.equal(paidOf(legacy), true);
    const legacyBad = seed(null);
    assert.equal(await postWebhook(legacyBad, { amount_total: 499 }), 400);
    assert.equal(paidOf(legacyBad), false);
  });

  // ---------- scheduled availability (send_at) ----------
  await t('seal schedules availability; expiry counts from open; all routes closed until then', async () => {
    const id = seed('trail');
    const sendAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const seal = await (await fetch(`${BASE}/api/gifts/${id}/seal`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sendAt, expireDays: 1 }),
    })).json();
    assert.ok(seal.trailToken);
    assert.equal(seal.sendAt, sendAt);
    assert.equal(
      Date.parse(seal.expiresAt),
      Date.parse(sendAt) + 86400000,
      'expiry must be counted from the scheduled open, not from seal time',
    );
    const ov = await (await fetch(`${BASE}/api/gifts/${id}/overview`)).json();
    assert.equal(ov.trail.sendAt, sendAt);
    assert.equal(ov.trail.scheduled, true);
    // idempotent: a second seal with a different valid sendAt returns the original
    const seal2 = await (await fetch(`${BASE}/api/gifts/${id}/seal`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sendAt: new Date(Date.now() + 86400000).toISOString() }),
    })).json();
    assert.equal(seal2.trailToken, seal.trailToken);
    assert.equal(seal2.sendAt, sendAt);
    const tok = seal.trailToken;
    // pending link: recipient sees the schedule, never the rounds
    const tr = await fetch(`${BASE}/api/trail/${tok}`);
    assert.equal(tr.status, 423);
    assert.deepEqual(await tr.json(), { error: 'scheduled', sendAt });
    // every sensitive route fails closed pre-open
    const closed = [
      fetch(`${BASE}/api/trail/${tok}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: 0, choice: 1 }) }),
      fetch(`${BASE}/api/trail/${tok}/unlock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'ABCDEF' }) }),
      fetch(`${BASE}/api/trail/${tok}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x' }) }),
      fetch(`${BASE}/api/trail/${tok}/photo/0`),
      fetch(`${BASE}/api/trail/${tok}/world-status`),
      fetch(`${BASE}/api/trail/${tok}/world`),
      fetch(`${BASE}/api/trail/${tok}/portrait`),
    ];
    for (const p of closed) assert.equal((await p).status, 404);
    // a scheduled peek must not log an 'opened' event
    assert.equal(
      dbGet("SELECT COUNT(*) c FROM events WHERE gift_id=? AND name='opened'", id).c,
      0,
    );
    // once send_at passes the same token is live and the trail answers
    const db = new DatabaseSync(join(tmp, 'test.db'));
    db.prepare('UPDATE trails SET send_at=? WHERE token=?').run(new Date(Date.now() - 1000).toISOString(), tok);
    db.close();
    assert.equal((await fetch(`${BASE}/api/trail/${tok}`)).status, 200);
    const right = await (await fetch(`${BASE}/api/trail/${tok}/answer`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: 0, choice: 1 }),
    })).json();
    assert.equal(right.correct, true);
  });

  await t('seal rejects malformed/past/over-horizon sendAt → 400, no trail row', async () => {
    const bad = [
      true,
      123,
      {},
      'nonsense',
      new Date(Date.now() - 1000).toISOString(),
      new Date(Date.now() + 367 * 86400000).toISOString(),
    ];
    for (const sendAt of bad) {
      const id = seed('trail');
      const r = await fetch(`${BASE}/api/gifts/${id}/seal`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sendAt }),
      });
      assert.equal(r.status, 400, `sendAt=${JSON.stringify(sendAt)}`);
      assert.equal(dbGet('SELECT token FROM trails WHERE gift_id=?', id), undefined);
    }
  });

  await t('unscheduled seal opens immediately and stays idempotent', async () => {
    const id = seed('trail');
    const seal = await (await fetch(`${BASE}/api/gifts/${id}/seal`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    assert.ok(seal.trailToken);
    assert.equal(seal.sendAt, null);
    assert.equal((await fetch(`${BASE}/api/trail/${seal.trailToken}`)).status, 200);
    const seal2 = await (await fetch(`${BASE}/api/gifts/${id}/seal`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sendAt: '' }),
    })).json();
    assert.equal(seal2.trailToken, seal.trailToken);
  });

  // ---------- referral attribution ----------
  await t('ref token attributes the new gift; source sees conversion but not the destination id', async () => {
    const sourceId = seed('trail');
    const sourceSeal = await (await fetch(`${BASE}/api/gifts/${sourceId}/seal`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    const refToken = sourceSeal.trailToken;
    // one additional real /api/gifts (5 drafts total incl. earlier tests) — carries the source token as ref
    const fd = new FormData();
    for (let i = 0; i < 5; i++) fd.append('photos', new Blob([readFileSync(PHOTO)]), `p${i}.jpg`);
    fd.append('mode', 'digital'); fd.append('tier', 'trail'); fd.append('ref', refToken);
    const c = await fetch(`${BASE}/api/gifts`, { method: 'POST', body: fd });
    assert.equal(c.status, 201);
    const newId = (await c.json()).giftId;
    assert.equal(dbGet('SELECT referred_by FROM gifts WHERE id=?', newId).referred_by, refToken);
    // source overview: conversion event present, destination gift id absent —
    // the gift id is the destination owner's delete/edit capability
    const srcOv = await (await fetch(`${BASE}/api/gifts/${sourceId}/overview`)).json();
    assert.ok(srcOv.events.some((e) => e.name === 'referred_conversion'), 'conversion not logged');
    assert.ok(!JSON.stringify(srcOv).includes(newId), 'destination gift id leaked to source owner');
    // destination overview records the referral token
    const dstOv = await (await fetch(`${BASE}/api/gifts/${newId}/overview`)).json();
    assert.equal(dstOv.gift.referredBy, refToken);
  });

  // ---------- room-gift recipient links (tabletop pilot) ----------
  const RG = '/api/room-gifts';
  const rgKey = () => crypto.randomBytes(32).toString('hex');
  const rgSha = (key) => crypto.createHash('sha256').update(key).digest('hex');
  const rgEdition = (over = {}) => ({
    roomId: 'dog-dining-room', revision: '44124720',
    to: 'Sam', from: 'Alex',
    dog: 'Low paper edge under the table.',
    chair: 'A seat saved for you.',
    postcard: 'Look for the watcher on the floor.',
    memory: 'A keepsake for stopping by.',
    invitation: 'Meet me where the table waits.',
    ...over,
  });
  const rgPost = (body, key, extra = {}) => fetch(`${BASE}${RG}`, {
    method: 'POST', headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...extra,
    }, body: JSON.stringify(body),
  });
  // independent Node-crypto replica of the Worker's WebCrypto signing
  const rgSign = (msg) => crypto.createHmac('sha256', ROOM_SECRET).update(msg).digest('hex');
  const rgVisitor = (ip) => {
    const id = rgSign(`room-client-v1\n${ip}`);
    return { 'x-enigmagift-visitor': id, 'x-enigmagift-visitor-proof': rgSign(`room-create-v1\n${id}`) };
  };
  const rgGet = (path, key) => fetch(`${BASE}${RG}${path}`,
    key ? { headers: { authorization: `Bearer ${key}` } } : {});
  const rgDel = (key) => fetch(`${BASE}${RG}/manage`, {
    method: 'DELETE', headers: { authorization: `Bearer ${key}` } });
  const rgCount = () => dbGet('SELECT COUNT(*) c FROM room_gifts').c;

  await t('POST creates a link; server stores only the key hash', async () => {
    const key = rgKey();
    const r = await rgPost({ edition: rgEdition() }, key);
    assert.equal(r.status, 201);
    const body = await r.json();
    assert.match(body.recipientToken, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const row = dbGet('SELECT * FROM room_gifts WHERE token=?', body.recipientToken);
    assert.equal(row.manage_hash, rgSha(key));
    assert.notEqual(row.manage_hash, key);
    assert.ok(!JSON.stringify(body).includes(key), 'key leaked in response');
    assert.ok(!row.edition_json.includes(key), 'key leaked in edition_json');
  });

  await t('POST validation: auth + edition shape → 401/400, no rows written', async () => {
    const before = rgCount();
    assert.equal((await rgPost({ edition: rgEdition() })).status, 401, 'no key');
    const bad = [
      rgEdition({ to: '' }),
      rgEdition({ invitation: '   ' }),
      rgEdition({ dog: 42 }),
      rgEdition({ to: 'x'.repeat(41) }),
      rgEdition({ dog: 'x'.repeat(161) }),
      rgEdition({ invitation: 'x'.repeat(201) }),
      rgEdition({ roomId: 'other-room' }),
      rgEdition({ revision: '00000000' }),
      rgEdition({ roomId: undefined, revision: undefined }),
      rgEdition({ roomId: 'other-room', revision: undefined }),
    ];
    for (const [i, edition] of bad.entries()) {
      assert.equal((await rgPost({ edition }, rgKey())).status, 400, `case ${i}`);
    }
    // no edition / null / array bodies fail the same way — never reach the DB
    for (const body of [{}, { edition: null }, { edition: [] }]) {
      assert.equal((await rgPost(body, rgKey())).status, 400, JSON.stringify(body));
    }
    assert.equal(rgCount(), before);
  });

  await t('edition whitelist: extras dropped, HTML stays literal text', async () => {
    const key = rgKey();
    const edition = rgEdition({ invitation: '<b>hi</b>', hacker: 'x' });
    const r = await rgPost({ edition }, key);
    assert.equal(r.status, 201);
    const token = (await r.json()).recipientToken;
    const row = dbGet('SELECT edition_json FROM room_gifts WHERE token=?', token);
    const stored = JSON.parse(row.edition_json);
    assert.deepEqual(Object.keys(stored).sort(),
      ['chair', 'dog', 'from', 'invitation', 'memory', 'postcard', 'revision', 'roomId', 'to'].sort());
    const pub = await rgGet(`/${token}`);
    assert.equal((await pub.json()).edition.invitation, '<b>hi</b>');
  });

  await t('GET recipient returns the exact trimmed edition, no owner data, no-store', async () => {
    const key = rgKey();
    const edition = rgEdition({ to: '  Sam  ' });
    const token = (await (await rgPost({ edition }, key)).json()).recipientToken;
    const r = await rgGet(`/${token}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const body = await r.json();
    assert.equal(body.edition.to, 'Sam');
    assert.deepEqual(validateShape(body), undefined);
    function validateShape(b) {
      const s = JSON.stringify(b);
      return s.includes(key) || s.includes(rgSha(key)) || 'manage_hash' in b ? 'leak' : undefined;
    }
    // a second, different gift does not disturb the first snapshot
    const k2 = rgKey();
    const t2 = (await (await rgPost({ edition: rgEdition({ invitation: 'Different message.' }) }, k2)).json()).recipientToken;
    assert.notEqual(t2, token);
    assert.equal((await (await rgGet(`/${token}`)).json()).edition.invitation, 'Meet me where the table waits.');
  });

  await t('idempotent retry: same key+edition → same token; changed edition → 409', async () => {
    const key = rgKey();
    const edition = rgEdition({ to: '  Sam ' });
    const first = await rgPost({ edition }, key);
    const t1 = (await first.json()).recipientToken;
    // equivalent content after normalization retries clean
    const again = await rgPost({ edition: rgEdition({ to: 'Sam' }) }, key);
    assert.equal(again.status, 200);
    assert.equal((await again.json()).recipientToken, t1);
    assert.equal(dbGet('SELECT COUNT(*) c FROM room_gifts WHERE manage_hash=?', rgSha(key)).c, 1);
    const changed = await rgPost({ edition: rgEdition({ invitation: 'New wording.' }) }, key);
    assert.equal(changed.status, 409);
    // the rejected body must not have mutated the stored edition
    const row = dbGet('SELECT edition_json FROM room_gifts WHERE token=?', t1);
    assert.equal(JSON.parse(row.edition_json).invitation, 'Meet me where the table waits.');
  });

  await t('management key is required and must be exact', async () => {
    const key = rgKey();
    const token = (await (await rgPost({ edition: rgEdition() }, key)).json()).recipientToken;
    assert.equal((await rgGet('/manage')).status, 401, 'no key');
    assert.equal((await rgGet('/manage', rgKey())).status, 404, 'wrong key');
    // the public recipient token is not a management capability
    assert.equal((await rgGet('/manage', token)).status, 401, 'token as key');
    const ok = await rgGet('/manage', key);
    assert.equal(ok.status, 200);
    const view = await ok.json();
    assert.equal(view.recipientToken, token);
    assert.equal(view.revoked, false);
    assert.equal(view.edition.invitation, 'Meet me where the table waits.');
    assert.ok(!JSON.stringify(view).includes(key), 'key leaked in manage view');
    // deleting without the key changes nothing public
    const unauth = await fetch(`${BASE}${RG}/manage`, { method: 'DELETE' });
    assert.equal(unauth.status, 401);
    assert.equal((await rgGet(`/${token}`)).status, 200);
  });

  await t('restart with same DB keeps recipient + management live', async () => {
    const key = rgKey();
    const token = (await (await rgPost({ edition: rgEdition() }, key)).json()).recipientToken;
    await stopServer(false);
    srv = launchServer();
    await waitUp();
    assert.equal((await rgGet(`/${token}`)).status, 200, 'recipient after restart');
    const mg = await rgGet('/manage', key);
    assert.equal(mg.status, 200, 'manage after restart');
    assert.equal((await mg.json()).recipientToken, token);
  });

  await t('rate key: only a valid edge proof earns a visitor bucket', async () => {
    const req = (headers = {}, ip = '127.0.0.1') => ({ get: (h) => headers[h.toLowerCase()], ip });
    const ipKey = 'ip:127.0.0.1';
    // missing/invalid secret → connection bucket
    assert.equal(roomCreateRateKey(req(), ''), ipKey);
    assert.equal(roomCreateRateKey(req(), 'not-hex'), ipKey);
    assert.equal(roomCreateRateKey(req(), ROOM_SECRET), ipKey);
    const vis = rgVisitor('198.51.100.7');
    const id = vis['x-enigmagift-visitor'];
    // valid id + proof → visitor bucket
    assert.equal(roomCreateRateKey(req(vis), ROOM_SECRET), `edge:${id}`);
    // malformed / forged / mismatched proofs all fall back
    assert.equal(roomCreateRateKey(req({ 'x-enigmagift-visitor': id }), ROOM_SECRET), ipKey, 'missing proof');
    assert.equal(roomCreateRateKey(req({ 'x-enigmagift-visitor': id, 'x-enigmagift-visitor-proof': 'zz' }), ROOM_SECRET), ipKey, 'malformed proof');
    assert.equal(roomCreateRateKey(req({ 'x-enigmagift-visitor': id, 'x-enigmagift-visitor-proof': '0'.repeat(64) }), ROOM_SECRET), ipKey, 'forged proof');
    const otherId = rgSign(`room-client-v1\n203.0.113.9`);
    assert.equal(roomCreateRateKey(req({ 'x-enigmagift-visitor': otherId, 'x-enigmagift-visitor-proof': vis['x-enigmagift-visitor-proof'] }), ROOM_SECRET), ipKey, 'proof for a different id');
    assert.equal(roomCreateRateKey(req({ 'x-enigmagift-visitor': 'a'.repeat(64), 'x-enigmagift-visitor-proof': vis['x-enigmagift-visitor-proof'] }), ROOM_SECRET), ipKey, 'replaced id');
    // raw IP headers alone never mint a visitor bucket
    assert.equal(roomCreateRateKey(req({ 'x-forwarded-for': '192.0.2.5', 'cf-connecting-ip': '192.0.2.5' }), ROOM_SECRET), ipKey);
  });

  await t('create is rate-limited at 10/IP/hour; idempotent retry still 200', async () => {
    // limiter is in-memory: since the last restart only non-counted posts ran,
    // so the window starts empty here
    const firstKey = rgKey();
    const firstEdition = rgEdition({ invitation: 'Message 0.' });
    assert.equal((await rgPost({ edition: firstEdition }, firstKey)).status, 201);
    for (let i = 1; i < 10; i++) {
      const r = await rgPost({ edition: rgEdition({ invitation: `Message ${i}.` }) }, rgKey());
      assert.equal(r.status, 201, `creation ${i}`);
    }
    assert.equal((await rgPost({ edition: rgEdition() }, rgKey())).status, 429);
    // retrying an already-created edition bypasses the limiter — idempotent
    const retry = await rgPost({ edition: firstEdition }, firstKey);
    assert.equal(retry.status, 200, 'same-token retry must not consume quota');
  });

  await t('signed edge visitors get their own 10/hour bucket; forgeries share the connection bucket', async () => {
    // the connection bucket (ip:127.0.0.1) is already exhausted by the test above —
    // every request below arrives from the same socket address
    const visA = rgVisitor('198.51.100.7');
    const keyA1 = rgKey();
    const edA1 = rgEdition({ invitation: 'Visitor A message 0.' });
    const a1 = await rgPost({ edition: edA1 }, keyA1, visA);
    assert.equal(a1.status, 201);
    assert.equal(a1.headers.get('x-ratelimit-scope'), 'verified-client');
    const tokA1 = (await a1.json()).recipientToken;
    for (let i = 1; i < 10; i++) {
      const r = await rgPost({ edition: rgEdition({ invitation: `Visitor A message ${i}.` }) }, rgKey(), visA);
      assert.equal(r.status, 201, `A creation ${i}`);
    }
    const a11 = await rgPost({ edition: rgEdition() }, rgKey(), visA);
    assert.equal(a11.status, 429, 'visitor A quota');
    assert.equal(a11.headers.get('x-ratelimit-scope'), 'verified-client');
    // a different signed visitor has an independent bucket despite the same socket
    const visB = rgVisitor('203.0.113.9');
    const b1 = await rgPost({ edition: rgEdition() }, rgKey(), visB);
    assert.equal(b1.status, 201, 'visitor B unaffected by A');
    assert.equal(b1.headers.get('x-ratelimit-scope'), 'verified-client');
    // idempotent retry under A's exhausted bucket still resolves to the same token
    const retry = await rgPost({ edition: edA1 }, keyA1, visA);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).recipientToken, tokA1);
    // a forged proof on A's id falls back to the exhausted connection bucket
    const forged = { 'x-enigmagift-visitor': visA['x-enigmagift-visitor'], 'x-enigmagift-visitor-proof': '0'.repeat(64) };
    const f = await rgPost({ edition: rgEdition() }, rgKey(), forged);
    assert.equal(f.status, 429);
    assert.equal(f.headers.get('x-ratelimit-scope'), 'connection');
    // B's proof presented under A's id is equally invalid
    const swapped = { 'x-enigmagift-visitor': visA['x-enigmagift-visitor'], 'x-enigmagift-visitor-proof': visB['x-enigmagift-visitor-proof'] };
    assert.equal((await rgPost({ edition: rgEdition() }, rgKey(), swapped)).status, 429);
    // spoofed raw IP headers cannot mint a fresh bucket either
    const spoof = await rgPost({ edition: rgEdition() }, rgKey(), { 'cf-connecting-ip': '192.0.2.77', 'x-forwarded-for': '192.0.2.77' });
    assert.equal(spoof.status, 429);
    assert.equal(spoof.headers.get('x-ratelimit-scope'), 'connection');
  });


  await t('DELETE revokes: public 404, owner sees closed, no resurrection', async () => {
    const key = rgKey();
    const token = crypto.randomBytes(32).toString('base64url');
    // seeded fixture — the create route's IP quota is exhausted by the rate test
    const db0 = new DatabaseSync(join(tmp, 'test.db'));
    db0.prepare("INSERT INTO room_gifts(token,manage_hash,room_id,room_revision,edition_json,created_at) VALUES (?,?,?,?,?,?)")
      .run(token, rgSha(key), 'dog-dining-room', '44124720', JSON.stringify(rgEdition()), new Date().toISOString());
    db0.close();
    assert.equal((await rgDel(key)).status, 200);
    assert.equal((await rgGet(`/${token}`)).status, 404);
    const mg = await rgGet('/manage', key);
    const view = await mg.json();
    assert.equal(view.revoked, true);
    assert.equal(view.edition, null);
    assert.equal(dbGet('SELECT edition_json FROM room_gifts WHERE token=?', token).edition_json, null);
    assert.equal((await rgDel(key)).status, 200, 'repeat delete is safe');
    // a revoked key can never recreate or return to the old token
    assert.equal((await rgPost({ edition: rgEdition() }, key)).status, 410);
  });

  await t('unknown/bad-shaped tokens 404; server allowlist is authoritative', async () => {
    assert.equal((await rgGet('/nope')).status, 404);
    assert.equal((await rgGet(`/${'A'.repeat(43)}`)).status, 404);
    // a seeded row on a revision the allowlist does not approve must not serve
    const db = new DatabaseSync(join(tmp, 'test.db'));
    db.prepare("INSERT INTO room_gifts(token,manage_hash,room_id,room_revision,edition_json,created_at) VALUES (?,?,?,?,?,?)")
      .run(crypto.randomBytes(32).toString('base64url'), rgSha(rgKey()), 'dog-dining-room', 'deadbeef',
        JSON.stringify(rgEdition()), new Date().toISOString());
    const badTok = db.prepare('SELECT token FROM room_gifts WHERE room_revision=?').get('deadbeef').token;
    db.close();
    assert.equal((await rgGet(`/${badTok}`)).status, 404);
  });

  // ---------- photo-gift recipient links (personal-photo pilot) ----------
  const PG = '/api/photo-gifts';
  const pgKey = rgKey;
  const pgPhoto = readFileSync(PHOTO);
  const pgEdition = (over = {}) => ({
    version: 1, to: 'Sam', from: 'Alex',
    message: 'Saturday pancakes, as always.\n\nYour turn to pick the film.',
    clue: 'Where the kettle sings…',
    hidingSpot: { x: 0.31, y: 0.72 },
    ...over,
  });
  const pgPost = (edition, photo, key, extra = {}) => {
    const fd = new FormData();
    if (edition !== null) fd.append('edition', typeof edition === 'string' ? edition : JSON.stringify(edition));
    if (photo !== null) fd.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'photo.jpg');
    return fetch(`${BASE}${PG}`, {
      method: 'POST',
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...extra },
      body: fd,
    });
  };
  const pgGet = (path, key) => fetch(`${BASE}${PG}${path}`,
    key ? { headers: { authorization: `Bearer ${key}` } } : {});
  const pgDel = (key) => fetch(`${BASE}${PG}/manage`, {
    method: 'DELETE', headers: { authorization: `Bearer ${key}` } });
  const pgCount = () => dbGet('SELECT COUNT(*) c FROM photo_gifts').c;

  await t('photo POST auth + payload validation: 401/400/413, no rows written', async () => {
    const before = pgCount();
    const key = pgKey();
    const vis = rgVisitor('192.0.2.60');
    assert.equal((await pgPost(pgEdition(), pgPhoto)).status, 401, 'no key');
    assert.equal((await pgPost(pgEdition(), pgPhoto, 'zz')).status, 401, 'bad key shape');
    assert.equal((await pgPost(pgEdition(), null, key, vis)).status, 400, 'missing photo');
    assert.equal((await pgPost(pgEdition(), Buffer.from('not a jpeg at all'), key, vis)).status, 400, 'corrupt');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), pgPhoto.subarray(4)]);
    assert.equal((await pgPost(pgEdition(), png, key, vis)).status, 400, 'non-JPEG bytes');
    assert.equal((await pgPost(pgEdition(), Buffer.alloc(4 * 1024 * 1024, 0xff), key, vis)).status, 413, 'oversize');
    // edition field problems
    assert.equal((await pgPost('{not json', pgPhoto, key, vis)).status, 400, 'bad JSON');
    assert.equal((await pgPost(pgEdition({ version: 2 }), pgPhoto, key, vis)).status, 400, 'version');
    assert.equal((await pgPost(pgEdition({ hidingSpot: { x: 1.2, y: 0.5 } }), pgPhoto, key, vis)).status, 400, 'x out of range');
    assert.equal((await pgPost(pgEdition({ hidingSpot: { x: '0.5', y: 0.5 } }), pgPhoto, key, vis)).status, 400, 'non-finite x');
    assert.equal((await pgPost(pgEdition({ to: 'x'.repeat(41) }), pgPhoto, key, vis)).status, 400, 'to over-limit');
    assert.equal((await pgPost(pgEdition({ message: 'x'.repeat(601) }), pgPhoto, key, vis)).status, 400, 'message over-limit');
    assert.equal((await pgPost(pgEdition({ clue: 'x'.repeat(201) }), pgPhoto, key, vis)).status, 400, 'clue over-limit');
    assert.equal((await pgPost(pgEdition({ to: '   ' }), pgPhoto, key, vis)).status, 400, 'blank to');
    assert.equal((await pgPost(pgEdition({ message: '' }), pgPhoto, key, vis)).status, 400, 'empty message');
    assert.equal((await pgPost(null, pgPhoto, key, vis)).status, 400, 'missing edition field');
    // a photo-shaped body without a management key still stops at 401 first
    assert.equal((await pgPost(pgEdition(), pgPhoto)).status, 401);
    assert.equal(pgCount(), before, 'nothing was stored');
  });

  await t('photo create stores normalized JPEG + edition; HTML/newlines literal', async () => {
    const key = pgKey();
    const vis = rgVisitor('192.0.2.61');
    const edition = pgEdition({ to: '<b>Sam</b>', hacker: 'drop-me' });
    const r = await pgPost(edition, pgPhoto, key, vis);
    assert.equal(r.status, 201);
    assert.equal(r.headers.get('x-ratelimit-scope'), 'verified-client');
    const token = (await r.json()).recipientToken;
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const row = dbGet('SELECT * FROM photo_gifts WHERE token=?', token);
    assert.equal(row.manage_hash, rgSha(key));
    const stored = JSON.parse(row.edition_json);
    assert.deepEqual(Object.keys(stored).sort(), ['clue', 'from', 'hidingSpot', 'message', 'to', 'version'].sort());
    assert.equal(stored.to, '<b>Sam</b>');
    assert.ok(stored.message.includes('\n\n'), 'paragraphs preserved');
    assert.equal(row.image_width > 0 && row.image_height > 0, true);
    // public view: edition + image dims, no owner fields, no BLOB
    const pub = await (await pgGet(`/${token}`)).json();
    assert.equal(pub.edition.to, '<b>Sam</b>');
    assert.deepEqual(pub.image, { width: row.image_width, height: row.image_height });
    assert.ok(!JSON.stringify(pub).includes(key));
    assert.ok(!JSON.stringify(pub).includes('manage_hash'));
    // image route: JPEG bytes, no-store, nosniff
    const img = await pgGet(`/${token}/image`);
    assert.equal(img.status, 200);
    assert.match(img.headers.get('content-type'), /^image\/jpeg/);
    assert.equal(img.headers.get('cache-control'), 'no-store');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await img.arrayBuffer());
    assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8, 'JPEG SOI');
    assert.ok(!bytes.includes(Buffer.from('manage_hash')));
  });

  await t('EXIF metadata does not survive normalization', async () => {
    const key = pgKey();
    const vis = rgVisitor('192.0.2.62');
    const { default: sharp } = await import('sharp');
    const withExif = await sharp({ create: { width: 40, height: 24, channels: 3, background: '#794c36' } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Artist: 'EXIF fixture' } } })
      .toBuffer();
    const before = await sharp(withExif).metadata();
    assert.equal(before.orientation, 6, 'fixture carries orientation');
    assert.ok(before.exif?.length, 'fixture carries an EXIF block');
    const r = await pgPost(pgEdition(), withExif, key, vis);
    assert.equal(r.status, 201);
    const token = (await r.json()).recipientToken;
    const stored = await (await pgGet(`/${token}/image`)).arrayBuffer();
    const after = await sharp(Buffer.from(stored)).metadata();
    assert.equal(after.exif, undefined, 'EXIF block removed entirely (GPS cannot survive)');
    assert.equal(after.orientation, undefined, 'orientation applied, then stripped');
    assert.equal(after.width, 24, 'rotated dimensions');
    assert.equal(after.height, 40);
  });

  await t('huge pixel canvas under the byte limit → 413, nothing stored; extra part → 400', async () => {
    const before = pgCount();
    const key = pgKey();
    const vis = rgVisitor('192.0.2.66');
    const { default: sharp } = await import('sharp');
    // a 4100×4100 JPEG compresses well under the 3 MiB byte ceiling but
    // exceeds the 16-megapixel decode bound
    const huge = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: '#4a6a8a' } })
      .jpeg({ quality: 20 }).toBuffer();
    assert.ok(huge.length < 3 * 1024 * 1024, 'fixture must pass the byte gate to reach the pixel gate');
    const big = await pgPost(pgEdition(), huge, key, vis);
    assert.equal(big.status, 413, 'oversize pixels');
    assert.equal(pgCount(), before, 'nothing stored');
    // a third multipart part is rejected by the strict part/field limits
    const fd = new FormData();
    fd.append('edition', JSON.stringify(pgEdition()));
    fd.append('note', 'one field too many');
    fd.append('photo', new Blob([pgPhoto], { type: 'image/jpeg' }), 'photo.jpg');
    const extraPart = await fetch(`${BASE}${PG}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, ...vis },
      body: fd,
    });
    assert.equal(extraPart.status, 400, 'extra multipart part');
    // the normal two-part shape still creates
    const ok = await pgPost(pgEdition(), pgPhoto, key, vis);
    assert.equal(ok.status, 201, 'two-part request still accepted');
  });

  await t('photo retry semantics: identical → 200 same token; concurrent → one gift; changed → 409; wrong owner → 404', async () => {
    const key = pgKey();
    const vis = rgVisitor('192.0.2.63');
    const first = await pgPost(pgEdition(), pgPhoto, key, vis);
    assert.equal(first.status, 201);
    const token = (await first.json()).recipientToken;
    const again = await pgPost(pgEdition(), pgPhoto, key, vis);
    assert.equal(again.status, 200, 'identical retry');
    assert.equal((await again.json()).recipientToken, token);
    // two concurrent identical POSTs still produce exactly one immutable gift
    const key2 = pgKey();
    const [c1, c2] = await Promise.all([
      pgPost(pgEdition({ to: 'Concurrent' }), pgPhoto, key2, vis),
      pgPost(pgEdition({ to: 'Concurrent' }), pgPhoto, key2, vis),
    ]);
    const [j1, j2] = await Promise.all([c1.json(), c2.json()]);
    assert.equal(j1.recipientToken, j2.recipientToken, 'concurrent identical → same token');
    assert.deepEqual([c1.status, c2.status].sort(), [200, 201], 'one create, one replay');
    assert.equal(dbGet('SELECT COUNT(*) c FROM photo_gifts WHERE manage_hash=?', rgSha(key2)).c, 1);
    // changed edition or changed image conflicts with the same key
    assert.equal((await pgPost(pgEdition({ message: 'Rewritten.' }), pgPhoto, key, vis)).status, 409);
    const { default: sharp } = await import('sharp');
    const altJpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#883311' } }).jpeg().toBuffer();
    const alt = await pgPost(pgEdition(), altJpeg, key, vis);
    assert.equal(alt.status, 409, 'changed image');
    // a second key gets its own gift, and the wrong owner sees nothing
    const other = await pgPost(pgEdition(), pgPhoto, pgKey(), vis);
    assert.equal(other.status, 201);
    assert.notEqual((await other.json()).recipientToken, token);
    const mg = await pgGet('/manage', pgKey());
    assert.equal(mg.status, 404, 'wrong owner');
    const mgBad = await pgGet('/manage');
    assert.equal(mgBad.status, 401, 'no key');
  });

  await t('photo revoke: recipient + image + manage metadata all close atomically', async () => {
    const key = pgKey();
    const vis = rgVisitor('192.0.2.64');
    const token = (await (await pgPost(pgEdition(), pgPhoto, key, vis)).json()).recipientToken;
    assert.equal((await pgGet(`/${token}/image`)).status, 200);
    assert.equal((await pgDel(key)).status, 200);
    assert.equal((await pgGet(`/${token}`)).status, 404, 'metadata closed');
    assert.equal((await pgGet(`/${token}/image`)).status, 404, 'image closed');
    const row = dbGet('SELECT edition_json, image, image_width, image_height, revoked_at FROM photo_gifts WHERE token=?', token);
    assert.equal(row.edition_json, null);
    assert.equal(row.image, null);
    assert.equal(row.image_width, null);
    assert.ok(row.revoked_at, 'revoked_at stamped');
    const mg = await (await pgGet('/manage', key)).json();
    assert.equal(mg.revoked, true);
    assert.equal(mg.edition, null);
    assert.equal(mg.image, null);
    assert.equal((await pgDel(key)).status, 200, 'repeat delete idempotent');
    assert.equal((await pgPost(pgEdition(), pgPhoto, key, vis)).status, 410, 'revoked key stays revoked');
    assert.equal((await pgGet('/manage', pgKey())).status, 404);
  });

  await t('restart keeps the stored photo servable', async () => {
    const key = pgKey();
    const vis = rgVisitor('192.0.2.65');
    const create = await pgPost(pgEdition(), pgPhoto, key, vis);
    assert.equal(create.status, 201, 'pre-restart create');
    const token = (await create.json()).recipientToken;
    await stopServer(false);
    srv = launchServer();
    await waitUp();
    assert.equal((await pgGet(`/${token}`)).status, 200, 'metadata after restart');
    const img = await pgGet(`/${token}/image`);
    assert.equal(img.status, 200, 'image after restart');
    const bytes = Buffer.from(await img.arrayBuffer());
    assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
  });

  await t('create quota is shared with room gifts; retries stay free', async () => {
    const vis = rgVisitor('192.0.2.66');
    const firstKey = pgKey();
    const firstEdition = pgEdition({ message: 'Quota message 0.' });
    const first = await pgPost(firstEdition, pgPhoto, firstKey, vis);
    assert.equal(first.status, 201);
    const firstToken = (await first.json()).recipientToken;
    for (let i = 1; i < 10; i++) {
      const r = await pgPost(pgEdition({ message: `Quota message ${i}.` }), pgPhoto, pgKey(), vis);
      assert.equal(r.status, 201, `creation ${i}`);
    }
    const roomCreate = await rgPost({ edition: rgEdition() }, rgKey(), vis);
    assert.equal(roomCreate.status, 429, 'photo creations share the room-create bucket');
    const over = await pgPost(pgEdition(), pgPhoto, pgKey(), vis);
    assert.equal(over.status, 429);
    assert.equal(over.headers.get('x-ratelimit-scope'), 'verified-client');
    // an identical retry under the exhausted bucket resolves, not a new gift
    const retry = await pgPost(firstEdition, pgPhoto, firstKey, vis);
    assert.equal(retry.status, 200, 'identical retry never consumes creation allowance');
    assert.equal((await retry.json()).recipientToken, firstToken);
    // a different signed visitor still has an independent bucket
    const other = rgVisitor('203.0.113.66');
    const b = await pgPost(pgEdition(), pgPhoto, pgKey(), other);
    assert.equal(b.status, 201, 'a second visitor is unaffected');
  });

  await stopServer();
  const failed = results.filter(([s]) => s === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await stopServer();
  process.exit(1);
});
