import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { readSteps } from '../data';
import { mockGallery } from '../data';
import { getGift, type Gift } from '../lib/api';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Polaroid } from '../components/Photo';

interface ReadingProps {
  demo: boolean;
  /** live gift id — when set, poll until the pipeline finishes */
  giftId?: string | null;
  /** true when the upload couldn't reach the api — show the demo note */
  offline?: boolean;
  /** how many photos the agent is reading (real mode) */
  photoCount: number;
  /** object URLs of the buyer's photos, for the fan (real mode) */
  preview?: string[];
  onDone: (gift?: Gift) => void;
}

const STEP_MS = 1150;
const HOLD_MS = 2100;
const POLL_MS = 2500;
/** give up polling after this long — fall back to the scripted read */
const POLL_DEADLINE_MS = 150_000;

const firstChar = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Steps built from the real gift once the pipeline is done. */
function liveSteps(g: Gift): string[] {
  const n = g.photoCount || 8;
  const steps = [`i read ${n} photo${n === 1 ? '' : 's'}`];

  // a whisper of what it actually saw — one real observation, honestly quoted
  const desc = g.observations
    ?.flatMap((o) => o.observations ?? [])
    .map((o) => o.description)
    .find((d): d is string => !!d);
  if (desc) steps.push(`i noticed: ${firstChar(desc)}`);

  const seen = g.clues?.filter((c) => (c.basis ?? c.kind) !== 'inferred').length;
  const inferred = g.clues?.filter((c) => (c.basis ?? c.kind) === 'inferred').length;
  if (g.clues?.length) {
    steps.push(
      inferred
        ? `i found ${seen ?? g.clues.length} details you can see, and ${inferred} i’m guessing at`
        : `i found ${g.clues.length} detail${g.clues.length === 1 ? '' : 's'} you can see`,
    );
  } else {
    steps.push('i found the details only you would know');
  }
  if (g.throughline) steps.push('i found one thing that runs through all of them');
  steps.push('i built the chain');
  return steps;
}

export function Reading({
  demo,
  giftId = null,
  offline = false,
  photoCount,
  preview,
  onDone,
}: ReadingProps) {
  const rootRef = useRef<HTMLElement>(null);
  const doneRef = useRef(false);
  const [shown, setShown] = useState(0);
  const [steps, setSteps] = useState<string[]>(() =>
    readSteps(photoCount || (demo ? MOCK_COUNT : 8)),
  );
  const gallery = demo ? mockGallery() : (preview ?? []).slice(0, 8);

  const finish = (g?: Gift) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(g);
  };

  // live mode: poll the gift until the pipeline reports 'ready'
  useEffect(() => {
    if (demo || !giftId) return;
    let dead = false;
    let errors = 0;
    const started = Date.now();

    const tick = async () => {
      if (dead || doneRef.current) return;
      if (Date.now() - started > POLL_DEADLINE_MS) {
        finish(); // never hard-fail — the scripted read carries on
        return;
      }
      try {
        const g = await getGift(giftId);
        if (dead || doneRef.current) return;
        errors = 0;
        if (g.status === 'ready' || g.status === 'sealed' || g.status === 'paid') {
          setSteps(liveSteps(g));
          // let the rewritten lines land, then move on
          window.setTimeout(() => finish(g), prefersReducedMotion() ? 900 : 2600);
          return;
        }
        if (g.status === 'error') {
          finish();
          return;
        }
      } catch {
        errors += 1;
        if (errors >= 4) finish(); // api went away mid-read — demo it out
      }
      window.setTimeout(tick, POLL_MS);
    };
    const t = window.setTimeout(tick, POLL_MS);
    return () => {
      dead = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, giftId]);

  // scripted step reveal — in live mode this is the theatre while we poll;
  // on 'ready' the lines are rewritten with real counts and finish() fires.
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const timers: number[] = [];

    if (reduced) {
      setShown(steps.length);
      if (!giftId) timers.push(window.setTimeout(() => finish(), 1400));
    } else {
      steps.forEach((_, i) => {
        timers.push(
          window.setTimeout(() => {
            setShown((s) => Math.max(s, i + 1));
            // little tick when each line lands
            gsap.fromTo(
              `.step-row:nth-child(${i + 1}) .step-dot`,
              { scale: 0 },
              { scale: 1, duration: 0.35, ease: 'back.out(2)' },
            );
          }, i * STEP_MS + 250),
        );
      });
      // scripted fallback — only when there's no live gift to wait for
      if (!giftId) {
        timers.push(
          window.setTimeout(() => finish(), steps.length * STEP_MS + HOLD_MS),
        );
      } else {
        // live: once every scripted line is up, keep the caret blinking on
        // the last one until the poll resolves
        timers.push(
          window.setTimeout(
            () => setShown((s) => Math.max(s, steps.length)),
            steps.length * STEP_MS + 250,
          ),
        );
      }
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

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
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const shownPhotos =
    gallery.length > 0
      ? gallery.slice(0, 8)
      : // no local previews yet (e.g. reload) — keep the theatre with mocks
        mockGallery().slice(0, 6);

  return (
    <section className="scene scene-reading" ref={rootRef}>
      <div className="scene-inner reading-inner">
        <div className="reading-log">
          <p className="kicker">the agent is reading</p>
          <ul className="steps">
            {steps.map((s, i) => (
              <li
                key={`${i}-${s}`}
                className={`step-row ${i < shown ? 'is-shown' : ''}`}
                aria-hidden={i >= shown}
              >
                <span className="step-dot" />
                <span className="step-text">{s}</span>
                <span className="step-caret" />
              </li>
            ))}
          </ul>
          {offline && <p className="foot-note reading-note">offline — demo mode</p>}
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

const MOCK_COUNT = 8;
