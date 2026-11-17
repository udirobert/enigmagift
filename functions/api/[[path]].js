// Pages Function: same-origin /api/* proxy to the Fly.io backend.
// Pages _redirects cannot proxy external domains, so this catch-all
// forwards method, headers, and body (incl. multipart uploads) verbatim.
const API = 'https://enigmagift-api.fly.dev';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = API + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length'); // recomputed for the streamed body

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half'; // stream request bodies (photo uploads) through
  }

  const upstream = await fetch(target, init);
  const respHeaders = new Headers(upstream.headers);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}
