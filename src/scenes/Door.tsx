import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../lib/motion';
import { HeroFilm } from '../components/HeroFilm';
import { TableBackdrop, type TableBackdropHandle } from '../components/TableBackdrop';
import type { Direction } from '../App';

const isFileDrag = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

interface DoorProps {
  onPhotos: (files: File[]) => void;
  onWatch: () => void;
  direction: Direction;
  onDirection: (d: Direction) => void;
  /** land on the dropzone instead of the hero (after the story's "make one") */
  initialSection?: 'hero' | 'start';
}

/**
 * The landing. Cold-opens on a real film of the place, then one move: make one
 * (the dropzone). The story lives behind "watch it work" — the product shows
 * itself; the page doesn't describe it.
 */
export function Door({ onPhotos, onWatch, direction, onDirection, initialSection = 'hero' }: DoorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<TableBackdropHandle>(null);
  const dragDepth = useRef(0);
  const [tableDrag, setTableDrag] = useState(false);
  const [hintPos, setHintPos] = useState<{ x: number; y: number } | null>(null);
  const [count, setCount] = useState(0);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const images = Array.from(files)
        .filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
        .slice(0, 12);
      if (images.length === 0) return;
      setCount(images.length);
      if (images.length < 5) {
        window.setTimeout(() => setCount(0), 1800);
        return;
      }
      backdropRef.current?.scatter(images.slice(0, 5).map((f) => URL.createObjectURL(f)));
      const delay = prefersReducedMotion() ? 250 : 900;
      window.setTimeout(() => onPhotos(images), delay);
    },
    [onPhotos],
  );

  /* drop anywhere over the page */
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current += 1;
      setTableDrag(true);
    };
    const onOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setHintPos({ x: e.clientX, y: e.clientY });
    };
    const onLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setTableDrag(false);
        setHintPos(null);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setTableDrag(false);
      setHintPos(null);
      handleFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  useEffect(() => {
    if (initialSection !== 'start') return;
    const t = window.setTimeout(() => {
      rootRef.current?.querySelector('.dropzone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [initialSection]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.door-anim', { opacity: 1, y: 0 });
        return;
      }
      gsap.from('.door-anim', {
        opacity: 0,
        y: 18,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.14,
        delay: 0.2,
        clearProps: 'all',
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const scrollToStart = () =>
    rootRef.current?.querySelector('.door-start')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <section className="scene scene-door" ref={rootRef}>
      {/* ---------------------------- the cold-open ---------------------- */}
      <div className="hero">
        <HeroFilm />
        <div className="hero-content">
          <p className="kicker hero-anim">a gift only one person in the world can find</p>
          <h1 className="wordmark hero-anim">enigmagift</h1>
          <p className="lede hero-anim">
            photograph a place that matters. it builds a trail only they can follow —
            and a code in what you hide opens the keepsake.
          </p>
          <div className="hero-actions hero-anim">
            <button className="btn btn-primary" onClick={onWatch}>
              watch it work
            </button>
            <button className="demo-link" onClick={scrollToStart}>
              make one for £19 ↓
            </button>
          </div>
        </div>
      </div>

      {tableDrag && hintPos && (
        <div className="drop-hint" style={{ left: hintPos.x, top: hintPos.y }} aria-hidden="true">
          spread them on the table
        </div>
      )}

      {/* ------------------------- make one — the start ------------------ */}
      <div className="door-start">
        <TableBackdrop ref={backdropRef} dragActive={tableDrag} />
        <div className="scene-inner door-start-inner">
          <div
            className={`dropzone door-anim ${tableDrag ? 'is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="drop photos of the place, or click to browse"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFiles(e.dataTransfer.files);
            }}
          >
            <span className="dropzone-glyph" aria-hidden>
              ↑
            </span>
            <span className="dropzone-label">
              {count > 0
                ? count >= 5
                  ? `${count} photo${count === 1 ? '' : 's'} gathered — reading them now`
                  : `a trail needs at least five — you have ${count}`
                : 'drop photos of the place'}
            </span>
            <span className="dropzone-sub">
              or click to browse — jpg, png, heic · 5–12 shots · the more of it you
              show it, the better the trail
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
        </div>
      </div>
    </section>
  );
}
