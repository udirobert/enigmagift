import { useEffect, useMemo, useRef, useState } from 'react';
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
const POLL_MS = 1600;
/** give up polling after this long — fall back to the scripted read */
const POLL_DEADLINE_MS = 150_000;

const firstChar = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/**
 * The streaming lines — one real "i noticed" per photo, as each photo is
 * read. This is what the buyer watches while the pipeline works: the agent
 * discovering their place in real time, not a spinner and not mock copy.
 */
function noticeLines(g: Gift): string[] {
  const rows = (g.observations ?? [])
    .filter((o) => o.observations?.length)
    .sort((a, b) => a.photoIndex - b.photoIndex);
  const out: string[] = [];
  for (const row of rows.slice(0, 5)) {
    // the most confident, most specific observation in this photo
    const best = [...row.observations!]
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    const d = best?.description;
    if (d) out.push(`i noticed: ${firstChar(d)}`);
  }
  return out;
}

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
  // phase drives which lines are shown:
  //  'reading'  — photos are being read (stream discoveries as they land)
  //  'weaving'  — every photo read, the trail is being assembled
  //  'live'     — pipeline ready, show the real result lines
  //  'demo'     — offline / scripted
  const [phase, setPhase] = useState<'reading' | 'weaving' | 'live' | 'demo'>(
    demo ? 'demo' : 'reading',
  );
  const [observed, setObserved] = useState(0);
  const [notices, setNotices] = useState<string[]>([]);
  const [realGift, setRealGift] = useState<Gift | null>(null);
  const gallery = demo ? mockGallery() : (preview ?? []).slice(0, 8);
  const total = photoCount || (demo ? MOCK_COUNT : 8);

  const finish = (g?: Gift) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(g);
  };

  // live mode: poll the gift. While it reads, stream each photo's real
  // discovery in as it lands (photosObserved ticks up, observations arrive);
  // when the reads are done but the trail isn't, say so ("weaving"); on ready,
  // rewrite the lines with the real result and move on.
  useEffect(() => {
    if (demo || !giftId) return;
    let dead = false;
    let errors = 0;
    const started = Date.now();
    let lastCount = -1;

    const tick = async () => {
      if (dead || doneRef.current) return;
      if (Date.now() - started > POLL_DEADLINE_MS) {
        setPhase((p) => (p === 'reading' || p === 'weaving' ? 'live' : p));
        finish(); // never hard-fail — the real read carries on
        return;
      }
      try {
        const g = await getGift(giftId);
        if (dead || doneRef.current) return;
        errors = 0;

        if (g.status === 'ready' || g.status === 'sealed' || g.status === 'paid') {
          setRealGift(g);
          setPhase('live');
          window.setTimeout(() => finish(g), prefersReducedMotion() ? 900 : 2600);
          return;
        }
        if (g.status === 'error') {
          finish();
          return;
        }

        // still reading: stream the live reads
        const n = g.photosObserved ?? 0;
        if (n !== lastCount) {
          lastCount = n;
          setObserved(n);
          setNotices(noticeLines(g));
          const count = g.photoCount || photoCount;
          // once every photo has been read, the agent is weaving the trail
          setPhase(n >= count && count > 0 ? 'weaving' : 'reading');
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

  // the lines to show, by phase. Reading: a live header + one real discovery
  // per photo read so far. Weaving: the reads are in, the trail is forming.
  // Live: the full real result. Demo: the scripted theatre.
  const displayLines = useMemo<string[]>(() => {
    if (phase === 'demo') return readSteps(total);
    if (phase === 'reading') {
      const out = [
        observed > 0
          ? `i’ve read ${observed} of ${total} photographs so far`
          : 'i’m reading your photographs now',
        ...notices,
      ];
      return out;
    }
    if (phase === 'weaving') {
      return [
        `i’ve read all ${total} photographs`,
        'i found one thing that runs through all of them',
        'i’m weaving it into a trail only they can follow',
      ];
    }
    // live
    if (realGift) return liveSteps(realGift);
    return readSteps(total);
  }, [phase, observed, total, notices, realGift]);

  // reveal the current lines. Scripted mode (demo/offline) reveals them on a
  // timer; live modes reveal them as they stream in (each new line animates in
  // as it arrives, so the buyer watches the agent discover their place).
  const linesKey = displayLines.join('§') + '|' + phase;
  const streaming = phase === 'reading' || phase === 'weaving';
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const timers: number[] = [];

    if (reduced) {
      setShown(displayLines.length);
      if (!giftId) timers.push(window.setTimeout(() => finish(), 1400));
      return;
    }

    if (streaming) {
      // the lines are true as they arrive — reveal all so the newest pops in
      setShown(displayLines.length);
      const last = displayLines.length;
      gsap.fromTo(
        `.step-row:nth-child(${last}) .step-dot`,
        { scale: 0 },
        { scale: 1, duration: 0.35, ease: 'back.out(2)' },
      );
      return;
    }

    displayLines.forEach((_, i) => {
      timers.push(
        window.setTimeout(() => {
          setShown((s) => Math.max(s, i + 1));
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
        window.setTimeout(() => finish(), displayLines.length * STEP_MS + HOLD_MS),
      );
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

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

  const kicker =
    phase === 'weaving'
      ? 'the agent is weaving'
      : phase === 'live'
        ? 'the trail is ready'
        : 'the agent is reading';
  const readPct = total > 0 ? Math.min(1, observed / total) : 0;

  return (
    <section className="scene scene-reading" ref={rootRef}>
      <div className="scene-inner reading-inner">
        <div className="reading-log">
          <p className="kicker">{kicker}</p>
          {(phase === 'reading' || phase === 'weaving') && (
            <div className="read-progress" aria-hidden>
              <span className="read-progress-track">
                <span className="read-progress-bar" style={{ transform: `scaleX(${readPct})` }} />
              </span>
              <span className="read-progress-label mono">
                {observed}/{total} photographs
              </span>
            </div>
          )}
          <ul className="steps">
            {displayLines.map((s, i) => (
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

        <div className={`fan${phase === 'reading' || phase === 'weaving' ? ' is-live-reading' : ''}`} aria-hidden>
          {shownPhotos.map((src, i) => (
            <Polaroid
              key={src}
              src={src}
              alt=""
              rotate={(seeded(i) - 0.5) * 14}
              className={`fan-item ${phase === 'reading' && i < observed ? 'is-read' : ''}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const MOCK_COUNT = 8;
