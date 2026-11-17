import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { CLUES, mockGallery } from '../data';
import { prefersReducedMotion, seeded } from '../lib/motion';
import { Photo } from '../components/Photo';

interface EditorProps {
  photos: string[];
  demo: boolean;
  onSeal: (kept: number) => void;
}

export function Editor({ photos, demo, onSeal }: EditorProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<('in' | 'out')[]>(CLUES.map(() => 'in'));
  const kept = status.filter((s) => s === 'in').length;

  // gallery the clues crop from — demo fills with the mock set
  const gallery = demo || photos.length === 0 ? mockGallery() : photos;

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.clue-card', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.clue-card', {
        opacity: 0,
        y: 26,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.14,
        delay: 0.2,
        clearProps: 'opacity,y',
      });
      gsap.from('.editor-head > *', {
        opacity: 0,
        y: 14,
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.1,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const toggle = (i: number) => {
    setStatus((prev) => prev.map((s, j) => (j === i ? (s === 'in' ? 'out' : 'in') : s)));
  };

  return (
    <section className="scene scene-editor" ref={rootRef}>
      <div className="scene-inner">
        <header className="editor-head">
          <p className="kicker">step three — you are the editor</p>
          <h2 className="scene-title">the agent proposes. you approve.</h2>
          <p className="lede small">
            three things it noticed in your photographs. keep what feels true —
            cut what doesn't. nothing reaches them unreviewed.
          </p>
        </header>

        <div className="clue-grid">
          {CLUES.map((c, i) => {
            const out = status[i] === 'out';
            const src = gallery[c.photo] ?? gallery[0];
            return (
              <article
                key={c.text}
                className={`clue-card ${out ? 'is-out' : ''}`}
                style={{ rotate: `${(seeded(i, 7) - 0.5) * 2.4}deg` }}
              >
                <div className="clue-media">
                  <Photo
                    src={src}
                    zoom={c.zoom}
                    focus={c.focus}
                    ratio="4 / 5"
                    taped
                    alt=""
                  />
                  {out && <span className="cut-stamp">cut</span>}
                </div>
                <div className="clue-body">
                  <p className="clue-text">{c.text}</p>
                  <div className="clue-foot">
                    <span className={`clue-tag is-${c.kind}`}>
                      {c.kind === 'seen' ? 'seen in photo' : 'inferred'}
                    </span>
                    <span className="clue-actions">
                      <button
                        className={out ? '' : 'is-active'}
                        onClick={() => toggle(i)}
                        aria-pressed={!out}
                      >
                        {out ? 'restore' : 'keep'}
                      </button>
                      {!out && (
                        <button className="is-danger" onClick={() => toggle(i)}>
                          remove
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="editor-foot">
          <p className="foot-note">
            {kept === 0
              ? 'nothing kept — the gift needs at least one true thing'
              : `${kept} clue${kept === 1 ? '' : 's'} kept · you can change your mind later`}
          </p>
          <button className="btn btn-primary" onClick={() => onSeal(kept)} disabled={kept === 0}>
            seal it →
          </button>
        </div>
      </div>
    </section>
  );
}
