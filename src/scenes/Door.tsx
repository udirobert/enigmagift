import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../lib/motion';
import {
  WorldBackdrop,
  type WorldBackdropHandle,
} from '../components/WorldBackdrop';
import type { Direction } from '../App';

const isFileDrag = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

interface DoorProps {
  onPhotos: (files: File[]) => void;
  onWatch: () => void;
  direction: Direction;
  onDirection: (d: Direction) => void;
  /** land on the dock (after the story's "make one") rather than the cold-open */
  initialSection?: 'hero' | 'start';
}

/**
 * The landing — one scene, one place, almost no words. A single photograph
 * of the place lifts into its 3D world on a slow loop behind everything;
 * the product's own words ("round 1", "hidden here", "the keepsake") float
 * on the world, so the backdrop shows the product instead of describing it.
 * The dock — drop photos + for whom — is the only move the page offers.
 */
export function Door({
  onPhotos,
  onWatch,
  direction,
  onDirection,
  initialSection = 'hero',
}: DoorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<WorldBackdropHandle>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);
  const [tableDrag, setTableDrag] = useState(false);
  const [hintPos, setHintPos] = useState<{ x: number; y: number } | null>(null);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<'photo' | 'world'>('photo');
  const [dockPulse, setDockPulse] = useState(false);

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

  /* returning from the story — the dock is where they go */
  useEffect(() => {
    if (initialSection !== 'start') return;
    setDockPulse(true);
    const t = window.setTimeout(() => setDockPulse(false), 2600);
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

  const openPicker = () => inputRef.current?.click();

  return (
    <section className="scene scene-door" ref={rootRef}>
      {/* the world behind everything — one photograph, its 3D world */}
      <div className="door-stage">
        <WorldBackdrop
          ref={backdropRef}
          dragActive={tableDrag}
          onPhase={setPhase}
        />
        <div className="door-scrim" aria-hidden />

        {tableDrag && hintPos && (
          <div
            className="drop-hint"
            style={{ left: hintPos.x, top: hintPos.y }}
            aria-hidden="true"
          >
            spread them on the table
          </div>
        )}

        {/* the words — bottom-left, over the world */}
        <div className="door-copy">
          <p className="kicker door-anim">a gift only one person in the world can find</p>
          <h1 className="wordmark door-anim">enigmagift</h1>
          <p className="lede door-anim">
            photograph a place that matters. it builds a trail only they can
            follow — and a code in what you hide opens the keepsake.
          </p>
          <div className="hero-actions door-anim">
            <button className="btn btn-primary" onClick={onWatch}>
              watch it work
            </button>
          </div>
        </div>

        {/* the move — a glass dock on the world */}
        <div
          ref={dockRef}
          className={`door-dock door-anim${dockPulse ? ' is-pulse' : ''}`}
        >
          <div
            className={`dock-drop${tableDrag ? ' is-dragging' : ''}`}
            role="button"
            tabIndex={0}
            aria-label="drop photos of the place, or click to browse"
            onClick={openPicker}
            onKeyDown={(e) => e.key === 'Enter' && openPicker()}
          >
            <span className="dock-glyph" aria-hidden>
              ↑
            </span>
            <span className="dock-label">
              {count > 0
                ? count >= 5
                  ? `${count} photo${count === 1 ? '' : 's'} gathered — reading them now`
                  : `a trail needs at least five — you have ${count}`
                : 'drop photos of the place'}
            </span>
            <span className="dock-sub">
              or click to browse · 5–12 shots · one is a start, more makes the
              truer
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
          <div
            className="seg dock-seg"
            role="group"
            aria-label="who is this gift for"
          >
            <button
              className={direction === 'someone' ? 'is-active' : ''}
              onClick={(e) => {
                e.stopPropagation();
                onDirection('someone');
              }}
            >
              for someone
            </button>
            <button
              className={direction === 'me' ? 'is-active' : ''}
              onClick={(e) => {
                e.stopPropagation();
                onDirection('me');
              }}
            >
              for me
            </button>
          </div>
        </div>

        {/* the promise, live — tracks the backdrop's photo ⇄ world loop */}
        <div className="door-caption mono" aria-live="polite">
          {phase === 'world' ? (
            <span className="is-on">
              one photograph <span className="door-caption-arrow">→</span> a
              world of it
            </span>
          ) : (
            <span>
              one photograph <span className="door-caption-arrow dim">→</span>{' '}
              a world of it
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
