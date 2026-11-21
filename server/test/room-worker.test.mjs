// Focused regression tests for the dog-gift-tabletop Cloudflare Worker proxy.
// No external HTTP: globalThis.fetch is stubbed per test and restored.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../dog-gift-tabletop/worker.ts';

const FLY = 'https://enigmagift-api.fly.dev';
const ENV = { ASSETS: { fetch: (req) => new Response('static:' + new URL(req.url).pathname) } };
const KEY = 'a'.repeat(64);

function stubFetch(fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  return () => { globalThis.fetch = original; };
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
      },
      body: payload,
    });
    const res = await worker.fetch(req, ENV);
    assert.equal(captured.url, `${FLY}/api/room-gifts`);
    assert.equal(captured.init.method, 'POST');
    assert.equal(captured.bodyText, payload);
    assert.equal(captured.headers.authorization, `Bearer ${KEY}`);
    assert.equal(captured.headers.origin, undefined);
    assert.equal(captured.headers.host, undefined);
    assert.equal(captured.headers['content-length'], undefined);
    assert.equal(captured.headers.cookie, undefined);
    assert.equal(captured.init.redirect, 'manual');
    assert.ok(captured.init.signal);
    assert.equal(res.status, 201);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal(await res.json().then((b) => b.recipientToken), 't');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('set-cookie'), null);
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
