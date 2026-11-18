import type { WorldHandle } from './world';

/**
 * Recipient build. One photograph unfolds into a generated room when
 * world.json ({rad, collider}) is present; everything meaningful —
 * the clue, the note, the invitation — also works from the photo alone.
 */

const DOG_CLUE =
  'I’m on guard down here. Look for the place with legs like mine, where nobody walks and everyone gathers.';
const ASIDES: Record<string, string> = {
  plant: 'Very good leaves. I have only sniffed them. Mostly.',
  coats: 'Everyone leaves something here. I keep them company.',
  dog: DOG_CLUE,
};
const TABLE_INSPECT =
  'Legs like mine — four, steady, never going anywhere. There’s a folded note waiting on top.';
const INVITATION = 'Dinner for two. You choose the evening. I’ll take care of the rest.';
const SLOW_MS = 12_000;

const PINS: { id: string; label: string; x: number; y: number }[] = [
  { id: 'dog', label: 'the dog', x: 0.74, y: 0.74 },
  { id: 'table', label: 'the table', x: 0.51, y: 0.35 },
  { id: 'plant', label: 'the plant', x: 0.9, y: 0.43 },
  { id: 'coats', label: 'the coats', x: 0.22, y: 0.31 },
];

interface WorldConfig {
  rad: string;
  collider: string;
}

const app = document.getElementById('app')!;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let world: WorldHandle | null = null;
let loading = false;
let tableSeen = false;
let opened = false;
let slowTimer = 0;
let lastFocus: HTMLElement | null = null;
let statusEl: HTMLElement;

const setStatus = (s: string) => {
  statusEl.textContent = s;
};

/* ---------------- DOM skeleton ---------------- */
app.innerHTML = `
  <section class="stage" aria-label="The room">
    <div class="world" id="world" hidden></div>
    <figure class="cover" id="cover">
      <img src="./room.jpg" alt="A warm sitting room with a dog lying by a table" />
    </figure>
    <div class="cover-line" id="coverLine">
      <h1>Someone saved you a seat.</h1>
      <button class="btn" id="enter">Step inside</button>
      <button class="link" id="coverPhoto" type="button">Look at the photograph</button>
    </div>
    <p class="status" id="status" role="status" aria-live="polite"></p>
  </section>

  <p class="clue" id="clue" hidden role="status"></p>

  <nav class="hud" id="hud" hidden>
    <p class="hint" id="hint">Drag to look around · arrows to walk</p>
    <div class="row">
      <button class="btn small" id="ask">Ask the dog</button>
      <button class="btn small" id="photo">Look at the photograph</button>
      <button class="btn small ghost" id="reset">Reset view</button>
      <button class="btn small ghost" id="skip">Open the note</button>
    </div>
    <div class="steps" role="group" aria-label="Walk controls">
      <button id="back" aria-label="Walk backward">‹</button>
      <button id="fwd" aria-label="Walk forward">›</button>
    </div>
  </nav>

  <section class="photo-sheet" id="sheet" hidden aria-label="The photograph">
    <figure class="photo-frame">
      <img src="./room.jpg" alt="The original photograph of the room" />
      ${PINS.map(
        (p) => `
        <button class="pin" data-id="${p.id}" style="left:${p.x * 100}%;top:${p.y * 100}%"
          aria-label="Look at ${p.label}"></button>`,
      ).join('')}
    </figure>
    <div class="sheet-card">
      <p class="aside" id="aside">The photograph is where the clues live. Tap what catches your eye.</p>
      <button class="btn" id="openNote" hidden>Open the note</button>
      <button class="link" id="anyway" type="button">Open it anyway</button>
      <button class="link" id="closeSheet" type="button">Back</button>
    </div>
  </section>

  <section class="note" id="note" hidden aria-label="Your gift" tabindex="-1">
    <p class="note-kicker">A note, folded small</p>
    <blockquote><p>“${INVITATION}”</p></blockquote>
    <div class="row">
      <button class="btn" id="keep">Keep exploring</button>
      <button class="link" id="replay">Start again</button>
    </div>
  </section>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector(sel) as T;
statusEl = $('#status');

const cover = $('#cover');
const coverLine = $('#coverLine');
const hud = $('#hud');
const clue = $('#clue');
const sheet = $('#sheet');
const note = $('#note');
const aside = $('#aside');
const openNoteBtn = $('#openNote');
const enterBtn = $('#enter') as HTMLButtonElement;

/* ---------------- photo sheet ---------------- */
const openPhoto = () => {
  lastFocus = document.activeElement as HTMLElement;
  sheet.hidden = false;
  aside.textContent = 'The photograph is where the clues live. Tap what catches your eye.';
  openNoteBtn.hidden = true;
};
const closePhoto = () => {
  sheet.hidden = true;
  lastFocus?.focus();
};

sheet.addEventListener('click', (e) => {
  const pin = (e.target as HTMLElement).closest('.pin') as HTMLElement | null;
  if (!pin) return;
  const id = pin.dataset.id!;
  if (id === 'table') {
    tableSeen = true;
    aside.textContent = TABLE_INSPECT;
    openNoteBtn.hidden = opened;
  } else {
    aside.textContent = ASIDES[id] ?? DOG_CLUE;
    openNoteBtn.hidden = true; // the Open CTA only appears on the table itself
  }
});
$('#closeSheet').addEventListener('click', closePhoto);
openNoteBtn.addEventListener('click', () => openGift('note'));
$('#anyway').addEventListener('click', () => openGift('skip'));
$('#coverPhoto').addEventListener('click', openPhoto);
$('#photo').addEventListener('click', openPhoto);

/* ---------------- gift ---------------- */
const openGift = (how: 'note' | 'skip') => {
  lastFocus = document.activeElement as HTMLElement;
  opened = true;
  note.hidden = false;
  sheet.hidden = true;
  openNoteBtn.hidden = true;
  clue.hidden = true;
  setStatus(how === 'note' ? 'You unfold the note.' : 'The note opens for you anyway.');
  note.focus();
};
$('#skip').addEventListener('click', () => openGift('skip'));
$('#keep').addEventListener('click', () => {
  note.hidden = true;
  setStatus('The room is still yours.');
  $('#ask').focus();
});
$('#replay').addEventListener('click', () => {
  // a real reset — closed overlays, fresh traversal state, camera home
  note.hidden = true;
  sheet.hidden = true;
  clue.hidden = true;
  tableSeen = false;
  opened = false;
  openNoteBtn.hidden = true;
  world?.reset();
  setStatus('');
  (hud.hidden ? enterBtn : $('#ask')).focus();
});

/* ---------------- world ---------------- */
$('#ask').addEventListener('click', () => {
  clue.textContent = DOG_CLUE;
  clue.hidden = false;
});
$('#reset').addEventListener('click', () => world?.reset());
$('#fwd').addEventListener('click', () => world?.step(0.5));
$('#back').addEventListener('click', () => world?.step(-0.5));

const showHud = () => {
  hud.hidden = false;
  cover.classList.add('is-hidden');
  coverLine.hidden = true;
};

/** photo-only play when there is no world to step into */
const photoOnly = (why: string) => {
  setStatus(why + ' The photograph still holds everything.');
  openPhoto();
};

const enter = async () => {
  if (loading || world) return; // one context, one load
  loading = true;
  enterBtn.textContent = 'Opening…';
  enterBtn.disabled = true;
  setStatus('Opening the room…');
  clearTimeout(slowTimer);
  slowTimer = window.setTimeout(() => {
    setStatus('Still opening — you can look at the photograph meanwhile.');
  }, SLOW_MS);

  const bail = (why: string) => {
    clearTimeout(slowTimer);
    photoOnly(why);
    enterBtn.disabled = false;
    enterBtn.textContent = 'Step inside';
    loading = false;
  };

  let config: WorldConfig;
  try {
    const res = await fetch('./world.json');
    if (!res.ok) throw new Error(String(res.status));
    config = await res.json();
    if (!config.rad || !config.collider) throw new Error('schema');
  } catch {
    bail('The 3D room is not here yet.');
    return;
  }

  const host = $('#world');
  host.hidden = false;
  try {
    const { enterWorld } = await import('./world');
    world = await enterWorld(host, config);
  } catch {
    host.hidden = true;
    bail('The 3D room could not open on this device.');
    return;
  }

  clearTimeout(slowTimer);
  loading = false;
  showHud();
  setStatus('You’re inside. The dog is waiting.');
  if (reduced()) $('#hint').textContent = 'Use the buttons or arrow keys to walk.';
};

enterBtn.addEventListener('click', enter);
