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
}

/**
 * The world of the place — a generated 3D model the recipient can orbit.
 * Auto-rotates; drag to look, wheel/pinch to zoom (scroll is captured by the
 * canvas only while the pointer is over it). If the GLB can't load it falls
 * back to a slow Ken-Burns still of the place, so the beat is never empty.
 */
export function World({ src, fallback, className = '', onReady }: WorldProps) {
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
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    // warm key light + cool rim, like late-afternoon on the place
    const key = new THREE.DirectionalLight(0xffe0b0, 2.4);
    key.position.set(2.5, 3, 2);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.9);
    rim.position.set(-3, 1.5, -2);
    const amb = new THREE.AmbientLight(0xfff2e0, 0.75);
    scene.add(key, rim, amb);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;
    controls.minDistance = 1.4;
    controls.maxDistance = 14;
    // stop auto-rotate while the visitor looks
    let interacted = false;
    controls.addEventListener('start', () => {
      interacted = true;
      controls.autoRotate = false;
    });

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

    // capture wheel over the canvas so zoom doesn't scroll the page
    const onWheel = (e: WheelEvent) => e.preventDefault();
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    let model: THREE.Object3D | null = null;
    const frame = () => {
      if (disposed) return;
      // gently resume the drift if they've been hands-off a while
      if (interacted && !renderer.domElement.matches(':active') && Math.random() < 0.002) {
        controls.autoRotate = true;
      }
      controls.update();
      if (model) {
        // a slow breathing sway, like wind
        model.rotation.z = Math.sin(performance.now() / 4000) * 0.012;
      }
      renderer.render(scene, camera);
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
          // frame it
          camera.position.set(0.8, 0.4, 4.4);
          controls.target.set(0, 0, 0);
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
      renderer.domElement.removeEventListener('wheel', onWheel);
      controls.dispose();
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
  }, [src, onReady]);

  if (failed) {
    return (
      <div className={`wt-world wt-world-fallback ${className}`} aria-hidden>
        {fallback && <img src={fallback} alt="" draggable={false} />}
      </div>
    );
  }

  return (
    <div className={`world ${className}`} aria-hidden ref={mountRef} />
  );
}
