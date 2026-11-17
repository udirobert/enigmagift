import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { readSteps } from '../data';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Polaroid } from '../components/Photo';

interface ReadingProps {
  photos: string[];
  onDone: () => void;
}

const STEP_MS = 1150;
const HOLD_MS = 2100;

export function Reading({ photos, onDone }: ReadingProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(0);
  const steps = readSteps(photos.length || 8);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const timers: number[] = [];

    if (reduced) {
      setShown(steps.length);
      timers.push(window.setTimeout(onDone, 1400));
    } else {
      steps.forEach((_, i) => {
        timers.push(
          window.setTimeout(() => {
            setShown(i + 1);
            // little tick when each line lands
            gsap.fromTo(
              `.step-row:nth-child(${i + 1}) .step-dot`,
              { scale: 0 },
              { scale: 1, duration: 0.35, ease: 'back.out(2)' },
            );
          }, i * STEP_MS + 250),
        );
      });
      timers.push(window.setTimeout(onDone, steps.length * STEP_MS + HOLD_MS));
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // polaroid fan entrance
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.fan-item', { opacity: 1, y: 0, rotate: 0 });
        return;
      }
      gsap.from('.fan-item', {
        opacity: 0,
        y: 34,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.09,
        delay: 0.4,
        clearProps: 'opacity,y',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const shownPhotos = photos.slice(0, 8);

  return (
    <section className="scene scene-reading" ref={rootRef}>
      <div className="scene-inner reading-inner">
        <div className="reading-log">
          <p className="kicker">the agent is reading</p>
          <ul className="steps">
            {steps.map((s, i) => (
              <li
                key={s}
                className={`step-row ${i < shown ? 'is-shown' : ''}`}
                aria-hidden={i >= shown}
              >
                <span className="step-dot" />
                <span className="step-text">{s}</span>
                <span className="step-caret" />
              </li>
            ))}
          </ul>
        </div>

        <div className="fan" aria-hidden>
          {shownPhotos.map((src, i) => (
            <Polaroid
              key={src}
              src={src}
              alt=""
              rotate={(seeded(i) - 0.5) * 14}
              className="fan-item"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
