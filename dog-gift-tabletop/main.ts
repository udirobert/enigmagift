import type { Target, WorldHandle } from './world';
import { createRun } from './run';
import { ROOM, CANONICAL, makeDraft, type GiftEdition } from './edition';

/**
 * Silent canonical v2. Unmarked photograph under a folded paper corner;
 * the paper lifts into the real room only when splats are visibly there.
 * Every meaningful beat still works without WebGL, from text alone.
 */

let edition: GiftEdition = { ...CANONICAL };
let isDraft = false;

const BASE_LINES: Record<Target, string> = {
  dog: '',
  plant: 'Good leaves. I only sniff them.',
  coats: 'Those usually mean a walk. Usually.',
  chair: '',
  tv: 'All those moving pictures. Not one of them smells like anything.',
  shelves: 'So many shelves. All the good things are out of nose reach.',
  door: 'I could wait here for a walk. But tonight we’re staying in.',
  table: '',
  postcard: '',
  ribbon: '',
};
const lineFor = (t: Target): string => {
  if (t === 'dog') return edition.dog;
  if (t === 'chair') return edition.chair;
  if (t === 'postcard') return edition.postcard;
  if (t === 'ribbon') return edition.memory;
  return BASE_LINES[t];
};
const TABLE_SLIP = 'A folded slip of paper waits on top.';
const SUCCESS = 'You found it. I kept it safe for you.';
const TITLE = 'Someone saved you a seat.';
const HINT_MS = 4_000;
const STATUS_MS = 3_000;

/* ---------- one local attempt — recap lives in this tab only ---------- */
let run = createRun();
let guided = false; // the walkthrough was used for this attempt
/* authored keepsakes noticed by this recipient — survives past the reveal */
let keepsakes = new Set<Target>();
const AUTHORED_ORDER: Target[] = ['ribbon', 'postcard', 'dog']; // suggestion priority

/* ---------- recipient-preview child mode & giver shortcut ---------- */
const qs = new URLSearchParams(location.search);
const isPreview = qs.has('recipientPreview'); // runs inside the giver's iframe
const makeNow = qs.has('make'); // local author shortcut: open a clean editor

/* ---------- the still atlas (motion-free route) ---------- */
interface Still {
  t: Target;
  place: 'table' | 'other';
  alt: string;
  /** one spatial sentence, no solution words */
  line: string;
  /** the artefact 'Take me there' faces */
  face: Target;
}
/* crops captured from the rendered world, revision 44124720 */
const STILLS: Still[] = [
  { t: 'dog', place: 'table', alt: 'A golden dog asleep on the wooden floor beside the table', line: 'Low on the floor, right beside the table legs.', face: 'dog' },
  { t: 'table', place: 'table', alt: 'A dark wooden dining table with crossed legs and a pale envelope on its edge', line: 'The dark table at the centre — something pale rests on its near edge.', face: 'table' },
  { t: 'chair', place: 'table', alt: 'Black dining chairs around the table', line: 'The seats gathered around the table.', face: 'chair' },
  { t: 'tv', place: 'table', alt: 'A wall screen glowing above the table area', line: 'The bright screen above the far side of the table.', face: 'tv' },
  { t: 'plant', place: 'table', alt: 'A tall plant in a large pot near the shelf', line: 'A tall green plant guarding the shelf line.', face: 'plant' },
  { t: 'postcard', place: 'other', alt: 'A small cream card with a paw print standing on an easel by the sofa', line: 'A small card on a stand, behind where you began.', face: 'postcard' },
  { t: 'ribbon', place: 'other', alt: 'A rust-red ribbon bookmark hanging from the bookshelf', line: 'A rust-red keepsake hanging quietly among the books.', face: 'ribbon' },
  { t: 'coats', place: 'other', alt: 'Coats hanging on a rack by the entrance', line: 'The coats by the entrance, still smelling of outside.', face: 'coats' },
  { t: 'shelves', place: 'other', alt: 'Tall black bookshelves full of books', line: 'The tall shelves of books along the rear wall.', face: 'shelves' },
  { t: 'door', place: 'other', alt: 'A wooden door at the back of the room', line: 'The wooden door where the outside stops.', face: 'door' },
];

const app = document.getElementById('app')!;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let world: WorldHandle | null = null;
let loading = false;
let abortCtl: AbortController | null = null;
let opened = false;
let autoNudged = false;
let dogMet = false;
let captionTarget: Target | null = null;
let captionRaf = 0;
let misses = 0;
let statusTimer = 0;
let statusEl: HTMLElement;

const setStatus = (s: string) => {
  statusEl.textContent = s;
  clearTimeout(statusTimer);
  if (s) {
    const mine = s;
    statusTimer = window.setTimeout(() => {
      if (statusEl.textContent === mine) statusEl.textContent = '';
    }, STATUS_MS);
  }
};

app.innerHTML = `
  <section class="stage" aria-label="The room">
    <div class="world" id="world" hidden></div>
    <div class="cover" id="cover">
      <figure class="cover-frame" id="coverFrame">
        <img src="./room.jpg" alt="A warm room with a dog lying near a table" />
        <span class="paper-card" aria-hidden="true">For you</span>
      </figure>
    </div>
    <div class="cover-line" id="coverLine">
      <p class="lead">I hid a gift in this room.</p>
      <button class="btn" id="enter">Step inside</button>
      <button class="link" id="no3d" type="button">Continue without 3D</button>
    </div>
    <p class="status" id="status" role="status" aria-live="polite"></p>
  </section>

  <div class="collar-tag" id="collarTag" hidden aria-hidden="true"></div>
  <p class="line" id="line" hidden role="status"></p>
  <p class="hint-bubble" id="hint" hidden>Drag to look. Tap to explore.</p>
  <button class="chip" id="dogChip" hidden>Look from here</button>
  <button class="chip" id="unfoldChip" hidden>Unfold the note</button>
  <div class="blink" id="blink" aria-hidden="true"></div>

  <section class="note paper-note" id="paperNote" hidden aria-label="The unfolded note" tabindex="-1">
    <p class="note-kicker">Someone saved you a seat.</p>
    <blockquote><p id="paperBody"></p><p class="note-sign" id="paperSign" hidden></p></blockquote>
    <p class="hint remix-line" id="paperRemixLine" hidden></p>
    <div class="row">
      <button class="btn small" id="paperKeep">Keep exploring</button>
      <button class="link" id="paperRecap">How the hunt went</button>
      <button class="link" id="paperRemix" hidden>Make a gift in this room</button>
      <button class="link" id="paperReplay">Start again</button>
    </div>
  </section>

  <nav class="hud" id="hud" hidden>
    <div class="row">
      <button class="btn small ghost" id="help">Help</button>
      <button class="btn small ghost" id="trailBtn" hidden>My trail</button>
    </div>
    <div class="steps" role="group" aria-label="Walk controls">
      <button id="back" aria-label="Walk backward">‹</button>
      <button id="fwd" aria-label="Walk forward">›</button>
    </div>
  </nav>

  <section class="help" id="helpPanel" hidden aria-label="Help" tabindex="-1">
    <p class="help-title">A little help</p>
    <p class="hint">Drag or swipe to look around. WASD or arrow keys walk. The photograph you arrived on is still yours to keep.</p>
    <p class="hint help-next" id="helpNext" hidden></p>
    <p class="hint" id="wtStep" hidden></p>
    <div class="row">
      <button class="btn small" id="reset">Reset view</button>
      <button class="btn small" id="ladder">A little more help</button>
      <button class="btn small" id="walkthrough" hidden>Walk me through it</button>
      <button class="btn small" id="motionless">Explore without motion</button>
      <button class="btn small ghost" id="directOpen">Just open my gift</button>
      <button class="link" id="closeHelp">Back</button>
    </div>
  </section>

  <section class="note" id="note" hidden aria-label="Your gift" tabindex="-1">
    <p class="note-kicker" id="noteTitle"></p>
    <blockquote><p id="noteBody"></p><p class="note-sign" id="noteSign" hidden></p></blockquote>
    <div class="row">
      <button class="btn" id="keep">Keep exploring</button>
      <button class="link" id="recapLink">How the hunt went</button>
      <button class="link" id="remixLink" hidden>Make a gift in this room</button>
      <button class="link" id="replay">Start again</button>
    </div>
  </section>

  <section class="textpath" id="textpath" hidden aria-label="Explore without 3D" tabindex="-1">
    <p class="help-title" id="tpTitle"></p>
    <p class="hint" id="tpClue" hidden></p>
    <p class="hint" id="tpInfo"></p>
    <div class="row" id="tpPlaces">
      <button class="btn small" id="tpDog">Ask the dog</button>
      <button class="btn small" id="tpLook" hidden>Look from down here</button>
      <button class="btn small" data-place="table">Around the table</button>
      <button class="btn small" data-place="other">On the other side</button>
      <button class="btn small" id="tpHelp">A little help</button>
      <button class="link" id="tpOpen">Open the note</button>
      <button class="link" id="tpReturn" hidden>Return to the room</button>
      <button class="link" id="tpTrail" hidden>My trail</button>
    </div>
    <div class="atlas" id="tpAtlas" hidden>
      <p class="hint" id="tpPlaceName"></p>
      <div class="row" id="tpArtList" role="group" aria-label="Things in this part of the room"></div>
      <figure class="still" id="tpStill" hidden>
        <img id="tpStillImg" alt="" />
        <figcaption id="tpStillCap"></figcaption>
      </figure>
      <div class="row">
        <button class="btn small" id="tpGo" hidden>Take me there</button>
        <button class="link" id="tpBackPlace">Back</button>
      </div>
    </div>
  </section>

  <section class="note paper-note recap" id="recapPanel" hidden aria-label="Your trail" tabindex="-1">
    <p class="note-kicker" id="recapTitle">How the hunt went</p>
    <p class="hint" id="recapSuggest"></p>
    <details class="recap-trail" id="recapDetails">
      <summary>See my trail</summary>
      <dl class="recap-list" id="recapList"></dl>
    </details>
    <p class="hint">This stays in this tab — nothing is sent anywhere.</p>
    <div class="row">
      <button class="btn small" id="recapBack">Keep exploring</button>
    </div>
  </section>

  <section class="note paper-note remix" id="remixPanel" hidden aria-label="Make a gift in this room" tabindex="-1">
    <p class="note-kicker">Make a gift in this room</p>
    <p class="hint">This sample room is available to reuse. Your edits stay in this tab.</p>
    <form id="remixForm">
      <label>To <input id="rmTo" maxlength="40" required placeholder="their name" /></label>
      <label>From <input id="rmFrom" maxlength="40" required placeholder="your name" /></label>
      <label>The dog’s hint <textarea id="rmDog" maxlength="160" required rows="2"></textarea></label>
      <label>The postcard’s clue <textarea id="rmPostcard" maxlength="160" required rows="2"></textarea></label>
      <label>The ribbon’s keepsake <textarea id="rmMemory" maxlength="160" required rows="2"></textarea></label>
      <label>The invitation <textarea id="rmInvite" maxlength="200" required rows="2"></textarea></label>
      <div class="row">
        <button class="btn small" type="submit" id="rmSubmit">Preview this gift</button>
        <button class="link" id="remixCancel" type="button">Back</button>
        <button class="link" id="remixOriginal" type="button">Back to original</button>
      </div>
    </form>
  </section>
`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector(sel) as T;
statusEl = $('#status');

const cover = $('#cover');
const coverFrame = $('#coverFrame');
const coverLine = $('#coverLine');
const hud = $('#hud');
const hint = $('#hint');
const collarTag = $('#collarTag');
const line = $('#line');
const helpPanel = $('#helpPanel');
const note = $('#note');
const noteTitle = $('#noteTitle');
const noteBody = $('#noteBody');
const textpath = $('#textpath');
const tpTitle = $('#tpTitle');
const tpInfo = $('#tpInfo');
const tpClue = $('#tpClue');
const enterBtn = $('#enter') as HTMLButtonElement;
const no3dBtn = $('#no3d');
const dogChip = $('#dogChip') as HTMLButtonElement;
const unfoldChip = $('#unfoldChip') as HTMLButtonElement;
const blink = $('#blink');
const paperNote = $('#paperNote');
const recapPanel = $('#recapPanel');
const recapList = $('#recapList');
const remixPanel = $('#remixPanel');
const helpNext = $('#helpNext');
const tpAtlas = $('#tpAtlas');
const tpArtList = $('#tpArtList');
const tpStill = $('#tpStill');
const tpStillImg = $('#tpStillImg') as HTMLImageElement;
const tpStillCap = $('#tpStillCap');
const tpPlaceName = $('#tpPlaceName');
const trailBtn = $('#trailBtn') as HTMLButtonElement;

const overlayOpen = () =>
  !note.hidden || !helpPanel.hidden || !textpath.hidden || !paperNote.hidden ||
  !recapPanel.hidden || !remixPanel.hidden;

let atDog = false;
let seeing = false; // 'Take me there' look from the atlas
let returnToText = false; // note was opened from the motion-free path
let paperState: 'edge' | 'folded' | 'open' = 'edge';
let tableInspected = false;
let tapHadSlip = false; // slip was offered before the current gesture began
let chipRaf = 0;

/* ---------- one-shot nudge: collar tag, swings once, gone ---------- */
const hideCollar = () => {
  collarTag.hidden = true;
};
const showCollar = () => {
  /* help stays open while it nudges — the tag is only suppressed once the
     gift is found or another tag is already out */
  if (!world || opened || !collarTag.hidden) return false;
  const p = world.project('dog');
  if (!p) return false;
  collarTag.style.left = `${p.x}px`;
  collarTag.style.top = `${p.y}px`;
  collarTag.hidden = false;
  collarTag.classList.remove('is-swing');
  void collarTag.offsetWidth;
  collarTag.classList.add('is-swing');
  window.setTimeout(hideCollar, 2400);
  return true;
};

/* ---------- tap feedback: cream ink ring where the finger lands ---------- */
const ripple = (x: number, y: number, hit: boolean) => {
  const r = document.createElement('span');
  r.className = 'ripple' + (hit ? ' is-hit' : '');
  r.setAttribute('aria-hidden', 'true');
  r.style.left = `${x}px`;
  r.style.top = `${y}px`;
  document.body.appendChild(r);
  window.setTimeout(() => r.remove(), 520);
};

let rearMentioned = false; // "a card behind you" spoken once, early
let rearTimer = 0;
let slipTimer = 0;
let sameItem = { t: null as Target | null, n: 0 };
let helpOffered = false;

const onTap = (t: Target | null, x: number, y: number) => {
  run.tap(t);
  tapHadSlip = tableInspected; // onInspect inside this tap must not count
  ripple(x, y, !!t);
  if (t) {
    misses = 0;
    sameItem = { t, n: sameItem.t === t ? sameItem.n + 1 : 1 };
    onInspect(t);
    /* repeated poking at the same thing before the find → help is there */
    if (!opened && !helpOffered && sameItem.n >= 3 && t !== 'table') {
      helpOffered = true;
      setStatus('Help has a next step whenever you want it.');
    }
    /* introduce the reverse side early, once, on a familiar item */
    if (!rearMentioned && !opened && t !== 'postcard' && t !== 'ribbon' && t !== 'table') {
      rearMentioned = true;
      rearTimer = window.setTimeout(() => {
        if (!opened) setStatus('There’s a card behind you, too.');
      }, 2600);
    }
    return;
  }
  hideCaption();
  hideCollar();
  misses++;
  sameItem = { t: null, n: 0 };
  if (misses >= 2 && !dogMet && !opened && !autoNudged) {
    autoNudged = true;
    if (!showCollar()) setStatus('A collar tag catches the light nearby.');
  } else if (misses >= 3 && !opened && !helpOffered) {
    helpOffered = true;
    setStatus('Help has a next step whenever you want it.');
  }
};

/* ---------- anchored chips: dog viewpoint + tabletop unfold ---------- */
const clampX = (x: number) => Math.max(70, Math.min(window.innerWidth - 70, x));
const clampNoteX = (x: number) => {
  const m = paperNote.offsetWidth / 2 + 12;
  return Math.max(m, Math.min(window.innerWidth - m, x));
};
const clampNoteY = (y: number) => {
  const m = paperNote.offsetHeight / 2 + 12;
  return Math.max(m, Math.min(window.innerHeight - m, y));
};
const anchorChips = () => {
  if (world && !atDog && !dogChip.hidden) {
    const p = world.project('dog');
    if (p) {
      dogChip.style.left = `${clampX(p.x)}px`;
      dogChip.style.top = `${p.y + 44}px`;
      dogChip.style.bottom = '';
    } else {
      dogChip.style.left = '50%';
      dogChip.style.top = 'auto';
      dogChip.style.bottom = '7.5rem';
    }
  }
  if (world && (!unfoldChip.hidden || !paperNote.hidden)) {
    const p = world.paperScreen();
    if (p) {
      unfoldChip.style.left = `${clampX(p.x)}px`;
      unfoldChip.style.top = `${p.y + 30}px`;
      unfoldChip.style.bottom = '';
      paperNote.style.left = `${clampNoteX(p.x)}px`;
      paperNote.style.top = `${clampNoteY(p.y - 40)}px`;
      paperNote.style.bottom = '';
    } else {
      unfoldChip.style.left = '50%';
      unfoldChip.style.top = 'auto';
      unfoldChip.style.bottom = '9rem';
      paperNote.style.left = '50%';
      paperNote.style.top = '22%';
      paperNote.style.bottom = '';
    }
  }
  chipRaf = requestAnimationFrame(anchorChips);
};

const updateDogChip = () => {
  if (!world || overlayOpen()) {
    dogChip.hidden = true;
    return;
  }
  if (atDog || seeing) {
    dogChip.textContent = 'Back to my spot';
    dogChip.style.left = '50%';
    dogChip.style.top = 'auto';
    dogChip.style.bottom = '6.5rem';
    dogChip.hidden = false;
  } else {
    dogChip.textContent = 'Look from here';
    dogChip.style.bottom = '';
    dogChip.hidden = !dogMet;
  }
};

const goDog = () => {
  if (!world || atDog) return;
  hideCaption();
  if (reduced()) {
    world.visitDog();
    return;
  }
  blink.classList.add('is-shut'); // eyelid cut — no flying through the room
  window.setTimeout(() => {
    world?.visitDog();
    window.setTimeout(() => blink.classList.remove('is-shut'), 160);
  }, 150);
};
const goHome = () => {
  if (!world || !atDog) return;
  if (reduced()) {
    world.leaveDog();
    return;
  }
  blink.classList.add('is-shut');
  window.setTimeout(() => {
    world?.leaveDog();
    window.setTimeout(() => blink.classList.remove('is-shut'), 160);
  }, 150);
};
dogChip.addEventListener('click', () => {
  if (atDog) goHome();
  else if (seeing) world?.unsee();
  else goDog();
});

/* ---------- the paper on the table ---------- */
const fillPaperNote = () => {
  ($('#paperBody') as HTMLElement).textContent = `“${edition.invitation}”`;
  const sign = $('#paperSign');
  const sig = [edition.to && `For ${edition.to}`, edition.from && `— ${edition.from}`]
    .filter(Boolean).join(' ');
  sign.hidden = !sig;
  sign.textContent = sig;
};
const doUnfold = () => {
  trailBtn.hidden = false;
  previewReveal();
  ($('#tpTrail') as HTMLElement).hidden = false;
  fillPaperNote();
  if (paperState === 'open') {
    paperNote.hidden = false;
    paperNote.focus();
    updateDogChip();
    return;
  }
  paperState = 'open';
  opened = true;
  unfoldChip.hidden = true;
  world?.showPaper('open');
  setStatus('You unfold the note.');
  window.setTimeout(() => {
    paperNote.hidden = false;
    paperNote.focus();
    updateDogChip();
  }, reduced() ? 80 : 650);
};
unfoldChip.addEventListener('click', doUnfold);
$('#paperKeep').addEventListener('click', () => {
  paperNote.hidden = true;
  setStatus('The room is still yours.');
  updateDogChip();
  if (!hud.hidden) $('#help').focus();
});

/* ---------- anchored caption (one tracker at a time) ---------- */
const hideCaption = () => {
  captionTarget = null;
  cancelAnimationFrame(captionRaf);
  line.hidden = true;
};
const showCaption = (t: Target, text: string) => {
  hideCaption();
  captionTarget = t;
  line.textContent = text;
  line.hidden = false;
  const track = () => {
    if (!captionTarget) return;
    const p = world?.project(captionTarget);
    if (p) {
      /* keep the caption inside phone edges */
      const cx = Math.max(96, Math.min(window.innerWidth - 96, p.x));
      line.style.left = `${cx}px`;
      line.style.top = `${p.y}px`;
      line.style.bottom = '';
      line.style.transform = 'translate(-50%, -140%)';
    } else {
      line.style.left = '50%';
      line.style.top = '';
      line.style.bottom = '10rem';
      line.style.transform = 'translateX(-50%)';
    }
    captionRaf = requestAnimationFrame(track);
  };
  track();
};

/* ---------- target taps ---------- */
const onInspect = (t: Target) => {
  hideCollar();
  if (t === 'dog' || t === 'postcard' || t === 'ribbon') keepsakes.add(t);
  if (t === 'table') {
    /* the slip stays in the room: no modal covers the scene on this route */
    if (paperState === 'open') return;
    hideCaption();
    if (!tableInspected) {
      run.finish(guided ? 'guided' : 'found'); // the envelope is discovered
      setStatus(SUCCESS);
      slipTimer = window.setTimeout(() => {
        if (statusEl.textContent === SUCCESS) setStatus(TABLE_SLIP);
      }, STATUS_MS - 200); // swap before the auto-clear would blank it
    } else {
      setStatus(TABLE_SLIP);
    }
    tableInspected = true;
    paperState = 'folded';
    world?.showPaper('folded');
    unfoldChip.hidden = false;
    return;
  }
  if (t === 'dog') {
    dogMet = true;
    updateDogChip();
  }
  showCaption(t, lineFor(t));
  setStatus(''); // the caption is the line — no duplicate status
};

/* ---------- the note ---------- */
const openGift = (route?: 'direct') => {
  opened = true;
  previewReveal();
  trailBtn.hidden = false;
  ($('#tpTrail') as HTMLElement).hidden = false;
  if (route === 'direct') run.finish('direct'); // a skip never claims a find
  else run.finish(guided ? 'guided' : 'found');
  returnToText = !textpath.hidden;
  hideCollar();
  hideCaption();
  helpPanel.hidden = true;
  noteTitle.textContent = TITLE;
  noteBody.textContent = `“${edition.invitation}”`;
  const sign = $('#noteSign');
  const sig = [edition.to && `For ${edition.to}`, edition.from && `— ${edition.from}`]
    .filter(Boolean).join(' ');
  sign.hidden = !sig;
  sign.textContent = sig;
  $('#keep').textContent = 'Keep exploring';
  (note.querySelector('#replay') as HTMLElement).textContent = 'Start again';
  note.dataset.stage = 'open';
  note.hidden = false;
  textpath.hidden = true;
  note.focus();
  setStatus('You unfold the note.');
};

$('#keep').addEventListener('click', () => {
  if (note.dataset.stage === 'slip') {
    openGift();
    return;
  }
  note.hidden = true;
  setStatus('The room is still yours.');
  if (returnToText) {
    textpath.hidden = false;
    ($('#tpDog') as HTMLElement).focus();
  } else if (!hud.hidden) $('#help').focus();
  else ($('#tpDog') as HTMLElement).focus();
});
const resetHunt = () => {
  const backToText = returnToText || !textpath.hidden;
  returnToText = backToText;
  run = createRun(); // a fresh attempt — the recap only ever describes one run
  run.start(!document.hidden);
  guided = false;
  rearMentioned = false;
  helpOffered = false;
  sameItem = { t: null, n: 0 };
  helpStage = 0;
  textDogView = false;
  wtActive = false;
  wtStep = 0;
  wtStepEl.hidden = true;
  ($('#ladder') as HTMLButtonElement).textContent = 'A little more help';
  helpNext.hidden = true;
  ($('#walkthrough') as HTMLElement).hidden = true;
  clearTimeout(rearTimer);
  clearTimeout(slipTimer);
  note.hidden = true;
  paperNote.hidden = true;
  helpPanel.hidden = true;
  unfoldChip.hidden = true;
  dogChip.hidden = true;
  opened = false;
  autoNudged = false;
  dogMet = false;
  misses = 0;
  atDog = false;
  seeing = false;
  tableInspected = false;
  tapHadSlip = false;
  paperState = 'edge';
  tpClue.hidden = true;
  ($('#tpLook') as HTMLElement).hidden = true;
  trailBtn.hidden = true;
  ($('#tpTrail') as HTMLElement).hidden = true;
  keepsakes = new Set();
  tpAtlas.hidden = true;
  tpStill.hidden = true;
  tpArtList.hidden = false;
  atlasPlace = null;
  atlasTarget = null;
  lastArt = null;
  ($('#tpPlaces') as HTMLElement).hidden = false;
  tpInfo.textContent = '';
  world?.showPaper('edge');
  hideCaption();
  world?.reset(); // restores the saved pose too, if crouched
  setStatus('');
};
const focusAfterReset = () => {
  if (returnToText) {
    textpath.hidden = false;
    ($('#tpDog') as HTMLElement).focus();
  } else if (!hud.hidden) $('#help').focus();
  else if (!textpath.hidden) ($('#tpDog') as HTMLElement).focus();
  else enterBtn.focus();
};
$('#replay').addEventListener('click', () => {
  if (note.dataset.stage === 'slip') {
    note.hidden = true;
    return;
  }
  resetHunt();
  focusAfterReset();
});
$('#paperReplay').addEventListener('click', () => {
  resetHunt();
  focusAfterReset();
});

/* ---------- help ---------- */
$('#help').addEventListener('click', () => {
  helpPanel.hidden = false;
  helpPanel.focus();
});
$('#closeHelp').addEventListener('click', () => {
  helpPanel.hidden = true;
  if (!textpath.hidden) ($('#tpDog') as HTMLElement).focus();
  else $('#help').focus();
});
$('#tpHelp').addEventListener('click', () => {
  helpPanel.hidden = false;
  helpPanel.focus();
});
/* ---------- the help ladder: one state-aware nudge at a time ---------- */
let helpStage = 0;
let textDogView = false; // the text route stood at the dog's height
let wtActive = false;    // walkthrough stepper in progress
let wtStep = 0;
const wtStepEl = $('#wtStep');
const STAGE_TEXT = [
  'Something low to the floor keeps watch here. Look for a collar tag.',
  'Down at the watcher’s eye level, something pale shows at the table lip. Try “Look from here.”',
  'A folded slip rests on the table’s front edge — see the pale corner.',
];
const ladderBtn = $('#ladder') as HTMLButtonElement;
const wtBtn = $('#walkthrough') as HTMLButtonElement;

const applyStage = () => {
  if (helpStage === 1) {
    if (!textpath.hidden) {
      tpInfo.textContent = STAGE_TEXT[0];
    } else {
      showCollar(); // works while this panel is open
    }
  } else if (helpStage === 2) {
    /* the viewpoint stays voluntary — the chip is only unlocked, not taken */
    if (textpath.hidden) {
      dogMet = true; // the ladder itself can be the first meeting
      updateDogChip();
      dogChip.hidden = false;
    }
  } else if (helpStage === 3) {
    if (textpath.hidden) world?.flashPaper();
    else tpInfo.textContent = 'A little paper edge peeks over the lip of the table.';
  }
};
ladderBtn.addEventListener('click', () => {
  if (wtActive) { wtAdvance(); return; }
  run.hint();
  const tier = Math.max(
    helpStage,
    tableInspected ? 3 : atDog || textDogView ? 2 : dogMet ? 1 : 0,
  );
  helpStage = Math.min(3, tier + 1);
  helpNext.hidden = false;
  helpNext.textContent = STAGE_TEXT[helpStage - 1];
  applyStage();
  if (helpStage >= 3) wtBtn.hidden = false; // the full walkthrough is the last rung
});

/* walkthrough → an explicit stepper, never a fake guided completion */
const WT_STEPS = [
  'Meet the watcher — something low to the floor is tagged.',
  'Look from here — from the watcher’s height, a paper edge shows.',
  'Follow the paper edge — a folded slip waits on the table.',
];
wtBtn.addEventListener('click', () => {
  run.hint();
  guided = true;
  wtActive = true;
  wtStep = 0;
  wtStepEl.hidden = false;
  wtStepEl.textContent = WT_STEPS[0];
  if (textpath.hidden) showCollar();
  ladderBtn.textContent = 'Next step';
  wtBtn.hidden = true;
});
const wtAdvance = () => {
  wtStep++;
  run.hint();
  if (wtStep === 1) {
    wtStepEl.textContent = WT_STEPS[1];
    if (textpath.hidden) {
      world?.visitDog(); // the player asked to be taken there
    } else {
      textDogView = true;
      tpInfo.textContent = 'From down here a little paper edge peeks over the lip of the table.';
    }
    return;
  }
  if (wtStep >= 2) {
    /* the walkthrough ends at the discovered slip — never at an open note */
    wtStepEl.textContent = WT_STEPS[2];
    wtActive = false;
    ladderBtn.textContent = 'A little more help';
    if (textpath.hidden && world) {
      world.flashPaper();
      if (!tableInspected) {
        tableInspected = true;
        paperState = 'folded';
        world.showPaper('folded');
        run.finish('guided');
        helpPanel.hidden = true;
        setStatus(SUCCESS);
        slipTimer = window.setTimeout(() => {
          if (statusEl.textContent === SUCCESS) setStatus(TABLE_SLIP);
        }, STATUS_MS - 200);
        unfoldChip.hidden = false; // the slip itself, not the reveal
      } else {
        helpPanel.hidden = true;
      }
    } else {
      if (!tableInspected) {
        tableInspected = true;
        run.finish('guided');
        tpInfo.textContent = `${SUCCESS} ${TABLE_SLIP}`;
        noteTitle.textContent = 'A folded slip of paper';
        noteBody.textContent = 'Unfold it?';
        note.dataset.stage = 'slip';
        ($('#keep') as HTMLElement).textContent = 'Unfold the note';
        (note.querySelector('#replay') as HTMLElement).textContent = 'Not yet';
        helpPanel.hidden = true;
        note.hidden = false;
        note.focus();
      } else {
        helpPanel.hidden = true;
      }
    }
  }
};
$('#motionless').addEventListener('click', () => {
  helpPanel.hidden = true;
  openTextPath('Here’s the hunt without moving through the room.');
});
$('#directOpen').addEventListener('click', () => openGift('direct'));
$('#reset').addEventListener('click', () => {
  world?.reset();
  helpPanel.hidden = true;
  $('#help').focus();
});
$('#fwd').addEventListener('click', () => world?.step(0.5));
$('#back').addEventListener('click', () => world?.step(-0.5));

/* ---------- text path: progressive, never names the answer ---------- */
function openTextPath(why: string) {
  tpTitle.textContent = why;
  tpInfo.textContent = 'The hunt still works from here.';
  textpath.hidden = false;
  textpath.focus();
  ($('#tpReturn') as HTMLElement).hidden = !world;
  ($('#tpTrail') as HTMLElement).hidden = !opened;
  run.start(!document.hidden);
}
const textPath = (why: string) => {
  openTextPath(why + ' The hunt still works from here.');
  enterBtn.disabled = false;
  enterBtn.textContent = 'Step inside';
  loading = false;
};
$('#tpDog').addEventListener('click', () => {
  run.tap('dog');
  dogMet = true;
  tpClue.hidden = false;
  tpClue.textContent = edition.dog;
  $('#tpLook').hidden = false;
});
$('#tpLook').addEventListener('click', () => {
  textDogView = true;
  tpInfo.textContent = 'A little paper edge peeks over the lip of the table.';
});
/* ---------- the still atlas: places → artefacts → still + sentence + clue ---------- */
let atlasPlace: 'table' | 'other' | null = null;
let atlasTarget: Still | null = null;
const PLACE_NAME = { table: 'Around the table', other: 'On the other side' };

const showAtlasList = () => {
  ($('#tpPlaces') as HTMLElement).hidden = true;
  ($('#tpBackPlace') as HTMLElement).textContent = atlasPlace
    ? `Back to ${PLACE_NAME[atlasPlace]}`
    : 'Back';
  tpAtlas.hidden = false;
  tpStill.hidden = true;
  tpArtList.hidden = false;
  atlasTarget = null;
  ($('#tpGo') as HTMLElement).hidden = true;
  tpPlaceName.textContent = atlasPlace ? PLACE_NAME[atlasPlace] : '';
  tpArtList.textContent = '';
  for (const st of STILLS) {
    if (st.place !== atlasPlace) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small art-btn';
    b.dataset.art = st.t;
    b.textContent = st.t;
    tpArtList.appendChild(b);
  }
};
let lastArt: HTMLElement | null = null;
const showArtefact = (st: Still) => {
  run.tap(st.t);
  atlasTarget = st;
  if (st.t === 'dog' || st.t === 'postcard' || st.t === 'ribbon') keepsakes.add(st.t);
  tpStill.hidden = false;
  tpArtList.hidden = true;
  tpStillImg.src = `./stills/${st.t}.webp`;
  tpStillImg.alt = st.alt;
  tpStillCap.textContent = st.line;
  tpInfo.textContent = lineFor(st.t);
  /* Take me there only exists when the real room is loaded — never pans on its own */
  ($('#tpGo') as HTMLElement).hidden = !world;
  if (st.t === 'table') {
    if (!tableInspected) {
      run.finish(guided ? 'guided' : 'found');
      tpInfo.textContent = `${SUCCESS} ${TABLE_SLIP}`;
    } else {
      tpInfo.textContent = TABLE_SLIP;
    }
    tableInspected = true;
    noteTitle.textContent = 'A folded slip of paper';
    noteBody.textContent = 'Unfold it?';
    note.dataset.stage = 'slip';
    $('#keep').textContent = 'Unfold the note';
    (note.querySelector('#replay') as HTMLElement).textContent = 'Not yet';
    note.hidden = false;
    note.focus();
  }
};
textpath.addEventListener('click', (e) => {
  const place = (e.target as HTMLElement).closest('[data-place]') as HTMLElement | null;
  if (place) {
    atlasPlace = place.dataset.place as 'table' | 'other';
    showAtlasList();
    return;
  }
  const art = (e.target as HTMLElement).closest('[data-art]') as HTMLElement | null;
  if (art) {
    const st = STILLS.find((x) => x.t === (art.dataset.art as Target));
    if (st) {
      lastArt = art;
      showArtefact(st);
    }
  }
});
$('#tpBackPlace').addEventListener('click', () => {
  atlasPlace = null;
  atlasTarget = null;
  /* back out of the still first, then out of the place */
  if (atlasTarget) {
    atlasTarget = null;
    tpStill.hidden = true;
    tpArtList.hidden = false;
    ($('#tpGo') as HTMLElement).hidden = true;
    (lastArt ?? (tpArtList.firstElementChild as HTMLElement | null))?.focus();
    return;
  }
  tpAtlas.hidden = true;
  tpStill.hidden = true;
  ($('#tpPlaces') as HTMLElement).hidden = false;
  (textpath.querySelector(`[data-place]`) as HTMLElement | null)?.focus();
});
$('#tpGo').addEventListener('click', () => {
  if (!world || !atlasTarget) return;
  textpath.hidden = true; // exit the atlas; the camera goes to a saved look
  world.see(atlasTarget.t);
});
$('#tpReturn').addEventListener('click', () => {
  textpath.hidden = true; // the camera never moved for the atlas
});
$('#tpOpen').addEventListener('click', () => openGift('direct'));

/* ---------- private recap — one frozen attempt, this tab only ---------- */
const ROUTE_LABEL: Record<string, string> = {
  found: 'Found it, in your own time',
  guided: 'Found it with the walkthrough',
  direct: 'Opened directly',
};
/* one quiet direction toward the next unseen keepsake — no names, no counts */
const SUGGEST: Record<string, string> = {
  ribbon: 'A small keepsake hangs quietly aside, if you look again.',
  postcard: 'Something stands behind where you first arrived.',
  dog: 'A watcher waits low to the floor, if you have not met.',
};
const showRecap = () => {
  const r = run.recap();
  const secs = Math.round(r.activeMs / 1000);
  const mins = Math.floor(secs / 60);
  ($('#recapTitle') as HTMLElement).textContent =
    r.route === 'direct' ? 'Your gift is open.' : r.route ? 'You found your gift.' : 'The hunt so far';
  const next = AUTHORED_ORDER.find((t) => !keepsakes.has(t));
  ($('#recapSuggest') as HTMLElement).textContent = next
    ? SUGGEST[next]
    : 'You found everything that was left for you.';
  recapList.textContent = '';
  const rows: [string, string][] = [
    ['Route', r.route ? ROUTE_LABEL[r.route] : 'Still exploring'],
    ['Time inside', mins ? `${mins} min ${secs % 60} s` : `${secs} s`],
    ['Things noticed', String(r.discoveries.length)],
    ['Times asked for help', String(r.hints)],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    recapList.append(dt, dd);
  }
  recapPanel.hidden = false;
  recapPanel.focus();
};
trailBtn.addEventListener('click', showRecap);
$('#tpTrail').addEventListener('click', showRecap);
let recapReturn: 'paper' | 'note' | 'text' | null = null;
for (const id of ['paperRecap', 'recapLink']) {
  ($(`#${id}`) as HTMLElement).addEventListener('click', () => {
    recapReturn = !paperNote.hidden ? 'paper' : !note.hidden ? 'note' : 'text';
    note.hidden = true;
    paperNote.hidden = true;
    showRecap();
  });
}
$('#recapBack').addEventListener('click', () => {
  /* keep exploring = back to the room or the atlas, never the invitation */
  recapPanel.hidden = true;
  if (returnToText || !textpath.hidden || !world) {
    if (returnToText || !world) textpath.hidden = false;
    ($('#tpDog') as HTMLElement).focus();
  } else {
    $('#help').focus();
  }
  recapReturn = null;
});

/* ---------- remix: reuse this room for your own small edition ---------- */
const draftChips = () => {
  for (const id of ['paperRemixLine']) {
    const el = $(`#${id}`) as HTMLElement;
    el.hidden = !isDraft;
    if (isDraft) el.textContent = 'You are previewing your own gift.';
  }
};
const remixLinks = () => {
  const on = ROOM.allowRemix && !isPreview; // a recipient preview never offers the editor
  ($('#paperRemix') as HTMLElement).hidden = !on;
  ($('#remixLink') as HTMLElement).hidden = !on;
};
remixLinks();

let remixReturn: 'paper' | 'note' | 'text' | null = null;
const openRemix = () => {
  if (!ROOM.allowRemix || isPreview) return;
  remixReturn = !paperNote.hidden ? 'paper' : !note.hidden ? 'note' : 'text';
  note.hidden = true;
  paperNote.hidden = true;
  /* the last draft keeps its edits; a fresh one gets neutral starters —
     nothing of the canonical gift is copied across */
  const base = lastDraft ?? makeDraft();
  ($('#rmTo') as HTMLInputElement).value = base.to;
  ($('#rmFrom') as HTMLInputElement).value = base.from;
  ($('#rmDog') as HTMLTextAreaElement).value = base.dog;
  ($('#rmPostcard') as HTMLTextAreaElement).value = base.postcard;
  ($('#rmMemory') as HTMLTextAreaElement).value = base.memory;
  ($('#rmInvite') as HTMLTextAreaElement).value = base.invitation;
  remixPanel.hidden = false;
  remixPanel.focus();
};
for (const id of ['paperRemix', 'remixLink']) {
  ($(`#${id}`) as HTMLElement).addEventListener('click', openRemix);
}
const closeRemix = () => {
  remixPanel.hidden = true;
  if (remixReturn === 'paper' && paperState === 'open' && world) {
    paperNote.hidden = false;
    paperNote.focus();
  } else if (remixReturn === 'note') {
    note.hidden = false;
    note.focus();
  } else if (returnToText || !textpath.hidden) {
    textpath.hidden = false;
    ($('#tpDog') as HTMLElement).focus();
  } else if (!hud.hidden) $('#help').focus();
  remixReturn = null;
};
$('#remixCancel').addEventListener('click', closeRemix);
/* ---------- recipient preview: the draft opens in an isolated frame ---------- */
let lastDraft: GiftEdition | null = null;
let previewSheet: HTMLElement | null = null;
let previewFrame: HTMLIFrameElement | null = null;
let previewBack: HTMLButtonElement | null = null;
let previewOpener: HTMLElement | null = null;

const submitLabel = () => {
  const to = (($('#rmTo') as HTMLInputElement).value || '').trim();
  ($('#rmSubmit') as HTMLElement).textContent = `Open it as ${to || 'your recipient'}`;
};
$('#rmTo').addEventListener('input', submitLabel);

const onPreviewMessage = (e: MessageEvent) => {
  if (!previewFrame || e.source !== previewFrame.contentWindow) return;
  if (e.origin !== location.origin) return;
  if (e.data === 'gift-preview-ready' && lastDraft) {
    previewFrame.contentWindow!.postMessage(
      { type: 'gift-edition', edition: { ...lastDraft } },
      location.origin,
    );
  } else if (e.data === 'gift-reveal' && previewBack) {
    previewBack.textContent = 'Back to my draft';
  }
};

const openPreview = () => {
  if (previewSheet || isPreview) return; // never nest a preview inside a preview
  previewOpener = document.activeElement as HTMLElement | null;
  remixPanel.hidden = true;
  previewSheet = document.createElement('div');
  previewSheet.className = 'preview-sheet';
  const bar = document.createElement('div');
  bar.className = 'preview-bar';
  const label = document.createElement('span');
  label.className = 'preview-label';
  label.textContent = 'Recipient preview — stays in this tab';
  previewBack = document.createElement('button');
  previewBack.type = 'button';
  previewBack.className = 'chip preview-back';
  previewBack.textContent = 'Back to editing';
  previewBack.addEventListener('click', closePreview);
  previewFrame = document.createElement('iframe');
  previewFrame.src = './?recipientPreview=1';
  previewFrame.title = 'The room as your recipient will open it';
  previewFrame.setAttribute('aria-label', 'Recipient preview of your gift');
  bar.append(label, previewBack);
  previewSheet.append(previewFrame, bar);
  document.body.appendChild(previewSheet);
  app.setAttribute('inert', ''); // background sleeps while the recipient plays
  window.addEventListener('message', onPreviewMessage);
  previewBack.focus();
};

const closePreview = () => {
  if (!previewSheet) return;
  window.removeEventListener('message', onPreviewMessage);
  previewFrame?.remove();
  previewSheet.remove();
  previewSheet = null;
  previewFrame = null;
  previewBack = null;
  app.removeAttribute('inert');
  remixPanel.hidden = false; // the form kept every field — nothing was applied
  remixPanel.focus();
  (previewOpener && document.contains(previewOpener)
    ? previewOpener
    : ($('#rmFrom') as HTMLElement)
  ).focus();
  previewOpener = null;
};

($('#remixForm') as HTMLFormElement).addEventListener('submit', (e) => {
  e.preventDefault();
  const val = (id: string) => (($(id) as HTMLInputElement | HTMLTextAreaElement).value || '').trim();
  const draft = makeDraft();
  draft.to = val('#rmTo');
  draft.from = val('#rmFrom');
  draft.dog = val('#rmDog');
  draft.postcard = val('#rmPostcard');
  draft.memory = val('#rmMemory');
  draft.invitation = val('#rmInvite');
  if (!draft.to || !draft.from || !draft.dog || !draft.postcard || !draft.memory || !draft.invitation) return;
  lastDraft = draft; // memory only — the parent's room is never replaced
  openPreview();
});
$('#remixOriginal').addEventListener('click', () => {
  edition = { ...CANONICAL };
  isDraft = false;
  remixPanel.hidden = true;
  remixReturn = null;
  resetHunt();
  draftChips();
  setStatus('Back to the original gift.');
  focusAfterReset();
});

/* ---------- entry: paper lifts only when the room is really there ---------- */
const enter = async () => {
  if (loading || world) return;
  loading = true;
  abortCtl = new AbortController();
  enterBtn.textContent = 'Opening…';
  enterBtn.disabled = true;
  setStatus('Opening…');
  window.setTimeout(() => {
    if (loading) no3dBtn.hidden = false; // quiet opt-out while it downloads
  }, 4_000);

  const bail = (why: string) => {
      textPath(why);
  };

  let config: { rad: string; collider: string };
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
  const ctl = abortCtl;
  try {
    const { enterWorld } = await import('./world');
    if (ctl.signal.aborted) return;
    world = await enterWorld(host, config, {
      onTap,
      onPaperTap: () => {
        if (paperState === 'open') {
          paperNote.hidden = false;
          paperNote.focus();
          updateDogChip();
        } else if (tapHadSlip) {
          doUnfold(); // a second deliberate touch on the paper itself
        }
      },
      onViewChanged: (v) => {
        atDog = v === 'dog';
        seeing = v === 'see';
        updateDogChip();
      },
      onMove: hideCollar,
    }, ctl.signal);
  } catch {
    host.hidden = true;
    if (ctl.signal.aborted) return; // user already chose the text path
    bail('The 3D room could not open on this device.');
    return;
  }
  if (ctl.signal.aborted) {
    world?.dispose();
    world = null;
    return;
  }

  loading = false;
  hud.hidden = false;
  run.start(!document.hidden);
  anchorChips();
  coverLine.hidden = true;
  setStatus('');

  hint.hidden = false;
  window.setTimeout(() => hint.classList.add('is-fading'), HINT_MS);
  window.setTimeout(() => {
    hint.hidden = true;
    hint.classList.remove('is-fading');
  }, HINT_MS + 1600);

  if (reduced()) {
    cover.remove();
  } else {
    coverFrame.classList.add('is-wiped'); // paper-edge slides the photo away
    window.setTimeout(() => cover.remove(), 1100);
  }
};

document.addEventListener('visibilitychange', () => run.visible(!document.hidden));

/* ---------- recipient-preview child: receives its edition in memory only ---------- */
const previewReveal = () => {
  if (isPreview) window.parent.postMessage('gift-reveal', location.origin);
};
if (isPreview) {
  (coverFrame.querySelector('.paper-card') as HTMLElement).textContent = '';
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const d = e.data as { type?: string; edition?: Record<string, unknown> };
    if (d?.type !== 'gift-edition' || !d.edition || typeof d.edition !== 'object') return;
    const ed = d.edition as Record<string, unknown>;
    if (ed.revision !== ROOM.revision || ed.roomId !== ROOM.id) return;
    const limits: [string, number][] = [
      ['to', 40], ['from', 40], ['dog', 160], ['chair', 160],
      ['postcard', 160], ['memory', 160], ['invitation', 200],
    ];
    if (!limits.every(([k, m]) => typeof ed[k] === 'string' && (ed[k] as string).length <= m)) return;
    edition = { ...(ed as unknown as GiftEdition) };
    /* the folded cover is signed for this recipient before they step inside */
    (coverFrame.querySelector('.paper-card') as HTMLElement).textContent =
      `For ${edition.to}, from ${edition.from}`;
  });
  window.parent.postMessage('gift-preview-ready', location.origin);
}

enterBtn.addEventListener('click', enter);
submitLabel();
if (makeNow && ROOM.allowRemix && !isPreview) openRemix();
no3dBtn.addEventListener('click', () => {
  abortCtl?.abort();
  openTextPath('Here’s the hunt without moving through the room.');
});
