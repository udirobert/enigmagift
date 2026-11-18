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
  SealResult,
  Trail,
  WorldStatus,
} from './types';

// Re-export the view types scenes import from here.
export type { ApiClue, Clue, Gift, HideSpot, SealResult, Trail, TrailRound, ApiObservation, ObsItem, WorldStatus } from './types';

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

/** POST /api/gifts — multipart photos[] + direction → {giftId, status:'reading'} */
export async function createGift(
  photos: File[],
  direction: GiftDirection,
): Promise<CreateGiftResult> {
  const form = new FormData();
  photos.forEach((f) => form.append('photos', f, f.name));
  form.append('direction', direction);
  return request<CreateGiftResult>('/api/gifts', { method: 'POST', body: form });
}

/** GET /api/gifts/:id */
export async function getGift(id: string): Promise<Gift> {
  return request<Gift>(`/api/gifts/${encodeURIComponent(id)}`);
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

/** POST /api/gifts/:id/seal → {trailToken, trailUrl, unlockCode?} */
export async function sealGift(id: string): Promise<SealResult> {
  return request<SealResult>(`/api/gifts/${encodeURIComponent(id)}/seal`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** Read ?t=<token> from the URL — the recipient's entry point. */
export function tokenFromUrl(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('t');
  } catch {
    return null;
  }
}

/** POST /api/gifts/:id/mark-paid — called on the Stripe return */
export async function markPaid(id: string, sessionId?: string | null): Promise<void> {
  await request<{ ok: boolean }>(`/api/gifts/${encodeURIComponent(id)}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ sessionId: sessionId ?? null }),
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
): Promise<{ unlocked: boolean; keepsake?: unknown }> {
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
