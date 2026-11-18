import type { Target, WorldHandle } from './world';

/**
 * Silent canonical v2. Unmarked photograph under a folded paper corner;
 * the paper lifts into the real room only when splats are visibly there.
 * Every meaningful beat still works without WebGL, from text alone.
 */

const LINES: Record<Target, string> = {
  dog: 'I nap under it. You sit around it.',
  plant: 'Good leaves. I only sniff them.',
  coats: 'Those usually mean a walk. Usually.',
  chair: 'A seat for you. Whoever’s keeping watch prefers the floor.',
  tv: 'All those moving pictures. Not one of them smells like anything.',
  shelves: 'So many shelves. All the good things are out of nose reach.',
  door: 'I could wait here for a walk. But tonight we’re staying in.',
  table: '',
};
const TABLE_SLIP = 'A folded slip of paper waits on top.';
const TITLE = 'Someone saved you a seat.';
const INVITATION = 'Dinner for two. You choose the evening. I’ll take care of the rest.';
const HINT_MS = 4_000;
const STATUS_MS = 3_000;

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
      <button class="link" id="no3d" hidden type="button">Continue without 3D</button>
    </div>
    <p class="status" id="status" role="status" aria-live="polite"></p>
  </section>

  <div class="collar-tag" id="collarTag" hidden aria-hidden="true"></div>
  <p class="line" id="line" hidden role="status"></p>
  <p class="hint-bubble" id="hint" hidden>Drag to look. Tap to explore.</p>

  <nav class="hud" id="hud" hidden>
    <div class="row">
      <button class="btn small ghost" id="help">Help</button>
    </div>
    <div class="steps" role="group" aria-label="Walk controls">
      <button id="back" aria-label="Walk backward">‹</button>
      <button id="fwd" aria-label="Walk forward">›</button>
    </div>
  </nav>

  <section class="help" id="helpPanel" hidden aria-label="Help" tabindex="-1">
    <p class="help-title">A little help</p>
    <p class="hint">Drag or swipe to look around. WASD or arrow keys walk. The photograph you arrived on is still yours to keep.</p>
    <div class="row">
      <button class="btn small" id="reset">Reset view</button>
      <button class="btn small" id="nudge">A nudge</button>
      <button class="btn small" id="motionless">Explore without motion</button>
      <button class="btn small ghost" id="directOpen">Open the note</button>
      <button class="link" id="closeHelp">Back</button>
    </div>
  </section>

  <section class="note" id="note" hidden aria-label="Your gift" tabindex="-1">
    <p class="note-kicker" id="noteTitle"></p>
    <blockquote><p id="noteBody"></p></blockquote>
    <div class="row">
      <button class="btn" id="keep">Keep exploring</button>
      <button class="link" id="replay">Start again</button>
    </div>
  </section>

  <section class="textpath" id="textpath" hidden aria-label="Explore without 3D" tabindex="-1">
    <p class="help-title" id="tpTitle"></p>
    <p class="hint" id="tpClue" hidden></p>
    <p class="hint" id="tpInfo"></p>
    <div class="row">
      <button class="btn small" id="tpDog">Ask the dog</button>
      <button class="btn small" data-tp="plant">The plant</button>
      <button class="btn small" data-tp="coats">The coats</button>
      <button class="btn small" data-tp="chair">The chairs</button>
      <button class="btn small" data-tp="shelves">The shelves</button>
      <button class="btn small" data-tp="tv">The screen</button>
      <button class="btn small" data-tp="door">The door</button>
      <button class="btn small" data-tp="table">The table</button>
      <button class="link" id="tpOpen">Open the note</button>
    </div>
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

const overlayOpen = () =>
  !note.hidden || !helpPanel.hidden || !textpath.hidden;

/* ---------- one-shot nudge: collar tag, swings once, gone ---------- */
const hideCollar = () => {
  collarTag.hidden = true;
};
const showCollar = () => {
  if (!world || opened || overlayOpen() || !collarTag.hidden) return false;
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

const onTap = (t: Target | null, x: number, y: number) => {
  ripple(x, y, !!t);
  if (t) {
    misses = 0;
    onInspect(t);
    return;
  }
  hideCaption();
  hideCollar();
  misses++;
  if (misses >= 2 && !dogMet && !opened && !autoNudged) {
    autoNudged = true;
    if (!showCollar()) setStatus('A collar tag catches the light nearby.');
  }
};

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
  if (t === 'table') {
    hideCaption();
    setStatus(TABLE_SLIP);
    noteTitle.textContent = 'A folded slip of paper';
    noteBody.textContent = 'Unfold it?';
    $('#keep').textContent = 'Unfold the note';
    (note.querySelector('#replay') as HTMLElement).textContent = 'Not yet';
    note.dataset.stage = 'slip';
    note.hidden = false;
    note.focus();
    return;
  }
  if (t === 'dog') dogMet = true;
  showCaption(t, LINES[t]);
  setStatus(''); // the caption is the line — no duplicate status
};

/* ---------- the note ---------- */
const openGift = () => {
  opened = true;
  hideCollar();
  hideCaption();
  helpPanel.hidden = true;
  noteTitle.textContent = TITLE;
  noteBody.textContent = `“${INVITATION}”`;
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
  if (!hud.hidden) $('#help').focus();
  else if (!textpath.hidden) ($('#tpDog') as HTMLElement).focus();
});
$('#replay').addEventListener('click', () => {
  if (note.dataset.stage === 'slip') {
    note.hidden = true;
    return;
  }
  note.hidden = true;
  helpPanel.hidden = true;
  opened = false;
  autoNudged = false;
  dogMet = false;
  misses = 0;
  hideCaption();
  world?.reset();
  setStatus('');
  if (!hud.hidden) $('#help').focus();
  else if (!textpath.hidden) ($('#tpDog') as HTMLElement).focus();
  else enterBtn.focus();
});

/* ---------- help ---------- */
$('#help').addEventListener('click', () => {
  helpPanel.hidden = false;
  helpPanel.focus();
});
$('#closeHelp').addEventListener('click', () => {
  helpPanel.hidden = true;
  $('#help').focus();
});
$('#nudge').addEventListener('click', () => {
  helpPanel.hidden = true;
  showCollar();
  setStatus('Something small catches your eye.');
});
$('#motionless').addEventListener('click', () => {
  helpPanel.hidden = true;
  openTextPath('Here’s the hunt without moving through the room.');
});
$('#directOpen').addEventListener('click', openGift);
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
}
const textPath = (why: string) => {
  openTextPath(why + ' The hunt still works from here.');
  enterBtn.disabled = false;
  enterBtn.textContent = 'Step inside';
  loading = false;
};
$('#tpDog').addEventListener('click', () => {
  tpClue.hidden = false;
  tpClue.textContent = LINES.dog;
});
textpath.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-tp]') as HTMLElement | null;
  if (!b) return;
  const t = b.dataset.tp as Target;
  if (t === 'table') {
    tpInfo.textContent = TABLE_SLIP;
    noteTitle.textContent = 'A folded slip of paper';
    noteBody.textContent = 'Unfold it?';
    note.dataset.stage = 'slip';
    $('#keep').textContent = 'Unfold the note';
    (note.querySelector('#replay') as HTMLElement).textContent = 'Not yet';
    note.hidden = false;
    note.focus();
  } else {
    tpInfo.textContent = LINES[t];
  }
});
$('#tpOpen').addEventListener('click', openGift);

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
    no3dBtn.hidden = true;
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
      onInspect,
      onTap,
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
  no3dBtn.hidden = true;
  hud.hidden = false;
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

enterBtn.addEventListener('click', enter);
no3dBtn.addEventListener('click', () => {
  abortCtl?.abort();
  no3dBtn.hidden = true;
  openTextPath('Here’s the hunt without moving through the room.');
});
