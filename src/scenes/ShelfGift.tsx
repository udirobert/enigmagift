import { useEffect, useRef, useState } from 'react';
import { ShelfStage, loadPixels } from './ShelfStage';
import {
  ANCHORS,
  ITEMS,
  SAMPLE_DRAFT,
  W,
  H,
  describeView,
  inspectItem,
  pinX,
  validateDraft,
  type Hiding,
  type Item,
  type ShelfDraft,
} from '../lib/shelfGift';
import './ShelfGift.css';

type StageState = 'idle' | 'loading' | 'ready' | 'error';
type Mode = 'cover' | 'play' | 'edit' | 'review';

const ORDER: Item[] = ['bear', 'frog', 'pot', 'box'];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * /studio/world — the measured shelf. Two real stereo views of a toy shelf
 * become a place the recipient can lean across; the bear points at a heart,
 * the heart marks the gift. Static local assets — nothing generated.
 */
export default function ShelfGift() {
  const [mode, setMode] = useState<Mode>('cover');
  const [draft, setDraft] = useState<ShelfDraft>(SAMPLE_DRAFT);
  const [form, setForm] = useState<ShelfDraft>(SAMPLE_DRAFT);
  const [entered, setEntered] = useState(false);
  const [stage, setStage] = useState<StageState>('idle');
  const [t, setT] = useState(0);
  const [disp, setDisp] = useState<Record<Item, number> | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [tried, setTried] = useState<Set<Item>>(new Set());
  const [opened, setOpened] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [confirmItem, setConfirmItem] = useState<Item | null>(null);
  const [status, setStatus] = useState('The bear has something to tell you.');
  const [editItem, setEditItem] = useState<Item>('frog');
  const [cameFromEdit, setCameFromEdit] = useState(false);
  const bearRef = useRef<HTMLButtonElement>(null);
  const glideRef = useRef<number>(0);

  const inScene = mode !== 'cover';
  const editing = mode === 'edit' || mode === 'review';
  /* on a still photo or reduced motion the only honest positions are the
     two captured frames — never slide anchors across a frozen image */
  const visibleT = stage === 'error' || reduced() ? Number(t >= 0.5) : t;
  const displayDraft = mode === 'edit' ? form : draft;

  /* measured disparity at each anchor — powers the pins */
  useEffect(() => {
    if (!entered) return;
    let dead = false;
    loadPixels('/stereo-teddy/disp2.png')
      .then((p) => {
        if (dead) return;
        const at = (x: number, y: number) => p.data[(y * p.width + x) * 4] / 4;
        const out = {} as Record<Item, number>;
        for (const it of ORDER) out[it] = at(ANCHORS[it].x, ANCHORS[it].y);
        setDisp(out);
      })
      .catch(() => {
        if (!dead) setDisp({ bear: 0, frog: 0, pot: 0, box: 0 });
      });
    return () => {
      dead = true;
    };
  }, [entered]);

  useEffect(() => {
    if (entered && stage === 'ready' && mode === 'play') bearRef.current?.focus();
  }, [entered, stage, mode]);

  /* leaving any mode (or unmounting) always stops a glide */
  useEffect(() => () => cancelAnimationFrame(glideRef.current), [mode]);

  const setView = (v: number) => {
    cancelAnimationFrame(glideRef.current);
    setT(v);
  };

  const glideTo = (target: number) => {
    cancelAnimationFrame(glideRef.current);
    if (reduced()) {
      setT(target);
      return;
    }
    const from = t;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min((now - t0) / 700, 1);
      setT(from + (target - from) * (1 - Math.pow(1 - k, 2)));
      if (k < 1) glideRef.current = requestAnimationFrame(step);
    };
    glideRef.current = requestAnimationFrame(step);
  };

  const begin = (d: ShelfDraft) => {
    setDraft(d);
    setSelected(null);
    setConfirmItem(null);
    setTried(new Set());
    setOpened(false);
    setShowInvitation(false);
    cancelAnimationFrame(glideRef.current);
    setT(0);
    setStatus('The bear has something to tell you.');
    if (!entered) {
      setEntered(true);
      setStage((s) => (s === 'idle' ? 'loading' : s));
    }
    setMode('play');
  };

  const startEdit = () => {
    cancelAnimationFrame(glideRef.current);
    setT(0);
    setForm(draft);
    setEditItem('frog');
    setEntered(true);
    setStage((s) => (s === 'idle' ? 'loading' : s));
    setMode('edit');
  };

  const leaveToCover = () => {
    cancelAnimationFrame(glideRef.current);
    setForm(draft);
    setEntered(false);
    setT(0);
    setMode('cover');
  };

  const inspect = (item: Item) => {
    setSelected(item);
    setConfirmItem(null);
    if (opened) setShowInvitation(false);
    setStatus(item === 'bear' ? 'The bear is looking right at you.' : `You lean closer to ${ITEMS[item].name}.`);
  };

  const doOpen = (item: Item | null) => {
    const target = item ?? selected;
    if (!target || opened) return;
    setConfirmItem(null);
    if (target === draft.hiding) {
      setOpened(true);
      setShowInvitation(true);
      setStatus(`Inside ${ITEMS[target].name} — there it is.`);
    } else {
      setTried((s) => new Set(s).add(target));
      setStatus(`${ITEMS[target].name} is empty — nothing lost.`);
    }
  };

  const openAnyway = () => {
    setConfirmItem(null);
    setOpened(true);
    setShowInvitation(true);
    setStatus('Your gift is open.');
  };

  const pinPos = (item: Item) => {
    const a = ANCHORS[item];
    const d = disp?.[item] ?? 0;
    return { left: `${(pinX(a.x, d, visibleT) / W) * 100}%`, top: `${(a.y / H) * 100}%` };
  };

  const heartShown = visibleT >= 0.6 && !opened;
  const result = selected ? inspectItem(selected, draft) : null;
  const errors = validateDraft(form);

  /* ---------- the one shared frame — identical position in every mode ---------- */
  const frame = (
    <div className="sg-frame">
      <ShelfStage t={visibleT} onView={setView} entered={entered} onState={setStage} active={inScene} />

      {inScene && (
        <div className="sg-pins">
          {ORDER.map((it) => (
            <button
              key={it}
              ref={it === 'bear' ? bearRef : undefined}
              type="button"
              className={`sg-pin${
                (mode === 'edit' ? editItem === it : selected === it) ? ' is-selected' : ''
              }${tried.has(it) ? ' is-tried' : ''}`}
              style={pinPos(it)}
              aria-label={editing ? `Edit ${ITEMS[it].name}` : `Look at ${ITEMS[it].name}`}
              onClick={() => (mode === 'edit' ? setEditItem(it) : inspect(it))}
            >
              {mode === 'play' && it === 'bear' && !selected && !opened && (
                <span className="sg-talk">Talk</span>
              )}
            </button>
          ))}
          {heartShown && mode !== 'review' && (
            <span className="sg-heart" style={pinPos(displayDraft.hiding)} aria-hidden>
              ♥
            </span>
          )}
        </div>
      )}

      {!entered && (
        <div className="sg-coverline">
          <h1 className="sg-title">For {draft.to}, from {draft.from}</h1>
          <button type="button" className="sg-btn" onClick={() => begin(draft)}>
            Step inside
          </button>
          <button type="button" className="sg-skip" onClick={startEdit}>
            Make one
          </button>
        </div>
      )}
    </div>
  );

  /* ---------- giver panel — same frame position, sheet swaps under it ---------- */
  if (editing) {
    return (
      <main className="sg">
        {frame}
        <section className="sg-sheet" aria-label="Make a gift">
          {mode === 'edit' ? (
            <form
              className="sg-form"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <p className="sg-kicker">Make one · free preview</p>
              <details className="sg-details" open>
                <summary>Gift details</summary>
                <div className="sg-row">
                  <label>
                    For
                    <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="Max" maxLength={40} />
                  </label>
                  <label>
                    From
                    <input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="Jo" maxLength={40} />
                  </label>
                </div>
                <label>
                  The message inside the gift
                  <textarea value={form.gift} rows={2} onChange={(e) => setForm({ ...form, gift: e.target.value })} maxLength={220} placeholder="Breakfast at our old spot on Sunday? My treat." />
                </label>
              </details>

              <label>
                What should they remember here? — {ITEMS[editItem].name}
                <textarea
                  rows={2}
                  value={form.memories[editItem]}
                  onChange={(e) => setForm({ ...form, memories: { ...form.memories, [editItem]: e.target.value } })}
                  maxLength={160}
                />
              </label>
              {editItem === 'bear' ? (
                <label>
                  The bear's line
                  <input value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} maxLength={160} />
                </label>
              ) : (
                <button
                  type="button"
                  className="sg-btn ghost"
                  onClick={() => setForm({ ...form, hiding: editItem as Hiding })}
                  disabled={form.hiding === editItem}
                >
                  {form.hiding === editItem ? 'Gift hides here' : 'Hide my gift here'}
                </button>
              )}
              <p className="sg-fineprint">
                Tap an object in the photo to edit it. Gift currently hides behind {ITEMS[form.hiding].name}; the heart mark follows automatically.
              </p>
              {errors.length > 0 && <p className="sg-errors" role="status">Still needed: {errors.join(', ')}.</p>}
              <div className="sg-actions">
                <button
                  type="button"
                  className="sg-btn"
                  disabled={errors.length > 0}
                  onClick={() => {
                    setCameFromEdit(true);
                    begin({ ...form });
                  }}
                >
                  See it as {form.to || 'them'}
                </button>
                <button type="button" className="sg-btn ghost" onClick={leaveToCover}>
                  Back
                </button>
              </div>
            </form>
          ) : (
            <div className="sg-form">
              <p className="sg-kicker">Review · free preview</p>
              <p className="sg-lede">
                For {form.to || 'them'}, from {form.from || 'you'} — gift behind {ITEMS[form.hiding].name}.
              </p>
              <p className="sg-price">Proposed £4.99 · one-time</p>
              <p className="sg-fineprint">Sending isn’t available in this preview — no payment, no link is created.</p>
              <div className="sg-actions">
                <button type="button" className="sg-btn" onClick={() => { setCameFromEdit(true); begin({ ...form }); }}>
                  See it as {form.to || 'them'} again
                </button>
                <button type="button" className="sg-btn ghost" onClick={() => setMode('edit')}>
                  Keep editing
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    );
  }

  /* ---------- cover + recipient sheet ---------- */
  return (
    <main className="sg">
      {frame}
      {inScene && (
        <section className="sg-sheet" aria-label="The shelf">
          <p className="sg-status" role="status" aria-live="polite">{status}</p>

          {stage === 'error' && (
            <p className="sg-fineprint">3D view unavailable — the photos still work.</p>
          )}

          {selected === 'bear' && (
            <div className="sg-bear">
              <p className="sg-line">“{draft.line}”</p>
              <button type="button" className="sg-btn ghost" onClick={() => glideTo(1)}>
                Come round here
              </button>
            </div>
          )}

          {opened && showInvitation ? (
            <div className="sg-gift" tabIndex={-1}>
              <p className="sg-note-kicker">Your gift</p>
              <blockquote>
                <p>“{draft.gift}”</p>
                <cite>— {draft.from}</cite>
              </blockquote>
              <p className="sg-note">It was behind {ITEMS[draft.hiding].name}. The shelf is still yours to wander.</p>
              <button type="button" className="sg-skip" onClick={() => setShowInvitation(false)}>
                Keep exploring
              </button>
            </div>
          ) : result ? (
            <div className="sg-note-card">
              <p className="sg-memory">“{result.memory}”</p>
              {opened && (
                <button type="button" className="sg-skip" onClick={() => setShowInvitation(true)}>
                  Read invitation again
                </button>
              )}
            </div>
          ) : null}

          <div className="sg-actions">
            {!opened && selected && selected !== 'bear' && confirmItem !== selected && (
              <button type="button" className="sg-btn" onClick={() => setConfirmItem(selected)}>
                Open {ITEMS[selected].name}?
              </button>
            )}
            {!opened && confirmItem && (
              <button type="button" className="sg-btn accent" onClick={() => doOpen(confirmItem)}>
                Yes — open {ITEMS[confirmItem].name}
              </button>
            )}
            {!opened && (
              <button type="button" className="sg-skip" onClick={openAnyway}>
                Open anyway
              </button>
            )}
            <div className="sg-views" role="group" aria-label="Viewpoints">
              <button type="button" aria-pressed={visibleT < 0.5} onClick={() => glideTo(0)}>The photo</button>
              <button type="button" aria-pressed={visibleT >= 0.5} onClick={() => glideTo(1)}>The bear’s side</button>
            </div>
            <details className="sg-describe">
              <summary>Describe this view</summary>
              <p>{describeView(visibleT, draft.hiding)}</p>
            </details>
            <details className="sg-describe">
              <summary>About sample</summary>
              <p>
                Middlebury 2003 “Teddy” stereo pair with measured disparities — Scharstein
                &amp; Szeliski, <i>High-accuracy stereo depth maps using structured light</i>,
                CVPR 2003. Local files only; see <code>public/stereo-teddy/CREDITS.md</code>.
              </p>
            </details>
            {cameFromEdit && (
              <button type="button" className="sg-skip" onClick={() => setMode('review')}>
                Review
              </button>
            )}
            <button type="button" className="sg-skip" onClick={startEdit}>
              Make one
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
