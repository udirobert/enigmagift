import * as THREE from 'three';
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** shared transform for splat + collider — never move one without the other */
const ROOT_POS: [number, number, number] = [0, 1.5, 0];
const ROOT_ROT: [number, number, number] = [Math.PI, Math.PI, 0];
const ROOT_SCALE = 2.5;

const EYE: [number, number, number] = [0, 1.5, 0];
const WALK_SPEED = 2.2;
const WALK_RADIUS = 5; // metres from capture origin
const WALL_STOP = 0.45; // min clearance before a ray hit stops a step

export interface WorldHandle {
  reset(): void;
  /** walk forward/backward `amount` metres along view heading (guarded) */
  step(amount: number): void;
  dispose(): void;
}

/**
 * Mount a first-person walk inside the generated splat world.
 * Resolves once the splat is initialised and the collider is loaded.
 */
export async function enterWorld(
  node: HTMLElement,
  assets: { rad: string; collider: string },
): Promise<WorldHandle> {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.className = 'world-canvas';
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    '3D room. Drag to look around, use arrow keys or WASD to walk.',
  );
  node.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 2000);
  const spark = new SparkRenderer({ renderer, enableLod: true });
  scene.add(spark);

  const root = new THREE.Group();
  root.position.set(...ROOT_POS);
  root.rotation.set(...ROOT_ROT);
  root.scale.setScalar(ROOT_SCALE);
  scene.add(root);

  const splat = new SplatMesh({
    url: assets.rad,
    fileType: SplatFileType.RAD,
    paged: true,
    raycastable: false,
  });
  root.add(splat);

  /* a failed load must not leak the renderer or its canvas */
  let colliderGltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  try {
    [, colliderGltf] = await Promise.all([
      splat.initialized,
      new GLTFLoader().loadAsync(assets.collider),
    ]);
  } catch (err) {
    splat.dispose();
    spark.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    throw err;
  }

  const collider = colliderGltf.scene;
  collider.traverse((o) => {
    o.visible = false;
  });
  root.add(collider);
  root.updateMatrixWorld(true);


  /* ---- camera pose ---- */
  const home = { pos: new THREE.Vector3(...EYE), yaw: 0, pitch: 0 };
  let yaw = 0;
  let pitch = 0;

  const applyLook = () => {
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  };
  const reset = () => {
    camera.position.copy(home.pos);
    yaw = home.yaw;
    pitch = home.pitch;
    applyLook();
  };
  reset();

  /* ---- walking ---- */
  const keys = new Set<string>();
  const ray = new THREE.Raycaster();
  const fwd = new THREE.Vector3();
  const origin = new THREE.Vector3();

  /** true if `dist` along `dir` is clear of the collider */
  const clearAlong = (dir: THREE.Vector3, dist: number): boolean => {
    if (dir.lengthSq() < 1e-6) return true;
    origin.copy(camera.position);
    ray.set(origin, dir);
    ray.far = Math.abs(dist) + WALL_STOP;
    return ray.intersectObject(collider, true).length === 0;
  };

  /** move `amount` metres along `dir` with wall + radius guards */
  const move = (dir: THREE.Vector3, amount: number) => {
    if (amount === 0 || dir.lengthSq() < 1e-6) return;
    if (!clearAlong(dir.clone().multiplyScalar(Math.sign(amount)), Math.abs(amount))) return;
    const candidate = camera.position.clone().addScaledVector(dir, amount);
    candidate.y = home.pos.y; // keep to eye height
    if (candidate.distanceTo(home.pos) <= WALK_RADIUS) camera.position.copy(candidate);
  };

  const step = (amount: number) => {
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    move(fwd, amount);
  };

  const strafe = (amount: number) => {
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    right.y = 0;
    right.normalize();
    move(right, amount);
  };

  /* keyboard */
  const editable = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  const overlayOpen = () =>
    !!document.querySelector('.photo-sheet:not([hidden]), .note:not([hidden])');
  const onKey = (e: KeyboardEvent) => {
    if (editable() || overlayOpen()) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      keys.add(k);
      e.preventDefault();
    } else if (k === 'escape') {
      keys.clear();
      renderer.domElement.blur();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const onBlur = () => keys.clear();
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  /* drag look — all the way round */
  let dragging = false;
  let lx = 0;
  let ly = 0;
  const el = renderer.domElement;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    el.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    yaw -= (e.clientX - lx) * 0.004;
    pitch -= (e.clientY - ly) * 0.004;
    pitch = Math.max(-1.4, Math.min(1.4, pitch));
    lx = e.clientX;
    ly = e.clientY;
    applyLook();
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  /* resize */
  const fit = () => {
    const w = node.clientWidth || 1;
    const h = node.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(node);
  fit();

  /* frame loop only while the stage is visible */
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    for (const k of keys) {
      if (k === 'w' || k === 'arrowup') step(WALK_SPEED * dt);
      else if (k === 's' || k === 'arrowdown') step(-WALK_SPEED * dt);
      else if (k === 'a' || k === 'arrowleft') strafe(-WALK_SPEED * dt);
      else if (k === 'd' || k === 'arrowright') strafe(WALK_SPEED * dt);
    }
    renderer.render(scene, camera);
  };
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      last = performance.now();
      renderer.setAnimationLoop(tick);
    } else {
      renderer.setAnimationLoop(null);
    }
  });
  observer.observe(el);

  return {
    reset,
    step,
    dispose: () => {
      observer.disconnect();
      ro.disconnect();
      renderer.setAnimationLoop(null);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | undefined;
        mat?.dispose?.();
      });
      root.removeFromParent();
      splat.dispose();
      spark.dispose();
      renderer.dispose();
      el.remove();
    },
  };
}
