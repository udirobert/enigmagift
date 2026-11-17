import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import {
  MOCK_PHOTOS,
  mockGallery,
  mockUrl,
  NUDGES,
  ROUND_1,
  ROUND_2,
  THROUGHLINE,
} from '../data';

import { prefersReducedMotion, seeded } from '../lib/motion';
import { Photo, Polaroid } from '../components/Photo';

interface RoundProps {
  round: 1 | 2 | 3;
  photos: string[];
  demo: boolean;
  onDone: () => void;
}

/**
 * The recipient's side. Warm, slow, forgiving — the lock is theatre,
 * never a password. Wrong answers nudge; after three tries it opens anyway.
 */
export function Round({ round, photos, demo, onDone }: RoundProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [attempts, setAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);
  const doneRef = useRef(false);

  const gallery = demo || photos.length === 0 ? mockGallery() : photos;
  const mockSet = demo ? MOCK_PHOTOS : null;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // entrance
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.round-anim', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.round-anim', {
        opacity: 0,
        y: 20,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.16,
        clearProps: 'all',
      });
      gsap.from('.round-photo', {
        opacity: 0,
        scale: 0.96,
        duration: 1.4,
        ease: 'power2.out',
        delay: 0.3,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // demo mode auto-plays: pause, then answer correctly
  useEffect(() => {
    if (!demo || round === 3) return;
    const t = window.setTimeout(() => {
      setSolved(true);
      window.setTimeout(finish, 1100);
    }, 3200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, round]);

  // round 3 is the reveal — statement fades in, then it opens
  useEffect(() => {
    if (round !== 3) return;
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.throughline', { opacity: 1 });
        window.setTimeout(finish, 4200);
        return;
      }
      gsap.to('.throughline', {
        opacity: 1,
        y: 0,
        duration: 1.6,
        delay: 1.1,
        ease: 'power2.out',
      });
      const t = window.setTimeout(finish, 5600);
      return () => window.clearTimeout(t);
    }, rootRef);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const pick = (i: number) => {
    if (solved) return;
    const cfg = round === 1 ? ROUND_1 : ROUND_2;
    if (i === cfg.answer) {
      setSolved(true);
      setNudge(null);
      window.setTimeout(finish, 1100);
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setNudge(NUDGES[Math.min(next - 1, NUDGES.length - 1)]);
    if (next >= 3) {
      // the lock is theatre — it opens anyway
      window.setTimeout(finish, 1600);
    }
  };

  const cfg = round === 1 ? ROUND_1 : ROUND_2;

  return (
    <section className={`scene scene-round round-${round}`} ref={rootRef}>
      <div className="round-halo" aria-hidden />

      <div className="scene-inner round-inner">
        <p className="kicker round-anim">
          {round === 3 ? 'round three — the throughline' : cfg.kicker}
          <span className="round-count">
            {round} / 3
          </span>
        </p>

        {round === 3 ? (
          <>
            <div className="throughline-photos">
              {gallery.slice(0, 5).map((src, i) => (
                <Polaroid
                  key={src}
                  src={src}
                  alt={mockSet?.[i]?.note ?? 'a photograph'}
                  rotate={(seeded(i, 3) - 0.5) * 10}
                  caption={mockSet?.[i]?.year}
                  className="round-anim"
                />
              ))}
            </div>
            <h2 className="throughline round-anim">{THROUGHLINE}</h2>
            <button className="demo-link round-anim" onClick={finish}>
              open the keepsake →
            </button>
          </>
        ) : (
          <>
            <div className={`round-photos round-photos-${round}`}>
              {round === 1 ? (
                <Photo
                  className="round-photo round-anim"
                  src={
                    mockSet
                      ? mockUrl(mockSet[1], 800, 1000)
                      : gallery[1] ?? gallery[0]
                  }
                  zoom={2.7}
                  focus="62% 56%"
                  ratio="4 / 5"
                  alt="a detail from the photographs"
                />
              ) : (
                <>
                  {[2, 3].map((idx) => (
                    <Photo
                      key={idx}
                      className="round-photo round-anim"
                      src={mockSet ? mockUrl(mockSet[idx], 700, 880) : gallery[idx] ?? gallery[0]}
                      zoom={1.45}
                      focus="50% 60%"
                      ratio="4 / 5"
                      alt="two days, years apart"
                    />
                  ))}
                </>
              )}
            </div>

            <h2 className="round-question round-anim">{cfg.question}</h2>

            <div className="attempts round-anim" role="group" aria-label="answer attempts">
              {cfg.options.map((opt, i) => (
                <button
                  key={opt}
                  className={`attempt ${solved && i === cfg.answer ? 'is-right' : ''}`}
                  onClick={() => pick(i)}
                  disabled={solved}
                >
                  {opt}
                </button>
              ))}
            </div>

            <p className={`round-nudge ${nudge ? 'is-visible' : ''}`} aria-live="polite">
              {nudge ?? ' '}
            </p>
            <p className="round-hint round-anim">there are no wrong doors here — only three looks</p>
          </>
        )}
      </div>
    </section>
  );
}
