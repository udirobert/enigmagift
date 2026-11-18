import { useRef, useState } from 'react';
import {
  MarbleStage,
  type MarbleLoadState,
  type MarbleStageHandle,
  type Mark,
  type Pin,
  type Pose,
  type Vec3,
} from './MarbleStage';
import './WorldGift.css';
import './MarbleStudio.css';

const MAX_BYTES = 30 * 1024 * 1024; // keep the local preview bounded
const MAX_MISSES = 2; // two wrong guesses before the guided reveal
const VIEW_LABELS = ['First view', 'Second view'] as const;

let markSeq = 0;

interface ViewSlot {
  pose: Pose | null;
}

/**
 * /studio/marble — bounded local playtest of a Marble-style SPZ slice.
 * The giver loads a local .spz file, saves two viewpoints, marks two or
 * three meaningful objects, designates the hiding place and writes one
 * witness clue and one gift note — then previews the recipient beat.
 * Everything stays in this tab: no upload, no generation API, no payment.
 */
export default function MarbleStudio() {
  const stageRef = useRef<MarbleStageHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [loadState, setLoadState] = useState<MarbleLoadState>('idle');
  const [note, setNote] = useState('Choose a .spz file to stand inside it.');
  const [pins, setPins] = useState<Pin[]>([]);

  const [views, setViews] = useState<ViewSlot[]>([{ pose: null }, { pose: null }]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [pending, setPending] = useState<Vec3 | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const [hidingId, setHidingId] = useState('');
  const [witness, setWitness] = useState('');
  const [giftNote, setGiftNote] = useState('');

  const [mode, setMode] = useState<'author' | 'play'>('author');
  const [playView, setPlayView] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [missedIds, setMissedIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const ready = loadState === 'ready';
  const hiding = marks.find((m) => m.id === hidingId) ?? null;
  const selected = marks.find((m) => m.id === selectedId) ?? null;
  const canPreview =
    ready &&
    views.every((v) => v.pose) &&
    marks.length >= 2 &&
    !!hiding &&
    witness.trim().length > 0 &&
    giftNote.trim().length > 0;

  const onLoadState = (s: MarbleLoadState, n: string) => {
    setLoadState(s);
    setNote(n);
  };

  const clearPlacement = () => {
    setViews([{ pose: null }, { pose: null }]);
    setMarks([]);
    setPins([]);
    setPending(null);
    setPendingLabel('');
    setHidingId('');
    setSelectedId('');
  };

  const chooseFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setLoadState('error');
      setNote(
        `${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB — over the 30 MB preview limit. Export a low-res variant (100k–500k splats) and choose that.`,
      );
      return;
    }
    if (!/\.spz$/i.test(f.name)) {
      setLoadState('error');
      setNote(`${f.name} is not an .spz file — choose an exported .spz to preview.`);
      return;
    }
    clearPlacement();
    setFlipped(false);
    setLoadState('loading');
    setFile(f);
  };

  const saveView = (i: number) => {
    const pose = stageRef.current?.captureView();
    if (!pose) {
      setNote('Nothing on stage yet — load a file first.');
      return;
    }
    setViews((vs) => vs.map((v, j) => (j === i ? { pose } : v)));
    setNote(`${VIEW_LABELS[i]} saved — the recipient will start looking from there.`);
  };

  const markAtCrosshair = () => {
    const hit = stageRef.current?.pickCenter();
    if (!hit) {
      setNote('No surface under the crosshair — orbit closer and try again.');
      return;
    }
    setPending(hit);
    setPendingLabel('');
    setNote('Surface found. Name the object so the recipient can recognise it.');
  };

  const confirmMark = () => {
    if (!pending || !pendingLabel.trim() || marks.length >= 3) return;
    setMarks((ms) => [
      ...ms,
      { id: `m${++markSeq}`, label: pendingLabel.trim(), position: pending },
    ]);
    setPending(null);
    setPendingLabel('');
    setNote('Object marked. Mark two or three things that matter.');
  };

  const enterPlay = () => {
    setMode('play');
    setPlayView(0);
    setSelectedId('');
    setMissedIds([]);
    setOpen(false);
    const pose = views[0].pose;
    if (pose) stageRef.current?.showView(pose);
    setNote('You are standing in the room. Look around — exploring costs nothing.');
  };

  const goView = (i: number) => {
    const pose = views[i].pose;
    if (!pose) return;
    setPlayView(i);
    stageRef.current?.showView(pose);
    setNote(`Standing at ${VIEW_LABELS[i].toLowerCase()}.`);
  };

  const inspect = (m: Mark) => {
    setSelectedId(m.id);
    setNote(`You pause by ${m.label}. Looking costs nothing — guessing spends a chance.`);
  };

  const guess = () => {
    if (!selected || open) return;
    if (missedIds.includes(selected.id)) {
      setNote(`You already looked inside ${selected.label} — no chance spent twice.`);
      return;
    }
    if (selected.id === hidingId) {
      setNote(`Inside ${selected.label} — there it is.`);
      setOpen(true);
      return;
    }
    const next = [...missedIds, selected.id];
    setMissedIds(next);
    if (next.length >= MAX_MISSES) {
      setNote(
        `${selected.label} is empty. That was the last chance — the witness steps in: “${witness.trim()}”`,
      );
      setOpen(true);
      return;
    }
    setNote(`${selected.label} is empty inside. One chance left — ${witness.trim()}`);
  };

  const openGift = () => {
    setOpen(true);
    setNote('Your gift is open.');
  };

  const backToEditing = () => {
    setMode('author');
    setOpen(false);
    setNote('Back to the author steps — nothing was published.');
  };

  /* ---------- cover: no file chosen yet ---------- */
  if (!file) {
    return (
      <main className="wg ms">
        <article className="wg-cover">
          <p className="wg-kicker">Local playtest · nothing leaves this tab</p>
          <h1 className="wg-title">Stand inside a memory.</h1>
          <p className="wg-lede">
            Load a local .spz splat (a Marble-style room export), save two
            viewpoints, mark the things that matter, hide the gift, then preview
            the recipient’s hunt.
          </p>
          <label className="ms-picker">
            <span className="wg-btn">Choose a .spz file</span>
            <input
              ref={fileRef}
              type="file"
              accept=".spz"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="wg-fineprint">
            One file under 30 MB — a low-res export (100k–500k splats) previews
            best. The file never leaves this browser; no upload, generation or
            payment is involved.
          </p>
          {loadState === 'error' && (
            <p className="ms-status error" role="alert">
              {note}
            </p>
          )}
        </article>
      </main>
    );
  }

  /* ---------- reveal overlay ---------- */
  const reveal = open && (
    <div className="ms-card reveal" role="group" aria-label="Gift revealed">
      <p className="wg-kicker">The gift</p>
      {hiding && <p className="ms-found">Inside {hiding.label}.</p>}
      <p className="ms-note-text">“{giftNote.trim()}”</p>
      <button type="button" className="wg-btn ghost" onClick={backToEditing}>
        Back to editing
      </button>
    </div>
  );

  return (
    <main className="wg ms">
      <header className="ms-head">
        <p className="wg-kicker">Local playtest · stays in this tab</p>
        <h1 className="wg-title">{mode === 'author' ? 'Hide it in the room.' : 'Find the gift.'}</h1>
      </header>

      <div className="ms-stage-wrap">
        <MarbleStage
          ref={stageRef}
          file={file}
          flipped={flipped}
          controlsEnabled={mode === 'author'}
          marks={marks}
          onLoadState={onLoadState}
          onPins={setPins}
        />
        {mode === 'author' && ready && (
          <div className="ms-reticle" aria-hidden="true">
            +
          </div>
        )}
        {pins.map(
          (p) =>
            p.visible && (
              <button
                key={p.id}
                type="button"
                className="ms-pin"
                style={{ left: p.x, top: p.y }}
                onClick={() => {
                  const m = marks.find((mm) => mm.id === p.id);
                  if (m) inspect(m);
                }}
              >
                {marks.find((mm) => mm.id === p.id)?.label ?? '?'}
              </button>
            ),
        )}
      </div>

      <p className={`ms-status${loadState === 'error' ? ' error' : ''}`} role="status">
        {note}
      </p>

      {mode === 'author' ? (
        <section className="ms-steps" aria-label="Authoring steps">
          <div className="ms-row">
            <label className="ms-picker inline">
              <span className="wg-btn ghost">Choose a different file</span>
              <input
                type="file"
                accept=".spz"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="ms-check">
              <input
                type="checkbox"
                checked={flipped}
                onChange={(e) => {
                  clearPlacement();
                  setFlipped(e.target.checked);
                  setNote('Orientation changed. Save your viewpoints and marks again.');
                }}
              />
              Flip scene upright (some exports face down)
            </label>
            <span className="wg-fineprint">Flipping clears saved viewpoints and marks.</span>
          </div>

          <ol className="ms-ol">
            <li>
              <strong>Save two viewpoints.</strong> Orbit with the mouse, then:
              {VIEW_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  className="wg-btn ghost small"
                  disabled={!ready}
                  onClick={() => saveView(i)}
                >
                  {views[i].pose ? `${label} saved — re-save` : `Save ${label.toLowerCase()}`}
                </button>
              ))}
            </li>
            <li>
              <strong>Mark two or three objects.</strong> Aim the crosshair at a
              thing that matters, then:
              <button
                type="button"
                className="wg-btn ghost small"
                disabled={!ready || marks.length >= 3}
                onClick={markAtCrosshair}
              >
                Mark object at crosshair
              </button>
              {pending && (
                <span className="ms-inline-form">
                  <input
                    type="text"
                    value={pendingLabel}
                    placeholder="name it as they know it"
                    aria-label="Object name"
                    onChange={(e) => setPendingLabel(e.target.value)}
                  />
                  <button
                    type="button"
                    className="wg-btn small"
                    disabled={!pendingLabel.trim()}
                    onClick={confirmMark}
                  >
                    Pin it
                  </button>
                </span>
              )}
            </li>
            <li>
              <strong>Objects and the hiding place.</strong>
              <ul className="ms-marks">
                {marks.map((m) => (
                  <li key={m.id}>
                    <label>
                      <input
                        type="radio"
                        name="hiding"
                        checked={hidingId === m.id}
                        onChange={() => setHidingId(m.id)}
                      />
                      {m.label} hides the gift
                    </label>
                    <button
                      type="button"
                      className="wg-skip"
                      onClick={() => {
                        setMarks((ms) => ms.filter((x) => x.id !== m.id));
                        if (hidingId === m.id) setHidingId('');
                        if (selectedId === m.id) setSelectedId('');
                      }}
                    >
                      remove
                    </button>
                  </li>
                ))}
                {marks.length === 0 && <li>No objects marked yet.</li>}
              </ul>
            </li>
            <li>
              <strong>One witness clue.</strong>
              <textarea
                aria-label="Witness clue"
                value={witness}
                rows={2}
                placeholder="Something only the witness would say — e.g. it is something soft enough to sit on."
                onChange={(e) => setWitness(e.target.value)}
              />
            </li>
            <li>
              <strong>One gift note.</strong>
              <textarea
                aria-label="Gift note"
                value={giftNote}
                rows={2}
                placeholder="What the recipient reads when the gift opens."
                onChange={(e) => setGiftNote(e.target.value)}
              />
            </li>
          </ol>

          <button type="button" className="wg-btn" disabled={!canPreview} onClick={enterPlay}>
            Preview as the recipient
          </button>
          {!canPreview && ready && (
            <p className="wg-fineprint">
              Needs both saved views, at least two named objects, one hiding
              place, a witness clue and a gift note.
            </p>
          )}
        </section>
      ) : (
        <section className="ms-play" aria-label="Recipient preview">
          <div className="ms-row">
            {VIEW_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`wg-btn ghost small${playView === i ? ' accent' : ''}`}
                onClick={() => goView(i)}
              >
                Stand at {label.toLowerCase()}
              </button>
            ))}
          </div>

          <ul className="ms-marks">
            {marks.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="wg-btn ghost small"
                  onClick={() => inspect(m)}
                >
                  Look at {m.label}
                </button>
              </li>
            ))}
          </ul>

          <details className="ms-witness">
            <summary>Ask the witness</summary>
            <blockquote>{witness.trim()}</blockquote>
          </details>

          <div className="ms-row">
            <button
              type="button"
              className="wg-btn"
              disabled={!selected || open}
              onClick={guess}
            >
              {selected ? `Guess: ${selected.label}` : 'Guess (look at something first)'}
            </button>
            <button type="button" className="wg-skip" onClick={openGift} disabled={open}>
              Open my gift instead
            </button>
            {!open && (
              <button type="button" className="wg-skip" onClick={backToEditing}>
                Back to editing
              </button>
            )}
          </div>
          <p className="wg-fineprint">
            {MAX_MISSES - missedIds.length} chance{MAX_MISSES - missedIds.length === 1 ? '' : 's'} left.
            Exploring never spends one.
          </p>
        </section>
      )}

      {reveal}
    </main>
  );
}
