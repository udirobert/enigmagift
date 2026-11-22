/* The shared photo-hunt player — the same module runs the giver's local
   try-out and the saved recipient's real hunt. The player owns only its
   run state (found / hint level / misses / note open); it never mutates
   the edition and never revokes the caller's photo URL. */

import type { PhotoEdition } from './photo-edition';
import { createPaperMotion } from './paper-motion';

const REGION_NAMES = [
  'top left', 'top centre', 'top right',
  'middle left', 'centre', 'middle right',
  'bottom left', 'bottom centre', 'bottom right',
];
const regionOf = (x: number, y: number) =>
  Math.min(2, Math.floor(x * 3)) + 3 * Math.min(2, Math.floor(y * 3));
const DEFAULT_CLUE = 'I left a little note here. Have a look around.';

export function mountPhotoPlayer(
  host: HTMLElement,
  options: { edition: PhotoEdition; photoUrl: string; preview: boolean; onBack?: () => void },
): () => void {
  const { edition, photoUrl, preview, onBack } = options;
  const ctl = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void,
  ) => el.addEventListener(type, fn as EventListener, { signal: ctl.signal });

  const root = document.createElement('div');
  root.className = 'ph-player';
  const motion = createPaperMotion(root);

  if (preview) {
    const banner = document.createElement('p');
    banner.className = 'ph-preview-banner';
    banner.textContent = 'A peek at your gift';
    root.appendChild(banner);
  }

  const heading = document.createElement('h2');
  heading.className = 'ph-player-title';
  heading.textContent = edition.to ? `For ${edition.to}` : 'A little hunt for you';
  root.appendChild(heading);

  const clueLine = document.createElement('p');
  clueLine.className = 'ph-clue';
  clueLine.textContent = edition.clue || DEFAULT_CLUE;
  root.appendChild(clueLine);

  const wrap = document.createElement('div');
  wrap.className = 'ph-photo-wrap';
  const img = document.createElement('img');
  img.className = 'ph-photo';
  img.alt = 'The place your note is hidden';
  img.draggable = false;
  img.src = photoUrl;
  const marker = document.createElement('span');
  marker.className = 'ph-marker';
  marker.hidden = true;
  marker.setAttribute('aria-hidden', 'true');
  const hintRegion = document.createElement('div');
  hintRegion.className = 'ph-hint-region';
  hintRegion.hidden = true;
  hintRegion.setAttribute('aria-hidden', 'true');
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn small';
  retryBtn.textContent = 'Try again';
  retryBtn.hidden = true;
  wrap.append(img, marker, hintRegion, retryBtn);
  root.appendChild(wrap);

  const status = document.createElement('p');
  status.className = 'ph-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.appendChild(status);

  const controls = document.createElement('div');
  controls.className = 'ph-controls';
  const hintBtn = document.createElement('button');
  hintBtn.type = 'button';
  hintBtn.className = 'btn small';
  hintBtn.textContent = 'A little hint';
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn small';
  openBtn.textContent = 'Open the note';
  const directBtn = document.createElement('button');
  directBtn.type = 'button';
  directBtn.className = 'link';
  directBtn.textContent = 'Open without searching';
  controls.append(hintBtn, openBtn, directBtn);
  root.appendChild(controls);

  const areaSearch = document.createElement('details');
  areaSearch.className = 'ph-areas';
  const sum = document.createElement('summary');
  sum.textContent = 'Search by area';
  const grid = document.createElement('div');
  grid.className = 'ph-area-grid';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Nine parts of the photo');
  const regionBtns = REGION_NAMES.map((name, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link ph-area';
    b.textContent = `Search the ${name}`;
    b.dataset.region = String(i);
    grid.appendChild(b);
    return b;
  });
  areaSearch.append(sum, grid);
  root.appendChild(areaSearch);

  const note = document.createElement('section');
  note.className = 'ph-note';
  note.hidden = true;
  /* the paper carries the words; status and controls live beside it so the
     fold animation never moves anything the reader might press */
  const notePaper = document.createElement('div');
  notePaper.className = 'ph-note-paper';
  const corner = document.createElement('span');
  corner.className = 'ph-note-corner';
  corner.setAttribute('aria-hidden', 'true');
  const noteTo = document.createElement('p');
  noteTo.className = 'ph-note-to';
  const body = document.createElement('p');
  body.className = 'ph-note-body';
  const sign = document.createElement('p');
  sign.className = 'ph-note-from';
  notePaper.append(corner, noteTo, body, sign);
  const noteStatus = document.createElement('p');
  noteStatus.className = 'ph-note-status';
  noteStatus.setAttribute('role', 'status');
  noteStatus.setAttribute('aria-live', 'polite');
  const noteControls = document.createElement('div');
  noteControls.className = 'ph-note-controls';
  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'link';
  backBtn.textContent = 'Back to photo';
  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.className = 'link';
  replayBtn.textContent = 'Replay hunt';
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn small';
  copyBtn.textContent = 'Copy note';
  noteControls.append(backBtn, replayBtn, copyBtn);
  note.append(notePaper, noteStatus, noteControls);
  root.appendChild(note);

  if (onBack) {
    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'link ph-leave';
    leave.textContent = 'Back to editing';
    on(leave, 'click', onBack);
    root.appendChild(leave);
  }

  host.appendChild(root);

  /* ---- run state ---- */
  let found = false;
  let noteOpen = false;
  let hintLevel = 0; // 0 none · 1 region outlined · 2 marker revealed
  let imageFailed = false;
  let hasDiscovered = false;
  let hasOpened = false;
  const spot = edition.hidingSpot;

  const placeMarker = () => {
    marker.style.left = `${spot.x * 100}%`;
    marker.style.top = `${spot.y * 100}%`;
  };
  const placeHintRegion = () => {
    const r = regionOf(spot.x, spot.y);
    hintRegion.style.left = `${(r % 3) * 100 / 3}%`;
    hintRegion.style.top = `${Math.floor(r / 3) * 100 / 3}%`;
  };

  const sync = () => {
    placeMarker();
    note.hidden = !noteOpen;
    wrap.hidden = noteOpen;
    img.hidden = noteOpen || imageFailed;
    heading.hidden = noteOpen;
    clueLine.hidden = found || noteOpen;
    status.hidden = noteOpen;
    controls.hidden = noteOpen;
    areaSearch.hidden = found || noteOpen || imageFailed;
    hintBtn.hidden = found || imageFailed;
    hintBtn.textContent = hintLevel === 0 ? 'A little hint' : 'Show the note';
    openBtn.hidden = !found;
    directBtn.hidden = found;
    marker.hidden = !(found || hintLevel >= 2);
    hintRegion.hidden = !(hintLevel === 1 && !found);
    retryBtn.hidden = !imageFailed;
  };

  const discover = (how: 'tap' | 'region' | 'hint' | 'direct') => {
    if (found) return;
    motion.settle();
    found = true;
    const firstFind = !hasDiscovered;
    hasDiscovered = true;
    status.textContent = (how === 'tap' || how === 'region')
      ? 'You found it — a little folded note.'
      : 'The note is right here.';
    sync();
    /* focus before play — the scope settles on focusin, so moving focus
       afterwards would cancel the marker move it just started */
    if (how === 'tap' || how === 'region' || how === 'hint') openBtn.focus();
    motion.play(marker, [
      { transform: 'translate(-50%, calc(-50% - 4px)) rotate(-4deg) scale(.92)' },
      { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)' },
    ], { duration: firstFind ? 220 : 140 });
  };

  const openNote = () => {
    motion.settle();
    noteTo.textContent = edition.to ? `For ${edition.to}` : '';
    noteTo.hidden = !edition.to;
    body.textContent = edition.message || '— a note is still being written —';
    sign.textContent = edition.from ? `— ${edition.from}` : '';
    sign.hidden = !edition.from;
    noteStatus.textContent = '';
    noteOpen = true;
    sync();
    note.focus();
    note.scrollIntoView({ block: 'start', behavior: 'auto' });
    const firstOpen = !hasOpened;
    hasOpened = true;
    if (firstOpen) {
      motion.play(notePaper, [
        { opacity: 0.9, transform: 'perspective(900px) rotateX(-3deg) translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 320 });
      motion.play(corner, [
        { transform: 'rotate(-14deg) scale(.92)' },
        { transform: 'none' },
      ], { duration: 280, delay: 40 });
    } else {
      motion.play(notePaper, [
        { transform: 'translateY(2px)' },
        { transform: 'none' },
      ], { duration: 140 });
    }
  };

  const closeNote = (focusBack = true) => {
    motion.settle();
    noteOpen = false;
    sync();
    if (focusBack) openBtn.focus();
  };

  /* image failure is honest: the photo is gone, but the note is in the
     edition and can still be opened directly */
  on(img, 'error', () => {
    motion.settle();
    imageFailed = true;
    found = false;
    hintLevel = 0;
    status.hidden = false;
    status.textContent = 'The photo could not load. Try again, or open your note.';
    sync();
  });
  on(img, 'load', () => {
    if (!img.naturalWidth) return;
    if (imageFailed) status.textContent = '';
    imageFailed = false;
    sync();
  });
  on(retryBtn, 'click', () => {
    img.src = '';
    img.src = photoUrl; // force a fresh fetch attempt
  });

  /* tap: forgiving radius, misses only acknowledge. Tapping the revealed
     spot again re-opens the note. */
  let downAt: { x: number; y: number } | null = null;
  on(wrap, 'pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    downAt = { x: e.clientX, y: e.clientY };
  });
  on(wrap, 'pointercancel', () => { downAt = null; });
  on(wrap, 'pointerup', (e) => {
    if (!downAt || !e.isPrimary) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 7 || imageFailed || noteOpen) return;
    if (!img.naturalWidth) return;
    const box = img.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    if (px < 0 || py < 0 || px > box.width || py > box.height) return;
    const radius = Math.max(22, Math.min(box.width, box.height) * 0.1);
    const dx = px - spot.x * box.width;
    const dy = py - spot.y * box.height;
    if (Math.hypot(dx, dy) > radius) {
      if (!found) {
        status.textContent = 'Not quite there — keep looking.';
        motion.play(status, [
          { opacity: 0.8, transform: 'translateY(2px)' },
          { opacity: 1, transform: 'none' },
        ], { duration: 120 });
      }
      return;
    }
    if (found) { openNote(); return; }
    discover('tap');
  });

  on(hintBtn, 'click', () => {
    motion.settle();
    if (hintLevel === 0) {
      hintLevel = 1;
      placeHintRegion();
      status.textContent = `Somewhere in the ${REGION_NAMES[regionOf(spot.x, spot.y)]} of the photo.`;
      sync();
      motion.play(hintRegion, [
        { opacity: 0.65, transform: 'scale(.98)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 160 });
      return;
    }
    hintLevel = 2;
    discover('hint');
  });

  regionBtns.forEach((b, i) => on(b, 'click', () => {
    if (found || imageFailed) return;
    if (i === regionOf(spot.x, spot.y)) discover('region');
    else {
      status.textContent = `Nothing in the ${REGION_NAMES[i]} — look again.`;
      motion.play(status, [
        { opacity: 0.8, transform: 'translateY(2px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 120 });
    }
  }));

  on(directBtn, 'click', () => {
    discover('direct');
    openNote();
  });
  on(openBtn, 'click', openNote);
  on(backBtn, 'click', () => closeNote());
  on(replayBtn, 'click', () => {
    motion.settle();
    found = false;
    noteOpen = false;
    hintLevel = 0;
    status.textContent = 'Fresh eyes — the note is hidden again.';
    sync();
    img.focus();
  });
  on(copyBtn, 'click', async () => {
    const text = `${noteTo.hidden ? '' : `${edition.to}\n\n`}${edition.message}${edition.from ? `\n\n— ${edition.from}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      noteStatus.textContent = 'Note copied.';
    } catch {
      noteStatus.textContent = 'Copy did not work here — the words stay on screen.';
    }
  });

  note.tabIndex = -1;
  img.tabIndex = 0;
  sync();

  return () => {
    motion.destroy();
    ctl.abort();
    root.remove();
  };
}
