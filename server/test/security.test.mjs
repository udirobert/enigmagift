// Security regression tests — boots the real server on a throwaway DB and
// asserts the auth/payment/scoping invariants. Run: node test/security.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { stripExif } from '../exif.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, '..', 'index.js');
const PHOTO = join(HERE, '..', '..', 'public', 'showcase', '0.jpg');
const PORT = 8898;
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'whsec_testsecret_testsecret_test';

const tmp = mkdtempSync(join(tmpdir(), 'eg-sec-'));
const env = {
  ...process.env,
  PORT: String(PORT),
  DB_PATH: join(tmp, 'test.db'),
  UPLOADS_DIR: join(tmp, 'uploads'),
  STRIPE_WEBHOOK_SECRET: SECRET,
  // deliberately NO STRIPE_API_KEY — mark-paid must fail closed
};

const srv = spawn('node', [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
srv.stdout.on('data', (d) => { serverLog += d; });
srv.stderr.on('data', (d) => { serverLog += d; });

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(['ok', name]); console.log(`  ok — ${name}`); }
  catch (e) { results.push(['FAIL', name]); console.error(`  FAIL — ${name}: ${e.message}`); }
}

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start\n' + serverLog);
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
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_x', client_reference_id: giftId, amount_total: 499 } } });
    const r = await fetch(`${BASE}/api/stripe/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: payload,
    });
    assert.equal(r.status, 400);
  });

  await t('webhook with wrong amount → 400', async () => {
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_x', client_reference_id: giftId, amount_total: 1 } } });
    const r = await fetch(`${BASE}/api/stripe/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload) }, body: payload,
    });
    assert.equal(r.status, 400);
  });

  await t('webhook with valid signature + correct amount sets paid', async () => {
    const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_ok', client_reference_id: giftId, amount_total: 499 } } });
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

  srv.kill('SIGTERM');
  rmSync(tmp, { recursive: true, force: true });
  const failed = results.filter(([s]) => s === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); srv.kill('SIGTERM'); process.exit(1); });
