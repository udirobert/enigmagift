// Focused regression tests for the dog-gift-tabletop Cloudflare Worker proxy.
// No external HTTP: globalThis.fetch is stubbed per test and restored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import worker from '../../dog-gift-tabletop/worker.ts';

const FLY = 'https://enigmagift-api.fly.dev';
const SECRET = randomBytes(32).toString('hex');
const ENV = {
  ASSETS: { fetch: (req) => new Response('static:' + new URL(req.url).pathname) },
  ROOM_PROXY_SECRET: SECRET,
};
const KEY = 'a'.repeat(64);
const hmac = (msg) => createHmac('sha256', SECRET).update(msg).digest('hex');
const visitorFor = (ip) => {
  const id = hmac(`room-client-v1\n${ip}`);
  return { id, proof: hmac(`room-create-v1\n${id}`) };
};

function stubFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  return () => { globalThis.fetch = original; };
}

async function proxiedPost(headers = {}) {
  let captured = null;
  const restore = stubFetch(async (input, init) => {
    captured = {
      url: String(input), init,
      headers: Object.fromEntries(init.headers.entries()),
      bodyText: await new Response(init.body).text(),
    };
    return new Response(JSON.stringify({ recipientToken: 't' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const res = await worker.fetch(new Request('https://room.example/api/room-gifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...headers },
      body: JSON.stringify({ edition: {} }),
    }), ENV);
    return { res, captured };
  } finally { restore(); }
}

test('non-/api requests delegate to ASSETS and never touch Fly', async () => {
  let calls = 0;
  const restore = stubFetch(() => { calls++; throw new Error('must not fetch'); });
  try {
    const res = await worker.fetch(new Request('https://room.example/'), ENV);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'static:/');
  } finally { restore(); }
  assert.equal(calls, 0);
});

test('same-origin POST /api/room-gifts forwards to Fly with sanitized headers', async () => {
  let captured = null;
  const restore = stubFetch(async (input, init) => {
    captured = {
      url: String(input), init,
      headers: Object.fromEntries(init.headers.entries()),
      bodyText: await new Response(init.body).text(),
    };
    return new Response(JSON.stringify({ recipientToken: 't' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'sid=secret; HttpOnly' },
    });
  });
  try {
    const payload = JSON.stringify({ edition: { roomId: 'dog-dining-room' } });
    const req = new Request('https://room.example/api/room-gifts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        Origin: 'https://room.example',
        Host: 'room.example',
        'Content-Length': String(payload.length),
        Cookie: 'session=abc',
        'CF-Connecting-IP': '198.51.100.7',
      },
      body: payload,
    });
    const res = await worker.fetch(req, ENV);
    const { id, proof } = visitorFor('198.51.100.7');
    assert.equal(captured.url, `${FLY}/api/room-gifts`);
    assert.equal(captured.init.method, 'POST');
    assert.equal(captured.bodyText, payload);
    assert.equal(captured.headers.authorization, `Bearer ${KEY}`);
    assert.equal(captured.headers['x-enigmagift-visitor'], id, 'HMAC visitor id');
    assert.equal(captured.headers['x-enigmagift-visitor-proof'], proof, 'HMAC proof');
    for (const h of ['origin', 'host', 'content-length', 'cookie',
      'cf-connecting-ip', 'cf-connecting-ipv6', 'x-real-ip', 'x-forwarded-for']) {
      assert.equal(captured.headers[h], undefined, `leaked ${h}`);
    }
    assert.equal(captured.init.redirect, 'manual');
    assert.ok(captured.init.signal);
    assert.equal(res.status, 201);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal(await res.json().then((b) => b.recipientToken), 't');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('set-cookie'), null);
  } finally { restore(); }
});

test('visitor id is deterministic per IP, differs across IPs, and only CF-Connecting-IP counts', async () => {
  const a = await proxiedPost({ 'CF-Connecting-IP': '198.51.100.7' });
  const b = await proxiedPost({ 'CF-Connecting-IP': '198.51.100.7' });
  assert.equal(a.captured.headers['x-enigmagift-visitor'], b.captured.headers['x-enigmagift-visitor'], 'same IP → same id');
  const c = await proxiedPost({ 'CF-Connecting-IP': '203.0.113.9' });
  assert.notEqual(c.captured.headers['x-enigmagift-visitor'], a.captured.headers['x-enigmagift-visitor'], 'different IP → different id');
  const { id, proof } = visitorFor('203.0.113.9');
  assert.equal(c.captured.headers['x-enigmagift-visitor'], id);
  assert.equal(c.captured.headers['x-enigmagift-visitor-proof'], proof);
  // an IPv6 literal in CF-Connecting-IP is signed as that address
  const v6 = await proxiedPost({ 'CF-Connecting-IP': '2001:db8::7' });
  assert.equal(v6.captured.headers['x-enigmagift-visitor'], visitorFor('2001:db8::7').id, 'v6 in CF-Connecting-IP');
  // a spoofed CF-Connecting-IPv6 header never displaces the signed v4 identity
  const spoof = await proxiedPost({ 'CF-Connecting-IP': '198.51.100.7', 'CF-Connecting-IPv6': '2001:db8::7' });
  assert.equal(spoof.captured.headers['x-enigmagift-visitor'], visitorFor('198.51.100.7').id, 'IPv6 header ignored');
});

test('caller-supplied identity headers are overwritten, never trusted', async () => {
  const { captured } = await proxiedPost({
    'CF-Connecting-IP': '198.51.100.7',
    'X-Enigmagift-Visitor': '0'.repeat(64),
    'X-Enigmagift-Visitor-Proof': '0'.repeat(64),
  });
  assert.equal(captured.headers['x-enigmagift-visitor'], visitorFor('198.51.100.7').id);
  assert.notEqual(captured.headers['x-enigmagift-visitor'], '0'.repeat(64));
});

test('creation fails 503 without a usable client IP or secret, zero upstream calls', async () => {
  for (const [label, headers, env] of [
    ['no IP', {}, ENV],
    ['no secret', { 'CF-Connecting-IP': '198.51.100.7' }, { ...ENV, ROOM_PROXY_SECRET: undefined }],
    ['bad secret', { 'CF-Connecting-IP': '198.51.100.7' }, { ...ENV, ROOM_PROXY_SECRET: 'nope' }],
  ]) {
    let calls = 0;
    const restore = stubFetch(() => { calls++; return new Response(''); });
    try {
      const res = await worker.fetch(new Request('https://room.example/api/room-gifts', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, ...headers },
        body: '{}',
      }), env);
      assert.equal(res.status, 503, label);
      assert.deepEqual(await res.json(), { error: 'api_unavailable' });
      assert.equal(res.headers.get('cache-control'), 'no-store');
    } finally { restore(); }
    assert.equal(calls, 0, label);
  }
});

test('GET manage forwards without any client-injected identity headers', async () => {
  let captured = null;
  const restore = stubFetch(async (input, init) => {
    captured = { url: String(input), headers: Object.fromEntries(init.headers.entries()) };
    return new Response('{"revoked":false}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const res = await worker.fetch(new Request('https://room.example/api/room-gifts/manage', {
      headers: {
        Authorization: `Bearer ${KEY}`,
        'X-Enigmagift-Visitor': '0'.repeat(64),
        'X-Enigmagift-Visitor-Proof': '0'.repeat(64),
      },
    }), ENV);
    assert.equal(captured.url, `${FLY}/api/room-gifts/manage`);
    assert.equal(captured.headers['x-enigmagift-visitor'], undefined, 'GET must not carry an id');
    assert.equal(captured.headers['x-enigmagift-visitor-proof'], undefined, 'GET must not carry a proof');
    assert.equal(captured.headers.authorization, `Bearer ${KEY}`);
    assert.equal(res.status, 200);
  } finally { restore(); }
});

test('GET recipient path preserves query and passes upstream 404 with no-store', async () => {
  let captured = null;
  const restore = stubFetch(async (input, init) => {
    captured = { url: String(input) };
    return new Response('{"error":"gift_unavailable"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const res = await worker.fetch(new Request('https://room.example/api/room-gifts/abc?x=1'), ENV);
    assert.equal(captured.url, `${FLY}/api/room-gifts/abc?x=1`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  } finally { restore(); }
});

test('cross-origin POST is rejected 403 with zero upstream calls', async () => {
  let calls = 0;
  const restore = stubFetch(() => { calls++; return new Response(''); });
  try {
    const res = await worker.fetch(new Request('https://room.example/api/room-gifts', {
      method: 'POST', headers: { Origin: 'https://other.invalid' }, body: '{}',
    }), ENV);
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'origin_not_allowed' });
    assert.equal(res.headers.get('cache-control'), 'no-store');
  } finally { restore(); }
  assert.equal(calls, 0);
});

test('non-room API paths are 404 with zero upstream calls', async () => {
  for (const path of ['/api/gifts', '/api/stripe/webhook']) {
    let calls = 0;
    const restore = stubFetch(() => { calls++; return new Response(''); });
    try {
      const res = await worker.fetch(new Request('https://room.example' + path), ENV);
      assert.equal(res.status, 404, path);
      assert.deepEqual(await res.json(), { error: 'not_found' });
    } finally { restore(); }
    assert.equal(calls, 0, path);
  }
});

test('upstream failure returns 503 api_unavailable without leaking detail', async () => {
  const restore = stubFetch(() => Promise.reject(new Error('connect failed ' + KEY)));
  try {
    const res = await worker.fetch(new Request('https://room.example/api/room-gifts/manage', {
      headers: { Authorization: `Bearer ${KEY}` },
    }), ENV);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: 'api_unavailable' });
    assert.ok(!text.includes(KEY));
    assert.ok(!text.includes('connect failed'));
  } finally { restore(); }
});
