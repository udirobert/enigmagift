import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../lib/motion';
import { HeroFilm } from '../components/HeroFilm';
import { Crop } from '../components/Crop';
import { TableBackdrop, type TableBackdropHandle } from '../components/TableBackdrop';
import { SHOWCASE, SHOWCASE_CODE } from '../lib/showcase';
import type { Direction } from '../App';

gsap.registerPlugin(ScrollTrigger);

interface DoorProps {
  onPhotos: (files: File[]) => void;
  onWatch: () => void;
  direction: Direction;
  onDirection: (d: Direction) => void;
  /** land on the dropzone instead of the hero (after the tour's "make one") */
  initialSection?: 'hero' | 'start';
}

const isFileDrag = (e: DragEvent) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

/**
 * The landing. Cold-opens on a short film (a real EnigmaGift photograph,
 * animated), then explains what it actually does through the product's own
 * crops — so a visitor *sees* the payoff before being asked for anything.
 *
 * Two moves: "watch it work" (the self-playing tour) and "make one" (the
 * dropzone, reframed as starting *your* gift).
 */
export function Door({ onPhotos, onWatch, direction, onDirection, initialSection = 'hero' }: DoorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<TableBackdropHandle>(null);
  const dragDepth = useRef(0);
  const [tableDrag, setTableDrag] = useState(false);
  const [hintPos, setHintPos] = useState<{ x: number; y: number } | null>(null);
  const [count, setCount] = useState(0);

  const heroCrops = [
    { url: SHOWCASE.photoUrls[1], bbox: (SHOWCASE.rounds[0].crop ?? [0.3, 0.25, 0.2, 0.2]) as [number, number, number, number] },
    { url: SHOWCASE.photoUrls[0], bbox: (SHOWCASE.rounds[1].crop ?? [0.3, 0.25, 0.2, 0.2]) as [number, number, number, number] },
  ];

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

  /* after the tour's "make one", land on the dropzone, not the hero */
  useEffect(() => {
    if (initialSection !== 'start') return;
    const t = window.setTimeout(() => {
      rootRef.current?.querySelector('.dropzone')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [initialSection]);

  /* hero entrance + scroll-driven reveals for the beats */
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) {
        gsap.set('.door-anim', { opacity: 1, y: 0 });
        gsap.set('.door-beat', { opacity: 1, y: 0 });
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
      gsap.utils.toArray<HTMLElement>('.door-beat').forEach((el) => {
        gsap.from(el, {
          opacity: 0,
          y: 44,
          duration: 1.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 78%' },
        });
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <section className="scene scene-door" ref={rootRef}>
      {/* ---------------------------- the cold-open ---------------------- */}
      <div className="hero">
        <HeroFilm />
        <div className="hero-content">
          <p className="kicker hero-anim">a gift only one person in the world can find</p>
          <h1 className="wordmark hero-anim">enigmagift</h1>
          <p className="lede hero-anim">
            photograph a place that matters. it reads them for what only you would
            know — and that becomes the trail only they can follow.
          </p>
          <div className="hero-actions hero-anim">
            <button className="btn btn-primary" onClick={onWatch}>
              watch it work
            </button>
            <button
              className="demo-link"
              onClick={() =>
                rootRef.current?.querySelector('.door-body')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              make one for £19 ↓
            </button>
          </div>
          <p className="hero-scroll mono" aria-hidden>
            scroll
          </p>
        </div>
      </div>

      {tableDrag && hintPos && (
        <div className="drop-hint" style={{ left: hintPos.x, top: hintPos.y }} aria-hidden="true">
          spread them on the table
        </div>
      )}

      {/* ------------------------- what it actually does ------------------ */}
      <div className="door-body">
        <TableBackdrop ref={backdropRef} dragActive={tableDrag} />
        <div className="scene-inner door-body-inner">
          <p className="kicker door-beat">what it does</p>

          {/* beat 1 — the reading */}
          <div className="door-beat door-beat-grid">
            <div className="door-crops">
              {heroCrops.map((c, i) => (
                <Crop
                  key={i}
                  url={c.url}
                  bbox={c.bbox}
                  caption={i === 0 ? `it noticed: ${SHOWCASE.notices[0]}` : ''}
                />
              ))}
            </div>
            <div className="door-beat-copy">
              <h2 className="door-beat-h">
                it reads your photos for the details only you would know.
              </h2>
              <p className="door-beat-p">
                not a caption on a photo — a <em>located</em> detail it can zoom straight to.
                the blue door, the same table by the window, a sign only you remember.
              </p>
            </div>
          </div>

          {/* beat 2 — the trail */}
          <div className="door-beat door-beat-grid door-beat-flip">
            <div className="door-crops">
              <div className="door-trailcard">
                <Crop url={heroCrops[0].url} bbox={heroCrops[0].bbox} />
                <p className="door-trail-q">{SHOWCASE.rounds[0].question}</p>
                <div className="door-trail-a">
                  {SHOWCASE.rounds[0].options.map((o, i) => (
                    <span key={i} className={i === SHOWCASE.rounds[0].correct ? 'is-right' : ''}>
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="door-beat-copy">
              <h2 className="door-beat-h">
                then it becomes a trail only they can follow.
              </h2>
              <p className="door-beat-p">
                three looks, escalating. the first is a tight crop of something in
                <em> their own place</em> — and a question only the person who knows it can answer.
              </p>
            </div>
          </div>

          {/* beat 3 — the keepsake */}
          <div className="door-beat door-beat-grid">
            <div className="door-keepsake-mini">
              <span className="door-code-label">the code, written inside the hidden thing</span>
              <span className="door-code-value mono">{SHOWCASE_CODE}</span>
              <p className="door-letter-mini">
                “you stood where {SHOWCASE.placeGuess.toLowerCase()} stands, and you found it.”
              </p>
            </div>
            <div className="door-beat-copy">
              <h2 className="door-beat-h">
                the code in the hidden thing unlocks the keepsake.
              </h2>
              <p className="door-beat-p">
                they follow the trail to the spot, find what you left, and read the code
                waiting inside. that opens the letter in your voice — the payoff they had to earn.
              </p>
            </div>
          </div>

          {/* the two moves */}
          <div className="door-cta door-anim">
            <button className="btn btn-primary" onClick={onWatch}>
              watch it work — a real gift, played
            </button>
            <button
              className="btn"
              onClick={() => inputRef.current?.click()}
            >
              make one — £19
            </button>
            <p className="foot-note">
              photograph the place · hide the thing · send them the trail
            </p>
          </div>

          {/* the dropzone — starting their own */}
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
