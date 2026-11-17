import { useEffect, useRef, useState } from 'react';
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
  spin,
  interactive = true,
}: WorldProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
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
    renderer.toneMappingExposure = 1.35;
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
      controls.autoRotate = true;
      // static per usage site — deliberately not in the effect deps, or the
      // scene would re-initialise when it changes
      controls.autoRotateSpeed = spin ?? 0.9;
      controls.minDistance = 1.4;
      controls.maxDistance = 14;
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
      onWheel = (e) => e.preventDefault();
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
    // rad/frame — the ambient drift; 0 when the visitor drives the camera
    const spinRate = interactive ? 0 : (spin ?? 0.35) * 0.05;
    const frame = () => {
      if (disposed) return;
      if (mountVisible) {
        if (controls) {
          controls.update();
        } else if (model) {
          model.rotation.y = modelBaseY + (performance.now() / 1000) * spinRate;
        }
        if (model) {
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
          obj.position.sub(center);
          const s = 3.2 / maxDim;
          obj.scale.setScalar(s);
          scene.add(obj);
          model = obj;
          modelBaseY = obj.rotation.y;
          // frame it
          camera.position.set(0.8, 0.4, 4.4);
          controls?.target.set(0, 0, 0);
          onReady?.();
        },
        undefined,
        (err) => {
          console.warn('[world] glb load failed', err);
          setFailed(true);
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
  }, [src, onReady, interactive]);

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
