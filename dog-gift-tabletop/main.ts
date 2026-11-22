import type { Target, WorldHandle } from './world';
import { createRun } from './run';
import { ROOM, CANONICAL, makeDraft, type GiftEdition } from './edition';
import {
  linkMode, validateEdition, initializeGiftLink, createRecipientLink, restorePendingDraft,
} from './links';

/**
 * Silent canonical v2. Unmarked photograph under a folded paper corner;
 * the paper lifts into the real room only when splats are visibly there.
 * Every meaningful beat still works without WebGL, from text alone.
 */

let edition: GiftEdition = { ...CANONICAL };

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
let dogPromptActive = false; // is the 'Look from here' hint currently earned
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
      <button class="link" id="no3d" type="button">Explore in photos</button>
      <button class="link resume-gift" id="coverResume" type="button" hidden>Continue your gift</button>
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
    <div class="row">
      <button class="btn small" id="paperKeep">Keep exploring</button>
    </div>
    <button class="link remix-entry" id="paperRemix" hidden>Make a gift in this room</button>
    <details class="gift-options" id="paperOptions">
      <summary>More options</summary>
      <div class="row">
        <button class="link" id="paperRecap">How the hunt went</button>
        <button class="link" id="paperReplay">Start again</button>
      </div>
    </details>
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
      <button class="btn small" id="motionless">Explore in photos</button>
      <button class="btn small ghost" id="directOpen">Just open my gift</button>
      <button class="link resume-gift" id="helpResume" type="button" hidden>Continue your gift</button>
      <button class="link" id="closeHelp">Back</button>
    </div>
  </section>

  <section class="note" id="note" hidden aria-label="Your gift" tabindex="-1">
    <p class="note-kicker" id="noteTitle"></p>
    <blockquote><p id="noteBody"></p><p class="note-sign" id="noteSign" hidden></p></blockquote>
    <div class="row">
      <button class="btn" id="keep">Keep exploring</button>
      <button class="link" id="slipBack" hidden>Not yet</button>
    </div>
    <button class="link remix-entry" id="remixLink" hidden>Make a gift in this room</button>
    <details class="gift-options" id="noteOptions">
      <summary>More options</summary>
      <div class="row">
        <button class="link" id="recapLink">How the hunt went</button>
        <button class="link" id="replay">Start again</button>
      </div>
    </details>
  </section>

  <section class="textpath" id="textpath" hidden aria-label="Explore in photos" tabindex="-1">
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
      <button class="link resume-gift" id="tpResume" type="button" hidden>Continue your gift</button>
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

  <dialog class="note paper-note remix" id="remixPanel" hidden aria-labelledby="rmDialogTitle">
    <form id="remixForm" novalidate>
      <header class="remix-header">
        <p class="letter-brand">EnigmaGift</p><h1 class="letter-sr-only" id="rmDialogTitle">Make a little gift</h1>
        <div class="letter-header-actions"><button class="link" type="button" id="rmJumpGift" data-rm-step="3">Your gift</button><button class="link remix-close" id="remixCancel" type="button" aria-label="Close, keeping your draft in this tab">Close</button></div>
      </header>
      <div class="remix-viewport" id="rmViewport">
        <section class="remix-stage letter-welcome" id="rmStagePeople" data-rm-panel="0">
          <h2 tabindex="-1">A little surprise,<br>just for them.</h2>
          <p class="remix-intro">Try a gift in this sample room.</p>
          <div class="letter-object letter-envelope">
            <div class="letter-stamp" aria-hidden="true"><img src="./room.jpg" alt="" width="72" height="54"><span>A little discovery</span></div>
            <span class="letter-postmark" aria-hidden="true"></span>
            <label for="rmTo" class="letter-addressee">For<input id="rmTo" maxlength="40" required placeholder="Their name or nickname" autocomplete="off" /></label>
          </div>
        </section>
        <section class="remix-stage" id="rmStageMessage" data-rm-panel="1" hidden>
          <div class="letter-object letter-paper letter-writing">
            <h2 tabindex="-1"><button type="button" class="letter-recipient" data-rm-step="0" aria-label="Change who this note is for"><span id="rmSalutation">For someone special,</span></button></h2>
            <label class="letter-sr-only" for="rmInvite">Your note</label>
            <textarea id="rmInvite" maxlength="200" required rows="4" placeholder="A plan, a memory, a reason they matter…" aria-describedby="rmInviteCount"></textarea>
            <p class="remix-count" id="rmInviteCount"></p>
            <label class="letter-signature" for="rmFrom"><span>From</span><input id="rmFrom" maxlength="40" required placeholder="Your name" autocomplete="off" /></label>
          </div>
        </section>
        <section class="remix-stage letter-paper" id="rmStageClues" data-rm-panel="2" hidden>
          <h2 tabindex="-1">Little discoveries</h2><p class="remix-intro" id="rmCluePurpose">Let the dog nudge them towards the note on the table.</p>
          <div class="remix-objects" role="group" aria-label="Choose a clue to edit">
            <button type="button" data-rm-clue="dog" aria-pressed="true" aria-controls="rmClueDog"><img src="./stills/dog.webp" alt="" width="44" height="36" />Dog</button>
            <button type="button" data-rm-clue="postcard" aria-pressed="false" aria-controls="rmCluePostcard"><img src="./stills/postcard.webp" alt="" width="44" height="36" />Postcard</button>
            <button type="button" data-rm-clue="memory" aria-pressed="false" aria-controls="rmClueMemory"><img src="./stills/ribbon.webp" alt="" width="44" height="36" />Keepsake</button>
          </div>
          <div id="rmClueDog" data-rm-clue-panel="dog"><label>The dog’s hint<textarea id="rmDog" maxlength="160" rows="3" aria-describedby="rmCluePurpose"></textarea></label></div>
          <div id="rmCluePostcard" data-rm-clue-panel="postcard" hidden><label>The postcard’s clue<textarea id="rmPostcard" maxlength="160" rows="3" aria-describedby="rmCluePurpose"></textarea></label></div>
          <div id="rmClueMemory" data-rm-clue-panel="memory" hidden><label>The ribbon’s keepsake<textarea id="rmMemory" maxlength="160" rows="3" aria-describedby="rmCluePurpose"></textarea></label></div>
        </section>
        <section class="remix-stage letter-review" id="rmStageReview" data-rm-panel="3" hidden>
          <h2 tabindex="-1" id="rmReviewTitle">One last look.</h2><p class="remix-intro" id="rmReviewIntro">Sample hiding place: dining table.</p>
          <div class="letter-object letter-paper remix-review-letter"><button type="button" class="letter-recipient" id="rmReviewTo" data-rm-step="0" aria-label="Change who this gift is for"></button><blockquote><p id="rmReviewMessage"></p></blockquote><p class="note-sign" id="rmReviewFrom"></p></div>
          <div class="letter-discoveries"><p>The room’s little trail is ready.</p><button class="link" id="rmEditClues" type="button" data-rm-step="2">Add a personal clue <span aria-hidden="true">↗</span></button></div>
        </section>
      </div>
      <p class="remix-status" id="rmLinkStatus" role="status" aria-live="polite"></p>
      <footer class="remix-footer"><div class="letter-inspiration" id="rmInspiration" hidden><div id="rmStarterChoices" class="letter-starters" role="group" aria-label="Start your note"><button type="button" data-rm-starter="evening">An evening</button><button type="button" data-rm-starter="thanks">Thank you</button><button type="button" data-rm-starter="own">My words</button></div></div><button class="link remix-preview" type="submit" id="rmSubmit" hidden>Preview as your recipient</button><div class="remix-navigation"><button class="link" id="rmPrev" type="button" hidden>Back</button><button class="btn small" id="rmNext" type="button">Write a note</button><button class="btn small" id="rmCreate" type="submit" hidden>Create gift link</button></div><p class="remix-footnote" id="rmFootnote">Free to make. Share by link.</p></footer>
    </form>
  </dialog>
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
const remixPanel = $<HTMLDialogElement>('#remixPanel');
const helpNext = $('#helpNext');
const tpAtlas = $('#tpAtlas');
const tpArtList = $('#tpArtList');
const tpStill = $('#tpStill');
const tpStillImg = $('#tpStillImg') as HTMLImageElement;
const tpStillCap = $('#tpStillCap');
const tpPlaceName = $('#tpPlaceName');
const trailBtn = $('#trailBtn') as HTMLButtonElement;

const overlayOpen = () =>
  app.hasAttribute('inert') ||
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
  clearContextHint();
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
        if (!opened && !tableInspected) setStatus('There’s a card behind you, too.');
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
  updateDogChip(); // overlay and hunt state gate the chip every frame
  if (world && !atDog && !seeing && !dogChip.hidden) {
    const p = world.project('dog');
    if (p) {
      dogChip.style.left = `${clampX(p.x)}px`;
      dogChip.style.top = `${Math.max(44, Math.min(window.innerHeight - 60, p.y + 44))}px`;
      dogChip.style.bottom = '';
    } else {
      /* off-view means the hint is done — no edge-pinned ghost */
      dogPromptActive = false;
      dogChip.hidden = true;
    }
  }
  /* the unfold chip exists only while the paper is genuinely visible */
  const p = world && (paperState === 'folded' || !paperNote.hidden) ? world.paperScreen() : null;
  const shouldShow = !!world && tableInspected && paperState === 'folded' && !opened && !overlayOpen() && !!p;
  if (unfoldChip.hidden !== !shouldShow) unfoldChip.hidden = !shouldShow;
  if (shouldShow && p) {
    unfoldChip.style.left = `${clampX(p.x)}px`;
    unfoldChip.style.top = `${Math.max(44, Math.min(window.innerHeight - 60, p.y + 30))}px`;
    unfoldChip.style.bottom = '';
  }
  /* the open letter keeps its readable position even off-view */
  if (world && !paperNote.hidden) {
    if (p) {
      paperNote.style.left = `${clampNoteX(p.x)}px`;
      paperNote.style.top = `${clampNoteY(p.y - 40)}px`;
      paperNote.style.bottom = '';
    } else {
      paperNote.style.left = '50%';
      paperNote.style.top = `${clampNoteY(window.innerHeight * 0.22)}px`;
      paperNote.style.bottom = '';
    }
  }
  chipRaf = requestAnimationFrame(anchorChips);
};

const updateDogChip = () => {
  const returning = atDog || seeing;
  const hide = !world || overlayOpen()
    || (!returning && (!dogPromptActive || tableInspected || opened));
  if (dogChip.hidden !== hide) dogChip.hidden = hide;
  if (hide) return;
  const label = returning ? 'Back to my spot' : 'Look from here';
  if (dogChip.textContent !== label) dogChip.textContent = label;
  if (returning) {
    dogChip.style.left = '50%';
    dogChip.style.top = 'auto';
    dogChip.style.bottom = '6.5rem';
  }
};

/* every contextual hint is cleared together — captions, collar, dog chip */
const clearContextHint = () => {
  dogPromptActive = false;
  hideCaption();
  hideCollar();
  updateDogChip();
};
const clearPhotoDogHint = () => {
  tpClue.hidden = true;
  ($('#tpLook') as HTMLElement).hidden = true;
};

const goDog = () => {
  if (!world || atDog) return;
  clearContextHint();
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
  clearContextHint();
  clearPhotoDogHint();
  trailBtn.hidden = false;
  previewReveal();
  ($('#tpTrail') as HTMLElement).hidden = false;
  fillPaperNote();
  ($('#paperOptions') as HTMLDetailsElement).open = false; // collapsed for each new reveal
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
      /* a context caption ends when its target leaves the view — no pinning */
      if (captionTarget === 'dog') dogPromptActive = false;
      hideCaption();
      updateDogChip();
      return;
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
    clearContextHint(); // the dog's errand is done once the table is found
    /* the slip stays in the room: no modal covers the scene on this route */
    if (paperState === 'open') return;
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
    dogPromptActive = !tableInspected && !opened;
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
  clearContextHint();
  clearPhotoDogHint();
  helpPanel.hidden = true;
  noteTitle.textContent = TITLE;
  noteBody.textContent = `“${edition.invitation}”`;
  const sign = $('#noteSign');
  const sig = [edition.to && `For ${edition.to}`, edition.from && `— ${edition.from}`]
    .filter(Boolean).join(' ');
  sign.hidden = !sig;
  sign.textContent = sig;
  $('#keep').textContent = 'Keep exploring';
  const noteOpts = $('#noteOptions') as HTMLDetailsElement;
  noteOpts.hidden = false;
  noteOpts.open = false;
  ($('#slipBack') as HTMLElement).hidden = true;
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
  ($('#slipBack') as HTMLElement).hidden = true;
  ($('#noteOptions') as HTMLElement).hidden = false;
  unfoldChip.hidden = true;
  dogChip.hidden = true;
  opened = false;
  autoNudged = false;
  dogMet = false;
  dogPromptActive = false;
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
/* the slip's only way back — hides the card, never opens the gift */
$('#slipBack').addEventListener('click', () => {
  note.hidden = true;
  if (!textpath.hidden || returnToText || !world) {
    textpath.hidden = false;
    (tpAtlas.hidden ? $('#tpDog') : $('#tpBackPlace')).focus();
  } else {
    $('#help').focus();
  }
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
      dogPromptActive = !tableInspected && !opened;
      updateDogChip();
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
        ($('#noteOptions') as HTMLElement).hidden = true;
        ($('#slipBack') as HTMLElement).hidden = false;
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
  openTextPath('Choose a part of the room, then look closer at what you find.');
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
  clearContextHint();
  clearPhotoDogHint();
  tpTitle.textContent = 'Explore in photos';
  tpInfo.textContent = why;
  coverLine.hidden = true;
  setStatus('');
  textpath.hidden = false;
  textpath.focus();
  ($('#tpReturn') as HTMLElement).hidden = !world;
  ($('#tpTrail') as HTMLElement).hidden = !opened;
  run.start(!document.hidden);
}
const textPath = (why: string) => {
  openTextPath(why);
  enterBtn.disabled = false;
  enterBtn.textContent = 'Step inside';
  loading = false;
};
$('#tpDog').addEventListener('click', () => {
  run.tap('dog');
  dogMet = true;
  tpClue.hidden = false;
  tpClue.textContent = edition.dog;
  ($('#tpLook') as HTMLElement).hidden = tableInspected || opened || textDogView;
});
$('#tpLook').addEventListener('click', () => {
  clearPhotoDogHint(); // the look is consumed as the player takes it
  textDogView = true;
  tpInfo.textContent = 'A little paper edge peeks over the lip of the table.';
});
/* ---------- the still atlas: places → artefacts → still + sentence + clue ---------- */
let atlasPlace: 'table' | 'other' | null = null;
let atlasTarget: Still | null = null;
const PLACE_NAME = { table: 'Around the table', other: 'On the other side' };

const showAtlasList = () => {
  clearPhotoDogHint();
  tpInfo.textContent = '';
  ($('#tpPlaces') as HTMLElement).hidden = true;
  ($('#tpBackPlace') as HTMLElement).textContent = 'Back to the room';
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
  clearPhotoDogHint();
  run.tap(st.t);
  atlasTarget = st;
  ($('#tpBackPlace') as HTMLElement).textContent = `Back to ${PLACE_NAME[st.place]}`;
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
    ($('#noteOptions') as HTMLElement).hidden = true;
    ($('#slipBack') as HTMLElement).hidden = false;
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
  clearPhotoDogHint();
  tpInfo.textContent = '';
  /* back out of the still first, then out of the place */
  if (atlasTarget) {
    atlasTarget = null;
    ($('#tpBackPlace') as HTMLElement).textContent = 'Back to the room';
    tpStill.hidden = true;
    tpArtList.hidden = false;
    ($('#tpGo') as HTMLElement).hidden = true;
    (lastArt ?? (tpArtList.firstElementChild as HTMLElement | null))?.focus();
    return;
  }
  atlasPlace = null;
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
const remixLinks = () => {
  // recipient links and previews never offer the editor — remix is demo-only
  const on = ROOM.allowRemix && !isPreview && linkMode === 'demo';
  ($('#paperRemix') as HTMLElement).hidden = !on;
  ($('#remixLink') as HTMLElement).hidden = !on;
};
remixLinks();

let lastDraft: GiftEdition | null = null;
let remixStep = 0;
let remixClue: 'dog' | 'postcard' | 'memory' = 'dog';
let remixOpener: HTMLElement | null = null;
let remixReturn: 'paper' | 'note' | 'text' | null = null;
let rmAnim: Animation | null = null;
let rmArrival: Animation | null = null;
const arriveRemix = () => {
  rmArrival?.cancel();
  if (reduced()) return;
  rmArrival = remixPanel.animate(
    [{ opacity: 0.7, transform: 'translate(-50%, calc(-50% + 6px)) scale(.985)' },
     { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }],
    { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' },
  );
};
const rmForm = $<HTMLFormElement>('#remixForm');
const composerBusy = () => rmForm.getAttribute('aria-busy') === 'true';

/* the composer tracks the visual viewport — keyboard shrink, pinch scale and
   pan all move the usable area without moving the layout viewport */
let composerFitFrame = 0;
let revealComposerField = false;
const fitComposerViewport = (revealField = false) => {
  if (!remixPanel.open) return;
  const v = window.visualViewport;
  const width = v?.width ?? window.innerWidth;
  const height = v?.height ?? window.innerHeight;
  const left = v?.offsetLeft ?? 0;
  const top = v?.offsetTop ?? 0;
  remixPanel.style.setProperty('--rm-vp-width', `${width}px`);
  remixPanel.style.setProperty('--rm-vp-height', `${height}px`);
  remixPanel.style.setProperty('--rm-vp-x', `${left + width / 2}px`);
  remixPanel.style.setProperty('--rm-vp-y', `${top + height / 2}px`);
  remixPanel.classList.toggle('is-compact', height < 560);
  remixPanel.classList.toggle('is-narrow', width < 320);
  if (!revealField) return;
  /* scroll only the inner pane — the page itself never jumps while typing */
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    || !rmForm.contains(field) || !field.getClientRects().length) return;
  const pane = $('#rmViewport');
  const box = pane.getBoundingClientRect();
  const rect = field.getBoundingClientRect();
  const fieldTop = rect.top - box.top + pane.scrollTop;
  const fieldBottom = fieldTop + rect.height;
  const start = pane.scrollTop + 4;
  const end = pane.scrollTop + pane.clientHeight - 4;
  if (rect.height > pane.clientHeight - 8) {
    if (fieldTop < start || fieldTop > end) pane.scrollTop = Math.max(0, fieldTop - 4);
  } else if (fieldTop < start) pane.scrollTop = Math.max(0, fieldTop - 4);
  else if (fieldBottom > end) pane.scrollTop = fieldBottom - pane.clientHeight + 4;
};
const scheduleComposerFit = (revealField = false) => {
  revealComposerField ||= revealField;
  if (composerFitFrame) return;
  composerFitFrame = requestAnimationFrame(() => {
    composerFitFrame = 0;
    const reveal = revealComposerField;
    revealComposerField = false;
    fitComposerViewport(reveal);
  });
};
const cancelComposerFit = () => {
  if (composerFitFrame) {
    cancelAnimationFrame(composerFitFrame);
    composerFitFrame = 0;
  }
  revealComposerField = false;
};
window.visualViewport?.addEventListener('resize', () => scheduleComposerFit(true));
window.visualViewport?.addEventListener('scroll', () => scheduleComposerFit());
window.addEventListener('resize', () => scheduleComposerFit(true));
rmForm.addEventListener('focusin', () => scheduleComposerFit(true));

const readDraft = (): GiftEdition => {
  const val = (id: string) => (($(id) as HTMLInputElement | HTMLTextAreaElement).value || '').trim();
  const draft = makeDraft();
  draft.to = val('#rmTo');
  draft.from = val('#rmFrom');
  draft.dog = val('#rmDog') || draft.dog;
  draft.postcard = val('#rmPostcard') || draft.postcard;
  draft.memory = val('#rmMemory') || draft.memory;
  draft.invitation = val('#rmInvite');
  return draft;
};

const submitLabel = () => {
  const to = (($('#rmTo') as HTMLInputElement).value || '').trim();
  ($('#rmSubmit') as HTMLElement).textContent = `Preview as ${to || 'your recipient'}`;
};

type RemixProblem = {
  field: string;
  stage: 0 | 1 | 2;
  clue?: 'dog' | 'postcard' | 'memory';
  say: string;
  action: string;
  missing: boolean;
};
const LETTER_OPENINGS = {
  evening: 'I’d love an evening together. How about ',
  thanks: 'I’ve been meaning to thank you for ',
} as const;
let selectedOpening: string | null = null;

const remixProblem = (d: GiftEdition): RemixProblem | null => {
  if (!d.to) return { field: '#rmTo', stage: 0, say: 'Add their name before previewing or creating a link.', action: 'Add recipient', missing: true };
  if (d.to.length > 40) return { field: '#rmTo', stage: 0, say: 'Keep their name to 40 characters.', action: 'Shorten their name', missing: false };
  if (!d.invitation) return { field: '#rmInvite', stage: 1, say: 'Write the message they will find before continuing.', action: 'Write your note', missing: true };
  if (d.invitation.length > 200) return { field: '#rmInvite', stage: 1, say: 'Keep your message to 200 characters.', action: 'Shorten your note', missing: false };
  if (Object.values(LETTER_OPENINGS).some((o) => o.trim() === d.invitation)) {
    return { field: '#rmInvite', stage: 1, say: 'Add your own detail to finish this first line.', action: 'Finish your note', missing: true };
  }
  if (!d.from) return { field: '#rmFrom', stage: 1, say: 'Add your name to sign the note before sharing.', action: 'Sign your note', missing: true };
  if (d.from.length > 40) return { field: '#rmFrom', stage: 1, say: 'Keep your name to 40 characters.', action: 'Shorten your name', missing: false };
  for (const [clue, field] of [['dog', '#rmDog'], ['postcard', '#rmPostcard'], ['memory', '#rmMemory']] as const) {
    if (d[clue].length > 160) return { field, stage: 2, clue, say: 'That clue is a little long — trim it to fit.', action: 'Shorten the clue', missing: false };
  }
  return null;
};

const syncRemixReview = () => {
  if (composerBusy()) return; // a create in flight keeps every control frozen
  const d = readDraft();
  $('#rmReviewTo').textContent = d.to ? `For ${d.to}` : 'For someone special';
  $('#rmReviewMessage').textContent = d.invitation || 'Your message will appear here.';
  $('#rmReviewFrom').textContent = d.from ? `— ${d.from}` : 'From you';
  ($('#rmSalutation') as HTMLElement).textContent = d.to ? `For ${d.to},` : 'For someone special,';
  const recipientLabel = d.to ? `Change recipient, currently ${d.to}` : 'Add a recipient';
  ($('#rmReviewTo') as HTMLElement).setAttribute('aria-label', recipientLabel);
  ($('#rmSalutation').closest('button')!).setAttribute('aria-label', recipientLabel);
  ($('#rmInviteCount') as HTMLElement).textContent =
    `${Math.max(0, 200 - ($('#rmInvite') as HTMLTextAreaElement).value.length)} characters left`;
  const defaults = makeDraft();
  const customClues = (['dog', 'postcard', 'memory'] as const).some((k) => d[k] !== defaults[k]);
  ($('#rmNext') as HTMLElement).textContent =
    remixStep === 0 ? 'Write a note'
    : remixStep === 1 ? 'Review gift'
    : remixStep === 2 ? (customClues ? 'Keep my discoveries' : 'Keep these clues')
    : 'Continue';
  ($('#rmPrev') as HTMLElement).textContent =
    remixStep === 2 ? 'Back to gift'
    : remixStep === 3 ? 'Back to note'
    : 'Back';
  ($('#rmEditClues') as HTMLElement).textContent = customClues ? 'Edit your discoveries' : 'Add a personal clue ↗';
  const problem = remixProblem(d);
  ($('#rmSubmit') as HTMLButtonElement).disabled = !!problem;
  ($('#rmCreate') as HTMLElement).textContent = problem?.action ?? 'Create gift link';
  ($('#rmReviewTitle') as HTMLElement).textContent = problem ? 'Make it yours.' : 'One last look.';
  ($('#rmReviewIntro') as HTMLElement).textContent = problem
    ? 'A name, a note, your signature.'
    : 'Sample hiding place: dining table.';
  ($('#rmFootnote') as HTMLElement).textContent = remixStep === 0
    ? 'Free to make. Share by link.'
    : remixStep === 3
      ? (problem ? 'You can keep changing your gift.' : 'Creates a link for you to send.')
      : 'Your draft stays in this tab.';
  // first-line choices only offer themselves on a blank or untouched starter
  const raw = ($('#rmInvite') as HTMLTextAreaElement).value;
  const untouched = !!selectedOpening && raw.trim() === selectedOpening.trim();
  ($('#rmInspiration') as HTMLElement).hidden = remixStep !== 1 || !(raw.trim() === '' || untouched);
  ($('#rmStarterChoices') as HTMLElement).hidden = false;
  rmForm.querySelectorAll<HTMLElement>('[data-rm-starter]').forEach((b) => {
    const key = b.dataset.rmStarter as keyof typeof LETTER_OPENINGS | 'own';
    const pressed = key !== 'own' && untouched && LETTER_OPENINGS[key] === selectedOpening;
    b.setAttribute('aria-pressed', String(pressed));
  });
  submitLabel();
};

const stageHeading = () =>
  $(`[data-rm-panel="${remixStep}"] h2`) as HTMLElement;

const showRemixStep = (next: number, focus = true) => {
  if (composerBusy()) return;
  rmAnim?.cancel();
  rmAnim = null;
  const previous = remixStep;
  remixStep = Math.max(0, Math.min(3, next));
  rmForm.querySelectorAll<HTMLElement>('[data-rm-panel]').forEach((p) => {
    p.hidden = Number(p.dataset.rmPanel) !== remixStep;
  });
  ($('#rmJumpGift') as HTMLElement).hidden = remixStep === 3;
  ($('#rmPrev') as HTMLElement).hidden = remixStep === 0;
  ($('#rmNext') as HTMLElement).hidden = remixStep === 3;
  ($('#rmCreate') as HTMLElement).hidden = remixStep !== 3;
  ($('#rmSubmit') as HTMLElement).hidden = remixStep !== 3;
  syncRemixReview();
  ($('#rmViewport') as HTMLElement).scrollTop = 0;
  const panel = $(`[data-rm-panel="${remixStep}"]`) as HTMLElement;
  if (remixStep !== previous && !reduced()) {
    const object = (panel.querySelector('.letter-object') ?? panel) as HTMLElement;
    if (remixStep === 1) {
      object.style.transformOrigin = '50% 0';
      rmAnim = object.animate(
        [{ opacity: 0.65, transform: 'perspective(900px) rotateX(-8deg) translateY(8px)' },
         { opacity: 1, transform: 'perspective(900px) rotateX(0deg) translateY(0)' }],
        { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
    } else {
      rmAnim = object.animate(
        [{ opacity: 0.65, transform: 'translateY(8px) rotate(-.5deg)' },
         { opacity: 1, transform: 'translateY(0) rotate(0deg)' }],
        { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
    }
  }
  if (focus && remixPanel.open) stageHeading().focus();
};

const CLUE_PURPOSE = {
  dog: 'Let the dog nudge them towards the note on the table.',
  postcard: 'Point them towards the dog, their very good guide.',
  memory: 'A memory or an inside joke, just for stopping to look.',
} as const;

const selectRemixClue = (kind: 'dog' | 'postcard' | 'memory', focus = false) => {
  if (composerBusy()) return;
  remixClue = kind;
  ($('#rmCluePurpose') as HTMLElement).textContent = CLUE_PURPOSE[kind];
  rmForm.querySelectorAll<HTMLElement>('[data-rm-clue-panel]').forEach((p) => {
    p.hidden = p.dataset.rmCluePanel !== kind;
  });
  rmForm.querySelectorAll<HTMLElement>('[data-rm-clue]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.rmClue === kind));
  });
  if (focus) {
    const field = { dog: '#rmDog', postcard: '#rmPostcard', memory: '#rmMemory' }[kind];
    ($(field) as HTMLElement).focus();
  }
};

const openRemix = () => {
  if (!ROOM.allowRemix || isPreview || linkMode !== 'demo' || remixPanel.open) return;
  const ae = document.activeElement as HTMLElement | null;
  // ?make=1 opens from the cover with no trigger — body counts as no opener
  remixOpener = ae && ae !== document.body && ae !== document.documentElement ? ae : null;
  remixReturn = !paperNote.hidden ? 'paper' : !note.hidden ? 'note' : 'text';
  note.hidden = true;
  paperNote.hidden = true;
  /* the last draft keeps its edits; a fresh one gets neutral starters with a
     blank invitation — nothing of the canonical gift is copied across */
  const base = lastDraft ?? { ...makeDraft(), invitation: '' };
  ($('#rmTo') as HTMLInputElement).value = base.to;
  ($('#rmFrom') as HTMLInputElement).value = base.from;
  ($('#rmDog') as HTMLTextAreaElement).value = base.dog;
  ($('#rmPostcard') as HTMLTextAreaElement).value = base.postcard;
  ($('#rmMemory') as HTMLTextAreaElement).value = base.memory;
  ($('#rmInvite') as HTMLTextAreaElement).value = base.invitation;
  app.classList.add('is-composing');
  remixPanel.hidden = false;
  remixPanel.showModal();
  fitComposerViewport();
  arriveRemix();
  showRemixStep(remixStep);
  selectRemixClue(remixClue);
};
const syncResumeLinks = () => {
  // a draft in memory earns a quiet way back — demo only, never on links
  const show = !!lastDraft && ROOM.allowRemix && !isPreview && linkMode === 'demo';
  for (const id of ['#coverResume', '#helpResume', '#tpResume']) {
    ($(id) as HTMLElement).hidden = !show;
  }
};
for (const id of ['paperRemix', 'remixLink', 'coverResume', 'helpResume', 'tpResume']) {
  ($(`#${id}`) as HTMLElement).addEventListener('click', openRemix);
}

const closeRemix = () => {
  if (composerBusy()) return;
  lastDraft = readDraft(); // unsaved edits survive a leave-without-submit
  cancelComposerFit();
  rmArrival?.cancel();
  rmAnim?.cancel();
  app.classList.remove('is-composing'); // the room wakes before focus returns
  remixPanel.close();
  remixPanel.hidden = true;
  syncResumeLinks();
  // measured after the return view is revealed — a hidden opener has no rect
  const restoreFocus = (fallback: HTMLElement) => {
    const openerVisible = remixOpener && document.contains(remixOpener) && remixOpener.getClientRects().length > 0;
    (openerVisible ? remixOpener! : fallback).focus();
  };
  if (remixReturn === 'paper' && paperState === 'open' && world) {
    paperNote.hidden = false;
    restoreFocus(paperNote);
  } else if (remixReturn === 'note') {
    note.hidden = false;
    restoreFocus(note);
  } else if (returnToText || !textpath.hidden) {
    textpath.hidden = false;
    restoreFocus($('#tpDog') as HTMLElement);
  } else if (!hud.hidden) {
    restoreFocus($('#help') as HTMLElement);
  } else {
    const resume = $('#coverResume') as HTMLElement;
    restoreFocus(!resume.hidden ? resume : ($('#enter') as HTMLElement));
  }
  remixOpener = null;
  remixReturn = null;
};
$('#remixCancel').addEventListener('click', closeRemix);
remixPanel.addEventListener('cancel', (e) => {
  e.preventDefault(); // Escape must never drop the draft or interrupt a create
  if (!composerBusy()) closeRemix();
});
rmForm.querySelectorAll<HTMLElement>('[data-rm-step]').forEach((b) => {
  b.addEventListener('click', () => showRemixStep(Number(b.dataset.rmStep)));
});
rmForm.querySelectorAll<HTMLElement>('[data-rm-clue]').forEach((b) => {
  b.addEventListener('click', () => selectRemixClue(b.dataset.rmClue as 'dog' | 'postcard' | 'memory'));
});
/* the primary route never visits Clues: envelope → letter → gift;
   Clues is an optional detour out of — and straight back to — the gift */
const nextRemixStep = () => (remixStep === 0 ? 1 : 3);
const previousRemixStep = () => (remixStep === 1 ? 0 : remixStep === 2 ? 3 : 1);
$('#rmNext').addEventListener('click', () => showRemixStep(nextRemixStep()));
$('#rmPrev').addEventListener('click', () => showRemixStep(previousRemixStep()));

/* a first line, borrowed only while it stays untouched — typing is sacred */
rmForm.querySelectorAll<HTMLElement>('[data-rm-starter]').forEach((b) => {
  b.addEventListener('click', () => {
    if (composerBusy()) return;
    const field = $('#rmInvite') as HTMLTextAreaElement;
    const untouched = !!selectedOpening && field.value.trim() === selectedOpening.trim();
    if (!(field.value.trim() === '' || untouched)) return; // never overwrite their words
    const key = b.dataset.rmStarter as keyof typeof LETTER_OPENINGS | 'own';
    const status = $('#rmLinkStatus') as HTMLElement;
    status.textContent = '';
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-errormessage');
    if (key === 'own') {
      if (untouched) field.value = '';
      selectedOpening = null;
      syncRemixReview();
      field.focus();
      return;
    }
    field.value = LETTER_OPENINGS[key];
    selectedOpening = field.value;
    syncRemixReview();
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });
});
// Enter in a single-line name field moves one stage on — the first submit
// button may be disabled, so implicit submission can't be relied on
rmForm.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229 || e.shiftKey
    || e.ctrlKey || e.altKey || e.metaKey
    || !(e.target instanceof HTMLInputElement) || remixStep === 3) return;
  e.preventDefault();
  if (!composerBusy()) showRemixStep(nextRemixStep());
});
for (const id of ['#rmTo', '#rmFrom', '#rmInvite', '#rmDog', '#rmPostcard', '#rmMemory']) {
  ($(id) as HTMLElement).addEventListener('input', (e) => {
    if (composerBusy()) return;
    const field = e.target as HTMLElement;
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-errormessage');
    // editing again after a message clears it — draft content is kept
    ($('#rmLinkStatus') as HTMLElement).textContent = '';
    syncRemixReview();
  });
}

/* ---------- recipient preview: the draft opens in an isolated frame ---------- */
let previewSheet: HTMLElement | null = null;
let previewFrame: HTMLIFrameElement | null = null;
let previewBack: HTMLButtonElement | null = null;
let previewOpener: HTMLElement | null = null;

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
  cancelComposerFit();
  rmArrival?.cancel();
  rmAnim?.cancel();
  app.classList.remove('is-composing');
  remixPanel.close(); // an open modal would sit above the full-window frame
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
  // the form kept every field — nothing was applied; return to the same stage
  app.classList.add('is-composing');
  remixPanel.hidden = false;
  remixPanel.showModal();
  fitComposerViewport();
  arriveRemix();
  showRemixStep(remixStep, false);
  (previewOpener && document.contains(previewOpener) && previewOpener.getClientRects().length
    ? previewOpener
    : stageHeading()
  ).focus();
  previewOpener = null;
};

rmForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (composerBusy()) return;
  // navigation never validates or loses values — only an explicit action on
  // the Review stage may preview or publish
  if (remixStep !== 3) {
    showRemixStep(nextRemixStep());
    return;
  }
  const draft = readDraft();
  const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
  const status = $('#rmLinkStatus') as HTMLElement;
  const problem = remixProblem(draft);
  if (problem) {
    // the relabelled primary is a gentle guide when something's simply
    // missing — jump and focus without red ink; real errors still mark it
    const guided = submitter?.id === 'rmCreate' && problem.missing;
    status.textContent = guided ? '' : problem.say;
    showRemixStep(problem.stage, false);
    if (problem.clue) selectRemixClue(problem.clue);
    const field = $(problem.field) as HTMLElement;
    if (guided) {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-errormessage');
    } else {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-errormessage', 'rmLinkStatus');
    }
    field.focus();
    return;
  }
  if (!validateEdition(draft)) {
    status.textContent = 'Check the names, message and clue lengths before continuing.';
    return;
  }
  lastDraft = draft; // memory only — the parent's room is never replaced
  if (submitter?.id === 'rmCreate') void createRecipientLink(draft);
  else if (submitter?.id === 'rmSubmit') openPreview();
});

/* ---------- entry: paper lifts only when the room is really there ---------- */
const enter = async () => {
  if (loading || world) return;
  loading = true;
  abortCtl = new AbortController();
  const ctl = abortCtl;
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
    const res = await fetch('./world.json', { signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    config = await res.json();
    if (!config.rad || !config.collider) throw new Error('schema');
  } catch {
    if (ctl.signal.aborted) return; // user already chose the photo route
    bail('The 3D room did not finish opening. You can still discover your gift in these photos.');
    return;
  }

  const host = $('#world');
  host.hidden = false;
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
        clearContextHint(); // return navigation survives; the prompt does not
      },
      onMove: clearContextHint,
    }, ctl.signal);
  } catch {
    host.hidden = true;
    if (ctl.signal.aborted) return; // user already chose the text path
    bail('The 3D room did not finish opening. You can still discover your gift in these photos.');
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
  /* the canonical gift stays inert until a trusted edition lands — a preview
     inside a saved-link page (or a standalone preview tab) fails closed */
  app.setAttribute('inert', '');
  const waiting = document.createElement('p');
  waiting.className = 'preview-wait';
  waiting.setAttribute('role', 'status');
  waiting.textContent = 'Opening your gift…';
  document.body.appendChild(waiting);
  const unavailable = (() => {
    waiting.remove();
    const panel = document.createElement('section');
    panel.className = 'note paper-note delivery-panel';
    panel.id = 'deliveryPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'deliveryHeading');
    panel.tabIndex = -1;
    const kicker = document.createElement('h2');
    kicker.className = 'note-kicker';
    kicker.id = 'deliveryHeading';
    kicker.textContent = 'Your gift';
    const msg = document.createElement('p');
    msg.className = 'delivery-status';
    msg.textContent = 'This gift link is unavailable or has been closed. Ask the giver for another link.';
    const row = document.createElement('div');
    row.className = 'row';
    const make = document.createElement('a');
    make.className = 'link';
    make.href = '?make=1';
    make.textContent = 'Make a gift';
    row.append(make);
    panel.append(kicker, msg, row);
    document.body.appendChild(panel);
    panel.focus();
  });
  if (linkMode !== 'demo' || window.frameElement === null) {
    unavailable();
  } else {
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || e.origin !== location.origin) return;
      const d = e.data as { type?: string; edition?: unknown };
      if (d?.type !== 'gift-edition') return;
      const ed = validateEdition(d.edition);
      if (!ed) return;
      edition = ed;
      /* the folded cover is signed for this recipient before they step inside */
      const card = coverFrame.querySelector('.paper-card') as HTMLElement;
      card.textContent = `For ${edition.to}, from ${edition.from}`;
      card.removeAttribute('aria-hidden');
      waiting.remove();
      app.removeAttribute('inert');
    });
    window.parent.postMessage('gift-preview-ready', location.origin);
  }
}

enterBtn.addEventListener('click', enter);
submitLabel();
if (linkMode === 'demo' && !isPreview) {
  // an interrupted create left its draft+key in this tab — reopen the editor
  const pending = restorePendingDraft();
  if (pending) {
    lastDraft = pending;
    remixStep = 3; // a recovered save is ready for its retry on Review
    openRemix();
  }
}
if (makeNow && ROOM.allowRemix && !isPreview && linkMode === 'demo') openRemix();
// a saved recipient/manage link only ever loads on the real page — a preview
// child must never fetch the link API or undo its own gate
if (!isPreview) void initializeGiftLink(app, (ed) => {
  // a real saved recipient link: apply the fetched edition — nothing else is
  // replaced (the sender's own draft/run stays only in their tab)
  edition = ed;
  const card = coverFrame.querySelector('.paper-card') as HTMLElement;
  card.textContent = `For ${ed.to}, from ${ed.from}`;
  card.removeAttribute('aria-hidden');
});
no3dBtn.addEventListener('click', () => {
  abortCtl?.abort();
  loading = false;
  if (!world) ($('#world') as HTMLElement).hidden = true;
  openTextPath('Choose a part of the room, then look closer at what you find.');
});
