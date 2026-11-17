import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '../lib/motion';
import { TableBackdrop, type TableBackdropHandle } from '../components/TableBackdrop';
import type { Direction } from '../App';

interface DoorProps {
  onPhotos: (files: File[]) => void;
  onDemo: () => void;
  direction: Direction;
  onDirection: (d: Direction) => void;
}

const isFileDrag = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

export function Door({ onPhotos, onDemo, direction, onDirection }: DoorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<TableBackdropHandle>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [tableDrag, setTableDrag] = useState(false);
  const [hintPos, setHintPos] = useState<{ x: number; y: number } | null>(null);
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
      const images = Array.from(files)
        .filter(
          (f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)
        )
        .slice(0, 12);
      if (images.length === 0) return;
      setCount(images.length);
      if (images.length < 5) {
        // not enough for a trail — the counter shows, then clears
        window.setTimeout(() => setCount(0), 1800);
        return;
      }
      // scatter a few onto the table before the scene moves on
      backdropRef.current?.scatter(
        images.slice(0, 5).map((f) => URL.createObjectURL(f))
      );
      // let the counter breathe for a beat, then move on
      const delay = prefersReducedMotion() ? 250 : 900;
      window.setTimeout(() => onPhotos(images), delay);
    },
    [onPhotos],
  );

  /* Drop-on-table: files dragged anywhere over the scene — including     */
  /* straight onto the backdrop cards — land via the same handleFiles     */
  /* flow as the dropzone. A depth counter keeps drag state stable while  */
  /* the pointer crosses child elements.                                  */
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
      if (!isFileDrag(e)) return;
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

  return (
    <section className="scene scene-door" ref={rootRef}>
      <TableBackdrop ref={backdropRef} dragActive={tableDrag} />
      {tableDrag && hintPos && (
        <div
          className="drop-hint"
          style={{ left: hintPos.x, top: hintPos.y }}
          aria-hidden="true"
        >
          spread them on the table
        </div>
      )}
      <div className="scene-inner door-inner">
        <p className="kicker door-anim">a gift only one person can find</p>
        <h1 className="wordmark door-anim">enigmagift</h1>
        <p className="lede door-anim">
          photograph a place that matters. it reads them for what only you would
          know — and that becomes the trail only they can follow.
        </p>

        <div
          className={`dropzone door-anim ${dragging ? 'is-dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="drop photos of the place, or click to browse"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
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
            or click to browse — jpg, png, heic · the more of it you show it, the
            better the trail
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

        <button className="demo-cta door-anim" onClick={onDemo}>
          see one first — thirty seconds
        </button>

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
    </section>
  );
}
