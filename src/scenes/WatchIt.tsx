import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Crop } from '../components/Crop';
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
  | { id: 'reveal'; label: string }
  | { id: 'keepsake'; label: string };

const BEATS: Beat[] = [
  { id: 'photos', label: 'the place' },
  { id: 'read', label: 'the reading' },
  { id: 'round', round: 0, label: 'the first look' },
  { id: 'round', round: 1, label: 'the connection' },
  { id: 'reveal', label: 'the place, named' },
  { id: 'keepsake', label: 'the keepsake' },
];

/** ms each beat holds before the next — the reveal + keepsake hold longer. */
const beatMs = (b: Beat) => {
  if (b.id === 'photos') return 3600;
  if (b.id === 'read') return 4200;
  if (b.id === 'round') return b.round === 0 ? 4200 : 4600;
  if (b.id === 'reveal') return 4600;
  return 5600; // keepsake
};

/**
 * "watch it work" — a real gift, played on its own. This is the payoff the
 * landing leads with: the recipient's side, self-playing. It uses a genuine
 * EnigmaGift trail (baked in) with real photo crops, so a visitor feels what
 * the other person gets without uploading a single photo.
 */
export function WatchIt({ onBack, onBuild }: WatchItProps) {
  const [beat, setBeat] = useState(0);
  const [solved, setSolved] = useState(false);
  const [direction, setDirection] = useState<'someone' | 'me'>('someone');
  const rootRef = useRef<HTMLElement>(null);
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  // advance on a timer; re-arm on beat change
  useEffect(() => {
    clear();
    setSolved(false);
    // for a round beat, reveal the correct answer partway through
    const b = BEATS[beat];
    if (b.id === 'round') {
      timers.current.push(window.setTimeout(() => setSolved(true), 1900));
    }
    const hold = beat < BEATS.length - 1 ? beatMs(b) : Infinity;
    if (hold !== Infinity) {
      timers.current.push(window.setTimeout(() => setBeat((i) => i + 1), hold));
    }
    return clear;
  }, [beat]);

  // entrance animation per beat
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
            <h2 className="wt-head wt-in">
              someone photographed a place that mattered.
              <br />
              five shots, one rainy tuesday.
            </h2>
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
            <h2 className="wt-head wt-in">
              it read every frame, and found the details
              <br />
              only you would know.
            </h2>
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

        {/* ---------------- the reveal — the place, named ---------------- */}
        {b.id === 'reveal' && (
          <div className="wt-stage wt-stage-reveal">
            <div className="wt-throughline-wrap wt-in">
              <p className="wt-throughline">“{SHOWCASE.throughline}”</p>
              <p className="wt-place">{SHOWCASE.placeGuess}</p>
            </div>
            <h2 className="wt-head wt-in">
              the last look names the place itself.
              <br />
              that’s where the thing is waiting.
            </h2>
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
                the photographs all pointed there — but only you could have followed them.
              </p>
            </div>
            <h2 className="wt-head wt-in">
              that’s the payoff. the lock is the photographs;
              <br />
              the code is yours to write.
            </h2>
          </div>
        )}

        {/* ---------------- the call to make one ---------------- */}
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
              make one — £19
            </button>
            <p className="foot-note wt-in">
              you’ll photograph the place, hide the thing, and send them the trail
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
