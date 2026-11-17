import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../lib/motion';
import type { Direction } from '../App';

interface DoorProps {
  onPhotos: (urls: string[]) => void;
  onDemo: () => void;
  direction: Direction;
  onDirection: (d: Direction) => void;
}

export function Door({ onPhotos, onDemo, direction, onDirection }: DoorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState(0);

  // entrance: elements arrive like objects placed on a table
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.door-anim', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.door-anim', {
        opacity: 0,
        y: 18,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.12,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const urls = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, 12)
        .map((f) => URL.createObjectURL(f));
      if (urls.length === 0) return;
      setCount(urls.length);
      // let the counter breathe for a beat, then move on
      const delay = prefersReducedMotion() ? 250 : 900;
      window.setTimeout(() => onPhotos(urls), delay);
    },
    [onPhotos],
  );

  return (
    <section className="scene scene-door" ref={rootRef}>
      <div className="scene-inner door-inner">
        <p className="kicker door-anim">a gift only one person can open</p>
        <h1 className="wordmark door-anim">enigmagift</h1>
        <p className="lede door-anim">
          give it the photographs. it finds the one thread running through all of
          them — and that becomes the lock only they can pick.
        </p>

        <div
          className={`dropzone door-anim ${dragging ? 'is-dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="drop photos of the two of you, or click to browse"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          <span className="dropzone-glyph" aria-hidden>
            ↑
          </span>
          <span className="dropzone-label">
            {count > 0
              ? `${count} photo${count === 1 ? '' : 's'} gathered — reading them now`
              : 'drop photos of the two of you'}
          </span>
          <span className="dropzone-sub">
            or click to browse — jpg, png, heic · 5 to 10 works best
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div className="seg door-anim" role="group" aria-label="who is this gift for">
          <button
            className={direction === 'someone' ? 'is-active' : ''}
            onClick={() => onDirection('someone')}
          >
            for someone
          </button>
          <button
            className={direction === 'me' ? 'is-active' : ''}
            onClick={() => onDirection('me')}
          >
            for me
          </button>
        </div>

        <button className="demo-link door-anim" onClick={onDemo}>
          try a demo — no photos needed
        </button>
      </div>
    </section>
  );
}
