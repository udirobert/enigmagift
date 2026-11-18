import { useEffect, useRef, useState } from 'react';
import { WorldStage } from './WorldStage';
import { explorerScene } from '../lib/explorerScene';
import {
  GULL_LINE,
  LIMITS,
  MAX_CHANCES,
  SAMPLE_DRAFT,
  emptyDraft,
  missNudge,
  puzzleOptions,
  validateDraft,
  type Draft,
  type Page,
} from '../lib/worldGift';
import './WorldGift.css';

type StageState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * /studio/world — photo-first explorer slice. The photo unfolds in place
 * into a walkable 3D scene; the gift is a word-puzzle lock in a compact
 * drawer. Static curated content: nothing is charged, sent or generated.
 */
export default function WorldGift() {
  const [page, setPage] = useState<Page>('cover');
  const [draft, setDraft] = useState<Draft>(SAMPLE_DRAFT);
  const [form, setForm] = useState<Draft>(emptyDraft());
  const [entered, setEntered] = useState(false);
  const [stage, setStage] = useState<StageState>('idle');
  const [photoBack, setPhotoBack] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const [status, setStatus] = useState('Explore the place. The gift waits in the drawer.');
  const [hintGone, setHintGone] = useState(false);
  const giftRef = useRef<HTMLDivElement>(null);

  const opened = page === 'reveal';
  const chances = MAX_CHANCES - missed.length;
  const options = puzzleOptions(draft);
  const showPhoto = !entered || stage !== 'ready' || photoBack;

  useEffect(() => {
    if (stage === 'ready') {
      const t = setTimeout(() => setHintGone(true), 6000);
      return () => clearTimeout(t);
    }
  }, [stage]);

  useEffect(() => {
    if (opened) giftRef.current?.focus();
  }, [opened]);

  const enter = (d: Draft) => {
    setDraft(d);
    setPicked(null);
    setMissed([]);
    setDrawer(false);
    setPhotoBack(false);
    setHintGone(false);
    setStage((s) => (s === 'idle' ? 'loading' : s));
    setStatus('Explore the place. The gift waits in the drawer.');
    setEntered(true);
    setPage('play');
  };

  const leaveToCover = () => {
    setEntered(false);
    setStage('idle');
    setPhotoBack(false);
    setDrawer(false);
    setPage('cover');
  };

  const inspect = (opt: string) => {
    setPicked(opt);
    setStatus(`“${opt}”? Say it if you mean it — trying costs a chance.`);
  };

  const guess = () => {
    if (!picked || opened || chances === 0) return;
    if (missed.includes(picked)) {
      setStatus('You already tried that one — no chance spent twice.');
      return;
    }
    if (picked.trim().toLowerCase() === draft.secret.trim().toLowerCase()) {
      setStatus('That is the word.');
      setPage('reveal');
      return;
    }
    const next = [...missed, picked];
    setMissed(next);
    setStatus(`“${picked}” is not it. ${missNudge(next.length)}`);
  };

  const openGift = () => {
    setStatus('Your gift is open.');
    setDrawer(true);
    setPage('reveal');
  };

  const errors = validateDraft(form);

  /* ---------- edit keeps its own simple page (stage unmounts) ---------- */
  if (page === 'edit') {
    return (
      <main className="wg">
        <article className="wg-edit">
          <p className="wg-kicker">Make it yours · free preview</p>
          <h1 className="wg-title">Personalise this sample</h1>
          <p className="wg-lede">
            A free preview of a sample place — private in this tab, no payment and no
            sending. In a real gift you would start from your own photo.
          </p>
          <form
            className="wg-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (errors.length === 0) {
                enter({
                  ...form,
                  to: form.to.trim(),
                  from: form.from.trim(),
                  memory: form.memory.trim(),
                  invitation: form.invitation.trim(),
                  secret: form.secret.trim(),
                });
              }
            }}
          >
            <div className="wg-row">
              <label>
                For
                <input value={form.to} maxLength={LIMITS.name} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="Max" />
              </label>
              <label>
                From
                <input value={form.from} maxLength={LIMITS.name} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Jo" />
              </label>
            </div>
            <label>
              A shared memory <span className="wg-opt">(optional)</span>
              <textarea value={form.memory} maxLength={LIMITS.memory} rows={2} onChange={(e) => setForm({ ...form, memory: e.target.value })} placeholder="Fish and chips on the wall here, that day the fog ate the bridge." />
            </label>
            <label>
              The message inside the gift
              <textarea value={form.invitation} maxLength={LIMITS.invitation} rows={2} onChange={(e) => setForm({ ...form, invitation: e.target.value })} placeholder="Same spot, same order, first Saturday of next month. My treat." />
            </label>
            <label>
              The secret word to guess
              <input value={form.secret} maxLength={LIMITS.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="fish and chips" />
            </label>
            {errors.length > 0 && (
              <p className="wg-errors" role="status">Still needed: {errors.join(', ')}.</p>
            )}
            <div className="wg-cover-actions">
              <button type="submit" className="wg-btn" disabled={errors.length > 0}>
                Preview the hunt
              </button>
              <button type="button" className="wg-btn ghost" onClick={leaveToCover}>
                Back
              </button>
            </div>
          </form>
        </article>
      </main>
    );
  }

  /* ---------- shared tree: persistent stage + photo + overlays ---------- */
  return (
    <main className={`wg wg-explorer${entered ? ' is-in' : ''}`}>
      <WorldStage entered={entered} active={!showPhoto && !drawer} onState={setStage} />

      {/* one fullscreen photo — first paint through first rendered frame */}
      <div className={`wg-photo${showPhoto ? ' is-shown' : ''}`} aria-hidden={!showPhoto}>
        <img src={explorerScene.poster} alt="Fort Point beneath the Golden Gate Bridge" />
        {stage === 'loading' && <p className="wg-photo-note">Opening…</p>}
        {stage === 'error' && <p className="wg-photo-note">3D unavailable. View the photo.</p>}
        {entered && photoBack && stage === 'ready' && (
          <button type="button" className="wg-btn" onClick={() => setPhotoBack(false)}>
            Back to the place
          </button>
        )}
      </div>

      {!entered ? (
        /* cover — the introduction, nothing else */
        <article className="wg-cover">
          <h1 className="wg-title">For {draft.to}, from {draft.from}</h1>
          <div className="wg-cover-actions">
            <button type="button" className="wg-btn" onClick={() => enter(draft)}>
              Explore photo
            </button>
            <button
              type="button"
              className="wg-skip"
              onClick={() => {
                setForm(SAMPLE_DRAFT);
                setPage('edit');
              }}
            >
              Personalise this sample
            </button>
          </div>
        </article>
      ) : (
        /* in-world chrome — hint, photo toggle, gift drawer */
        <>
          {!hintGone && stage === 'ready' && (
            <p className="wg-hint">Drag to look · arrows to move</p>
          )}
          <div className="wg-chrome">
            <button type="button" onClick={() => setPhotoBack(true)}>
              Photo
            </button>
            <button type="button" onClick={() => setDrawer(!drawer)} aria-expanded={drawer}>
              Gift
            </button>
          </div>

          {drawer && (
            <aside className="wg-drawer" aria-label="The gift">
              <button type="button" className="wg-drawer-close" onClick={() => setDrawer(false)} aria-label="Close">
                ×
              </button>
              <p className="wg-status" role="status" aria-live="polite">{status}</p>

              {opened ? (
                <div className="wg-gift" ref={giftRef} tabIndex={-1}>
                  <p className="wg-note-kicker">Your gift</p>
                  <blockquote>
                    <p>“{draft.invitation}”</p>
                    <cite>— {draft.from}</cite>
                  </blockquote>
                  <button type="button" className="wg-skip" onClick={() => setDrawer(false)}>
                    Keep exploring
                  </button>
                </div>
              ) : (
                <>
                  <details className="wg-gull">
                    <summary>Ask the gull for a clue</summary>
                    <p>“{GULL_LINE}”</p>
                  </details>
                  {draft.memory && (
                    <details className="wg-memory">
                      <summary>A memory from {draft.from}</summary>
                      <p>“{draft.memory}”</p>
                    </details>
                  )}
                  <div className="wg-picks" role="group" aria-label="Possible answers">
                    {options.map((o) => (
                      <button
                        key={o}
                        type="button"
                        className={picked === o ? 'is-selected' : ''}
                        onClick={() => inspect(o)}
                      >
                        {o}
                        {missed.includes(o) ? ' — tried' : ''}
                      </button>
                    ))}
                  </div>
                  <div className="wg-actions">
                    {chances > 0 && (
                      <button type="button" className="wg-btn" onClick={guess} disabled={!picked || missed.includes(picked)}>
                        {picked ? `Say “${picked}”` : 'Pick an answer first'}
                      </button>
                    )}
                    {chances === 0 && (
                      <button type="button" className="wg-btn accent" onClick={openGift}>
                        Show me
                      </button>
                    )}
                    <button type="button" className="wg-skip" onClick={openGift}>
                      Open my gift instead
                    </button>
                  </div>
                  <p className="wg-fineprint">
                    {chances} {chances === 1 ? 'try' : 'tries'} left — picking an answer is free.
                  </p>
                </>
              )}
              <button
                type="button"
                className="wg-skip"
                onClick={() => {
                  setForm(draft);
                  setPage('edit');
                }}
              >
                Personalise this sample
              </button>
            </aside>
          )}
        </>
      )}
    </main>
  );
}
