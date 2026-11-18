import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { explorerScene } from '../lib/explorerScene';

interface Props {
  /** true once the recipient has stepped in — loading begins on entry, once */
  entered: boolean;
  /** false while the poster or drawer covers the scene — input is ignored */
  active?: boolean;
  onState: (s: 'loading' | 'ready' | 'error') => void;
}

const SPEED = 3; // units / second
const BOUND = 24; // stay near the heart of the place

/**
 * The continuous explorer — one WebGL canvas showing the photo-derived
 * keepsake (or a prepared environment via VITE_WORLD_SCENE_GLB). Drag to
 * look, WASD/arrows to walk, wheel and the labelled hold-buttons to move
 * forward and back. Renders only while something changes.
 */
export function WorldStage({ entered, active = true, onState }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ reset: () => void; move: (dir: number, on: boolean) => void } | null>(null);
  const onStateRef = useRef(onState);
  const enteredRef = useRef(entered);
  const activeRef = useRef(active);
  const idleRef = useRef<(() => void) | null>(null);
  const startLoadRef = useRef<(() => void) | null>(null);
  const [loadNote, setLoadNote] = useState('');

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);
  useEffect(() => {
    enteredRef.current = entered;
    if (entered) startLoadRef.current?.();
  }, [entered]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) idleRef.current?.();
  }, [active]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setLoadNote('');
      onStateRef.current('error');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.setAttribute(
      'aria-label',
      'The place in 3D — drag to look around, use arrow keys or the move buttons to walk',
    );
    mount.appendChild(renderer.domElement);

    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#b9c8d2');
    scene.fog = new THREE.Fog('#b9c8d2', 18, 60);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
    camera.rotation.order = 'YXZ';

    scene.add(new THREE.AmbientLight('#f3e9d4', 1.15));
    const sun = new THREE.DirectionalLight('#ffe0b0', 1.5);
    sun.position.set(5, 10, 4);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#b9c8d2', 0.5);
    fill.position.set(-6, 4, -6);
    scene.add(fill);

    // eye state — home pose is captured once the model (or env camera) lands
    const pos = camera.position;
    let yaw = 0;
    let pitch = 0;
    const home = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };

    const applyLook = (target: THREE.Vector3, from: THREE.Vector3) => {
      pos.copy(from);
      const d = target.clone().sub(from).normalize();
      yaw = Math.atan2(-d.x, -d.z);
      pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
      camera.rotation.set(pitch, yaw, 0);
    };
    const captureHome = () => {
      home.pos.copy(pos);
      home.yaw = yaw;
      home.pitch = pitch;
    };
    const reset = () => {
      pos.copy(home.pos);
      yaw = home.yaw;
      pitch = home.pitch;
      camera.rotation.set(pitch, yaw, 0);
      requestRender();
    };
    applyLook(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 9));
    captureHome();

    /* input — movement flags only; a frame runs while anything is held */
    const keys = new Set<string>();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let wheelBump = 0;

    const active = () => keys.size > 0 || dragging || wheelBump !== 0;

    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };
    let renderQueued = false;
    const requestRender = () => {
      if (renderQueued || disposed) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        render();
      });
    };

    let lastT = 0;
    const frame = (now: number) => {
      raf = active() && !disposed ? requestAnimationFrame(frame) : 0;
      const dt = Math.min((now - lastT) / 1000, 0.05) || 0;
      lastT = now;
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      if (keys.size) {
        const step = SPEED * dt;
        if (keys.has('f')) pos.addScaledVector(fwd, step);
        if (keys.has('b')) pos.addScaledVector(fwd, -step);
        if (keys.has('l')) pos.addScaledVector(right, -step);
        if (keys.has('r')) pos.addScaledVector(right, step);
      }
      if (wheelBump !== 0) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        pos.addScaledVector(dir, wheelBump);
        wheelBump = 0;
      }
      pos.y = THREE.MathUtils.clamp(pos.y, home.pos.y - 3, home.pos.y + 18);
      const dx = pos.x - home.pos.x;
      const dz = pos.z - home.pos.z;
      const flat = Math.hypot(dx, dz);
      if (flat > BOUND) {
        pos.x = home.pos.x + (dx * BOUND) / flat;
        pos.z = home.pos.z + (dz * BOUND) / flat;
      }
      render();
    };
    const kick = () => {
      if (!raf && !disposed) {
        lastT = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const KEYMAP: Record<string, string> = {
      w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeRef.current) return;
      const k = KEYMAP[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      if (!keys.has(k)) {
        keys.add(k);
        kick();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = KEYMAP[e.key.toLowerCase()];
      if (k) keys.delete(k);
    };
    const stopAll = () => {
      keys.clear();
      dragging = false;
      wheelBump = 0;
    };
    idleRef.current = stopAll;
    renderer.domElement.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('blur', stopAll);
    window.addEventListener('blur', stopAll);

    const onPointerDown = (e: PointerEvent) => {
      if (!activeRef.current) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      kick();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.005;
      pitch = THREE.MathUtils.clamp(pitch - (e.clientY - lastY) * 0.005, -1.35, 1.35);
      lastX = e.clientX;
      lastY = e.clientY;
      camera.rotation.set(pitch, yaw, 0);
    };
    const onPointerEnd = (e: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(e.pointerId)) {
        renderer.domElement.releasePointerCapture(e.pointerId);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      wheelBump += THREE.MathUtils.clamp(-e.deltaY * 0.0025, -1.2, 1.2);
      kick();
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerEnd);
    renderer.domElement.addEventListener('pointercancel', onPointerEnd);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const move = (dir: number, on: boolean) => {
      if (on && !activeRef.current) return;
      const k = dir > 0 ? 'f' : 'b';
      if (on) {
        keys.add(k);
        kick();
      } else {
        keys.delete(k);
      }
    };
    apiRef.current = { reset, move };

    /* model — loaded once, on entry */
    let started = false;
    const startLoad = () => {
      if (started || disposed) return;
      started = true;
      onStateRef.current('loading');
      new GLTFLoader().load(
        explorerScene.mesh,
        (gltf) => {
          if (disposed) {
            gltf.scene.traverse((o) => {
              const m = o as THREE.Mesh;
              m.geometry?.dispose();
              const mat = m.material as THREE.Material | THREE.Material[] | undefined;
              if (mat)
                (Array.isArray(mat) ? mat : [mat]).forEach((mm) => {
                  (mm as THREE.MeshStandardMaterial).map?.dispose();
                  mm.dispose();
                });
            });
            return;
          }
          const obj = gltf.scene;
          if (explorerScene.kind === 'keepsake') {
            const group = new THREE.Group();
            const box = new THREE.Box3().setFromObject(obj);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const s = 10 / (Math.max(size.x, size.y, size.z) || 1);
            group.scale.setScalar(s);
            obj.position.sub(center);
            group.add(obj);
            scene.add(group);
            applyLook(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 9));
          } else {
            scene.add(obj); // environment — no normalise
            const embedded = (gltf.cameras?.[0] as THREE.PerspectiveCamera | undefined);
            if (embedded?.isPerspectiveCamera) {
              embedded.updateMatrixWorld(true);
              const p = new THREE.Vector3();
              const q = new THREE.Quaternion();
              embedded.getWorldPosition(p);
              embedded.getWorldQuaternion(q);
              const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
              applyLook(p.clone().add(fwd), p);
            } else if (explorerScene.eye && explorerScene.look) {
              applyLook(
                new THREE.Vector3(...explorerScene.look),
                new THREE.Vector3(...explorerScene.eye),
              );
            }
          }
          captureHome();
          render(); // first real frame — parent lifts the photo
          renderer.domElement.focus();
          onStateRef.current('ready');
        },
        undefined,
        () => {
          if (!disposed) {
            setLoadNote('3D unavailable. View the photo.');
            onStateRef.current('error');
          }
        },
      );
    };
    startLoadRef.current = startLoad;
    if (enteredRef.current) startLoad();

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    });
    ro.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('blur', stopAll);
      renderer.domElement.removeEventListener('pointerup', onPointerEnd);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((mm) => mm.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="wg-stage-wrap">
      <div ref={mountRef} className="wg-stage" />
      <div className="wg-move" aria-label="Move">
        <button
          type="button"
          onPointerDown={() => apiRef.current?.move(1, true)}
          onPointerUp={() => apiRef.current?.move(1, false)}
          onPointerLeave={() => apiRef.current?.move(1, false)}
          onPointerCancel={() => apiRef.current?.move(1, false)}
        >
          Forward
        </button>
        <button
          type="button"
          onPointerDown={() => apiRef.current?.move(-1, true)}
          onPointerUp={() => apiRef.current?.move(-1, false)}
          onPointerLeave={() => apiRef.current?.move(-1, false)}
          onPointerCancel={() => apiRef.current?.move(-1, false)}
        >
          Back
        </button>
        <button type="button" onClick={() => apiRef.current?.reset()}>
          Reset view
        </button>
      </div>
      {loadNote && <p className="wg-stage-note" role="status">{loadNote}</p>}
    </div>
  );
}
