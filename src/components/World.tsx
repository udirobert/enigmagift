import { useEffect, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface WorldProps {
  /** glb url — the generated 3D model of the place */
  src: string;
  /** fallback poster if the model fails to load */
  fallback?: string;
  className?: string;
  /** called when the model is ready and interactive */
  onReady?: () => void;
  /** called when the renderer or the model fails — lets the caller keep a
   *  designed fallback on screen instead of the default poster swap */
  onError?: () => void;
  /**
   * Miniature mode: a 0..1 progress ref the caller owns. While p<1 the world
   * authors the camera and the model's clipped emergence from the photograph;
   * at p=1 OrbitControls takes over. No auto-rotate, no sway.
   */
  unfold?: RefObject<number>;
  /** spin speed (worlds-per-~60s) — the ambient backdrop drifts slower than
   *  the tour beat */
  spin?: number;
  /**
   * interactive = the visitor can drag to orbit and wheel to zoom (tour
   * climax). ambient = the model just drifts on its own and lets every
   * pointer event fall through to the page (a landing backdrop) — no
   * OrbitControls, no scroll capture.
   */
  interactive?: boolean;
}

// soft radial blot used as the paper-grounding shadow under the miniature
function makeRadialShadow(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(30, 22, 10, 0.55)');
  g.addColorStop(0.7, 'rgba(30, 22, 10, 0.28)');
  g.addColorStop(1, 'rgba(30, 22, 10, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The world of the place — a generated 3D model the recipient can orbit.
 * interactive: auto-rotates; drag to look, wheel/pinch to zoom (scroll is
 * captured by the canvas only while the pointer is over it). ambient: slow
 * self-spin, input passes through. If the GLB can't load it falls back to a
 * slow Ken-Burns still of the place, so the beat is never empty.
 */
export function World({
  src,
  fallback,
  className = '',
  onReady,
  onError,
  unfold,
  spin,
  interactive = true,
}: WorldProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const unfoldMode = !!unfold;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      onError?.();
      return;
    }
    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    camera.position.set(0, 0, 4);

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // the miniature sits on pale paper — keep the exposure nearer room light
    renderer.toneMappingExposure = unfoldMode ? 1.1 : 1.35;
    mount.appendChild(renderer.domElement);

    // The TRELLIS model is a real photograph, so light it like late
    // afternoon: a warm key from the sun's side, a cool fill off the water,
    // and enough ambient that the brick never reads black.
    const key = new THREE.DirectionalLight(0xffe0b0, 3.0);
    key.position.set(2.5, 3, 2);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 1.1);
    fill.position.set(-3, 0.5, 1);
    const hemi = new THREE.HemisphereLight(0xdfeaff, 0x2a2118, 0.9);
    const amb = new THREE.AmbientLight(0xfff2e0, 0.95);
    scene.add(key, fill, hemi, amb);

    // interactive: full OrbitControls — the tour beat where the visitor
    // looks around themselves. ambient: a plain slow spin, and every pointer
    // event falls through to the page (it's a backdrop, not a gadget).
    const controls = interactive
      ? new OrbitControls(camera, renderer.domElement)
      : null;
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.autoRotate = !unfoldMode;
      // static per usage site — deliberately not in the effect deps, or the
      // scene would re-initialise when it changes
      controls.autoRotateSpeed = spin ?? 0.9;
      controls.minDistance = 1.4;
      controls.maxDistance = 14;
      // the miniature's camera is authored until the fold finishes
      if (unfoldMode) controls.enabled = false;
      // stop auto-rotate while the visitor looks
      controls.addEventListener('start', () => {
        controls.autoRotate = false;
      });
    } else {
      // backdrop spin — slow enough to read as weather, not a wheel
      camera.position.set(0.8, 0.4, 4.4);
    }

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // interactive only: capture wheel over the canvas so zoom doesn't
    // scroll the page. ambient: no listener — the page owns the wheel.
    let onWheel: ((e: WheelEvent) => void) | null = null;
    if (controls) {
      // Only claim the wheel once the controls own the canvas — during the
      // fold the page keeps its scroll.
      onWheel = (e) => {
        if (controls.enabled) e.preventDefault();
      };
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    }

    // don't burn frames off-screen — the world can sit mounted as a
    // backdrop while the visitor reads or scrolls
    let mountVisible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        mountVisible = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(mount);

    let model: THREE.Object3D | null = null;
    let modelBaseY = 0;
    // unfold-mode state: the caller owns progress through the ref; we only
    // re-author transforms when it actually moves.
    let clipPlane: THREE.Plane | null = null;
    let clipBottom = 0;
    let clipTop = 0;
    let lastP = -1;
    // paper grounding shadow under the miniature, faded in with emerge
    let shadowMat: THREE.MeshBasicMaterial | null = null;
    // rad/frame — the ambient drift; 0 when the visitor drives the camera
    const spinRate = interactive ? 0 : (spin ?? 0.35) * 0.05;
    const frame = () => {
      if (disposed) return;
      if (mountVisible) {
        if (unfoldMode && model && clipPlane && unfold) {
          const p = THREE.MathUtils.clamp(unfold.current ?? 1, 0, 1);
          if (p !== lastP) {
            const emerge = THREE.MathUtils.smoothstep(p, 0.2, 0.88);
            const settle = THREE.MathUtils.smoothstep(p, 0.43, 1);
            model.visible = emerge > 0;
            model.position.y = (emerge - 1) * 0.5;
            model.rotation.y = modelBaseY + (1 - settle) * -0.55;
            clipPlane.constant = clipBottom + (clipTop - clipBottom) * emerge + 0.02;
            if (shadowMat) shadowMat.opacity = emerge * 0.5;
            // the camera is authored for every progress change — scrubbing
            // or replaying hands it straight back to the fold
            camera.position.set(1.0 + (1 - settle) * 1.35, 1.35 + (1 - settle) * 0.9, 5.8 + (1 - settle) * 0.8);
            camera.lookAt(0, 0, 0);
            if (controls) controls.enabled = p >= 1;
            lastP = p;
          }
          if (p >= 1 && controls) controls.update();
        } else if (controls) {
          controls.update();
        } else if (model) {
          model.rotation.y = modelBaseY + (performance.now() / 1000) * spinRate;
        }
        if (model && !unfoldMode) {
          // a slow breathing sway, like wind
          model.rotation.z = Math.sin(performance.now() / 4000) * 0.012;
        }
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(frame);
    };

    new GLTFLoader()
      .load(
        src,
        (gltf) => {
          if (disposed) return;
          const obj = gltf.scene;
          // normalise to fit the frame regardless of the generator's scale
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const s = 3.2 / maxDim;
          if (unfoldMode && unfold) {
            // one mesh, one assembly: the room rises out of the photograph
            // under a clip plane, not via fake per-node splits. Centering
            // lives on a fitted wrapper — the glb scene stays untouched.
            renderer.localClippingEnabled = true;
            clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
            obj.traverse((o) => {
              const m = o as THREE.Mesh;
              if (!m.isMesh) return;
              (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
                mat.clippingPlanes = [clipPlane!];
              });
            });
            const fitted = new THREE.Group();
            fitted.scale.setScalar(s);
            fitted.position.copy(center).multiplyScalar(-s);
            fitted.add(obj);
            const wrap = new THREE.Group();
            wrap.add(fitted);
            scene.add(wrap);
            wrap.updateWorldMatrix(true, true);
            const nb = new THREE.Box3().setFromObject(fitted);
            clipBottom = nb.min.y;
            clipTop = nb.max.y;
            clipPlane.constant = clipBottom;
            // a soft paper shadow where the room meets the plinth — it fades
            // in as the miniature emerges so it never floats on blank fill
            const ns = nb.getSize(new THREE.Vector3());
            const shadowTex = makeRadialShadow();
            shadowMat = new THREE.MeshBasicMaterial({
              map: shadowTex,
              transparent: true,
              opacity: 0,
              depthWrite: false,
            });
            const shadow = new THREE.Mesh(
              new THREE.PlaneGeometry(Math.max(ns.x, 1) * 1.2, Math.max(ns.z, 1) * 1.35),
              shadowMat,
            );
            shadow.rotation.x = -Math.PI / 2;
            shadow.position.y = nb.min.y + 0.012;
            wrap.add(shadow);
            wrap.visible = false;
            model = wrap;
            modelBaseY = wrap.rotation.y;
            camera.lookAt(0, 0, 0);
          } else {
            obj.position.sub(center);
            obj.scale.setScalar(s);
            scene.add(obj);
            model = obj;
            modelBaseY = obj.rotation.y;
            // frame it
            camera.position.set(0.8, 0.4, 4.4);
            controls?.target.set(0, 0, 0);
          }
          onReady?.();
        },
        undefined,
        (err) => {
          console.warn('[world] glb load failed', err);
          setFailed(true);
          onError?.();
        },
      );

    frame();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      if (onWheel) renderer.domElement.removeEventListener('wheel', onWheel);
      controls?.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [src, onReady, onError, unfold, interactive]);

  if (failed) {
    return (
      <div className={`world world-fallback ${className}`} aria-hidden>
        {fallback && <img src={fallback} alt="" draggable={false} />}
      </div>
    );
  }

  return (
    <div className={`world ${className}`} aria-hidden ref={mountRef} />
  );
}
