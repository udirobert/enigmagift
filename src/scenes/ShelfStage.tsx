import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { W, H, quadTris } from '../lib/shelfGift';

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** decode an image to raw pixels (local asset only — nothing remote) */
export function loadPixels(url: string): Promise<Pixels> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0);
      resolve({ width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data });
    };
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

const grayAt = (p: Pixels, x: number, y: number): number =>
  p.data[((y | 0) * p.width + (x | 0)) * 4];

/** one measured textured mesh: disparity → metric X/Y/Z, photo → UVs */
function buildMesh(baseX: number, disp: Pixels, tex: THREE.Texture): THREE.Mesh {
  const STEP = 2;
  const cols = Math.floor((disp.width - 1) / STEP);
  const rows = Math.floor((disp.height - 1) / STEP);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const depth: number[] = new Array((cols + 1) * (rows + 1)).fill(0);

  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const x = Math.min(i * STEP, disp.width - 1);
      const y = Math.min(j * STEP, disp.height - 1);
      const d = grayAt(disp, x, y) / 4;
      const vi = j * (cols + 1) + i;
      depth[vi] = d;
      if (d <= 0) {
        pos.push(0, 0, 0);
      } else {
        const px = x + 0.5;
        const py = y + 0.5;
        pos.push(baseX + (px - 225) / d, (187.5 - py) / d, -400 / d);
      }
      uv.push((x + 0.5) / 450, 1 - (y + 0.5) / 375);
    }
  }
  const ok = (a: number, b: number, c: number) => {
    const da = depth[a];
    const db = depth[b];
    const dc = depth[c];
    if (da <= 0 || db <= 0 || dc <= 0) return false;
    return Math.max(da, db, dc) - Math.min(da, db, dc) <= 2;
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v00 = j * (cols + 1) + i;
      const v10 = v00 + 1;
      const v01 = v00 + cols + 1;
      const v11 = v01 + 1;
      for (const [a, b, c] of quadTris(v00, v10, v01, v11)) {
        if (ok(a, b, c)) idx.push(a, b, c);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: tex,
      polygonOffset: baseX === 1,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
}

interface Props {
  /** parallax position 0 = left photo, 1 = right photo */
  t: number;
  onView: (t: number) => void;
  entered: boolean;
  active?: boolean;
  onState: (s: 'loading' | 'ready' | 'error') => void;
}

/**
 * Two real measured views of the Teddy shelf, rebuilt as textured triangle
 * meshes. Drag or use arrow keys to slide between the captured viewpoints;
 * nothing is generated and the frame is exactly the 450×375 stereo frame.
 */
export function ShelfStage({ t, onView, entered, active = true, onState }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onViewRef = useRef(onView);
  const onStateRef = useRef(onState);
  const enteredRef = useRef(entered);
  const activeRef = useRef(active);
  const tRef = useRef(t);
  const startRef = useRef<(() => void) | null>(null);
  const apiRef = useRef<{ setT: (v: number) => void } | null>(null);
  const [webgl, setWebgl] = useState(true);

  // camera follows t — one render per change, no loop
  useEffect(() => {
    apiRef.current?.setT(t);
  }, [t]);

  useEffect(() => { onViewRef.current = onView; }, [onView]);
  useEffect(() => { onStateRef.current = onState; }, [onState]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => {
    enteredRef.current = entered;
    if (entered) startRef.current?.();
  }, [entered]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebgl(false);
      onStateRef.current('error');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0, 0); // holes show the real photo behind the canvas
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.setAttribute(
      'aria-label',
      'The shelf in 3D — drag or use arrow keys to look from the left photo to the right photo',
    );
    mount.appendChild(renderer.domElement);

    let disposed = false;
    let raf = 0;
    let loaded = false;
    const textures: THREE.Texture[] = [];

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      2 * Math.atan(375 / (2 * 400)) * (180 / Math.PI),
      W / H,
      0.1,
      200,
    );
    camera.position.set(0, 0, 0); // looks straight down -Z

    const render = () => {
      if (!disposed && loaded) renderer.render(scene, camera);
    };
    apiRef.current = {
      setT: (v: number) => {
        camera.position.x = v;
        render();
      },
    };

    const start = () => {
      if (loaded || disposed) return;
      loaded = true;
      onStateRef.current('loading');
      Promise.all([
        loadPixels('/stereo-teddy/im2.png'),
        loadPixels('/stereo-teddy/im6.png'),
        loadPixels('/stereo-teddy/disp2.png'),
        loadPixels('/stereo-teddy/disp6.png'),
      ])
        .then(([im2, im6, d2, d6]) => {
          if (disposed) return;
          for (const [img, disp, baseX] of [
            [im2, d2, 0],
            [im6, d6, 1],
          ] as const) {
            const tex = new THREE.CanvasTexture((() => {
              const c = document.createElement('canvas');
              c.width = img.width;
              c.height = img.height;
              const copy = new Uint8ClampedArray(img.data);
              c.getContext('2d')!.putImageData(new ImageData(copy, img.width, img.height), 0, 0);
              return c;
            })());
            tex.colorSpace = THREE.SRGBColorSpace;
            textures.push(tex);
            scene.add(buildMesh(baseX, disp, tex));
          }
          render();
          onStateRef.current('ready');
          // one gentle settle into the scene so the parallax proves itself —
          // abandoned the moment the visitor takes over
          if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const t0 = performance.now();
            const settle = (now: number) => {
              if (disposed || userDrove || !enteredRef.current) return;
              const k = Math.min((now - t0) / 900, 1);
              onViewRef.current(0.1 * (1 - Math.pow(1 - k, 2)));
              if (k < 1) requestAnimationFrame(settle);
            };
            requestAnimationFrame(settle);
          }
        })
        .catch(() => {
          if (!disposed) {
            setWebgl(false);
            onStateRef.current('error');
          }
        });
    };
    startRef.current = start;
    if (enteredRef.current) start();

    /* parallax input — only while the scene is uncovered */
    const setT = (v: number) => onViewRef.current(THREE.MathUtils.clamp(v, 0, 1));
    let dragging = false;
    let userDrove = false;
    let lastX = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (!activeRef.current) return;
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      userDrove = true;
      setT(tRef.current + (e.clientX - lastX) * 0.004);
      lastX = e.clientX;
    };
    const onPointerEnd = (e: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebgl(false);
      onStateRef.current('error');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        userDrove = true;
        setT(tRef.current + (e.key === 'ArrowRight' ? 0.06 : -0.06));
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerEnd);
    renderer.domElement.addEventListener('pointercancel', onPointerEnd);
    renderer.domElement.addEventListener('keydown', onKey);

    const ro = new ResizeObserver(() => {
      renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1, false);
      render();
    });
    ro.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.MeshBasicMaterial | undefined;
        if (mat) {
          mat.map?.dispose();
          mat.dispose();
        }
      });
      textures.forEach((tx) => tx.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      startRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sg-stage-wrap">
      {/* endpoint photo stays behind the canvas — holes and context loss
          still show the real photograph */}
      <img
        className="sg-under"
        src={t < 0.5 ? '/stereo-teddy/im2.png' : '/stereo-teddy/im6.png'}
        alt=""
        aria-hidden
      />
      {webgl ? (
        <div ref={mountRef} className="sg-stage" />
      ) : (
        <img
          className="sg-under sg-fallback"
          src={t < 0.5 ? '/stereo-teddy/im2.png' : '/stereo-teddy/im6.png'}
          alt={t < 0.5 ? 'The shelf, from the left photo' : 'The shelf, from the right photo'}
        />
      )}
    </div>
  );
}
