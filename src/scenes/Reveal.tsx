import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { mockGallery } from '../data';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Polaroid } from '../components/Photo';

interface RevealProps {
  photos: string[];
  demo: boolean;
  direction: 'someone' | 'me';
}

export function Reveal({ photos, demo }: RevealProps) {
  const rootRef = useRef<HTMLElement>(null);
  const gallery = demo || photos.length === 0 ? mockGallery() : photos;
  const keepsake = gallery.slice(0, 6);

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
      gsap.from('.keepsake-photo', {
        opacity: 0,
        scale: 0.92,
        rotate: -4,
        duration: 1.1,
        ease: 'power3.out',
        stagger: 0.12,
        delay: 0.7,
        clearProps: 'opacity,scale',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <section className="scene scene-reveal" ref={rootRef}>
      <div className="scene-inner reveal-inner">
        <p className="kicker reveal-anim">the keepsake</p>

        <div className="keepsake-photos">
          {keepsake.map((src, i) => (
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
          <p className="letter-salutation">dear you,</p>
          <p>
            some gifts you unwrap. this one you follow — three looks down the
            trail, then it gives itself up.
          </p>
          <p>
            every photograph you were given pointed at the same corner of the
            same street. the blue door, the chalkboard, the bench where the
            light sits warmest. you found what i left where i said it would be.
          </p>
          <p>
            the world around that place is being built as you read this. walk
            it when it's ready — it's yours to keep, and yours to pass on.
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
          generated; it's all really yours.
        </p>
      </div>
    </section>
  );
}
