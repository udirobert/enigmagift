import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/motion';
import './Miniature.css';

// three.js stays out of the entry chunk — one renderer, mounted once, reused
// across replay.
const World = lazy(() => import('./World').then((m) => ({ default: m.World })));

const PHOTO = '/assets/recraft/miniature-source.jpg';
const GLB = '/world-meshy.glb';
const UNFOLD_MS = 2800;

const smoothstep = (p: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The room in the fold — an authored sample: a flat photograph whose two
 * halves hinge open on their bottom edge while the 3D room rises out of it
 * under a clip plane. Scrub it, replay it, then look around. Demo only — the
 * note inside is the sample's own, not the recipient's.
 */
export function Miniature() {
  const stageRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  // the progress the World reads every frame — never a React state
  const unfoldRef = useRef(0);
  const animRef = useRef<{ from: number; t0: number; dur: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false); // unfold asked for before the GLB arrived
  const [noteOpen, setNoteOpen] = useState(false);
  const [status, setStatus] = useState('the room is still folded in its photograph');
  const [shareMsg, setShareMsg] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  const onReady = useCallback(() => setReady(true), []);
  const onError = useCallback(() => {
    setFailed(true);
    unfoldRef.current = 0; // fold the photograph back over the empty stage
    animRef.current = null;
    setStatus('the room stayed on paper this time — the photograph is still yours to keep');
  }, []);

  const startPlayback = useCallback(() => {
    if (prefersReducedMotion()) {
      unfoldRef.current = 1;
      animRef.current = null;
      setPlaying(false);
      setStatus('the room is open — drag to look around');
      return;
    }
    animRef.current = { from: unfoldRef.current, t0: performance.now(), dur: UNFOLD_MS };
    setPlaying(true);
    setStatus('unfolding…');
  }, []);

  const play = useCallback(() => {
    if (failed || playing || waiting) return;
    if (!ready) {
      setWaiting(true);
      setStatus('getting the room ready…');
      return;
    }
    startPlayback();
  }, [failed, playing, waiting, ready, startPlayback]);

  // honour an early press once the model lands
  useEffect(() => {
    if (ready && waiting) {
      setWaiting(false);
      startPlayback();
    }
  }, [ready, waiting, startPlayback]);

  // one RAF: drives the playback tween, pushes progress into the stage's CSS
  // vars, mirrors the slider, and flags the open threshold — no React churn,
  // and no DOM writes at all while progress stands still.
  useEffect(() => {
    let raf = 0;
    let lastProgress = -1;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const a = animRef.current;
      if (a) {
        const t = Math.min(1, (now - a.t0) / a.dur);
        const k = t * t * (3 - 2 * t);
        unfoldRef.current = a.from + (1 - a.from) * k;
        if (t >= 1) {
          animRef.current = null;
          setPlaying(false);
          setStatus('the room is open — drag to look around');
        }
      }
      const p = unfoldRef.current;
      if (p === lastProgress) return;
      lastProgress = p;
      const stage = stageRef.current;
      if (stage) {
        stage.style.setProperty('--fold', smoothstep(p, 0.05, 0.68).toFixed(4));
        stage.style.setProperty('--p', p.toFixed(4));
      }
      // the slider mirrors progress even while focused — a real input event
      // from the visitor still wins because it writes unfoldRef directly
      const r = rangeRef.current;
      if (r) r.value = String(Math.round(p * 100));
      setOpen(p >= 1);
      if (p < 1) setNoteOpen(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const scrub = (v: number) => {
    if (!ready || failed) return;
    animRef.current = null; // interrupt playback — the scrub wins, both ways
    setPlaying(false);
    unfoldRef.current = v / 100;
    setStatus(v >= 100 ? 'the room is open — drag to look around' : 'unfolded by hand');
  };

  const replay = () => {
    unfoldRef.current = 0;
    animRef.current = null;
    setNoteOpen(false);
    startPlayback();
  };

  const share = async () => {
    const url = `${window.location.origin}/?miniature=1`;
    const text = 'a photograph that unfolds into a room — an authored sample';
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'the room in the fold', text, url });
        setShareMsg('sample shared');
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('link copied');
    } catch {
      setShareMsg('copy the link below');
      setShareUrl(url);
    }
  };

  return (
    <section className="miniature reveal-anim" aria-label="the room in the fold — an authored sample">
      <p className="mini-kicker mono">an authored sample · not your photographs</p>
      <h2 className="mini-title">the room in the fold</h2>

      <div
        className={`mini-stage${open ? ' is-open' : ''}${failed ? ' is-failed' : ''}`}
        ref={stageRef}
        style={{ '--fold': 0, '--p': 0 } as React.CSSProperties}
        role={open ? undefined : 'img'}
        aria-label={open ? undefined : 'a dog resting beside the dining table in the source photograph'}
      >
        <div className="mini-plinth" aria-hidden />
        <div className="mini-world" aria-hidden={!open} data-lenis-prevent={open ? '' : undefined}>
          <Suspense fallback={null}>
            <World src={GLB} interactive unfold={unfoldRef} onReady={onReady} onError={onError} />
          </Suspense>
        </div>
        {/* two registered halves of the same flat photograph */}
        <div className="mini-photo mini-photo-left" aria-hidden><img src={PHOTO} alt="" draggable={false} /></div>
        <div className="mini-photo mini-photo-right" aria-hidden><img src={PHOTO} alt="" draggable={false} /></div>
        <span className="mini-crop tl" aria-hidden />
        <span className="mini-crop tr" aria-hidden />
        <span className="mini-crop bl" aria-hidden />
        <span className="mini-crop br" aria-hidden />
      </div>

      <p className="mini-status mono" role="status" aria-live="polite">
        {status}
      </p>

      <div className="mini-controls">
        <button
          type="button"
          className="btn btn-primary"
          onClick={open ? replay : play}
          disabled={failed || waiting || playing}
        >
          {waiting ? 'getting the room ready…' : playing ? 'unfolding…' : open ? 'replay the fold' : 'unfold the room'}
        </button>
        <label className="mini-scrub mono">
          Unfold the photograph
          <input
            ref={rangeRef}
            type="range"
            min={0}
            max={100}
            defaultValue={0}
            disabled={!ready || failed}
            onChange={(e) => scrub(Number(e.target.value))}
          />
        </label>
        {open && !failed && (
          <button type="button" className="btn" onClick={() => setNoteOpen((v) => !v)} aria-expanded={noteOpen}>
            a note tucked under the table
          </button>
        )}
        <a className="btn" href={GLB} download="the-room-in-the-fold.glb">
          keep the miniature
        </a>
        <button type="button" className="btn" onClick={share}>
          share this sample
        </button>
      </div>

      {shareMsg && (
        <p className="mini-share mono" role="status" aria-live="polite">
          {shareMsg}
        </p>
      )}
      {shareUrl && (
        <input className="mini-share-url mono" type="text" readOnly value={shareUrl} aria-label="sample link" onFocus={(e) => e.target.select()} />
      )}

      {noteOpen && (
        <div className="mini-note">
          <p className="mini-note-kicker mono">a note from the sample — not from your sender</p>
          <p>If you could put an afternoon in your pocket, I’d pick this one.</p>
        </div>
      )}
    </section>
  );
}
