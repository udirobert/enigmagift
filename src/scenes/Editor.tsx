import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { CLUES, mockGallery } from '../data';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Photo } from '../components/Photo';
import { aspectKnown, bboxToCrop, useImageAspect } from '../lib/crop';
import { reclueGift, setWorldSource, updateClues, type ApiClue, type Gift, type GiftMode, type HideSpot } from '../lib/api';

interface EditorProps {
  demo: boolean;
  gift: Gift | null;
  mode: GiftMode;
  /** kept count + the hide spot the buyer chose (null = "somewhere else") */
  onSeal: (kept: number, hideSpot: HideSpot | null) => void;
}

/** Real clue crop: bbox from the observation, measured against the photo. */
function ClueCrop({
  url,
  bbox,
}: {
  url: string;
  bbox: [number, number, number, number];
}) {
  const aspect = useImageAspect(url);
  const crop = bboxToCrop(bbox, aspect);
  if (!aspectKnown(url)) {
    return (
      <div
        className="photo-mat"
        style={{ aspectRatio: '4 / 5', background: 'var(--ink-3)' }}
        aria-hidden
      />
    );
  }
  return (
    <Photo
      src={url}
      zoom={crop.zoom}
      focus={crop.focus}
      pos={crop.pos}
      ratio={crop.ratio}
      taped
      alt=""
    />
  );
}

export function Editor({ demo, gift, mode, onSeal }: EditorProps) {
  const rootRef = useRef<HTMLElement>(null);
  // local copy so a reclue can refresh the proposals in place
  const [g, setG] = useState<Gift | null>(gift);
  useEffect(() => setG(gift), [gift]);
  const real = !demo && !!g && !!g.clues?.length;

  // one view shape for both real (pipeline) and mock (demo) clues
  const clues: {
    id: string;
    text: string;
    kind: 'seen' | 'inferred';
    photoIndex: number;
    bbox?: [number, number, number, number];
    zoom?: number;
    focus?: string;
  }[] = real
    ? (g!.clues as ApiClue[]).map((c) => ({
        id: c.id,
        text: c.text,
        kind: c.kind === 'inferred' ? 'inferred' : 'seen',
        photoIndex: c.photoIndex ?? 0,
        bbox: c.bbox as [number, number, number, number] | undefined,
      }))
    : CLUES.map((c, i) => ({
        id: `mock-${i}`,
        text: c.text,
        kind: c.kind,
        photoIndex: c.photo,
        zoom: c.zoom,
        focus: c.focus,
      }));

  const [status, setStatus] = useState<('in' | 'out')[]>(clues.map(() => 'in'));
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [hideIdx, setHideIdx] = useState<number | null>(0);
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // which photo becomes the 3D world of the place
  const [worldSrc, setWorldSrc] = useState<number>(g?.worldSource ?? 0);
  // Update the clues with buyer notes (bounded server-side pre-payment)
  const [reclueOpen, setReclueOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [recluing, setRecluing] = useState(false);
  const [reclueMsg, setReclueMsg] = useState<string | null>(null);

  const hideSpots = real ? (g!.hideSpots ?? []) : [];
  const kept = status.filter((s) => s === 'in').length;

  // gallery for mock crops; real crops come from /api/photo
  const mockGalleryUrls = mockGallery();
  const photoUrl = (i: number) =>
    real ? `/api/photo/${g!.id}/${i}` : mockGalleryUrls[i] ?? mockGalleryUrls[0];

  const pickWorld = (i: number) => {
    setWorldSrc(i);
    if (real) setWorldSource(g!.id, i).catch(() => {});
  };

  const doReclue = async () => {
    if (!real || recluing) return;
    setRecluing(true);
    setReclueMsg(null);
    try {
      const r = await reclueGift(g!.id, notes);
      setG(r.gift);
      setStatus((r.gift.clues ?? []).map(() => 'in'));
      setEdits({});
      setReclueOpen(false);
      setNotes('');
      setReclueMsg('Your new clues are ready to look over.');
    } catch (e: any) {
      setReclueMsg(e.message || 'We couldn’t update the clues. Try again.');
    } finally {
      setRecluing(false);
    }
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.clue-card', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.clue-card', {
        opacity: 0,
        y: 26,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.14,
        delay: 0.2,
        clearProps: 'opacity,y',
      });
      gsap.from('.editor-head > *', {
        opacity: 0,
        y: 14,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.1,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const toggle = (i: number) => {
    setStatus((prev) => prev.map((s, j) => (j === i ? (s === 'in' ? 'out' : 'in') : s)));
  };

  const clueText = (i: number) => edits[i] ?? clues[i].text;

  const seal = async () => {
    if (sealing || kept === 0) return;
    setSealing(true);
    setError(null);
    if (real) {
      try {
        const keepIds: string[] = [];
        const ed: Record<string, string> = {};
        status.forEach((s, i) => {
          if (s !== 'in') return;
          keepIds.push(clues[i].id);
          const t = clueText(i);
          if (t !== clues[i].text) ed[clues[i].id] = t;
        });
        await updateClues(g!.id, keepIds, ed);
      } catch (e: any) {
        setError(e.message || 'couldn’t save — try again');
        setSealing(false);
        return;
      }
    }
    // nothing is posted to /hide here — the chosen spot travels to the
    // hide-it scene, which records the hide when the buyer says it's done
    const spot = hideIdx != null ? (hideSpots[hideIdx] ?? null) : null;
    onSeal(kept, spot);
  };

  return (
    <section className="scene scene-editor" ref={rootRef}>
      <div className="scene-inner">
        <header className="editor-head">
          <p className="kicker">make it yours</p>
          <h2 className="scene-title">a few clues, made personal.</h2>
          <p className="lede small">
            {clues.length} clue{clues.length === 1 ? '' : 's'} from these photos. Keep what fits, and change what doesn’t.
          </p>
        </header>

        <div className="clue-grid">
          {clues.map((c, i) => {
            const out = status[i] === 'out';
            return (
              <article
                key={c.id}
                className={`clue-card ${out ? 'is-out' : ''}`}
                style={{ rotate: `${(seeded(i, 7) - 0.5) * 2.4}deg` }}
              >
                <div className="clue-media">
                  {real ? (
                    <ClueCrop
                      url={photoUrl(c.photoIndex)}
                      bbox={c.bbox!}
                    />
                  ) : (
                    <Photo
                      src={photoUrl(c.photoIndex)}
                      zoom={c.zoom}
                      focus={c.focus}
                      ratio="4 / 5"
                      taped
                      alt=""
                    />
                  )}
                  {out && <span className="cut-stamp">cut</span>}
                </div>
                <div className="clue-body">
                  <textarea
                    className="clue-text is-editable"
                    rows={2}
                    value={clueText(i)}
                    onChange={(e) =>
                      setEdits((prev) => ({ ...prev, [i]: e.target.value }))
                    }
                    aria-label={`clue ${i + 1} text`}
                  />
                  <div className="clue-foot">
                    <span className={`clue-tag is-${c.kind}`}>
                      {c.kind === 'seen' ? 'seen in photo' : 'inferred'}
                    </span>
                    <span className="clue-actions">
                      <button
                        className={out ? '' : 'is-active'}
                        onClick={() => toggle(i)}
                        aria-pressed={!out}
                      >
                        {out ? 'restore' : 'keep'}
                      </button>
                      {!out && (
                        <button className="is-danger" onClick={() => toggle(i)}>
                          remove
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {real && (
          <div className="hide-picker clue-card" style={{ rotate: '-0.3deg' }}>
            <div className="clue-body">
              <p className="clue-kicker">which photo becomes the world?</p>
              <div className="world-src-row" role="radiogroup" aria-label="world source photo">
                {Array.from({ length: g!.photoCount }, (_, i) => (
                  <label
                    key={i}
                    className={`world-src-opt ${worldSrc === i ? 'is-active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="world-src"
                      checked={worldSrc === i}
                      onChange={() => pickWorld(i)}
                    />
                    <img src={photoUrl(i)} alt={`photo ${i + 1}`} />
                  </label>
                ))}
              </div>
              <p className="foot-note">
                the reveal builds a 3D world from this photograph — pick the
                clearest, most iconic shot
              </p>
            </div>
          </div>
        )}

        {real && (
          <div className="reclue clue-card" style={{ rotate: '0.3deg' }}>
            <div className="clue-body">
              <button className="demo-link" onClick={() => setReclueOpen((v) => !v)}>
                {reclueOpen ? 'close' : 'something not quite right? →'}
              </button>
              {reclueOpen && (
                <>
                  <textarea
                    className="clue-text is-editable"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. the door is green, not blue — the bench faces the water…"
                    aria-label="Changes to the clues"
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={doReclue}
                    disabled={recluing || !notes.trim()}
                  >
                    {recluing ? 'Looking again…' : 'Update the clues'}
                  </button>
                </>
              )}
              {reclueMsg && <p className="foot-note" aria-live="polite">{reclueMsg}</p>}
            </div>
          </div>
        )}

        {real && mode === 'physical' && hideSpots.length > 0 && (
          <div className="hide-picker clue-card" style={{ rotate: '0.4deg' }}>
            <div className="clue-body">
              <p className="clue-kicker">and where will you hide it?</p>
              <div className="hide-list" role="radiogroup" aria-label="hide spot">
                {hideSpots.map((h, i) => (
                  <label
                    key={h.id}
                    className={`hide-option ${hideIdx === i ? 'is-active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="hide-spot"
                      checked={hideIdx === i}
                      onChange={() => setHideIdx(i)}
                    />
                    <span>{h.description}</span>
                  </label>
                ))}
                <label className={`hide-option ${hideIdx === null ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="hide-spot"
                    checked={hideIdx === null}
                    onChange={() => setHideIdx(null)}
                  />
                  <span>somewhere else — i’ll decide in person</span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="editor-foot">
          <p className="foot-note" aria-live="polite">
            {error ??
              (kept === 0
                ? 'nothing kept — the gift needs at least one true thing'
                : `${kept} clue${kept === 1 ? '' : 's'} kept · ${mode === 'physical' ? 'now go hide it' : 'ready to seal'}`)}
          </p>
          <button className="btn btn-primary" onClick={seal} disabled={kept === 0 || sealing}>
            {sealing ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </section>
  );
}
