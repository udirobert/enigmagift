/* Personal-photo gift hunts — creator, recipient player host and private
   management view. Routed to by entry.ts for ?photo=1 (and ?make=1 without
   a legacy fragment). Five small views, no checklist; the giver's photo is
   the centre of every screen. */

import {
  type PhotoDraft, emptyPhotoDraft, normalizePhotoEdition, photoFingerprint, PHOTO_LIMITS,
} from './photo-edition';
import { preparePhoto, photoAcceptAttr, MAX_ORIGINAL } from './photo-image';
import {
  saveDraftSoon, flushDraft, loadDraft, clearDraft,
  storageDenied, loadWasCorrupt, onStorageFailure,
} from './photo-storage';
import {
  PhotoLinkError, createPhotoGift, getManageView, revokePhotoGift, getPublicGift,
  getSavedPhoto, publicImageUrl, recipientPhotoUrl, managementPhotoUrl, newManageKey,
  GIFT_TOKEN_RE, MANAGE_KEY_RE, type ManageView,
} from './photo-links';
import { mountPhotoPlayer } from './photo-player';
import { createPaperMotion } from './paper-motion';

const app = document.getElementById('app') as HTMLElement;
app.className = 'ph-app';

const fragParams = new URLSearchParams(location.hash.slice(1));
const hasManage = fragParams.has('manage');
const hasGift = fragParams.has('gift');
const manageKey = fragParams.get('manage') ?? '';
const giftToken = fragParams.get('gift') ?? '';

/* ---------- shell: one warm frame that follows the visual viewport ---------- */
app.innerHTML = `
  <header class="ph-header">
    <p class="letter-brand">EnigmaGift</p>
    <div class="ph-header-actions"><button class="link" id="phBack" type="button" hidden>Back</button><button class="link" id="phJump" type="button" hidden>Your gift</button></div>
  </header>
  <div class="ph-viewport" id="phViewport"><div class="ph-stage" id="phStage"></div></div>
  <p class="ph-status" id="phStatus" role="status" aria-live="polite"></p>
  <footer class="ph-footer" id="phFooter">
    <button class="link" id="phSecondary" type="button" hidden></button>
    <button class="btn small" id="phPrimary" type="button" hidden></button>
    <p class="ph-footnote" id="phFootnote"></p>
  </footer>`;

const $ = <T extends HTMLElement>(sel: string) => app.querySelector(sel) as T;
const stage = $('#phStage');
const pane = $('#phViewport');
const statusEl = $('#phStatus');
const footnoteEl = $('#phFootnote');
const say = (text: string) => { statusEl.textContent = text; };
const appMotion = createPaperMotion(app);

let footnoteDefault = 'Free to make. Share by link.';
const setFootnote = () => {
  if (storageDenied()) {
    footnoteEl.textContent = draft.copiedFromSaved && draft.step === 'review'
      ? 'Draft stays in this tab. Saving makes a new link.'
      : 'Draft stays in this tab.';
    footnoteEl.classList.add('ph-storage-note');
  } else {
    footnoteEl.textContent = footnoteDefault;
    footnoteEl.classList.remove('ph-storage-note');
  }
};
/* registered before boot so a denied/blocked open reports honestly */
onStorageFailure(setFootnote);

/* the whole shell tracks the visual viewport so the footer actions stay
   above a phone keyboard or inside a panned pinch-zoom; a resize/focus
   also scrolls the inner pane so the focused field is reachable */
let fitRaf = 0;
let revealField = false;
const fitShell = (reveal = false) => {
  const v = window.visualViewport;
  const w = v?.width ?? window.innerWidth;
  const h = v?.height ?? window.innerHeight;
  app.style.setProperty('--ph-vp-width', `${w}px`);
  app.style.setProperty('--ph-vp-height', `${h}px`);
  app.style.setProperty('--ph-vp-x', `${(v?.offsetLeft ?? 0) + w / 2}px`);
  app.style.setProperty('--ph-vp-y', `${(v?.offsetTop ?? 0) + h / 2}px`);
  app.classList.toggle('is-compact', h < 560);
  app.classList.toggle('is-narrow', w < 320);
  if (!reveal) return;
  const field = document.activeElement;
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    || !pane.contains(field) || !field.getClientRects().length) return;
  const box = pane.getBoundingClientRect();
  const rect = field.getBoundingClientRect();
  const fieldTop = rect.top - box.top + pane.scrollTop;
  const fieldBottom = fieldTop + rect.height;
  const start = pane.scrollTop + 4;
  const end = pane.scrollTop + pane.clientHeight - 4;
  if (rect.height > pane.clientHeight - 8) {
    if (fieldTop < start || fieldTop > end) pane.scrollTop = Math.max(0, fieldTop - 4);
  } else if (fieldTop < start) {
    pane.scrollTop = Math.max(0, fieldTop - 4);
  } else if (fieldBottom > end) {
    pane.scrollTop = fieldBottom - pane.clientHeight + 4;
  }
};
const scheduleFit = (reveal = false) => {
  revealField ||= reveal;
  if (fitRaf) return;
  fitRaf = requestAnimationFrame(() => {
    fitRaf = 0;
    const r = revealField;
    revealField = false;
    fitShell(r);
  });
};
window.visualViewport?.addEventListener('resize', () => scheduleFit(true));
window.visualViewport?.addEventListener('scroll', () => scheduleFit(false));
window.addEventListener('resize', () => scheduleFit(true));
app.addEventListener('focusin', () => scheduleFit(true));
fitShell();

/* ---------- shared draft ---------- */
let draft: PhotoDraft = emptyPhotoDraft();
let photoObjectUrl: string | null = null;
const photoUrl = () => {
  if (!draft.photo) return null;
  if (!photoObjectUrl) photoObjectUrl = URL.createObjectURL(draft.photo);
  return photoObjectUrl;
};
const releasePhotoUrl = () => {
  if (photoObjectUrl) { URL.revokeObjectURL(photoObjectUrl); photoObjectUrl = null; }
};

const touch = () => saveDraftSoon(draft); // durable copy; Blob included

let saving = false;
let preparing = false;
const freeze = (on: boolean) => {
  saving = on;
  app.querySelectorAll('button, input, textarea').forEach((el) => {
    (el as HTMLButtonElement).disabled = on;
  });
};

/* ---------- recipient + management bootstrap ---------- */
const staticNotice = (title: string, line: string) => {
  appMotion.settle();
  stage.innerHTML = '';
  const h = document.createElement('h2');
  h.tabIndex = -1;
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'ph-intro';
  p.textContent = line;
  stage.append(h, p);
  say('');
  $('#phFooter').hidden = true;
  $('#phBack').hidden = true;
  $('#phJump').hidden = true;
  h.focus();
};

/* a notice plus a retry control — for transient failures that a refresh
   would fix, unlike a dead link */
const retryNotice = (title: string, line: string, retry: () => void) => {
  appMotion.settle();
  stage.innerHTML = '';
  say('');
  const h = document.createElement('h2');
  h.tabIndex = -1;
  h.textContent = title;
  const p = document.createElement('p');
  p.className = 'ph-intro';
  p.textContent = line;
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'btn small';
  again.textContent = 'Try again';
  again.onclick = retry;
  stage.append(h, p, again);
  $('#phFooter').hidden = true;
  $('#phBack').hidden = true;
  $('#phJump').hidden = true;
  h.focus();
};

const anotherGift = () => {
  const a = document.createElement('a');
  a.className = 'link';
  a.href = '?photo=1';
  a.textContent = 'Make another gift';
  return a;
};

/* copy fallback: select the readonly input so the link is one keystroke away */
const copyOrSelect = async (input: HTMLInputElement, okText: string) => {
  try {
    await navigator.clipboard.writeText(input.value);
    say(okText);
  } catch {
    input.focus();
    input.select();
    say('Copy did not work — the link is selected for you.');
  }
};

const STEPS: PhotoDraft['step'][] = ['photo', 'hide', 'clue', 'note', 'review'];
let playerCleanup: (() => void) | null = null;

/* renders are synchronous; motion is layered on top after the new step is
   already in its final, focused state — cancelling it changes nothing */
let lastRenderedStep: PhotoDraft['step'] | null = null;
const seenSteps = new Set<PhotoDraft['step']>();

function renderStep(focus = true) {
  appMotion.settle();
  /* the photo the giver last saw — captured before the stage clears so the
     readonly clue/review copy can travel from it (FLIP). Pane bounds are
     read per call — the new step's footer can change them. */
  const inside = (r: DOMRect) => {
    const pb = pane.getBoundingClientRect();
    return r.width > 0 && r.height > 0
      && r.top >= pb.top && r.bottom <= pb.bottom
      && r.left >= pb.left && r.right <= pb.right;
  };
  const oldImg = stage.querySelector<HTMLImageElement>(
    ':scope > .ph-photo-wrap > .ph-photo, :scope > .ph-thumb',
  );
  const oldRect = oldImg && oldImg.complete && oldImg.naturalWidth > 0
    ? oldImg.getBoundingClientRect() : null;
  const oldShot = oldImg && oldRect && inside(oldRect)
    ? { src: oldImg.src, rect: oldRect } : null;

  renderStepContent(focus);

  const step = draft.step;
  const changed = lastRenderedStep !== step;
  const repeat = seenSteps.has(step);
  lastRenderedStep = step;
  seenSteps.add(step);

  /* reserve the true ratio while the image decodes */
  stage.querySelectorAll<HTMLImageElement>('.ph-photo').forEach((img) => {
    if (draft.photoWidth > 0 && draft.photoHeight > 0) {
      img.width = draft.photoWidth;
      img.height = draft.photoHeight;
    }
  });
  if (!changed) return;

  const newImg = stage.querySelector<HTMLImageElement>(
    ':scope > .ph-photo-wrap > .ph-photo',
  );
  const newWrap = newImg?.closest<HTMLElement>('.ph-photo-wrap') ?? null;
  if ((step === 'clue' || step === 'review') && oldShot && newImg && newWrap
    && newImg.src === oldShot.src) {
    const nr = newImg.getBoundingClientRect();
    if (inside(nr)) {
      const dx = oldShot.rect.left - nr.left;
      const dy = oldShot.rect.top - nr.top;
      const sx = oldShot.rect.width / nr.width;
      const sy = oldShot.rect.height / nr.height;
      newWrap.style.transformOrigin = '0 0';
      newWrap.style.pointerEvents = 'none';
      const dur = repeat ? 140 : 220;
      appMotion.play(newWrap, [
        { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transform: 'none' },
      ], { duration: dur });
      const mk = newWrap.querySelector<HTMLElement>('.ph-marker');
      if (mk) {
        mk.style.transformOrigin = '50% 50%';
        appMotion.play(mk, [
          { transform: `translate(-50%, -50%) scale(${1 / sx}, ${1 / sy})` },
          { transform: 'translate(-50%, -50%) scale(1)' },
        ], { duration: dur });
      }
    }
  } else if (step === 'hide' && newImg) {
    appMotion.play(newImg, [{ opacity: 0.85 }, { opacity: 1 }], { duration: 160 });
  }
  if (step === 'note') {
    const paper = stage.querySelector<HTMLElement>('.ph-paper');
    if (paper) {
      paper.style.transformOrigin = '50% 0';
      appMotion.play(paper, repeat
        ? [{ transform: 'translateY(2px)' }, { transform: 'none' }]
        : [{ opacity: 0.9, transform: 'perspective(900px) rotateX(-2deg) translateY(5px)' },
           { opacity: 1, transform: 'none' }],
        { duration: repeat ? 120 : 200 });
    }
  } else if (step === 'review') {
    const letter = stage.querySelector<HTMLElement>('.ph-review-letter');
    if (letter) {
      appMotion.play(letter, [
        { opacity: 0.9, transform: 'translateY(3px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 140 });
    }
  }
}

function renderStepContent(focus = true) {
  playerCleanup?.(); playerCleanup = null;
  stage.innerHTML = '';
  say('');
  const step = draft.step;
  app.dataset.step = step;
  app.dataset.hasPhoto = String(!!draft.photo);
  const back = $('#phBack');
  back.hidden = step === 'photo';
  back.textContent = 'Back';
  back.onclick = () => {
    draft.step = STEPS[Math.max(0, STEPS.indexOf(step) - 1)];
    touch(); renderStep();
  };
  const jump = $('#phJump');
  const canReview = !!draft.photo && !!draft.hidingSpot;
  jump.hidden = step === 'review' || !canReview;
  jump.onclick = () => { draft.step = 'review'; touch(); renderStep(); };
  $('#phFooter').hidden = false;
  const secondary = $('#phSecondary');
  const primary = $('#phPrimary');
  secondary.hidden = true;
  primary.hidden = false;
  primary.onclick = null;
  footnoteDefault = 'Free to make. Share by link.';
  footnoteEl.classList.remove('ph-copy-note');
  setFootnote();

  const h = document.createElement('h2');
  h.tabIndex = -1;
  stage.appendChild(h);

  if (step === 'photo') {
    h.textContent = draft.photo ? 'Your place.' : 'A place. A little secret.';
    const intro = document.createElement('p');
    intro.className = 'ph-intro';
    intro.textContent = draft.photo
      ? 'One photo is enough — it stays on your device until you create a link.'
      : 'Choose a photo of a place they know.';
    stage.appendChild(intro);
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = photoAcceptAttr;
    file.id = 'phFile';
    file.hidden = true;
    if (draft.photo) {
      const img = document.createElement('img');
      img.className = 'ph-thumb';
      img.alt = 'Your chosen photo';
      img.src = photoUrl()!;
      stage.appendChild(img);
      const swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'link';
      swap.textContent = 'Change photo';
      swap.onclick = () => file.click();
      stage.appendChild(swap);
      primary.textContent = 'Choose a hiding spot';
      primary.onclick = () => { draft.step = 'hide'; touch(); renderStep(); };
    } else {
      /* the gift itself is the first thing they see, not a blank form */
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'ph-photo-choice';
      choice.setAttribute('aria-label', 'Choose a photo for your gift');
      choice.innerHTML = '<span class="ph-photo-space" aria-hidden="true"><span class="ph-empty-caption">Your place</span><span class="ph-folded-note"></span></span><span class="ph-photo-caption">A little surprise belongs here.</span>';
      choice.onclick = () => file.click();
      stage.appendChild(choice);
      primary.textContent = 'Use your photo';
      primary.onclick = () => file.click();
    }
    stage.appendChild(file);
    file.onchange = async () => {
      const chosen = file.files?.[0];
      file.value = '';
      if (!chosen || preparing) return;
      preparing = true;
      freeze(true);
      try {
        say('Preparing your photo…');
        const prepared = await preparePhoto(chosen);
        if (typeof prepared === 'string') {
          renderStep(false);
          say(prepared === 'too_large'
            ? `That file is too large — photos up to ${Math.round(MAX_ORIGINAL / 1024 / 1024)} MB work.`
            : 'That file did not open as a photo — JPEG, PNG and WebP work here.');
          return; // the previous draft stays untouched
        }
        releasePhotoUrl();
        draft.photo = prepared.blob;
        draft.photoWidth = prepared.width;
        draft.photoHeight = prepared.height;
        draft.hidingSpot = null; // a new photo always wants a new hiding place
        const keptClue = draft.clue;
        touch();
        renderStep(false);
        if (keptClue) say('Your clue stayed — check it still fits the new photo.');
      } finally {
        preparing = false;
        freeze(false);
      }
    };
    secondary.hidden = false;
    secondary.textContent = 'Try the sample room';
    secondary.onclick = () => { location.href = '?make=1&sample=1'; };
  } else if (step === 'hide') {
    h.textContent = 'Where will they find the note?';
    const intro = document.createElement('p');
    intro.className = 'ph-intro';
    intro.textContent = 'Tap where you’d like them to find the note.';
    stage.appendChild(intro);
    const wrap = document.createElement('div');
    wrap.className = 'ph-photo-wrap ph-place';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'application');
    wrap.setAttribute('aria-label',
      'Hiding place on the photo — arrow keys move the note, Shift for larger steps');
    const img = document.createElement('img');
    img.className = 'ph-photo';
    img.alt = 'Your photo';
    img.draggable = false;
    img.src = photoUrl()!;
    const mark = document.createElement('span');
    mark.className = 'ph-marker';
    mark.setAttribute('aria-hidden', 'true');
    mark.hidden = !draft.hidingSpot;
    wrap.append(img, mark);
    stage.appendChild(wrap);
    const place = (x: number, y: number) => {
      /* the draft and style land first; the marker's travel is decorative —
         the gesture that started it already settled any earlier move */
      const prev = mark.hidden ? null : mark.getBoundingClientRect();
      appMotion.settle(); // programmatic moves (assistive clicks) skip gesture settles
      draft.hidingSpot = {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
      mark.hidden = false;
      mark.style.left = `${draft.hidingSpot.x * 100}%`;
      mark.style.top = `${draft.hidingSpot.y * 100}%`;
      say('');
      touch();
      const next = mark.getBoundingClientRect();
      if (prev && prev.width && next.width) {
        const dx = prev.left - next.left;
        const dy = prev.top - next.top;
        appMotion.play(mark, [
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(-3deg) scale(.96)` },
          { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)' },
        ], { duration: 160 });
      } else {
        appMotion.play(mark, [
          { transform: 'translate(calc(-50% + 0px), calc(-50% + -3px)) rotate(-3deg) scale(.92)' },
          { transform: 'translate(-50%, -50%) rotate(0deg) scale(1)' },
        ], { duration: 220 });
      }
    };
    if (draft.hidingSpot) {
      mark.style.left = `${draft.hidingSpot.x * 100}%`;
      mark.style.top = `${draft.hidingSpot.y * 100}%`;
    }
    let down: { x: number; y: number } | null = null;
    wrap.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
    });
    wrap.addEventListener('pointercancel', () => { down = null; });
    wrap.addEventListener('pointerup', (e) => {
      if (!down || !e.isPrimary) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 7) return; // a scroll gesture never moves the note
      const box = img.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const px = e.clientX - box.left;
      const py = e.clientY - box.top;
      if (px < 0 || py < 0 || px > box.width || py > box.height) return;
      place(px / box.width, py / box.height);
    });
    wrap.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.10 : 0.02;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      const cur = draft.hidingSpot ?? { x: 0.5, y: 0.5 };
      place(cur.x + d[0], cur.y + d[1]);
    });
    secondary.hidden = false;
    secondary.textContent = 'Centre the note';
    secondary.onclick = () => place(0.5, 0.5);
    primary.textContent = 'Hide here';
    primary.onclick = () => {
      if (!draft.hidingSpot) { say('Tap a spot, or choose the centre.'); return; }
      draft.step = 'clue'; touch(); renderStep();
    };
  } else if (step === 'clue') {
    h.textContent = 'Leave them a little clue.';
    const intro = document.createElement('p');
    intro.className = 'ph-intro';
    intro.textContent = 'A nudge toward the spot you chose.';
    stage.appendChild(intro);
    /* the actual photo with the chosen marker, so the clue matches the spot */
    if (draft.photo && draft.hidingSpot) {
      const ctx = document.createElement('div');
      ctx.className = 'ph-photo-wrap ph-context';
      ctx.style.setProperty('--photo-ratio',
        String(draft.photoWidth > 0 && draft.photoHeight > 0 ? draft.photoWidth / draft.photoHeight : 1.5));
      const cImg = document.createElement('img');
      cImg.className = 'ph-photo';
      cImg.alt = 'Your photo with the hiding place';
      cImg.draggable = false;
      cImg.src = photoUrl()!;
      const cMark = document.createElement('span');
      cMark.className = 'ph-marker';
      cMark.setAttribute('aria-hidden', 'true');
      cMark.style.left = `${draft.hidingSpot.x * 100}%`;
      cMark.style.top = `${draft.hidingSpot.y * 100}%`;
      ctx.append(cImg, cMark);
      stage.appendChild(ctx);
    }
    const label = document.createElement('label');
    label.className = 'ph-field';
    label.textContent = 'Clue';
    const area = document.createElement('textarea');
    area.maxLength = PHOTO_LIMITS.clue;
    area.rows = 3;
    area.placeholder = 'Where our Saturday mornings begin…';
    area.value = draft.clue;
    const count = document.createElement('p');
    count.className = 'ph-count';
    const syncCount = () => {
      count.textContent = `${Math.max(0, PHOTO_LIMITS.clue - area.value.length)} characters left`;
    };
    area.addEventListener('input', () => { draft.clue = area.value; syncCount(); touch(); });
    syncCount();
    label.appendChild(area);
    stage.append(label, count);
    primary.textContent = 'Write the note';
    primary.onclick = () => { draft.clue = area.value; draft.step = 'note'; touch(); renderStep(); };
    secondary.hidden = false;
    secondary.textContent = 'Skip clue';
    secondary.onclick = () => { draft.clue = ''; draft.step = 'note'; touch(); renderStep(); };
  } else if (step === 'note') {
    h.textContent = 'What will they find?';
    const paper = document.createElement('div');
    paper.className = 'ph-paper';
    if (draft.photo) {
      const stamp = document.createElement('img');
      stamp.className = 'ph-stamp';
      stamp.alt = '';
      stamp.src = photoUrl()!;
      paper.appendChild(stamp);
    }
    const toLabel = document.createElement('label');
    toLabel.className = 'ph-field ph-inline';
    toLabel.textContent = 'To';
    const to = document.createElement('input');
    to.maxLength = PHOTO_LIMITS.to;
    to.placeholder = 'Their name';
    to.value = draft.to;
    to.addEventListener('input', () => { draft.to = to.value; touch(); });
    toLabel.appendChild(to);
    const msgLabel = document.createElement('label');
    msgLabel.className = 'ph-field';
    msgLabel.textContent = 'Your note';
    const msg = document.createElement('textarea');
    msg.maxLength = PHOTO_LIMITS.message;
    msg.rows = 6;
    msg.placeholder = 'A plan, a memory, a reason they matter…';
    msg.value = draft.message;
    const count = document.createElement('p');
    count.className = 'ph-count';
    const syncCount = () => {
      count.textContent = `${Math.max(0, PHOTO_LIMITS.message - msg.value.length)} characters left`;
    };
    msg.addEventListener('input', () => { draft.message = msg.value; syncCount(); touch(); });
    syncCount();
    msgLabel.appendChild(msg);
    const fromLabel = document.createElement('label');
    fromLabel.className = 'ph-field ph-inline';
    fromLabel.textContent = 'From';
    const from = document.createElement('input');
    from.maxLength = PHOTO_LIMITS.from;
    from.placeholder = 'Your name';
    from.value = draft.from;
    from.addEventListener('input', () => { draft.from = from.value; touch(); });
    fromLabel.appendChild(from);
    paper.append(toLabel, msgLabel, count, fromLabel);
    stage.appendChild(paper);
    primary.textContent = 'Look it over';
    primary.onclick = () => { draft.step = 'review'; touch(); renderStep(); };
  } else {
    /* ---------- review ---------- */
    const problem = reviewProblem();
    h.textContent = problem ? 'Make it yours.' : 'One last look.';
    const intro = document.createElement('p');
    intro.className = 'ph-intro';
    intro.textContent = problem
      ? 'A photo, a hiding place, a name, a note.'
      : 'Your note is hidden here.';
    stage.appendChild(intro);
    const wrap = document.createElement('div');
    wrap.className = 'ph-photo-wrap';
    const img = document.createElement('img');
    img.className = 'ph-photo';
    img.alt = 'Your photo';
    img.draggable = false;
    img.src = photoUrl()!;
    const mark = document.createElement('span');
    mark.className = 'ph-marker';
    mark.setAttribute('aria-hidden', 'true');
    mark.hidden = !draft.hidingSpot;
    if (draft.hidingSpot) {
      mark.style.left = `${draft.hidingSpot.x * 100}%`;
      mark.style.top = `${draft.hidingSpot.y * 100}%`;
    }
    wrap.append(img, mark);
    stage.appendChild(wrap);
    if (draft.to || draft.from || draft.message) {
      const letter = document.createElement('div');
      letter.className = 'ph-paper ph-review-letter';
      const to = document.createElement('p');
      to.className = 'ph-review-to';
      to.textContent = draft.to ? `For ${draft.to}` : 'For someone';
      const m = document.createElement('p');
      m.className = 'ph-review-msg';
      m.textContent = draft.message || '— the note still needs words —';
      const f = document.createElement('p');
      f.className = 'ph-review-from';
      f.textContent = draft.from ? `— ${draft.from}` : '';
      letter.append(to, m, f);
      stage.appendChild(letter);
    }
    const edits = document.createElement('div');
    edits.className = 'ph-edits';
    const mkEdit = (label: string, step: PhotoDraft['step']) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'link';
      b.textContent = label;
      b.onclick = () => { draft.step = step; touch(); renderStep(); };
      edits.appendChild(b);
    };
    mkEdit('Change photo', 'photo');
    mkEdit('Move the note', 'hide');
    mkEdit(draft.clue ? 'Edit clue' : 'Add a clue', 'clue');
    mkEdit('Edit note', 'note');
    const tryBtn = document.createElement('button');
    tryBtn.type = 'button';
    tryBtn.className = 'link';
    tryBtn.textContent = 'See what they see';
    tryBtn.onclick = tryHunt;
    edits.appendChild(tryBtn);
    stage.appendChild(edits);
    primary.textContent = problem
      ? problem.label
      : (draft.copiedFromSaved ? 'Save changes' : 'Create gift link');
    primary.onclick = problem
      ? () => { draft.step = problem.step; touch(); renderStep(); }
      : saveGift;
    if (!problem) {
      footnoteDefault = draft.copiedFromSaved
        ? 'You’ll get a new link. Earlier links stay the same.'
        : 'Creates a link for you to send.';
    }
    footnoteEl.classList.toggle('ph-copy-note', draft.copiedFromSaved === true);
    setFootnote();
  }

  if (focus) h.focus();
}

const reviewProblem = (): { label: string; step: PhotoDraft['step'] } | null => {
  if (!draft.photo) return { label: 'Choose a photo', step: 'photo' };
  if (!draft.hidingSpot) return { label: 'Choose a hiding spot', step: 'hide' };
  if (!draft.to.trim() || !draft.from.trim() || !draft.message.trim()) {
    return { label: 'Finish the note', step: 'note' };
  }
  return null;
};

/* "Try the hunt" runs the real recipient player over the draft — the same
   hit geometry and hints the saved link will use. Nothing is published.
   The header owns the way back so the exit is never buried under a tall photo. */
function tryHunt() {
  appMotion.settle();
  if (!draft.photo || !draft.hidingSpot) { say('The note needs a hiding place first.'); return; }
  const edition = normalizePhotoEdition({
    version: 1,
    to: draft.to || 'someone',
    from: draft.from || 'the giver',
    message: draft.message || '— the note is still being written —',
    clue: draft.clue,
    hidingSpot: draft.hidingSpot,
  });
  if (!edition) { say('Check the names and note lengths first.'); return; }
  stage.innerHTML = '';
  pane.scrollTop = 0;
  $('#phFooter').hidden = true;
  const back = $('#phBack');
  back.hidden = false;
  back.textContent = 'Back to your gift';
  back.onclick = () => { playerCleanup?.(); playerCleanup = null; renderStep(); };
  $('#phJump').hidden = true;
  playerCleanup = mountPhotoPlayer(stage, {
    edition, photoUrl: photoUrl()!, preview: true,
  });
}

/* ---------- create ---------- */
async function saveGift() {
  appMotion.settle();
  if (saving) return;
  const edition = normalizePhotoEdition({
    version: 1, to: draft.to, from: draft.from, message: draft.message,
    clue: draft.clue, hidingSpot: draft.hidingSpot,
  });
  if (!edition || !draft.photo) { say('Check the photo, hiding place, names and note.'); return; }
  freeze(true);
  try {
    const fingerprint = await photoFingerprint(edition, draft.photo);
    if (!draft.pending || draft.pending.fingerprint !== fingerprint) {
      draft.pending = { key: newManageKey(), fingerprint };
      touch();
    }
    await flushDraft(); // pending identity lands before the POST leaves
    const key = draft.pending!.key;
    say('Saving your gift…');
    await createPhotoGift(key, edition, draft.photo);
    /* the private controls live behind the fragment — put it in the URL
       before the durable draft goes away so a refresh can't orphan it */
    let urlHeld = false;
    try {
      history.replaceState(null, '', managementPhotoUrl(key));
      urlHeld = true;
    } catch { /* keep the pending record as the recovery copy */ }
    if (urlHeld) {
      draft.pending = null;
      await clearDraft();
    }
    releasePhotoUrl();
    draft = emptyPhotoDraft();
    await renderManagement(key, undefined, true);
  } catch (e) {
    renderStep(false);
    if (e instanceof PhotoLinkError && e.code === 'edition_already_created') {
      say('That save made a gift already — open it, or make a fresh copy.');
      const row = document.createElement('div');
      row.className = 'ph-resume';
      const open = document.createElement('a');
      open.className = 'btn small';
      open.href = managementPhotoUrl(draft.pending!.key);
      open.textContent = 'See earlier gift';
      const fresh = document.createElement('button');
      fresh.type = 'button';
      fresh.className = 'link';
      fresh.textContent = 'Create a new copy';
      fresh.onclick = () => {
        draft.pending = null; // new identity on the next save, same words
        touch();
        draft.step = 'review';
        renderStep();
      };
      row.append(open, fresh);
      stage.appendChild(row);
    } else if (e instanceof PhotoLinkError && e.code === 'gift_revoked') {
      draft.pending = null; touch();
      say('That earlier link was closed. Choose “Create gift link” again to make a new one.');
    } else if (e instanceof PhotoLinkError && e.status === 429) {
      say('Link limit reached. Please try again later.');
    } else if (e instanceof PhotoLinkError && e.status === 413) {
      say('That photo is too large for a link — try a smaller one.');
    } else {
      say('Your photo and words are still here. Try saving again.');
    }
  } finally {
    freeze(false);
  }
}

/* ---------- management ---------- */
/* the ready screen leads with seeing and editing the gift — sharing sits
   below, private controls stay behind their own <details> */
async function renderManagement(key: string, known?: ManageView, newlySaved = false) {
  playerCleanup?.(); playerCleanup = null;
  appMotion.settle();
  /* after a confirmed save the review paper stays put until the fresh
     management view resolves — nothing vanishes mid-flight */
  if (!newlySaved) {
    stage.innerHTML = '';
    $('#phFooter').hidden = true;
    $('#phBack').hidden = true;
    $('#phJump').hidden = true;
  }
  let view;
  try {
    view = known ?? await getManageView(key);
  } catch (e) {
    if (e instanceof PhotoLinkError && (e.status === 401 || e.status === 404)) {
      staticNotice('Nothing to manage here.', 'This private link does not match a saved gift.');
      return;
    }
    retryNotice('We couldn’t open your gift just now.', 'Try again.',
      () => void renderManagement(key));
    return;
  }
  stage.innerHTML = '';
  $('#phFooter').hidden = true;
  $('#phBack').hidden = true;
  $('#phJump').hidden = true;
  say('');
  const who = document.createElement('p');
  who.className = 'ph-manage-who';
  who.textContent = view.revoked ? '' : `For ${view.edition!.to}`;
  const h = document.createElement('h2');
  h.tabIndex = -1;
  h.textContent = view.revoked ? 'This gift link is closed.' : 'Your gift is ready.';
  if (view.revoked) {
    stage.appendChild(h);
    const p = document.createElement('p');
    p.className = 'ph-intro';
    p.textContent = 'The photo and note were removed when this gift was closed.';
    stage.append(p, anotherGift());
    h.focus();
    return;
  }
  const pub = recipientPhotoUrl(view.recipientToken);
  const priv = managementPhotoUrl(key);
  const intro = document.createElement('p');
  intro.className = 'ph-intro';
  intro.textContent = 'Take a look before you share.';
  /* a small folded note beside the "For" line — always present, animated
     once only when this view follows a confirmed save */
  const glyph = document.createElement('span');
  glyph.className = 'ph-marker ph-ready-note';
  glyph.setAttribute('aria-hidden', 'true');
  who.prepend(glyph);
  stage.append(who, h, intro);
  const rows = document.createElement('div');
  rows.className = 'ph-manage';
  const actionRow = document.createElement('div');
  actionRow.className = 'ph-ready-row';
  const peek = document.createElement('button');
  peek.type = 'button';
  peek.className = 'btn small';
  peek.textContent = 'See what they see';
  peek.onclick = () => showSavedPhotoPreview(key, view);
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'link';
  edit.textContent = 'Make changes';
  edit.onclick = () => {
    if (saving) return;
    freeze(true);
    void editSavedPhoto(key, view)
      .catch(() => say('We couldn’t open the editor. Try again.'))
      .finally(() => freeze(false));
  };
  actionRow.append(peek, edit);
  rows.appendChild(actionRow);
  const pubLabel = document.createElement('label');
  pubLabel.className = 'ph-field';
  pubLabel.textContent = 'Link to share';
  const pubRow = document.createElement('div');
  pubRow.className = 'ph-link-row';
  const pubIn = document.createElement('input');
  pubIn.readOnly = true;
  pubIn.value = pub;
  pubIn.setAttribute('aria-label', 'Link to share');
  const pubBtn = document.createElement('button');
  pubBtn.type = 'button';
  pubBtn.className = 'btn small';
  pubBtn.textContent = 'Copy link';
  pubBtn.onclick = () => copyOrSelect(pubIn, 'Link copied — ready to send.');
  pubRow.append(pubIn, pubBtn);
  pubLabel.appendChild(pubRow);
  rows.appendChild(pubLabel);
  if (typeof navigator.canShare === 'function' && navigator.canShare({ url: pub })) {
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'btn small';
    share.textContent = 'Share gift';
    share.onclick = async () => {
      try { await navigator.share({ url: pub }); }
      catch { /* cancelled or unsupported — nothing was sent */ }
    };
    rows.appendChild(share);
  }
  const opts = document.createElement('details');
  opts.className = 'ph-private';
  const sum = document.createElement('summary');
  sum.textContent = 'Your private link';
  const help = document.createElement('p');
  help.className = 'ph-intro';
  help.textContent = 'Keep this to edit or close your gift later.';
  const privRow = document.createElement('div');
  privRow.className = 'ph-link-row';
  const privIn = document.createElement('input');
  privIn.readOnly = true;
  privIn.value = priv;
  privIn.setAttribute('aria-label', 'Your private link — keep it to yourself');
  const privBtn = document.createElement('button');
  privBtn.type = 'button';
  privBtn.className = 'btn small';
  privBtn.textContent = 'Copy private link';
  privBtn.onclick = () => copyOrSelect(privIn, 'Private link copied — keep it to yourself.');
  privRow.append(privIn, privBtn);
  const closeText = document.createElement('p');
  closeText.textContent = 'Closing stops new opens and removes the saved photo and note. This cannot be undone.';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn small';
  del.textContent = 'Close the gift link';
  let armed = false;
  del.onclick = async () => {
    if (!armed) { armed = true; del.textContent = 'Close it for good?'; return; }
    del.disabled = true;
    try {
      await revokePhotoGift(key); // validated { revoked: true } — idempotent
      renderManagementClosed();
    } catch {
      del.disabled = false;
      say('Closing did not finish — try again.');
    }
  };
  opts.append(sum, help, privRow, closeText, del);
  rows.appendChild(opts);
  rows.appendChild(anotherGift());
  stage.appendChild(rows);
  h.focus();
  if (newlySaved) {
    appMotion.play(glyph, [
      { opacity: 0.85, transform: 'perspective(240px) rotateX(-16deg) rotate(-3deg) scaleY(1.12)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 320 });
  }
}

/* The saved gift played exactly as the recipient will — no writes, the
   private URL and draft are untouched. Back returns to the live view. */
function showSavedPhotoPreview(key: string, view: ManageView) {
  playerCleanup?.(); playerCleanup = null;
  appMotion.settle();
  stage.innerHTML = '';
  say('');
  pane.scrollTop = 0;
  $('#phFooter').hidden = true;
  const back = $('#phBack');
  back.hidden = false;
  back.textContent = 'Back to your gift';
  back.onclick = () => {
    playerCleanup?.(); playerCleanup = null;
    void renderManagement(key);
  };
  $('#phJump').hidden = true;
  playerCleanup = mountPhotoPlayer(stage, {
    edition: view.edition!,
    photoUrl: publicImageUrl(view.recipientToken),
    preview: true,
  });
}

/* Copies the saved gift into the ordinary editor — the original link and
   photo stay as they are; saving later creates a new link. The old private
   page is kept one Back away via pushState. */
async function editSavedPhoto(key: string, view: ManageView): Promise<void> {
  if (!view.edition || !view.image) return;
  const existing = await loadDraft();
  if (existing && (existing.photo || existing.message || existing.to
    || existing.from || existing.clue || existing.pending)) {
    if (!window.confirm('Replace your unfinished draft with this gift?')) return;
  }
  say('Opening your gift…');
  let blob: Blob;
  try {
    blob = await getSavedPhoto(view.recipientToken);
  } catch {
    say('The photo couldn’t open. Try again.');
    return; // the saved gift and any draft are untouched
  }
  /* keep the original private page one Back away before anything mutates —
     if the tab can't hold history the private controls must stay put */
  try {
    history.pushState(null, '', `${location.pathname}?photo=1`);
  } catch {
    say('We couldn’t open the editor. Try again.');
    return;
  }
  say('');
  releasePhotoUrl();
  draft = {
    ...emptyPhotoDraft(),
    to: view.edition.to, from: view.edition.from,
    message: view.edition.message, clue: view.edition.clue,
    hidingSpot: { ...view.edition.hidingSpot },
    photo: blob,
    photoWidth: view.image.width, photoHeight: view.image.height,
    step: 'review',
    pending: null,
    copiedFromSaved: true,
  };
  touch();
  await flushDraft();
  renderStep();
}

function renderManagementClosed() {
  appMotion.settle();
  stage.innerHTML = '';
  const h = document.createElement('h2');
  h.tabIndex = -1;
  h.textContent = 'This gift link is closed.';
  const p = document.createElement('p');
  p.className = 'ph-intro';
  p.textContent = 'The photo and the note are gone from the gift.';
  stage.append(h, p, anotherGift());
  say('');
  h.focus();
}

/* ---------- recipient ---------- */
async function renderRecipient(token: string) {
  playerCleanup?.(); playerCleanup = null;
  appMotion.settle();
  stage.replaceChildren();
  say('Opening your gift…');
  $('#phFooter').hidden = true;
  $('#phBack').hidden = true;
  $('#phJump').hidden = true;
  try {
    const gift = await getPublicGift(token);
    say('');
    playerCleanup = mountPhotoPlayer(stage, {
      edition: gift.edition,
      photoUrl: publicImageUrl(token),
      preview: false,
    });
    document.title = 'EnigmaGift — a little surprise for you';
  } catch (e) {
    if (e instanceof PhotoLinkError && e.status === 404) {
      staticNotice('This gift link is no longer available.',
        'It may have been closed, or the link is incomplete.');
    } else {
      retryNotice('The gift couldn’t open just now.',
        'Check your connection and try again.',
        () => void renderRecipient(token));
    }
  }
}

/* ---------- boot ---------- */
async function boot() {
  /* fragment decides the route — validate shape, never fall through to the
     creator on a malformed link, and fail closed if both appear */
  if (hasManage && hasGift) {
    staticNotice('This gift link is not quite right.', 'It may have been closed, or the link is incomplete.');
    return;
  }
  if (hasManage) {
    if (!MANAGE_KEY_RE.test(manageKey)) {
      staticNotice('This gift link is not quite right.', 'It may have been closed, or the link is incomplete.');
      return;
    }
    document.title = 'EnigmaGift — your gift link';
    await renderManagement(manageKey);
    return;
  }
  if (hasGift) {
    if (!GIFT_TOKEN_RE.test(giftToken)) {
      staticNotice('This gift link is no longer available.', 'It may have been closed, or the link is incomplete.');
      return;
    }
    await renderRecipient(giftToken);
    return;
  }
  document.title = 'EnigmaGift — hide a note in a photo';
  const saved = await loadDraft();
  if (saved?.pending) {
    /* an interrupted save: the server decides what actually happened */
    const key = saved.pending.key;
    try {
      const view = await getManageView(key);
      if (view.revoked) {
        /* the link was closed before the save could be confirmed — keep
           the words and photo, drop the dead key */
        saved.pending = null;
        draft = saved;
        touch();
        offerResume(saved, 'That earlier link was closed. Your draft can become a new gift.');
        return;
      }
      /* active: adopt the private fragment, then it is safe to let the
         draft go — if the URL can't hold the key, the draft stays */
      try {
        history.replaceState(null, '', managementPhotoUrl(key));
        draft = saved;
        await clearDraft();
        draft = emptyPhotoDraft();
      } catch {
        draft = saved; // pending record remains the recovery copy
      }
      renderManagement(key, view);
      return;
    } catch (e) {
      draft = saved;
      if (e instanceof PhotoLinkError && e.status === 404) {
        offerResume(saved); // saved draft intact — retry still possible
      } else {
        offerResume(saved, 'We couldn’t confirm your earlier save. Your draft is here.');
      }
      return;
    }
  }
  if (saved && (saved.photo || saved.message || saved.to || saved.from || saved.clue)) {
    draft = saved;
    offerResume(saved);
    return;
  }
  draft = emptyPhotoDraft();
  renderStep(false);
  if (loadWasCorrupt()) say('Couldn’t restore the saved draft. Start again.');
}

function offerResume(saved: PhotoDraft, line?: string) {
  appMotion.settle();
  stage.innerHTML = '';
  const h = document.createElement('h2');
  h.tabIndex = -1;
  h.textContent = 'Your draft is still here.';
  const p = document.createElement('p');
  p.className = 'ph-intro';
  p.textContent = line ?? (saved.pending
    ? 'An earlier save did not finish — pick up where it left off, or start over.'
    : 'Pick up where it left off, or start fresh.');
  const row = document.createElement('div');
  row.className = 'ph-resume';
  const resume = document.createElement('button');
  resume.type = 'button';
  resume.className = 'btn small';
  resume.textContent = 'Keep making it';
  resume.onclick = () => { draft = saved; renderStep(); };
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.className = 'link';
  discard.textContent = 'Start over';
  discard.onclick = async () => {
    const gone = await clearDraft();
    draft = emptyPhotoDraft();
    renderStep();
    if (!gone) say('The draft is cleared here — the browser could not remove its saved copy.');
  };
  row.append(resume, discard);
  stage.append(h, p, row);
  $('#phFooter').hidden = true;
  $('#phBack').hidden = true;
  $('#phJump').hidden = true;
  h.focus();
}

window.addEventListener('hashchange', () => location.reload());
void boot();
