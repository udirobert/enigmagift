const API_ORIGIN = 'https://enigmagift-api.fly.dev';

const apiError = (status: number, error: string) =>
  Response.json({ error }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const allowed = url.pathname === '/api/health'
      || url.pathname === '/api/room-gifts'
      || url.pathname.startsWith('/api/room-gifts/')
      || url.pathname === '/api/photo-gifts'
      || url.pathname.startsWith('/api/photo-gifts/');
    if (!allowed) return apiError(404, 'not_found');
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return apiError(403, 'origin_not_allowed');
    const headers = new Headers(request.headers);
    // The edge checks the browser Origin above. Forward to Fly without a browser
    // Origin so its separate host allowlist need not mirror workers.dev aliases.
    headers.delete('origin');
    headers.delete('host');
    headers.delete('content-length');
    headers.delete('cookie');
    // Never forward caller-supplied identity/IP headers — the Worker sets its
    // own signed visitor id for creations and nothing else may claim one.
    headers.delete('x-enigmagift-visitor');
    headers.delete('x-enigmagift-visitor-proof');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-connecting-ipv6');
    headers.delete('x-real-ip');
    headers.delete('x-forwarded-for');
    try {
      if (request.method === 'POST'
        && (url.pathname === '/api/room-gifts' || url.pathname === '/api/photo-gifts')) {
        // Cloudflare overwrites CF-Connecting-IP with the connecting client's address.
        const ip = request.headers.get('CF-Connecting-IP');
        const secret = env.ROOM_PROXY_SECRET;
        if (!ip || !/^[0-9a-fA-F:.]{3,45}$/.test(ip)
          || typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret)) {
          console.error(JSON.stringify({ event: 'room_proxy_identity_unavailable' }));
          return apiError(503, 'api_unavailable');
        }
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(secret),
          { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const hex = (bytes: ArrayBuffer) =>
          Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
        const id = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`room-client-v1\n${ip}`)));
        const proof = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`room-create-v1\n${id}`)));
        headers.set('X-Enigmagift-Visitor', id);
        headers.set('X-Enigmagift-Visitor-Proof', proof);
      }
      const upstream = await fetch(API_ORIGIN + url.pathname + url.search, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
        // photo creation carries a multi-MB upload — it gets a longer leash
        signal: AbortSignal.timeout(
          request.method === 'POST' && url.pathname === '/api/photo-gifts' ? 45000 : 12000),
      });
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.delete('set-cookie');
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      console.error(JSON.stringify({ event: 'room_api_unavailable' }));
      return apiError(503, 'api_unavailable');
    }
  },
} satisfies ExportedHandler<Env>;
