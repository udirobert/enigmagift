/* ------------------------------------------------------------------ */
/*  Typed fetch wrappers for the gift API.                             */
/*  Base URL: VITE_API_URL, default http://localhost:8787.             */
/*  Every call has a 15s timeout and throws ApiError on failure —      */
/*  scenes catch and fall back to the mock/demo flow.                  */
/* ------------------------------------------------------------------ */

import type {
  CreateGiftResult,
  Gift,
  GiftDirection,
  GiftMode,
  GiftOverview,
  SealResult,
  Tier,
  Trail,
  WorldStatus,
} from './types';

// Re-export the view types scenes import from here.
export type { ApiClue, Clue, Gift, GiftDirection, GiftMode, GiftOverview, HideSpot, SealResult, Tier, Trail, TrailRound, ApiObservation, ObsItem, WorldStatus } from './types';

// Same-origin by default: in dev Vite proxies /api → the server (see
// vite.config.ts); in prod the server hosts this build, so relative works.
// Set VITE_API_URL only if the API is hosted separately from the site.
const BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(init.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('the api took too long to answer', 0);
    }
    throw new ApiError('could not reach the api', 0);
  } finally {
    window.clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-json body */
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string } | null)?.error ??
      `request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

/* ------------------------------- gifts ------------------------------ */

/** Cheap liveness probe — decides live mode vs the offline demo read. */
export async function apiHealthy(): Promise<boolean> {
  try {
    const r = await request<{ ok: boolean }>('/api/health');
    return r.ok === true;
  } catch {
    return false;
  }
}

/**
 * Downscale an upload to max ~1280px JPEG before it leaves the browser —
 * the vision pass is priced per token, and drafts are read pre-payment.
 * Falls back to the original file if anything goes wrong.
 */
async function downscaleForUpload(file: File): Promise<Blob> {
  const MAX = 1280;
  try {
    const bmp = await createImageBitmap(file);
    if (Math.max(bmp.width, bmp.height) <= MAX) {
      bmp.close();
      return file;
    }
    const scale = MAX / Math.max(bmp.width, bmp.height);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return file;
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/jpeg', 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export interface CreateGiftOpts {
  mode?: GiftMode;
  tier?: Tier | null;
  packId?: string | null;
  /** referral — the trail token whose recipient made this gift (server-validated) */
  ref?: string | null;
}

/** POST /api/gifts — multipart photos[] + direction + mode/tier → {giftId, status:'reading'} */
export async function createGift(
  photos: File[],
  direction: GiftDirection,
  opts: CreateGiftOpts = {},
): Promise<CreateGiftResult> {
  const form = new FormData();
  const downscaled = await Promise.all(photos.map((f) => downscaleForUpload(f)));
  downscaled.forEach((b, i) => {
    const name = (b instanceof File ? b.name : photos[i].name.replace(/\.[^.]+$/, '')) + '.jpg';
    form.append('photos', b, name);
  });
  form.append('direction', direction);
  form.append('mode', opts.mode ?? 'digital');
  if (opts.tier) form.append('tier', opts.tier);
  if (opts.packId) form.append('packId', opts.packId);
  if (opts.ref) form.append('ref', opts.ref);
  return request<CreateGiftResult>('/api/gifts', { method: 'POST', body: form });
}

/** POST /api/packs/:id/gifts — same multipart body, consumes one pack credit */
export async function createPackGift(
  packId: string,
  photos: File[],
  direction: GiftDirection,
  opts: CreateGiftOpts = {},
): Promise<CreateGiftResult> {
  const form = new FormData();
  const downscaled = await Promise.all(photos.map((f) => downscaleForUpload(f)));
  downscaled.forEach((b, i) => {
    const name = (b instanceof File ? b.name : photos[i].name.replace(/\.[^.]+$/, '')) + '.jpg';
    form.append('photos', b, name);
  });
  form.append('direction', direction);
  form.append('mode', opts.mode ?? 'digital');
  if (opts.tier) form.append('tier', opts.tier);
  return request<CreateGiftResult>(`/api/packs/${encodeURIComponent(packId)}/gifts`, {
    method: 'POST',
    body: form,
  });
}

/** GET /api/packs/:id — {creditsLeft, children, ...} */
export async function getPack(id: string): Promise<{ id: string; creditsLeft: number; purchaseGiftId: string; children: unknown[]; createdAt: string }> {
  return request(`/api/packs/${encodeURIComponent(id)}`);
}

/** POST /api/gifts/:id/reclue — {notes} → {ok, gift} re-derived clues/rounds */
export async function reclueGift(id: string, notes: string): Promise<{ ok: boolean; gift: Gift }> {
  return request(`/api/gifts/${encodeURIComponent(id)}/reclue`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/** PATCH /api/gifts/:id/letter — {message, signature} → updated Gift.
 *  Locked (409) once the gift is sealed: the recipient may already hold it. */
export async function saveLetter(
  id: string,
  message: string,
  signature: string,
): Promise<Gift> {
  return request<Gift>(`/api/gifts/${encodeURIComponent(id)}/letter`, {
    method: 'PATCH',
    body: JSON.stringify({ message, signature }),
  });
}

/** POST /api/gifts/:id/letter-drafts — {notes?} → {drafts: string[]}
 *  Three openings grounded in what the photos showed. Bounded server-side. */
export async function letterDrafts(id: string, notes = ''): Promise<{ drafts: string[] }> {
  return request(`/api/gifts/${encodeURIComponent(id)}/letter-drafts`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/** POST /api/gifts/:id/world-source — {index} pick the photo that becomes the 3D world */
export async function setWorldSource(id: string, index: number): Promise<{ ok: boolean; worldSource: number; rebuilding: boolean }> {
  return request(`/api/gifts/${encodeURIComponent(id)}/world-source`, {
    method: 'POST',
    body: JSON.stringify({ index }),
  });
}

/** DELETE /api/gifts/:id — giver deletes a draft or a whole gift + link */
export async function deleteGift(id: string): Promise<void> {
  await request(`/api/gifts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ------------------------------ pack stash ------------------------------ */

const PACK_KEY = 'enigmagift.pack.v1';

export function stashPack(packId: string): void {
  try { localStorage.setItem(PACK_KEY, packId); } catch { /* private mode */ }
}

export function unstashPack(): string | null {
  try { return localStorage.getItem(PACK_KEY); } catch { return null; }
}

/* ------------------------------- events ------------------------------ */

export function logGiftEvent(id: string, name: string, data?: unknown): void {
  request(`/api/gifts/${encodeURIComponent(id)}/event`, {
    method: 'POST',
    body: JSON.stringify({ name, data: data ?? null }),
  }).catch(() => {});
}

export function logTrailEvent(token: string, name: string, data?: unknown): void {
  request(`/api/trail/${encodeURIComponent(token)}/event`, {
    method: 'POST',
    body: JSON.stringify({ name, data: data ?? null }),
  }).catch(() => {});
}

/** GET /api/gifts/:id */
export async function getGift(id: string): Promise<Gift> {
  return request<Gift>(`/api/gifts/${encodeURIComponent(id)}`);
}

/** GET /api/gifts/:id/overview — giver dashboard payload (no answer key) */
export async function getGiftOverview(id: string): Promise<GiftOverview> {
  return request<GiftOverview>(`/api/gifts/${encodeURIComponent(id)}/overview`);
}

/** PATCH /api/gifts/:id/clues — {keepIds, edits:{id:text}} */
export async function updateClues(
  id: string,
  keepIds: string[],
  edits: Record<string, string>,
): Promise<Gift> {
  return request<Gift>(`/api/gifts/${encodeURIComponent(id)}/clues`, {
    method: 'PATCH',
    body: JSON.stringify({ keepIds, edits }),
  });
}

/** POST /api/gifts/:id/hide — {hideSpotId, hideNote?, hiddenAt?} */
export interface HideBody {
  hideSpotId?: string | null;
  hideNote?: string | null;
  hiddenAt?: string | null;
}

/** POST /api/gifts/:id/hide — {hideSpotId, hideNote?, hiddenAt?} */
export async function hideGift(id: string, body: HideBody): Promise<void> {
  await request(`/api/gifts/${encodeURIComponent(id)}/hide`, {
    method: 'POST',
    body: JSON.stringify({
      hideSpotId: body.hideSpotId ?? null,
      hideNote: body.hideNote ?? null,
      hiddenAt: body.hiddenAt ?? null,
    }),
  });
}

/** POST /api/gifts/:id/seal → {trailToken, trailUrl, unlockCode?, sendAt?}
 * `email` is captured transactionally (Phase 1b): it delivers the link,
 * powers /api/lookup recovery, and is deleted with the gift. */
export async function sealGift(id: string, opts: { email?: string; sendAt?: string | null; fallbackAt?: string | null } = {}): Promise<SealResult> {
  return request<SealResult>(`/api/gifts/${encodeURIComponent(id)}/seal`, {
    method: 'POST',
    body: JSON.stringify({
      email: opts.email ?? undefined,
      sendAt: opts.sendAt ?? undefined,
      fallbackAt: opts.fallbackAt ?? undefined,
    }),
  });
}

/** GET /api/lookup?email= — mail back every gift owned by this address.
 * The response is deliberately uninformative; the email is the payload. */
export async function lookupGifts(email: string): Promise<{ ok: boolean }> {
  return request(`/api/lookup?email=${encodeURIComponent(email)}`);
}

/** Read ?t=<token> from the URL — the recipient's entry point. */
export function tokenFromUrl(): string | null {
  try {
    const u = new URL(window.location.href);
    // canonical form is the path /t/<token> (keeps the token out of query
    // strings, which leak via Referer/history); ?t=<token> still works
    const m = u.pathname.match(/^\/t\/([A-Za-z0-9_-]+)\/?$/);
    if (m) return m[1];
    return u.searchParams.get('t');
  } catch {
    return null;
  }
}

/** POST /api/gifts/:id/mark-paid — called on the Stripe return. The server only
 * sets `paid` when it can verify the session itself; otherwise the signed
 * Stripe webhook is the source of truth. */
export async function markPaid(id: string, sessionId?: string | null): Promise<{ ok: boolean; paid: boolean; pending?: boolean }> {
  return request(`/api/gifts/${encodeURIComponent(id)}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ sessionId: sessionId ?? null }),
  });
}

/** POST /api/gifts/:id/revoke — kill the recipient trail link (buyer-side) */
export async function revokeTrail(id: string): Promise<{ ok: boolean; revoked: boolean }> {
  return request(`/api/gifts/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
}

/** PATCH /api/gifts/:id/tier — swap tier pre-seal (Trail → Hide upsell). 409 once sealed */
export async function updateGiftTier(
  id: string,
  tier: Tier,
  mode: GiftMode,
): Promise<{ ok: boolean; tier: string; mode: string }> {
  return request(`/api/gifts/${encodeURIComponent(id)}/tier`, {
    method: 'PATCH',
    body: JSON.stringify({ tier, mode }),
  });
}

/* ------------------------------- trail ------------------------------ */

/** GET /api/trail/:token */
export async function getTrail(token: string): Promise<Trail> {
  return request<Trail>(`/api/trail/${encodeURIComponent(token)}`);
}

/** POST /api/trail/:token/answer — {round, choice} → {correct, finished} */
export async function answerRound(
  token: string,
  round: number,
  choice: number,
): Promise<{ correct: boolean; finished: boolean }> {
  return request(`/api/trail/${encodeURIComponent(token)}/answer`, {
    method: 'POST',
    body: JSON.stringify({ round, choice }),
  });
}

/** POST /api/trail/:token/unlock — {code} → {unlocked, keepsake?} */
export async function unlockTrail(
  token: string,
  code: string,
): Promise<{
  unlocked: boolean;
  viaFallback?: boolean;
  /** when the giver's "open anyway" date passes, shown after a wrong code */
  fallbackAt?: string | null;
  keepsake?: {
    throughline: string | null;
    placeGuess: string | null;
    message: string | null;
    signature: string | null;
  };
}> {
  return request(`/api/trail/${encodeURIComponent(token)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

/** GET /api/trail/:token/world-status — the 3D world's build status */
export async function worldStatus(
  token: string,
): Promise<{ worldStatus: WorldStatus }> {
  return request(`/api/trail/${encodeURIComponent(token)}/world-status`);
}
