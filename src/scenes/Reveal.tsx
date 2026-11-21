import { Suspense, useCallback, useEffect, useMemo, useRef, useState, lazy } from 'react';
import { gsap } from 'gsap';
import { mockGallery } from '../data';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Polaroid } from '../components/Photo';
import { Miniature } from '../components/Miniature';
import { logTrailEvent, unlockTrail, worldStatus, type Trail, type WorldStatus } from '../lib/api';

// three.js is only for the world — keep it out of the main chunk
const World = lazy(() =>
  import('../components/World').then((m) => ({ default: m.World })),
);

interface RevealProps {
  demo: boolean;
  trail: Trail | null;
  direction: 'someone' | 'me';
}

/**
 * The keepsake. In real mode it arrives in two beats: the hunt is done
 * (the thing is found, the code is in their hands), then the code unlocks
 * the digital residue — the letter, the world of the place, the film.
 */
export function Reveal({ demo, trail, direction }: RevealProps) {
  const rootRef = useRef<HTMLElement>(null);
  const real = !demo && !!trail;
  // digital gifts (The Trail) have no code — the keepsake opens directly
  const needsCode = real && trail?.requiresCode !== false;

  // code beat — only when the recipient has a real trail that requires a code
  const [codeDone, setCodeDone] = useState(!needsCode); // demo + digital skip the code

  useEffect(() => {
    if (real && trail && trail.requiresCode === false) setCodeDone(true);
  }, [real, trail]);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);

  // the 3D world of the place — built at seal time, so by the time the
  // recipient unlocks it's usually already done. Real trails poll the build;
  // the demo renders the showcase world so the letter's promise holds in
  // preview too.
  const [worldState, setWorldState] = useState<WorldStatus>(
    real ? (trail!.worldStatus ?? 'worlding') : 'ready',
  );
  const worldUrl = real ? trail!.worldUrl : '/world.glb';
  // the keepsake portrait — painted from the place photo at seal time.
  // Real trails get it once the build reports ready; the demo shows the
  // canonical one so the reveal is complete in preview too.
  const portraitUrl = real
    ? trail!.portraitUrl
    : '/assets/recraft/keepsake-portrait-room.webp';
  // did the world finish before they unlocked, or did they watch it build?
  const [worldNote, setWorldNote] = useState<'instant' | 'built' | null>(null);
  const [copiedBack, setCopiedBack] = useState(false);

  // the recipient's own picks, kept client-side by Round (the server never
  // sends the answer key) — drives the recap and the note back to the giver
  const recap = useMemo(() => {
    if (!real || !trail) return null;
    try {
      const picks: { round: number; choice: number; correct: boolean; at: number }[] = JSON.parse(
        sessionStorage.getItem('eg_picks') || '[]',
      );
      const started = Number(sessionStorage.getItem('eg_started') || Date.now());
      const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
      const perRound = trail.rounds.map((r, idx) => {
        const p = picks.filter((x) => x.round === idx + 1);
        const first = p[0];
        return {
          round: idx + 1,
          picked: first ? r.options[first.choice] : null,
          right: first?.correct ?? false,
          looks: p.length,
          photo: trail.photoUrls?.[r.cropPhotoIndex ?? 0] ?? null,
        };
      });
      return { perRound, looks: picks.length, mins, rounds: trail.rounds.length };
    } catch {
      return null;
    }
  }, [real, trail]);

  const copyFoundIt = async () => {
    if (!trail) return;
    const msg = `i followed the trail and found it 💛 — ${recap?.rounds ?? 3} rounds, ${recap?.looks ?? 0} looks, ${recap?.mins ?? 0} min · made with enigmagift (${window.location.origin})`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedBack(true);
      window.setTimeout(() => setCopiedBack(false), 1600);
    } catch { /* clipboard blocked — the text is short enough to type */ }
    logTrailEvent(trail.token, 'shared_back', { looks: recap?.looks, mins: recap?.mins });
  };
  const [worldLoaded, setWorldLoaded] = useState(false);
  const onWorldReady = useCallback(() => setWorldLoaded(true), []);
  useEffect(() => {
    if (codeDone && worldNote === null) {
      setWorldNote(worldState === 'ready' ? 'instant' : 'built');
    }
  }, [codeDone, worldState, worldNote]);
  // re-entering a build (it just finished on this page) replays the assemble
  useEffect(() => {
    if (worldState !== 'ready') setWorldLoaded(false);
  }, [worldState]);

  const gallery = real
    ? (trail!.photoUrls ?? []).slice(0, 6)
    : mockGallery().slice(0, 6);

  // poll the world build until it's ready (or failed). Cheap, stops on done.
  // Backoff while it's still building (builds take 45–90s): 5s → 10s → 20s cap.
  useEffect(() => {
    if (!real || !trail) return;
    if (worldState === 'ready' || worldState === 'failed') return;
    let dead = false;
    let delay = 5000;
    let timer: number | undefined;
    const tick = async () => {
      if (dead) return;
      try {
        const r = await worldStatus(trail.token);
        const s = r.worldStatus || 'worlding';
        if (!dead) setWorldState((cur) => (cur === s ? cur : s));
      } catch {
        /* api blip — keep polling */
      }
      if (!dead) {
        delay = Math.min(delay * 2, 20000);
        timer = window.setTimeout(tick, delay);
      }
    };
    tick();
    const stop = window.setTimeout(() => {
      dead = true;
      if (timer) window.clearTimeout(timer);
    }, 5 * 60 * 1000);
    return () => {
      dead = true;
      if (timer) window.clearTimeout(timer);
      window.clearTimeout(stop);
    };
  }, [real, trail, worldState]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.reveal-anim', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.reveal-anim', {
        opacity: 0,
        y: 22,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.12,
        delay: 0.2,
        clearProps: 'all',
      });
      if (codeDone) {
        gsap.from('.keepsake-photo', {
          opacity: 0,
          scale: 0.92,
          rotate: -4,
          duration: 1.1,
          ease: 'power3.out',
          stagger: 0.12,
          delay: 0.7,
          clearProps: 'all',
        });
      }
    }, rootRef);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeDone]);

  const submitCode = async () => {
    if (!real || checking || code.trim().length < 4) return;
    setChecking(true);
    setWrong(false);
    try {
      const r = await unlockTrail(trail!.token, code.trim().toUpperCase());
      if (r.unlocked) {
        setCodeDone(true);
        window.scrollTo(0, 0);
      } else {
        setWrong(true);
      }
    } catch {
      setWrong(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="scene scene-reveal" ref={rootRef}>
      <div className="scene-inner reveal-inner">
        <p className="kicker reveal-anim">
          {codeDone ? 'the keepsake' : 'you found it'}
        </p>

        {codeDone ? (
          <>
            {!real && <Miniature />}

            <div className="keepsake-photos">
              {gallery.map((src, i) => (
                <Polaroid
                  key={src}
                  src={src}
                  alt=""
                  rotate={(seeded(i, 11) - 0.5) * 8}
                  className={`keepsake-photo reveal-anim ${i % 3 === 1 ? 'is-tall' : ''}`}
                />
              ))}
            </div>

            <article className="letter reveal-anim">
              <p className="letter-salutation">
                {direction === 'me' ? 'dear future me,' : 'dear you,'}
              </p>
              <p>
                some gifts you unwrap. this one you follow — three looks down
                the trail, then it gives itself up.
              </p>
              <p>
                {needsCode
                  ? trail?.placeGuess
                    ? `you stood where ${trail.placeGuess.toLowerCase()} stands and you found it.`
                    : 'you found what i left where i said it would be.'
                  : trail?.placeGuess
                    ? `every clue pointed to where ${trail.placeGuess.toLowerCase()} stands — and you followed them all.`
                    : 'you followed every clue to the end.'}{' '}
                the photographs all pointed there — but only you could have
                followed them.
              </p>
              <p>
                while you were following the trail, your photographs became a
                world you can stand inside. it’s right here — it’s yours to
                keep, and yours to pass on.
              </p>
              <p className="letter-sign">— the one who left it there</p>
            </article>

            {/* recap of their own hunt + a note they can send back to the giver */}
            {recap && recap.perRound.length > 0 && (
              <div className="reveal-recap reveal-anim">
                <p className="kicker">your trail</p>
                <div className="recap-polaroids">
                  {recap.perRound.map((r) => (
                    <figure key={r.round} className="recap-polaroid">
                      {r.photo && <img src={r.photo} alt="" draggable={false} />}
                      <figcaption>
                        <span className="recap-round mono">round {r.round}</span>
                        {r.picked ? `“${r.picked}”` : '—'}
                        <span className="recap-verdict">
                          {r.right ? ' · right first look' : r.looks > 0 ? ` · ${r.looks} looks` : ''}
                        </span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
                <p className="recap-stats mono">
                  {recap.rounds} rounds · {recap.looks} looks · {recap.mins} min
                </p>
                <button className="demo-link" onClick={() => void copyFoundIt()}>
                  {copiedBack ? 'copied — send it to them 💛' : 'copy a note to send back →'}
                </button>
              </div>
            )}

            {worldState === 'ready' && worldUrl ? (
              <div className="reveal-world reveal-anim">
                <div className={`reveal-world-stage${worldLoaded ? ' is-loaded' : ''}`}>
                  {/* the flat photo holds, then the world assembles out of it */}
                  <div className="reveal-world-photo" aria-hidden>
                    <img src={gallery[0] ?? '/showcase/0.jpg'} alt="" draggable={false} />
                  </div>
                  <Suspense fallback={null}>
                    <World
                      src={worldUrl}
                      interactive
                      onReady={onWorldReady}
                      className="reveal-world-canvas"
                    />
                  </Suspense>
                </div>
                <p className="reveal-world-note mono">
                  {worldNote === 'built'
                    ? 'it finished while you were here'
                    : 'it finished while you were away'}
                </p>
                <div className="reveal-world-actions">
                  <a
                    className="btn btn-primary"
                    href={worldUrl}
                    download="your-world.glb"
                  >
                    keep this world
                  </a>
                  <span className="reveal-world-hint mono">
                    drag to look around · a 3D world of the place, yours to keep
                  </span>
                </div>
              </div>
            ) : worldState === 'failed' ? (
              <div className="build-status reveal-anim">
                <span className="build-spinner is-done" aria-hidden />
                <div className="build-text">
                  <p className="build-title">the world won’t load right now</p>
                  <p className="build-sub mono">
                    the photographs are still yours — the world will follow
                  </p>
                </div>
              </div>
            ) : (
              <div className="build-status build-status-building reveal-anim">
                <span className="build-spinner" aria-hidden />
                <div className="build-text">
                  <p className="build-title">building the world of your place</p>
                  <p className="build-sub mono">
                    turning a photograph into something you can stand in — it’s
                    usually done before you finish reading the letter above
                    <span className="dots" />
                  </p>
                </div>
              </div>
            )}

            {portraitUrl && (
              <figure className="keepsake-portrait reveal-anim">
                <img
                  src={portraitUrl}
                  alt="a portrait of the place, drawn from your photographs"
                />
                <figcaption className="reveal-world-note">
                  a portrait of the place
                </figcaption>
                <div className="reveal-world-actions">
                  <a
                    className="btn btn-primary"
                    href={portraitUrl}
                    download="portrait-of-the-place"
                  >
                    keep this portrait
                  </a>
                  <span className="reveal-world-hint mono">
                    drawn from the photograph that became the world — print it,
                    frame it
                  </span>
                </div>
              </figure>
            )}
          </>
        ) : (
          <>
            <div className="keepsake-photos">
              {gallery.slice(0, 3).map((src, i) => (
                <Polaroid
                  key={src}
                  src={src}
                  alt=""
                  rotate={(seeded(i, 11) - 0.5) * 8}
                  className={`keepsake-photo reveal-anim`}
                />
              ))}
            </div>

            <article className="letter reveal-anim code-letter">
              <p className="letter-salutation">it’s in your hands</p>
              <p>
                the code is inside the thing you found — scratched into the
                card, taped under the lid, written on the back.
              </p>
              <p>
                six letters, no spaces. type it in and the rest of the gift
                opens.
              </p>
            </article>

            <div className="code-entry reveal-anim">
              <input
                className="code-input"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase().replace(/\s/g, ''));
                  setWrong(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                placeholder="CODE"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                aria-label="unlock code"
              />
              <button
                className="btn btn-primary"
                onClick={submitCode}
                disabled={checking || code.trim().length < 4}
              >
                {checking ? 'unlocking…' : 'unlock the keepsake'}
              </button>
              {wrong && (
                <p className="round-nudge is-visible" aria-live="polite">
                  not quite — check the code again
                </p>
              )}
            </div>
          </>
        )}

        {/* virality — the recipient becomes the next giver */}
        <div className="reveal-make reveal-anim">
          <a className="demo-link" href="/">
            loved this? make one for someone you love →
          </a>
        </div>
      </div>
    </section>
  );
}
