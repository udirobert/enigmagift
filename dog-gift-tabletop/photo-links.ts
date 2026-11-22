/* Photo-gift link creation and management against /api/photo-gifts.
   Same contract as the room links: a public recipient token and a private
   64-hex management key. Never claims a message was sent. Every 2xx body
   is validated before it is trusted — a malformed success keeps the
   pending draft instead of clearing it. */

import type { PhotoEdition } from './photo-edition';
import { canonicalPhotoEdition, normalizePhotoEdition } from './photo-edition';

export class PhotoLinkError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) { super(code); }
}

export const GIFT_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const MANAGE_KEY_RE = /^[0-9a-f]{64}$/;
const MAX_DIM = 1600;

const badBody = (): PhotoLinkError => new PhotoLinkError(0, 'invalid_response');

const validDate = (v: unknown): v is string =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));

const validImage = (v: unknown): v is { width: number; height: number } => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const { width, height } = v as { width: unknown; height: unknown };
  return Number.isInteger(width) && Number.isInteger(height)
    && (width as number) >= 1 && (width as number) <= MAX_DIM
    && (height as number) >= 1 && (height as number) <= MAX_DIM;
};

/* The whole request — including the body upload — fits in one 60 s bound;
   a stalled request must not leak past it. */
async function api(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/photo-gifts${path}`, {
      credentials: 'omit',
      cache: 'no-store',
      ...init,
      signal: ctl.signal,
    });
    const body = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      throw new PhotoLinkError(
        res.status,
        typeof body?.error === 'string' ? body.error : `http_${res.status}`,
      );
    }
    return body;
  } finally {
    window.clearTimeout(timer);
  }
}

const ownerHeaders = (key: string) => ({ Authorization: `Bearer ${key}` });

export interface PhotoCreated { recipientToken: string; createdAt: string }

const parseCreated = (body: unknown): PhotoCreated => {
  const b = body as PhotoCreated | null;
  if (!b || typeof b !== 'object'
    || typeof b.recipientToken !== 'string' || !GIFT_TOKEN_RE.test(b.recipientToken)
    || !validDate(b.createdAt)) throw badBody();
  return { recipientToken: b.recipientToken, createdAt: b.createdAt };
};

export async function createPhotoGift(
  key: string, edition: PhotoEdition, photo: Blob,
): Promise<PhotoCreated> {
  const fd = new FormData();
  fd.append('edition', canonicalPhotoEdition(edition));
  fd.append('photo', photo, 'photo.jpg');
  return parseCreated(await api('', { method: 'POST', headers: ownerHeaders(key), body: fd }));
}

export interface ManageView {
  recipientToken: string;
  createdAt: string;
  revoked: boolean;
  edition: PhotoEdition | null;
  image: { width: number; height: number } | null;
}

const parseManageView = (body: unknown): ManageView => {
  const b = body as ManageView | null;
  if (!b || typeof b !== 'object' || typeof b.revoked !== 'boolean'
    || typeof b.recipientToken !== 'string' || !GIFT_TOKEN_RE.test(b.recipientToken)
    || !validDate(b.createdAt)) throw badBody();
  if (b.revoked) {
    if (b.edition !== null || b.image !== null) throw badBody();
    return { ...b, edition: null, image: null };
  }
  const edition = normalizePhotoEdition(b.edition);
  if (!edition || !validImage(b.image)) throw badBody();
  return { ...b, edition, image: b.image };
};

export const getManageView = async (key: string): Promise<ManageView> =>
  parseManageView(await api('/manage', { headers: ownerHeaders(key) }));

export const revokePhotoGift = async (key: string): Promise<{ revoked: true }> => {
  const b = await api('/manage', { method: 'DELETE', headers: ownerHeaders(key) }) as { revoked?: unknown } | null;
  if (!b || b.revoked !== true) throw badBody();
  return { revoked: true };
};

export interface PublicGift {
  edition: PhotoEdition;
  image: { width: number; height: number };
  createdAt: string;
}

const parsePublicGift = (body: unknown): PublicGift => {
  const b = body as PublicGift | null;
  if (!b || typeof b !== 'object' || !validDate(b.createdAt) || !validImage(b.image)) throw badBody();
  const edition = normalizePhotoEdition(b.edition);
  if (!edition) throw badBody();
  return { edition, image: b.image, createdAt: b.createdAt };
};

export const getPublicGift = async (token: string): Promise<PublicGift> =>
  parsePublicGift(await api(`/${encodeURIComponent(token)}`));
export const publicImageUrl = (token: string) => `/api/photo-gifts/${encodeURIComponent(token)}/image`;

/* The stored photo for an "edit a saved gift" copy — already the normalized
   JPEG, so no re-encoding. Dimensions come from the validated ManageView. */
export async function getSavedPhoto(token: string): Promise<Blob> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 60_000);
  try {
    const res = await fetch(publicImageUrl(token), {
      credentials: 'omit', cache: 'no-store', signal: ctl.signal,
    });
    if (!res.ok) throw new PhotoLinkError(res.status, 'photo_unavailable');
    const blob = await res.blob();
    if (blob.type !== 'image/jpeg' || blob.size === 0 || blob.size > 2 * 1024 * 1024) {
      throw badBody();
    }
    return blob;
  } finally {
    window.clearTimeout(timer);
  }
}

/* ---------- URLs: same origin + path, ?photo=1, one fragment ---------- */
export const recipientPhotoUrl = (token: string) =>
  `${location.origin}${location.pathname}?photo=1#gift=${token}`;
export const managementPhotoUrl = (key: string) =>
  `${location.origin}${location.pathname}?photo=1#manage=${key}`;

export const newManageKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
