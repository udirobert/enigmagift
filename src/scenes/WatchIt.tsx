import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Crop } from '../components/Crop';
import { World } from '../components/World';
import { Polaroid } from '../components/Photo';
import { SHOWCASE, SHOWCASE_CODE } from '../lib/showcase';

interface WatchItProps {
  onBack: () => void;
  onBuild: (direction: 'someone' | 'me') => void;
}

type Beat =
  | { id: 'photos'; label: string }
  | { id: 'read'; label: string }
  | { id: 'round'; round: number; label: string }
  | { id: 'world'; label: string }
  | { id: 'keepsake'; label: string };

const BEATS: Beat[] = [
  { id: 'photos', label: 'the place' },
  { id: 'read', label: 'the reading' },
  { id: 'round', round: 0, label: 'the first look' },
  { id: 'round', round: 1, label: 'the connection' },
  { id: 'round', round: 2, label: 'the place, named' },
  { id: 'world', label: 'the world of it' },
  { id: 'keepsake', label: 'the keepsake' },
];

const beatMs = (b: Beat) => {
  if (b.id === 'photos') return 3200;
  if (b.id === 'read') return 3600;
  if (b.id === 'round') return b.round === 2 ? 4400 : 4000;
  if (b.id === 'world') return 14000; // let them look around
  return 6000; // keepsake
};

/**
 * The story — a real gift, played on its own. One place throughout: the hero
 * film, the trail, the 3D world and the letter are all the same spot, so the
 * product shows itself instead of being described. Almost no narration: the
 * product's own words (kickers, questions, throughline, letter) do the work.
 */
export function WatchIt({ onBack, onBuild }: WatchItProps) {
  const [beat, setBeat] = useState(0);
  const [solved, setSolved] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const [direction, setDirection] = useState<'someone' | 'me'>('someone');
  const rootRef = useRef<HTMLElement>(null);
  const timers = useRef<number[]>([]);

  // stable — World's effect keys off this, and an inline arrow would reload
  // the model on every re-render
  const handleWorldReady = useCallback(() => setWorldReady(true), []);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    clear();
    setSolved(false);
    const b = BEATS[beat];
    // re-entering the world beat replays the flythrough, then the 3D handover
    setWorldReady(false);
    if (b.id === 'round') {
      timers.current.push(window.setTimeout(() => setSolved(true), 1900));
    }
    const hold = beat < BEATS.length - 1 ? beatMs(b) : Infinity;
    if (hold !== Infinity) {
      timers.current.push(window.setTimeout(() => setBeat((i) => i + 1), hold));
    }
    return clear;
  }, [beat]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const els = gsap.utils.toArray('.wt-in');
      if (prefersReducedMotion()) {
        gsap.set(els, { opacity: 1, y: 0 });
        return;
      }
      gsap.from(els, {
        opacity: 0,
        y: 18,
        duration: 0.85,
        ease: 'power3.out',
        stagger: 0.1,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, [beat]);

  const b = BEATS[beat];
  const r = b.id === 'round' ? SHOWCASE.rounds[b.round] : null;

  return (
    <section className="scene scene-wit" ref={rootRef}>
      <div className="scene-inner wit-inner">
        <div className="wit-top">
          <button className="wit-back" onClick={onBack}>
            ← back
          </button>
          <div className="wit-dots" aria-hidden>
            {BEATS.map((_, i) => (
              <span key={i} className={`dot ${i <= beat ? 'is-on' : ''}`} />
            ))}
          </div>
          <span className="wit-skip mono" onClick={() => setBeat(BEATS.length - 1)}>
            skip →
          </span>
        </div>

        <p className="kicker wt-in">{BEATS[beat].label}</p>

        {/* ---------------- the place — the photos arrive ---------------- */}
        {b.id === 'photos' && (
          <div className="wt-stage">
            <div className="wt-fan">
              {SHOWCASE.photoUrls.map((u, i) => (
                <Polaroid
                  key={i}
                  src={u}
                  alt="a photograph of the place"
                  rotate={(seeded(i, 5) - 0.5) * 10}
                  className="wt-in"
                />
              ))}
            </div>
          </div>
        )}

        {/* ---------------- the reading — located observations ------------ */}
        {b.id === 'read' && (
          <div className="wt-stage">
            <div className="wt-notices">
              <Crop
                url={SHOWCASE.photoUrls[1]}
                bbox={(SHOWCASE.rounds[0].crop ?? [0.3, 0.25, 0.2, 0.2]) as [number, number, number, number]}
                className="wt-in"
                caption={`it noticed: ${SHOWCASE.notices[0]}`}
              />
              <Crop
                url={SHOWCASE.photoUrls[0]}
                bbox={(SHOWCASE.rounds[1].crop ?? [0.3, 0.25, 0.2, 0.2]) as [number, number, number, number]}
                className="wt-in"
                caption={`it noticed: ${SHOWCASE.notices[1]}`}
              />
            </div>
          </div>
        )}

        {/* ---------------- a round — the trail, one look ---------------- */}
        {b.id === 'round' && r && (
          <div className="wt-stage">
            <div className={`wt-round ${r.cropPhotoIndex2 != null ? 'wt-round-2' : ''}`}>
              <Crop
                url={SHOWCASE.photoUrls[r.cropPhotoIndex ?? 0]}
                bbox={(r.crop ?? [0.3, 0.25, 0.2, 0.2]) as [number, number, number, number]}
                className="wt-in"
              />
              {r.cropPhotoIndex2 != null && (
                <Crop
                  url={SHOWCASE.photoUrls[r.cropPhotoIndex2]}
                  bbox={(r.crop2 ?? r.crop ?? [0.3, 0.25, 0.2, 0.2]) as [number, number, number, number]}
                  className="wt-in"
                />
              )}
            </div>
            <h2 className="wt-question wt-in">{r.question}</h2>
            <div className="wt-opts">
              {r.options.map((opt, i) => (
                <button
                  key={i}
                  className={`wt-opt wt-in ${solved && i === r.correct ? 'is-right' : ''}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- the world of the place ----------------------- */}
        {b.id === 'world' && (
          <div className="wt-stage wt-stage-world">
            <div className={`wt-world wt-in ${worldReady ? 'is-ready' : ''}`}>
              <video
                className="wt-world-clip"
                src="/world.mp4"
                poster="/showcase/0.jpg"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
              />
              <World
                src="/world.glb"
                fallback="/showcase/0.jpg"
                onReady={handleWorldReady}
              />
            </div>
            <div className="wt-world-copy wt-in">
              <p className="wt-throughline">“{SHOWCASE.throughline}”</p>
              <p className="wt-place">{SHOWCASE.placeGuess}</p>
              <p className="wt-world-hint mono">
                {worldReady ? 'drag to look around' : 'building the world of this place…'}
              </p>
            </div>
          </div>
        )}

        {/* ---------------- the keepsake — the code opens it ------------- */}
        {b.id === 'keepsake' && (
          <div className="wt-stage">
            <div className="wt-keepsake wt-in">
              <div className="wt-code">
                <span className="wt-code-label">the code, written inside the hidden thing</span>
                <span className="wt-code-value mono">{SHOWCASE_CODE}</span>
              </div>
              <p className="wt-letter">
                dear you,
                <br />
                some gifts you unwrap. this one you <em>followed</em> — three looks down the
                trail, then it gave itself up. you stood where{' '}
                <strong>{SHOWCASE.placeGuess.toLowerCase()}</strong> stands, and you found it.
              </p>
            </div>
          </div>
        )}

        {/* ---------------- make one ------------------------------------ */}
        {beat === BEATS.length - 1 && (
          <div className="wt-build">
            <div className="seg wt-in" role="group" aria-label="who is this gift for">
              <button
                className={direction === 'someone' ? 'is-active' : ''}
                onClick={() => setDirection('someone')}
              >
                for someone
              </button>
              <button
                className={direction === 'me' ? 'is-active' : ''}
                onClick={() => setDirection('me')}
              >
                for me
              </button>
            </div>
            <button className="btn btn-primary wt-in" onClick={() => onBuild(direction)}>
              make yours — £19
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
