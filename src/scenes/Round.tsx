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
import { aspectKnown, bboxToCrop, useImageAspect } from '../lib/crop';
import { answerRound, logTrailEvent, type Trail } from '../lib/api';

interface RoundProps {
  demo: boolean;
  /** recipient trail (real mode) — null in demo */
  trail: Trail | null;
  round: 1 | 2 | 3;
  onDone: () => void;
}

/** Unified round shape: the API's `correct` and the mock's `answer` become `answer`. */
interface RoundCfg {
  kicker: string;
  question: string;
  options: string[];
  /** demo scripted rounds only — live rounds never receive the answer key */
  answer?: number;
  cropPhotoIndex?: number;
  crop?: [number, number, number, number];
  cropPhotoIndex2?: number;
  crop2?: [number, number, number, number];
}

/** A crop of a real photo, computed from the observation bbox. */
function RealCrop({
  url,
  bbox,
  className = '',
  alt = 'a detail from the photographs',
}: {
  url: string;
  bbox: [number, number, number, number];
  className?: string;
  alt?: string;
}) {
  const aspect = useImageAspect(url);
  const crop = bboxToCrop(bbox, aspect);
  if (!aspectKnown(url)) {
    return (
      <div className={`photo ${className}`} aria-hidden>
        <div
          className="photo-mat"
          style={{ aspectRatio: '4 / 5', background: 'var(--ink-3)' }}
        />
      </div>
    );
  }
  return (
    <Photo
      className={className}
      src={url}
      zoom={crop.zoom}
      focus={crop.focus}
      pos={crop.pos}
      ratio={crop.ratio}
      alt={alt}
    />
  );
}

/**
 * The recipient's side. Warm, slow, forgiving — the lock is theatre,
 * never a password. Wrong answers nudge; after three tries it opens anyway.
 */
export function Round({ demo, trail, round, onDone }: RoundProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [attempts, setAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [rightIdx, setRightIdx] = useState<number | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  // Phase 2 — honest misses: after a wrong look, label the actual crop so the
  // place itself corrects them (shown briefly, then they look again).
  const [truth, setTruth] = useState(false);
  const truthTimer = useRef<number | undefined>(undefined);
  // Phase 2 — progressive payout: a correct look releases one line of the
  // giver's letter (or the full photo behind the crop when there's no letter).
  const [payout, setPayout] = useState<string | null>(null);
  const doneRef = useRef(false);
  const enteredAtRef = useRef(Date.now());

  const real = !demo && !!trail;
  // remember when the hunt started (for the reveal's recap stats)
  useEffect(() => {
    enteredAtRef.current = Date.now();
  }, [round]);
  useEffect(() => {
    if (!real) return;
    try {
      if (!sessionStorage.getItem('eg_started')) sessionStorage.setItem('eg_started', String(Date.now()));
    } catch { /* private mode */ }
  }, [real]);
  const apiRound = real ? trail!.rounds[round - 1] : undefined;
  // a trail with fewer rounds than expected degrades to the scripted round
  const live = real && !!apiRound;
  const cfg: RoundCfg = live
    ? {
        kicker: apiRound!.kicker,
        question: apiRound!.question,
        options: apiRound!.options,
        answer: apiRound!.correct,
        cropPhotoIndex: apiRound!.cropPhotoIndex,
        crop: apiRound!.crop,
        cropPhotoIndex2: apiRound!.cropPhotoIndex2,
        crop2: apiRound!.crop2,
      }
    : ((round === 1 ? ROUND_1 : ROUND_2) as unknown as RoundCfg);
  const mockSet = demo ? MOCK_PHOTOS : null;

  // Phase 3 — short trails degrade honestly: the total round count comes from
  // the real trail when there is one, so a one-photo gift reads "1 / 1".
  const totalRounds = real && trail ? Math.max(1, trail.rounds.length || 3) : 3;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (real) {
      logTrailEvent(trail!.token, `round_${round}_dwell`, {
        ms: Math.max(0, Date.now() - enteredAtRef.current),
        attempts,
        outcome: round === 3 ? 'throughline' : solved ? 'correct' : exhausted ? 'opened_anyway' : 'continued',
      });
    }
    onDone();
  };

  // Phase 2 — no auto-advance. After three misses the recipient chooses to
  // open it: owning the choice is the difference between a gift and a paywall.
  // The demo keeps its scripted theatre.
  const exhausted = attempts >= 3;

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
    if (demo || round === 3) return;
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

  // Phase 2 — the letter line each round releases. Split the giver's words
  // into paragraphs; rounds 1 and 2 hand out the first two, round 3 (the
  // throughline) hands out the rest. With no letter, the full photo behind
  // the crop is the payout instead.
  function letterLine(t: Trail, r: 1 | 2 | 3): string | null {
    const body = (t.message ?? '').trim();
    if (!body) return null;
    const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paras.length === 0) return null;
    if (r === 1) return paras[0];
    if (r === 2) return paras[1] ?? null;
    return paras.slice(2).join('\n\n') || null;
  }

  const pick = (i: number) => {
    if (solved) return;
    if (live) {
      // the answer key never leaves the server — ask it, then react
      answerRound(trail!.token, round - 1, i)
        .then((res) => {
          logTrailEvent(trail!.token, `round_${round}_picked`, { choice: i, correct: res.correct, attempts: attempts + 1 });
          // keep the picks client-side for the reveal recap (the server never
          // sends the answer key, so the recap reads these local records)
          try {
            const picks = JSON.parse(sessionStorage.getItem('eg_picks') || '[]');
            picks.push({ round, choice: i, correct: res.correct, at: Date.now() });
            sessionStorage.setItem('eg_picks', JSON.stringify(picks));
          } catch { /* private mode */ }
          if (res.correct) {
            setRightIdx(i);
            setSolved(true);
            setNudge(null);
            setTruth(false);
            // Phase 2 — the look pays out: one line of the giver's letter
            setPayout(letterLine(trail!, round));
            logTrailEvent(trail!.token, `round_${round}_payout`, { line: true });
            return;
          }
          const next = attempts + 1;
          setAttempts(next);
          setNudge(NUDGES[Math.min(next - 1, NUDGES.length - 1)]);
          if (next >= 3) {
            setAttempts(next);
            setTruth(true);
            if (truthTimer.current) window.clearTimeout(truthTimer.current);
            truthTimer.current = window.setTimeout(() => setTruth(false), 2600);
            // no auto-advance — the "open it anyway" button appears instead
          }
        })
        .catch(() => {});
      return;
    }
    if (i === cfg.answer) {
      setSolved(true);
      setNudge(null);
      setPayout('the photo, whole — as it was taken');
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    setNudge(NUDGES[Math.min(next - 1, NUDGES.length - 1)]);
    if (next >= 3) {
      setTruth(true);
      if (truthTimer.current) window.clearTimeout(truthTimer.current);
      truthTimer.current = window.setTimeout(() => setTruth(false), 2600);
      // the lock is theatre — but the recipient owns the choice now
    }
  };

  // mock crops: prefer the seeded mock set, fall back to the plain gallery
  const galleryUrls = mockGallery();
  const mockSrc = (i: number, w = 700, h = 880) =>
    mockSet ? mockUrl(mockSet[i], w, h) : galleryUrls[i] ?? galleryUrls[0];

  const photoUrl = (i: number) =>
    real
      ? (trail!.photoUrls ?? [])[i] ?? (trail!.photoUrls ?? [])[0]
      : undefined;

  const fan = real
    ? (trail!.photoUrls ?? []).slice(0, 5)
    : mockSet
      ? mockSet.map((p) => mockUrl(p, 640, 800)).slice(0, 5)
      : mockGallery().slice(0, 5);

  return (
    <section className={`scene scene-round round-${round}`} ref={rootRef}>
      <div className="round-halo" aria-hidden />

      <div className="scene-inner round-inner">
        <p className="kicker round-anim">
          {cfg.kicker}
          <span className="round-count">
            {round} / {totalRounds}
          </span>
        </p>

        {round === 3 ? (
          <>
            <div className="throughline-photos">
              {fan.map((src, i) => (
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
            <h2 className="throughline round-anim">
              {real ? trail!.throughline || THROUGHLINE : THROUGHLINE}
            </h2>
            {real && trail!.placeGuess && (
              <p className="throughline-sub round-anim">{trail!.placeGuess}</p>
            )}
            {real && round === 3 && trail!.hideHint && (
              <p className="round-hide-hint round-anim">
                one last clue — the thing is hidden {trail!.hideHint}
              </p>
            )}
            <button className="demo-link round-anim" onClick={finish}>
              {real && trail!.hideHint && round === 3 ? 'go find it →' : 'open the keepsake →'}
            </button>
          </>
        ) : (
          <>
            <div className={`round-photos round-photos-${round}`}>
              {live ? (
                <>
                  <div className={`round-crop-wrap ${truth ? 'is-truth' : ''}`}>
                    <RealCrop
                      className="round-photo round-anim"
                      url={photoUrl(cfg.cropPhotoIndex ?? 0) ?? ''}
                      bbox={cfg.crop ?? [0, 0, 1, 1]}
                    />
                    {truth && (
                      <span className="round-truth" aria-live="polite">
                        this is what's there — look again
                      </span>
                    )}
                  </div>
                  {round === 2 && (
                    <div className={`round-crop-wrap ${truth ? 'is-truth' : ''}`}>
                      <RealCrop
                        className="round-photo round-anim"
                        url={photoUrl(cfg.cropPhotoIndex2 ?? 1) ?? ''}
                        bbox={cfg.crop2 ?? cfg.crop ?? [0, 0, 1, 1]}
                      />
                    </div>
                  )}
                </>
              ) : round === 1 ? (
                <Photo
                  className="round-photo round-anim"
                  src={mockSrc(1, 800, 1000)}
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
                      src={mockSrc(idx, 700, 880)}
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

            <div
              className="attempts round-anim"
              role="group"
              aria-label="answer attempts"
            >
              {cfg.options.map((opt, i) => (
                <button
                  key={opt}
                  className={`attempt ${solved && i === (live ? rightIdx : cfg.answer) ? 'is-right' : ''}`}
                  onClick={() => pick(i)}
                  disabled={solved}
                >
                  {opt}
                </button>
              ))}
            </div>

            <p className={`round-nudge ${nudge ? 'is-visible' : ''}`} aria-live="polite">
              {nudge ?? ' '}
            </p>

            {/* Phase 2 — the payout: what the correct look released */}
            {solved && payout && (
              <div className="round-payout" role="status">
                <p className="round-payout-line">{payout.split(/\n{2,}/).map((p, i) => (
                  <span key={i}>{p.trim()}</span>
                ))}</p>
                <button className="demo-link" onClick={finish}>
                  {round === 2 ? 'one more look →' : 'keep going →'}
                </button>
              </div>
            )}
            {solved && !payout && (
              <button className="demo-link" onClick={finish}>
                {round === 2 ? 'one more look →' : 'keep going →'}
              </button>
            )}
            {exhausted && !solved && (
              <button className="demo-link round-open-anyway" onClick={finish}>
                open it anyway →
              </button>
            )}
            <p className="round-hint round-anim">
              there are no wrong doors here — only looks
            </p>
            {real && round === 1 && (
              <p className="round-privacy round-anim">
                made for you from photos someone shared with permission ·{' '}
                <a href="/privacy" target="_blank" rel="noreferrer">privacy</a>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
