/* One IndexedDB record holds the whole draft — including the prepared image
   Blob (never a blob: URL). Storage failure must not break composing, so a
   denied database falls back to a memory-only draft with an honest status. */

import type { PhotoDraft } from './photo-edition';
import { PHOTO_LIMITS } from './photo-edition';

const DB_NAME = 'enigmagift-photo';
const STORE = 'draft';
const KEY = 'current';
const MAX_STORED_BLOB = 2 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;
let denied = false;
let corruptLoad = false;

const failureListeners = new Set<() => void>();
const markDenied = () => {
  if (denied) return;
  denied = true;
  failureListeners.forEach((fn) => fn());
};

/* First failure — boot or a late quota/abort — flips the flag and tells
   the app once, so the honest "this tab only" notice stays accurate. */
export function onStorageFailure(listener: () => void): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

const openDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in globalThis)) { markDenied(); reject(new Error('no idb')); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { markDenied(); reject(req.error ?? new Error('idb failed')); };
      req.onblocked = () => { markDenied(); reject(new Error('idb blocked')); };
    });
    dbPromise.catch(() => {});
  }
  return dbPromise;
};

const txDone = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error('idb transaction failed'));
  tx.onabort = () => reject(tx.error ?? new Error('idb transaction aborted'));
});

const put = async (draft: PhotoDraft): Promise<void> => {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(draft, KEY);
  await txDone(tx);
};

let saveTimer = 0;
let queued: PhotoDraft | null = null;

/* Debounced 300 ms — every change resets the timer, so a pause writes once. */
export function saveDraftSoon(draft: PhotoDraft) {
  queued = { ...draft };
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void flushDraft(); }, 300);
}

/* Best-effort flush when the page hides — the timer alone can be dropped. */
const flushBestEffort = () => {
  if (!queued) return;
  void flushDraft();
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushBestEffort();
});
window.addEventListener('pagehide', flushBestEffort);

/* Flush the queued write — pending create identity must land before POST. */
export async function flushDraft(): Promise<void> {
  if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = 0; }
  const d = queued; queued = null;
  if (!d) return;
  try { await put(d); } catch { markDenied(); }
}

/* Shape-check a stored record — a corrupt record must never crash boot.
   Partial drafts are legal (blank names, no photo yet), so this is a
   looser check than normalizePhotoEdition. */
const STEPS = new Set(['photo', 'hide', 'clue', 'note', 'review']);
const validStoredDraft = (raw: unknown): raw is PhotoDraft => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const d = raw as Record<string, unknown>;
  for (const field of ['to', 'from', 'message', 'clue'] as const) {
    if (typeof d[field] !== 'string' || (d[field] as string).length > PHOTO_LIMITS[field]) return false;
  }
  if (typeof d.step !== 'string' || !STEPS.has(d.step)) return false;
  if (d.photo !== null && d.photo !== undefined) {
    if (!(d.photo instanceof Blob)) return false;
    if (d.photo.type !== 'image/jpeg' || d.photo.size > MAX_STORED_BLOB) return false;
    if (!Number.isInteger(d.photoWidth) || !Number.isInteger(d.photoHeight)
      || (d.photoWidth as number) < 1 || (d.photoWidth as number) > 1600
      || (d.photoHeight as number) < 1 || (d.photoHeight as number) > 1600) return false;
  } else if (d.photoWidth !== 0 || d.photoHeight !== 0) {
    return false;
  }
  if (d.hidingSpot !== null) {
    const spot = d.hidingSpot as Record<string, unknown> | null;
    if (!spot || typeof spot !== 'object'
      || typeof spot.x !== 'number' || typeof spot.y !== 'number'
      || !Number.isFinite(spot.x) || !Number.isFinite(spot.y)
      || spot.x < 0 || spot.x > 1 || spot.y < 0 || spot.y > 1) return false;
  }
  if (d.pending !== null) {
    const p = d.pending as Record<string, unknown> | null;
    if (!p || typeof p !== 'object'
      || typeof p.key !== 'string' || !/^[0-9a-f]{64}$/.test(p.key)
      || typeof p.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(p.fingerprint)) return false;
  }
  if (d.copiedFromSaved !== undefined && typeof d.copiedFromSaved !== 'boolean') return false;
  return true;
};

/* True when the last loadDraft found a record it could not trust. */
export const loadWasCorrupt = () => corruptLoad;

export async function loadDraft(): Promise<PhotoDraft | null> {
  corruptLoad = false;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('read failed'));
    });
    await txDone(tx);
    if (raw === undefined || raw === null) return null;
    if (!validStoredDraft(raw)) { corruptLoad = true; return null; }
    return raw;
  } catch {
    markDenied();
    return null;
  }
}

/* Returns true only when the durable record is confirmed gone — a failed
   clear must never be reported as deleted. */
export async function clearDraft(): Promise<boolean> {
  if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = 0; }
  queued = null;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    await txDone(tx);
    return true;
  } catch {
    markDenied();
    return false;
  }
}

export const storageDenied = () => denied;
