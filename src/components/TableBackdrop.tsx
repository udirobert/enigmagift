import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { MOCK_PHOTOS, NOTICES, mockUrl } from '../data';
import { prefersReducedMotion, seeded } from '../lib/motion';

/* ------------------------------------------------------------------ */
/*  The table — a living backdrop for the Door scene. Seven photographs */
/*  scattered at the edges like prints left on a table in low light,   */
/*  threaded together in year order, with one card the camera keeps    */
/*  leaning into. Hovering or tapping a card surfaces what "the agent  */
/*  noticed" in it; dropping files anywhere on the scene scatters      */
/*  temporary polaroids across the table via scatter().                */
/* ------------------------------------------------------------------ */

interface CardCfg {
  photo: (typeof MOCK_PHOTOS)[number];
  x: number; // % of backdrop width
  y: number; // % of backdrop height
  w: string;
  rot: number;
  depth: number; // parallax factor 0.3–1.0
  z: number;
  blur?: number; // depth-of-field, px
  extra?: boolean; // hidden on small screens
  hero?: boolean; // participates in push-ins
}

// First four are the thread anchors, in year order: 2019 → 2021 → 2023 → 2024.
const CARDS: CardCfg[] = [
  { photo: MOCK_PHOTOS[0], x: 2.5, y: 6,  w: 'clamp(7.5rem, 15vw, 12.5rem)', rot: -4.2, depth: 0.55, z: 3, blur: 0.5 },
  { photo: MOCK_PHOTOS[1], x: 80,  y: 9,  w: 'clamp(8rem, 16vw, 13.5rem)',  rot: 3.1,  depth: 1.0,  z: 6, hero: true },
  { photo: MOCK_PHOTOS[2], x: 75,  y: 56, w: 'clamp(7.5rem, 14vw, 12rem)',   rot: -2.6, depth: 0.85, z: 5, hero: true, blur: 0.4 },
  { photo: MOCK_PHOTOS[3], x: 4,   y: 60, w: 'clamp(8.5rem, 17vw, 14rem)',  rot: 4.6,  depth: 0.95, z: 6, hero: true },
  { photo: MOCK_PHOTOS[4], x: 84,  y: 80, w: 'clamp(7rem, 12vw, 10rem)',    rot: -5,   depth: 0.4,  z: 2, blur: 1.6, extra: true },
  { photo: MOCK_PHOTOS[5], x: 30,  y: 4,  w: 'clamp(7rem, 12vw, 10rem)',    rot: 2.2,  depth: 0.5,  z: 3, blur: 1.2, extra: true },
  { photo: MOCK_PHOTOS[6], x: 60,  y: 5,  w: 'clamp(7rem, 11vw, 9.5rem)',   rot: -3,   depth: 0.45, z: 2, blur: 1.8, extra: true },
];

const THREAD_ORDER = [0, 1, 2, 3]; // card indices, already in year order

export interface TableBackdropHandle {
  /** Scatter 3–5 temporary polaroids of the given object URLs onto the table. */
  scatter: (urls: string[]) => void;
}

interface TableBackdropProps {
  /** True while files are being dragged over the scene — cards brighten. */
  dragActive?: boolean;
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

/** Catmull-Rom → cubic bézier smoothing through the anchor points. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export const TableBackdrop = forwardRef<TableBackdropHandle, TableBackdropProps>(
  function TableBackdrop({ dragActive = false }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const basePathRef = useRef<SVGPathElement>(null);
    const pulsePathRef = useRef<SVGPathElement>(null);
    const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
    const parRefs = useRef<(HTMLDivElement | null)[]>([]);
    const driftRefs = useRef<(HTMLDivElement | null)[]>([]);
    const pushRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [temps, setTemps] = useState<TempCard[]>([]);

    /* ------------------------- temp polaroids ------------------------ */
    /* Dropped files land on the table as small prints that drift in,    */
    /* linger a few seconds, and fade — pure ambience, pointer-events    */
    /* none, swept away when the scene transitions.                      */

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
            // keep clear of the centre where the dropzone lives
            x: side ? 2 + s2 * 20 : 76 + s2 * 20,
            y: 6 + seeded(now + i * 13, 5) * 74,
            w: 'clamp(5rem, 9vw, 7.5rem)',
            rot: (seeded(now + i * 7, 11) - 0.5) * 14,
          };
        });
        setTemps((prev) => [...prev.slice(-6), ...cards]);
        // fade out with the CSS temp-life animation, then remove
        const ids = new Set(cards.map((c) => c.id));
        window.setTimeout(() => {
          setTemps((prev) => prev.filter((c) => !ids.has(c.id)));
        }, 5600);
      },
    }));

    /* --------------------- agent-notice captions -------------------- */
    /* pointerenter fires for taps too, so one listener covers hover on  */
    /* desktop and tap on mobile. On fine pointers a leave hides early;   */
    /* otherwise the caption lingers ~2.6s and fades on its own.         */

    useEffect(() => {
      const cards = cardRefs.current.filter(
        (el): el is HTMLDivElement => !!el,
      );
      const fine = window.matchMedia('(pointer: fine)').matches;
      const timers = new Map<HTMLElement, number>();

      const hide = (card: HTMLElement) => {
        const t = timers.get(card);
        if (t != null) window.clearTimeout(t);
        card.querySelector('.tb-notice')?.classList.remove('is-on');
      };
      const show = (card: HTMLElement) => {
        const notice = card.querySelector<HTMLElement>('.tb-notice');
        if (!notice) return;
        const t = timers.get(card);
        if (t != null) window.clearTimeout(t);
        notice.classList.add('is-on');
        timers.set(
          card,
          window.setTimeout(() => notice.classList.remove('is-on'), 2600),
        );
      };

      const cleanups: (() => void)[] = [];
      cards.forEach((card) => {
        const onEnter = () => show(card);
        const onLeave = () => hide(card);
        card.addEventListener('pointerenter', onEnter);
        cleanups.push(() => card.removeEventListener('pointerenter', onEnter));
        if (fine) {
          card.addEventListener('pointerleave', onLeave);
          cleanups.push(() => card.removeEventListener('pointerleave', onLeave));
        }
      });
      cleanups.push(() => timers.forEach((t) => window.clearTimeout(t)));
      return () => cleanups.forEach((fn) => fn());
    }, []);

    /* ------------------------------ scene ---------------------------- */

    useEffect(() => {
      const root = rootRef.current;
      const basePath = basePathRef.current;
      const pulsePath = pulsePathRef.current;
      if (!root || !basePath || !pulsePath) return;

      /** Measure card centres and write the thread path onto both SVG paths. */
      const measureThread = () => {
        const rootRect = root.getBoundingClientRect();
        const pts = THREAD_ORDER.map((i) => {
          const el = cardRefs.current[i];
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            x: r.left - rootRect.left + r.width / 2,
            y: r.top - rootRect.top + r.height / 2,
          };
        });
        if (pts.some((p) => !p)) return null;
        const d = smoothPath(pts as { x: number; y: number }[]);
        basePath.setAttribute('d', d);
        pulsePath.setAttribute('d', d);
        return d;
      };

      // Measure before any entrance transform is applied.
      measureThread();
      const threadLen = basePath.getTotalLength();

      const onResize = () => {
        if (measureThread()) {
          // Path changed: leave the thread fully drawn rather than mid-animation.
          basePath.setAttribute('stroke-dasharray', 'none');
          basePath.setAttribute('stroke-dashoffset', '0');
        }
      };
      window.addEventListener('resize', onResize);

      if (prefersReducedMotion()) {
        // Static collage + fully drawn thread. CSS keeps pulse hidden (opacity 0).
        return () => window.removeEventListener('resize', onResize);
      }

      const cleanups: (() => void)[] = [];

      const ctx = gsap.context(() => {
        const cards = cardRefs.current.filter((el): el is HTMLDivElement => !!el);
        const parEls = parRefs.current.filter((el): el is HTMLDivElement => !!el);
        const driftEls = driftRefs.current.filter((el): el is HTMLDivElement => !!el);

        // Cards arrive like prints being placed on the table.
        gsap.from(cards, {
          opacity: 0,
          y: 14,
          duration: 0.9,
          stagger: 0.08,
          ease: 'power2.out',
          clearProps: 'opacity,y',
        });

        // Idle drift — very slow bob + micro-rotate, staggered phases.
        driftEls.forEach((el, i) => {
          const rot = CARDS[i].rot;
          const half = 4 + seeded(i, 7) * 3; // full cycle 8–14s with yoyo
          gsap.fromTo(
            el,
            { y: -6, rotation: rot - 0.6 },
            {
              y: 6,
              rotation: rot + 0.6,
              duration: half,
              yoyo: true,
              repeat: -1,
              ease: 'sine.inOut',
              delay: seeded(i, 21) * 10,
            },
          );
        });

        // Mouse parallax — nearer cards (higher depth) travel further.
        if (window.matchMedia('(pointer: fine)').matches) {
          const qx = parEls.map((el) =>
            gsap.quickTo(el, 'x', { duration: 1.1, ease: 'power3' }),
          );
          const qy = parEls.map((el) =>
            gsap.quickTo(el, 'y', { duration: 1.1, ease: 'power3' }),
          );
          const onMove = (e: PointerEvent) => {
            const nx = (e.clientX / window.innerWidth - 0.5) * 2;
            const ny = (e.clientY / window.innerHeight - 0.5) * 2;
            parEls.forEach((_, i) => {
              const d = CARDS[i].depth;
              qx[i](nx * d * 26);
              qy[i](ny * d * 18);
            });
          };
          window.addEventListener('pointermove', onMove, { passive: true });
          cleanups.push(() => window.removeEventListener('pointermove', onMove));
        }

        // The thread draws on once, then a light pulse travels it forever.
        if (threadLen > 0) {
          gsap.set(basePath, {
            attr: { 'stroke-dasharray': `${threadLen} ${threadLen}`, 'stroke-dashoffset': threadLen },
          });
          gsap.delayedCall(0.9, () => {
            ctx.add(() => {
              gsap.to(basePath, {
                attr: { 'stroke-dashoffset': 0 },
                duration: 1.8,
                ease: 'power2.inOut',
                onComplete: () => {
                  gsap.to(pulsePath, { opacity: 0.85, duration: 1.2 });
                  // dash period = 1.5 + 17 = 18.5 — one full period per loop
                  gsap.fromTo(
                    pulsePath,
                    { attr: { 'stroke-dashoffset': 0 } },
                    {
                      attr: { 'stroke-dashoffset': -18.5 },
                      duration: 3.4,
                      repeat: -1,
                      ease: 'none',
                    },
                  );
                },
              });
            });
          });
        }

        // Push-ins — every ~9–12s the next hero card gets a slow camera lean-in.
        const heroIdxs = CARDS.map((c, i) => (c.hero ? i : -1)).filter((i) => i >= 0);
        let heroCursor = 0;
        let pushTimer: number | null = null;

        const runPush = (i: number) => {
          const card = cardRefs.current[i];
          const pushEl = pushRefs.current[i];
          if (!card || !pushEl) return;
          const veil = pushEl.querySelector<HTMLElement>('.tb-veil');
          const sweep = pushEl.querySelector<HTMLElement>('.tb-sweep');
          ctx.add(() => {
            gsap.set(card, { zIndex: 20 });
            const tl = gsap.timeline({
              onComplete: () => gsap.set(card, { zIndex: CARDS[i].z }),
            });
            tl.to(pushEl, { scale: 1.5, duration: 2.2, ease: 'power2.inOut' }, 0);
            if (veil) tl.to(veil, { opacity: 0.2, duration: 2.2, ease: 'power1.inOut' }, 0);
            if (sweep)
              tl.fromTo(
                sweep,
                { xPercent: -140 },
                { xPercent: 340, duration: 2.4, ease: 'power1.inOut' },
                0.15,
              );
            tl.to(pushEl, { scale: 1, duration: 2.8, ease: 'power2.inOut' }, 2.35);
            if (veil) tl.to(veil, { opacity: 0, duration: 2.8, ease: 'power1.inOut' }, 2.35);
          });
        };

        const schedulePush = () => {
          pushTimer = window.setTimeout(() => {
            pushTimer = null;
            if (document.hidden) {
              schedulePush();
              return;
            }
            const idx = heroIdxs[heroCursor % heroIdxs.length];
            heroCursor += 1;
            runPush(idx);
            schedulePush();
          }, 9000 + Math.random() * 3000);
        };
        schedulePush();

        const onVis = () => {
          if (document.hidden) {
            if (pushTimer != null) {
              window.clearTimeout(pushTimer);
              pushTimer = null;
            }
          } else if (pushTimer == null) {
            schedulePush();
          }
        };
        document.addEventListener('visibilitychange', onVis);
        cleanups.push(() => document.removeEventListener('visibilitychange', onVis));
        cleanups.push(() => {
          if (pushTimer != null) window.clearTimeout(pushTimer);
        });
      }, root);

      return () => {
        ctx.revert();
        cleanups.forEach((fn) => fn());
        window.removeEventListener('resize', onResize);
      };
    }, []);

    return (
      <div
        className={`tb-wrap${dragActive ? ' is-drop-hover' : ''}`}
        ref={rootRef}
        aria-hidden="true"
      >
        <svg className="tb-thread">
          <path ref={basePathRef} className="tb-thread-base" />
          <path ref={pulsePathRef} className="tb-thread-pulse" />
        </svg>
        {CARDS.map((c, i) => (
          <div
            key={c.photo.id}
            className={`tb-card${c.extra ? ' is-extra' : ''}`}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.w, zIndex: c.z }}
          >
            <div
              className="tb-par"
              ref={(el) => {
                parRefs.current[i] = el;
              }}
            >
              <div
                className="tb-drift"
                ref={(el) => {
                  driftRefs.current[i] = el;
                }}
                style={{ transform: `rotate(${c.rot}deg)` }}
              >
                <div
                  className="tb-push"
                  ref={(el) => {
                    pushRefs.current[i] = el;
                  }}
                >
                  <div
                    className="tb-frame"
                    style={c.blur ? { filter: `blur(${c.blur}px)` } : undefined}
                  >
                    <img
                      src={mockUrl(c.photo, 400, 500)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                    <span className="tb-veil" />
                    <span className="tb-sweep" />
                  </div>
                </div>
              </div>
            </div>
            <span
              className={`tb-notice${c.y > 62 ? ' is-above' : ''}`}
              aria-hidden="true"
            >
              {NOTICES[c.photo.id] ?? ''}
            </span>
          </div>
        ))}
        {temps.map((t) => (
          <div
            key={t.id}
            className="tb-card tb-temp"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: t.w,
              zIndex: 7,
            }}
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
