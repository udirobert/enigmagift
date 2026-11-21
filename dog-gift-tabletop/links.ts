/// <reference types="vite/client" />
import { ROOM, type GiftEdition } from './edition';

/**
 * Saved gift links. The editor can publish a snapshot of its draft as a
 * recipient link (`#gift=<token>`) plus a private management link
 * (`#manage=<key>`) that can close it. The key lives only in the URL the
 * sender keeps — the server stores a SHA-256 hash of it.
 */

export type LinkMode = 'demo' | 'recipient' | 'manage' | 'invalid';

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const KEY_SHAPE = /^[a-f0-9]{64}$/i;
const LIMITS: Record<string, number> = {
  to: 40, from: 40, dog: 160, chair: 160, postcard: 160, memory: 160, invitation: 200,
};
const FIELDS = Object.keys(LIMITS) as (keyof Omit<GiftEdition, 'roomId' | 'revision'>)[];

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined ?? '').replace(/\/+$/, '');
const PENDING_KEY = 'enigmagift.room-link.pending';
const NOTICE_KEY = 'enigmagift.room-link.notice';

const hashParams = new URLSearchParams(location.hash.slice(1));
// both keys present (even empty) or any duplicate => never a valid link
const invalidFragment =
  (hashParams.has('gift') && hashParams.has('manage')) ||
  hashParams.getAll('gift').length > 1 ||
  hashParams.getAll('manage').length > 1 ||
  [...hashParams.keys()].some((k) => k !== 'gift' && k !== 'manage');
const giftParam = invalidFragment ? null : hashParams.get('gift');
const manageParam = invalidFragment ? null : hashParams.get('manage');
export const linkMode: LinkMode =
  giftParam != null ? (TOKEN_SHAPE.test(giftParam) ? 'recipient' : 'invalid')
    : manageParam != null ? (KEY_SHAPE.test(manageParam) ? 'manage' : 'invalid')
      : hashParams.toString() || invalidFragment ? 'invalid'
        : 'demo';
const recipientToken = linkMode === 'recipient' ? giftParam! : null;
const manageKey = linkMode === 'manage' ? manageParam!.toLowerCase() : null;

// any fragment change means a different link — reload rather than trust stale state
window.addEventListener('hashchange', () => location.reload());

export class RoomLinkError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'RoomLinkError';
  }
}

/** Mirrors server/room-gifts.js: approved room/revision, whitelist of fields,
 *  each a non-empty trimmed string within its length limit. */
export function validateEdition(value: unknown): GiftEdition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.roomId !== ROOM.id || input.revision !== ROOM.revision) return null;
  const edition = { roomId: ROOM.id, revision: ROOM.revision } as GiftEdition;
  for (const field of FIELDS) {
    const raw = input[field];
    if (typeof raw !== 'string' || raw.length > LIMITS[field]) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    (edition as unknown as Record<string, string>)[field] = trimmed;
  }
  return edition;
}

// the 15s bound covers the whole request INCLUDING the body parse — a stalled
// response must not leak past the timeout
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(`${API_BASE}/api/room-gifts${path}`, {
      credentials: 'omit',
      cache: 'no-store',
      ...init,
      signal: ctl.signal,
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new RoomLinkError(
        res.status,
        typeof body?.error === 'string' ? body.error : `http_${res.status}`,
      );
    }
    return body as T;
  } finally {
    window.clearTimeout(timer);
  }
}

const ownerHeaders = (key: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${key}`,
});

/* ---------- link URLs: same origin/path, one fragment, nothing else ---------- */
const cleanUrl = () => `${location.origin}${location.pathname}`;
const recipientUrl = (token: string) => `${cleanUrl()}#gift=${token}`;
const managementUrl = (key: string) => `${cleanUrl()}#manage=${key}`;

/* ---------- pending create: survive an interrupted request, in-session only ---------- */
interface Pending { key: string; edition: GiftEdition }
// sessionStorage is the preferred store, but a denied Storage API must still
// reuse the same key for an identical retry — keep a module-level copy too
let memoryPending: Pending | null = null;
const readPending = (): Pending | null => {
  if (memoryPending) return memoryPending;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    if (!p || !KEY_SHAPE.test(p.key)) return null;
    const edition = validateEdition(p.edition);
    if (!edition) return null;
    memoryPending = { key: p.key, edition };
    return memoryPending;
  } catch { return null; }
};
const writePending = (p: Pending | null) => {
  memoryPending = p;
  try {
    if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch { /* storage denied — memoryPending covers this tab */ }
};
const writeNotice = (text: string | null) => {
  try {
    if (text) sessionStorage.setItem(NOTICE_KEY, text);
    else sessionStorage.removeItem(NOTICE_KEY);
  } catch { /* best effort */ }
};
const readNotice = () => {
  try {
    const n = sessionStorage.getItem(NOTICE_KEY);
    sessionStorage.removeItem(NOTICE_KEY);
    return n;
  } catch { return null; }
};

const newKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

/** Restore an interrupted create's draft (demo author mode only). The pending
 *  key is kept for the retry; nothing here touches the network. */
export function restorePendingDraft(): GiftEdition | null {
  return readPending()?.edition ?? null;
}

/* ---------- create ---------- */
const sameEdition = (a: GiftEdition, b: GiftEdition) => JSON.stringify(a) === JSON.stringify(b);

export async function createRecipientLink(draft: GiftEdition): Promise<void> {
  const status = document.querySelector<HTMLElement>('#rmLinkStatus');
  const form = document.querySelector<HTMLFormElement>('#remixForm');
  const createBtn = document.querySelector<HTMLButtonElement>('#rmCreate');
  const say = (s: string) => { if (status) status.textContent = s; };

  const edition = validateEdition(draft);
  if (!edition) {
    say('Check the names, message and clue lengths before creating a link.');
    return;
  }

  // freeze the snapshot for the duration of the request
  const controls = Array.from(form?.querySelectorAll('input, textarea, button') ?? []);
  controls.forEach((c) => ((c as HTMLButtonElement).disabled = true));
  if (createBtn) createBtn.textContent = 'Creating link…';
  form?.setAttribute('aria-busy', 'true');
  say('Creating your link…');
  const unfreeze = () => {
    controls.forEach((c) => ((c as HTMLButtonElement).disabled = false));
    if (createBtn) createBtn.textContent = 'Create recipient link';
    form?.removeAttribute('aria-busy');
  };

  // identical retry reuses the pending key; an edited draft gets a fresh one
  const pending = readPending();
  const key = pending && sameEdition(pending.edition, edition) ? pending.key : newKey();
  writePending({ key, edition });

  try {
    const body = await api<{ recipientToken?: string }>('', {
      method: 'POST',
      headers: ownerHeaders(key),
      body: JSON.stringify({ edition }),
    });
    if (!body?.recipientToken || !TOKEN_SHAPE.test(body.recipientToken)) {
      throw new RoomLinkError(502, 'bad_response');
    }
    writePending(null);
    writeNotice(null);
    location.replace(managementUrl(key)); // hashchange reloads into manage mode
  } catch (e) {
    if (e instanceof RoomLinkError && e.status === 409) {
      // this key already holds a different (earlier) edition — it is owned by
      // this same key, so hand the sender the management view of that copy
      try {
        await api('/manage', { headers: ownerHeaders(key) });
        writePending(null);
        writeNotice('This key already holds your earlier message — the link below opens that version. Close it to make a different one.');
        location.replace(managementUrl(key));
        return;
      } catch {
        say('You already created a link with different wording, and we could not open its controls. Please try again.');
        unfreeze();
        return;
      }
    }
    if (e instanceof RoomLinkError && e.status === 410) {
      writePending(null);
      say('That earlier link was closed. Press Create recipient link again to make a new one.');
      unfreeze();
      return;
    }
    if (e instanceof RoomLinkError && e.status === 429) {
      say('Too many links have been created here. Please try again in an hour.');
      unfreeze();
      return;
    }
    // ambiguous outcome — the key stays pending so an identical retry reuses it
    say('We couldn’t save your link right now. Your wording is still here — try again.');
    unfreeze();
  }
}

/* ---------- delivery sheet ---------- */
const UNAVAILABLE = 'This gift link is unavailable or has been closed. Ask the giver for another link.';
const TRANSIENT = 'We couldn’t open your gift right now. Please try again.';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sheet(): HTMLElement {
  const panel = el('section', 'note paper-note delivery-panel');
  panel.id = 'deliveryPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'deliveryHeading');
  panel.tabIndex = -1;
  document.body.appendChild(panel);
  return panel;
}

const heading = (text: string) => {
  const h = el('h2', 'note-kicker', text);
  h.id = 'deliveryHeading';
  return h;
};

const focusPanel = (panel: HTMLElement) => panel.focus();

function copyField(labelText: string, value: string): { wrap: HTMLElement; input: HTMLInputElement; status: HTMLElement } {
  const wrap = el('label', 'delivery-copy');
  const span = el('span', 'delivery-copy-label', labelText);
  const input = el('input', 'delivery-url');
  input.readOnly = true;
  input.value = value;
  input.spellcheck = false;
  const status = el('p', 'delivery-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  wrap.append(span, input, status);
  return { wrap, input, status };
}

function wireCopy(button: HTMLButtonElement, input: HTMLInputElement, status: HTMLElement) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input.value);
      status.textContent = 'Link copied';
    } catch {
      input.focus();
      input.select();
      status.textContent = 'Select and copy the link above.';
    }
  });
}

/* ---------- recipient ---------- */
async function initRecipient(panel: HTMLElement, app: HTMLElement,
  applyEdition: (edition: GiftEdition) => void): Promise<void> {
  const status = el('p', 'delivery-status', 'One moment.');
  status.setAttribute('role', 'status');
  panel.replaceChildren(heading('Opening your gift…'), status);
  focusPanel(panel);

  const fail = (message: string, retry: boolean) => {
    const row = el('div', 'row');
    if (retry) {
      const again = el('button', 'btn small', 'Retry');
      again.addEventListener('click', () => void initRecipient(panel, app, applyEdition));
      row.append(again);
    }
    const make = el('a', 'link', 'Make a gift');
    make.href = '?make=1';
    row.append(make);
    panel.replaceChildren(
      heading('Your gift'),
      el('p', 'delivery-status', message),
      row,
    );
    focusPanel(panel);
  };

  try {
    const body = await api<{ edition?: unknown }>(`/${recipientToken}`);
    const edition = validateEdition(body?.edition);
    if (!edition) throw new RoomLinkError(502, 'bad_response');
    applyEdition(edition);
    panel.remove();
    app.inert = false;
    (document.querySelector('#enter') as HTMLElement | null)?.focus();
  } catch (e) {
    if (e instanceof RoomLinkError && (e.status === 404 || e.status === 410)) fail(UNAVAILABLE, false);
    else fail(TRANSIENT, true);
  }
}

/* ---------- manage ---------- */
interface ManageView {
  recipientToken: string;
  createdAt: string;
  revoked: boolean;
  edition: GiftEdition | null;
}

const parseManage = (body: unknown): ManageView => {
  const v = body as Partial<ManageView>;
  if (!v || typeof v !== 'object'
    || typeof v.recipientToken !== 'string' || !TOKEN_SHAPE.test(v.recipientToken)
    || typeof v.createdAt !== 'string' || typeof v.revoked !== 'boolean'
    || (v.revoked && v.edition !== null)
    || (!v.revoked && !validateEdition(v.edition))) {
    throw new RoomLinkError(502, 'bad_response');
  }
  return v as ManageView;
};

function renderClosed(panel: HTMLElement) {
  const row = el('div', 'row');
  const make = el('a', 'btn small', 'Make another gift');
  make.href = '?make=1';
  row.append(make);
  panel.replaceChildren(
    heading('This gift link is closed'),
    el('p', 'hint', 'The recipient link no longer opens your gift.'),
    row,
  );
  focusPanel(panel);
}

async function initManage(panel: HTMLElement, key: string): Promise<void> {
  const loading = el('p', 'delivery-status', 'Opening your private controls…');
  loading.setAttribute('role', 'status');
  panel.replaceChildren(heading('Your gift link'), loading);
  focusPanel(panel);

  let view: ManageView;
  try {
    view = parseManage(await api('/manage', { headers: ownerHeaders(key) }));
  } catch (e) {
    const gone = e instanceof RoomLinkError && (e.status === 404 || e.status === 410);
    const row = el('div', 'row');
    if (!gone) {
      const again = el('button', 'btn small', 'Retry');
      again.addEventListener('click', () => void initManage(panel, key));
      row.append(again);
    }
    const make = el('a', 'link', 'Make a gift');
    make.href = '?make=1';
    row.append(make);
    panel.replaceChildren(
      heading('Your gift link'),
      el('p', 'delivery-status', gone ? UNAVAILABLE : TRANSIENT),
      row,
    );
    focusPanel(panel);
    return;
  }

  const notice = readNotice();

  if (view.revoked) {
    renderClosed(panel);
    return;
  }

  const ed = view.edition;
  const bits: (HTMLElement | Text)[] = [heading('Your gift link is ready')];
  if (notice) bits.push(el('p', 'delivery-status', notice));
  bits.push(el('p', 'delivery-status', ed ? `For ${ed.to}, from ${ed.from}` : ''));

  const pub = copyField('Recipient link', recipientUrl(view.recipientToken));
  const copyBtn = el('button', 'btn small', 'Copy recipient link');
  wireCopy(copyBtn, pub.input, pub.status);
  const openBtn = el('a', 'link', 'Open recipient link');
  openBtn.href = pub.input.value;
  openBtn.target = '_blank';
  openBtn.rel = 'noopener noreferrer';
  const row1 = el('div', 'row');
  row1.append(copyBtn, openBtn);
  const hint = el('p', 'hint', 'Anyone with this link can open the gift. Send it in your own message.');

  const priv = copyField('Private management link', managementUrl(key));
  const privBtn = el('button', 'btn small', 'Copy private management link');
  wireCopy(privBtn, priv.input, priv.status);
  const closeBtn = el('button', 'link', 'Close recipient link');
  const details = el('details', 'delivery-private');
  const dsum = el('summary', '', 'Private controls');
  const dp = el('p', 'hint', 'Keep this link for yourself. It lets you close the recipient link.');
  details.append(dsum, priv.wrap, privBtn, dp, closeBtn);

  const err = el('p', 'delivery-status');
  err.setAttribute('role', 'status');
  err.setAttribute('aria-live', 'polite');

  closeBtn.addEventListener('click', () => {
    if (closeBtn.disabled) return; // one confirmation at a time
    closeBtn.disabled = true;
    const row = el('div', 'row');
    const keep = el('button', 'btn small ghost', 'Keep link open');
    const sure = el('button', 'btn small', 'Close link');
    const ask = el('p', 'hint', 'Close it? The recipient link will stop opening your gift.');
    const cleanup = () => {
      ask.remove(); row.remove();
      closeBtn.disabled = false;
      closeBtn.focus();
    };
    keep.addEventListener('click', () => { err.textContent = ''; cleanup(); });
    sure.addEventListener('click', async () => {
      sure.disabled = true;
      keep.disabled = true;
      try {
        await api('/manage', { method: 'DELETE', headers: ownerHeaders(key) });
        renderClosed(panel); // the server confirmed — no second fetch needed
      } catch {
        // ambiguous: the DELETE may still have landed — never claim either way
        sure.disabled = true;
        keep.disabled = true;
        err.textContent = 'We couldn’t confirm whether the link closed. Retry to check its status.';
        const check = el('button', 'btn small', 'Check status');
        check.addEventListener('click', () => void initManage(panel, key));
        row.append(check);
        check.focus();
      }
    });
    row.append(keep, sure);
    details.append(ask, row);
    sure.focus();
  });

  panel.replaceChildren(...bits, pub.wrap, row1, hint, details, err);
  focusPanel(panel);
}

/* ---------- entry ---------- */
export async function initializeGiftLink(
  app: HTMLElement,
  applyEdition: (edition: GiftEdition) => void,
): Promise<void> {
  if (linkMode === 'demo') return;
  app.inert = true; // nothing behind the sheet is reachable until a real edition lands
  const panel = sheet();
  if (linkMode === 'recipient') {
    await initRecipient(panel, app, applyEdition);
    return;
  }
  if (linkMode === 'manage') {
    await initManage(panel, manageKey!);
    return;
  }
  // invalid fragment — show only the closed card, never the canonical gift
  const row = el('div', 'row');
  const make = el('a', 'link', 'Make a gift');
  make.href = '?make=1';
  row.append(make);
  panel.replaceChildren(
    heading('Your gift'),
    el('p', 'delivery-status', UNAVAILABLE),
    row,
  );
  focusPanel(panel);
}
