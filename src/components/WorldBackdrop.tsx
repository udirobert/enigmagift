import {
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  lazy,
} from 'react';
import { gsap } from 'gsap';
import { SHOWCASE } from '../lib/showcase';
import { prefersReducedMotion, seeded } from '../lib/motion';

/* ------------------------------------------------------------------ */
/*  The world — the Door's living backdrop. One photograph of the place*/
/*  lifts into the generated 3D world on a slow loop, and the world is */
/*  where the product lives: a trail runs on it, a thing hides in it,  */
/*  the keepsake is it. Small "hunt" words float on the model so the   */
/*  backdrop shows the place *doing* the product, not describing it.   */
/*  The world is ambient — it spins on its own and lets every pointer  */
/*  event pass through to the page; the interactive orbit is the tour. */
/*  Dropped files scatter as temporary polaroids, as before.          */
/* ------------------------------------------------------------------ */

// three.js is heavy — the backdrop is the Door's, and the Door is the
// whole page, so keep it out of the initial bundle until it's needed
const World = lazy(() =>
  import('./World').then((m) => ({ default: m.World })),
);

interface WorldBackdropProps {
  /** True while files are being dragged over the scene — the world brightens. */
  dragActive?: boolean;
  /** the backdrop's phase — the photo, or the world of it. Kept in a ref
   *  internally, so passing an inline callback is safe. */
  onPhase?: (phase: 'photo' | 'world') => void;
}

interface TempCard {
  id: number;
  url: string;
  x: number;
  y: number;
  w: string;
  rot: number;
}

let tempId = 0;

/** Product words placed *in* the place — the backdrop's way of saying
 *  "this is where the trail, the hide and the keepsake live." */
const HINTS = [
  { label: 'round 1 · find the red tower', x: 21, y: 24 },
  { label: '◆ something is hidden here', x: 66, y: 38 },
  { label: 'the trail ends at the keepsake', x: 30, y: 72 },
];

export interface WorldBackdropHandle {
  /** Scatter 3–5 temporary polaroids of the given object URLs across the world. */
  scatter: (urls: string[]) => void;
}

export const WorldBackdrop = forwardRef<WorldBackdropHandle, WorldBackdropProps>(
  function WorldBackdrop({ dragActive = false, onPhase }, ref) {
    const [loadWorld, setLoadWorld] = useState(false); // heavy WebGL deferred until idle
    const [worldOn, setWorldOn] = useState(false); // world layer is up
    const [worldReady, setWorldReady] = useState(false); // GLB loaded
    const [temps, setTemps] = useState<TempCard[]>([]);
    const onPhaseRef = useRef(onPhase);
    onPhaseRef.current = onPhase;

    // stable — World keys its effect off this; an inline arrow would reload
    // the model on every re-render
    const handleWorldReady = useCallback(() => setWorldReady(true), []);

    /* The three.js runtime and multi-megabyte GLB are enhancement, not first
     * paint. Start them only once the browser is idle; visitors asking for
     * reduced motion, data saver, or a slow connection keep the still photo. */
    useEffect(() => {
      if (prefersReducedMotion()) return;
      const nav = navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      };
      if (nav.connection?.saveData || ['slow-2g', '2g'].includes(nav.connection?.effectiveType ?? '')) return;
      const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (win.requestIdleCallback) {
        const id = win.requestIdleCallback(() => setLoadWorld(true), { timeout: 3500 });
        return () => win.cancelIdleCallback?.(id);
      }
      const id = window.setTimeout(() => setLoadWorld(true), 1600);
      return () => window.clearTimeout(id);
    }, []);

    /* ------------------------- temp polaroids ------------------------ */
    /* Dropped files land as small prints that drift in, linger, and fade. */

    useImperativeHandle(ref, () => ({
      scatter: (urls: string[]) => {
        const clean = urls.filter(Boolean);
        if (clean.length === 0) return;
        const n = Math.min(5, Math.max(3, clean.length));
        const now = Date.now();
        const cards: TempCard[] = Array.from({ length: n }, (_, i) => {
          const s = seeded(now + i * 17, 3);
          const s2 = seeded(now + i * 31, 9);
          const side = s < 0.5;
          return {
            id: tempId++,
            url: clean[i % clean.length],
            // keep clear of the centre where the dropzone dock lives
            x: side ? 2 + s2 * 22 : 74 + s2 * 22,
            y: 8 + seeded(now + i * 13, 5) * 70,
            w: 'clamp(5rem, 9vw, 7.5rem)',
            rot: (seeded(now + i * 7, 11) - 0.5) * 14,
          };
        });
        setTemps((prev) => [...prev.slice(-6), ...cards]);
        const ids = new Set(cards.map((c) => c.id));
        window.setTimeout(() => {
          setTemps((prev) => prev.filter((c) => !ids.has(c.id)));
        }, 5600);
      },
    }), []);

    /* --------------------- the photo ⇄ world loop -------------------- */
    /* One photo, then the world of it, then back — a slow breathing that  */
    /* keeps saying the whole thing: this place is a world you can stand   */
    /* inside. The world only counts once the GLB has loaded.             */

    useEffect(() => {
      if (prefersReducedMotion()) return; // keep the photo, skip the motion
      if (!worldReady) return;
      const timeouts: number[] = [];
      const show = () => {
        setWorldOn(true);
        onPhaseRef.current?.('world');
        timeouts.push(window.setTimeout(hide, 6500)); // hold on the world
      };
      const hide = () => {
        setWorldOn(false);
        onPhaseRef.current?.('photo');
        timeouts.push(window.setTimeout(show, 8000)); // hold on the photo
      };
      timeouts.push(window.setTimeout(show, 2200)); // photo settles, then loop
      return () => timeouts.forEach((t) => window.clearTimeout(t));
    }, [worldReady]);

    /* ------------------- hint drift + parallax ----------------------- */

    useEffect(() => {
      if (prefersReducedMotion()) return;
      const hints = Array.from(document.querySelectorAll<HTMLElement>('.wb-hint'));
      const ctx = gsap.context(() => {
        hints.forEach((el, i) => {
          gsap.fromTo(
            el,
            { y: -5 },
            {
              y: 5,
              duration: 3 + seeded(i, 9) * 2,
              yoyo: true,
              repeat: -1,
              ease: 'sine.inOut',
              delay: seeded(i, 5) * 2,
            },
          );
        });
      });
      // the parallax is plain DOM work — outside the context so the effect
      // can't reference ctx before it exists
      let onMove: ((e: PointerEvent) => void) | null = null;
      if (window.matchMedia('(pointer: fine)').matches) {
        onMove = (e) => {
          const nx = (e.clientX / window.innerWidth - 0.5) * 2;
          hints.forEach((el, i) => {
            const d = 6 + i * 3; // near hints travel a little further
            gsap.to(el, { x: nx * d, duration: 0.9, ease: 'power3' });
          });
        };
        window.addEventListener('pointermove', onMove, { passive: true });
      }
      return () => {
        if (onMove) window.removeEventListener('pointermove', onMove);
        ctx.revert();
      };
    }, []);

    const active = worldOn && worldReady;

    return (
      <div
        className={`wb-wrap${dragActive ? ' is-drop-hover' : ''}${active ? ' is-world' : ''}`}
        aria-hidden
      >
        {/* layer 1 — the single photograph, slow push */}
        <div className="wb-photo">
          <img src={SHOWCASE.photoUrls[0]} alt="" draggable={false} />
        </div>

        {/* layer 2 — the world of the place (ambient spin, input passes through) */}
        <div className="wb-world-layer">
          <Suspense fallback={null}>
            {loadWorld && (
              <World
                src="/world.glb"
                interactive={false}
                spin={0.3}
                onReady={handleWorldReady}
              />
            )}
          </Suspense>
        </div>

        {/* layer 3 — the product's words, placed in the place */}
        <div className="wb-hints">
          {HINTS.map((h, i) => (
            <span
              key={i}
              className={`wb-hint mono${active ? ' is-on' : ''}`}
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
            >
              {h.label}
            </span>
          ))}
        </div>

        {/* dropped files */}
        {temps.map((t) => (
          <div
            key={t.id}
            className="tb-card tb-temp wb-temp"
            style={{ left: `${t.x}%`, top: `${t.y}%`, width: t.w, zIndex: 8 }}
          >
            <div className="tb-temp-rot" style={{ transform: `rotate(${t.rot}deg)` }}>
              <div className="tb-frame">
                <img src={t.url} alt="" draggable={false} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  },
);
