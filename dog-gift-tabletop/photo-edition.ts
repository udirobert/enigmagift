/* Personal-photo hunt data model — the exact contract from PHOTO-HUNT.md. */

export interface PhotoEdition {
  version: 1;
  to: string;      // trimmed, required, 1–40
  from: string;    // trimmed, required, 1–40
  message: string; // trimmed, required, 1–600; internal newlines preserved
  clue: string;    // trimmed, optional, 0–200
  hidingSpot: { x: number; y: number }; // normalized 0–1 on the uncropped photo
}

export interface PhotoDraft {
  to: string;
  from: string;
  message: string;
  clue: string;
  hidingSpot: { x: number; y: number } | null;
  photo: Blob | null;
  photoWidth: number;
  photoHeight: number;
  step: 'photo' | 'hide' | 'clue' | 'note' | 'review';
  pending: { key: string; fingerprint: string } | null;
  /* true when this draft is a copy of an already-saved gift being edited —
     saved links stay immutable, so the next save mints a new link */
  copiedFromSaved?: boolean;
}

export const PHOTO_LIMITS = { to: 40, from: 40, message: 600, clue: 200 };

export const emptyPhotoDraft = (): PhotoDraft => ({
  to: '', from: '', message: '', clue: '',
  hidingSpot: null, photo: null, photoWidth: 0, photoHeight: 0,
  step: 'photo', pending: null, copiedFromSaved: false,
});

/* Normalize in the PhotoEdition field order. Raw strings are rejected
   over-limit BEFORE trimming; unrecognized properties are dropped. */
export function normalizePhotoEdition(input: unknown): PhotoEdition | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const src = input as Record<string, unknown>;
  if (src.version !== 1) return null;
  const out = { version: 1 } as PhotoEdition;
  for (const field of ['to', 'from', 'message', 'clue'] as const) {
    const raw = src[field];
    if (typeof raw !== 'string' || raw.length > PHOTO_LIMITS[field]) return null;
    const trimmed = raw.trim();
    if (field !== 'clue' && !trimmed) return null;
    out[field] = trimmed;
  }
  const spot = src.hidingSpot;
  if (!spot || typeof spot !== 'object' || Array.isArray(spot)) return null;
  const { x, y } = spot as { x: unknown; y: unknown };
  if (typeof x !== 'number' || typeof y !== 'number'
    || !Number.isFinite(x) || !Number.isFinite(y)
    || x < 0 || x > 1 || y < 0 || y > 1) return null;
  out.hidingSpot = { x, y };
  return out;
}

/* Canonical JSON: fixed key order for a stable client-side identity.
   The server hashes its own normalized edition + stored JPEG, so the two
   hashes are independent — the client fingerprint only decides whether a
   retry may reuse the same management key. */
export const canonicalPhotoEdition = (e: PhotoEdition): string =>
  JSON.stringify({
    version: 1, to: e.to, from: e.from, message: e.message, clue: e.clue,
    hidingSpot: { x: e.hidingSpot.x, y: e.hidingSpot.y },
  });

/* Request identity: SHA-256 over canonical edition + '\n' + JPEG bytes. */
export async function photoFingerprint(edition: PhotoEdition, jpeg: Blob): Promise<string> {
  const head = new TextEncoder().encode(`${canonicalPhotoEdition(edition)}\n`);
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const buf = new Uint8Array(head.length + bytes.length);
  buf.set(head, 0); buf.set(bytes, head.length);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
