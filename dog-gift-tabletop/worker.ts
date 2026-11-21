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
      || url.pathname.startsWith('/api/room-gifts/');
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
    try {
      const upstream = await fetch(API_ORIGIN + url.pathname + url.search, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
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
