import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { mockGallery } from '../data';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Polaroid } from '../components/Photo';
import { unlockTrail, type Trail } from '../lib/api';

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

  // code beat — only when the recipient has a real trail
  const [codeDone, setCodeDone] = useState(!real); // demo skips the code
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);

  const gallery = real
    ? (trail!.photoUrls ?? []).slice(0, 6)
    : mockGallery().slice(0, 6);

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
                {trail?.placeGuess
                  ? `you stood where ${trail.placeGuess.toLowerCase()} stands and you found it.`
                  : 'you found what i left where i said it would be.'}{' '}
                the photographs all pointed there — but only you could have
                followed them.
              </p>
              <p>
                the world around that place is being built as you read this.
                walk it when it’s ready — it’s yours to keep, and yours to pass
                on.
              </p>
              <p className="letter-sign">— the one who left it there</p>
            </article>

            <div className="build-status reveal-anim">
              <span className="build-spinner" aria-hidden />
              <div className="build-text">
                <p className="build-title">your gift is being built</p>
                <p className="build-sub mono">
                  composing the world around the place<span className="dots" />
                </p>
              </div>
            </div>

            <p className="foot-note reveal-anim">
              this takes a few minutes — the link stays warm. nothing here was
              generated; it’s all really yours.
            </p>
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
      </div>
    </section>
  );
}
