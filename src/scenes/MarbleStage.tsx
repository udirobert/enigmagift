import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark';

/** scene-independent authored data — raw preview coordinates, not metres */
export type Vec3 = [number, number, number];
export interface Pose {
  position: Vec3;
  target: Vec3;
}
export interface Mark {
  id: string;
  label: string;
  position: Vec3;
}
export interface Pin {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}
export type MarbleLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface MarbleStageHandle {
  /** current camera position + look target */
  captureView(): Pose | null;
  /** restore a captured pose */
  showView(pose: Pose): void;
  /** raycast the canvas centre against the splat; nearest finite hit or null */
  pickCenter(): Vec3 | null;
}

interface Props {
  file: File | null;
  flipped: boolean;
  /** author mode only — OrbitControls are disabled while playing */
  controlsEnabled: boolean;
  marks: Mark[];
  onLoadState: (state: MarbleLoadState, note: string) => void;
  onPins?: (pins: Pin[]) => void;
}

/**
 * Center stage canvas for /studio/marble: one local SplatMesh loaded from a
 * File, SparkRenderer, render-on-demand loop, OrbitControls (author only).
 * Everything the parent asks for goes through the imperative handle.
 */
export const MarbleStage = forwardRef<MarbleStageHandle, Props>(function MarbleStage(
  { file, flipped, controlsEnabled, marks, onLoadState, onPins },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onLoadStateRef = useRef(onLoadState);
  const onPinsRef = useRef(onPins);
  const marksRef = useRef(marks);
  const flippedRef = useRef(flipped);
  const controlsEnabledRef = useRef(controlsEnabled);
  onLoadStateRef.current = onLoadState;
  onPinsRef.current = onPins;
  marksRef.current = marks;
  flippedRef.current = flipped;
  controlsEnabledRef.current = controlsEnabled;

  const ctxRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    spark: SparkRenderer;
    mesh: SplatMesh | null;
    requestRender: () => void;
  } | null>(null);

  const loadSeq = useRef(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false });
    } catch {
      onLoadStateRef.current('error', 'This browser cannot show 3D — try another device or browser.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#b9c8d2'); // fog field, same as the room stage
    scene.fog = new THREE.Fog('#b9c8d2', 7, 30);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
    camera.position.set(0, 0, 0.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enabled = controlsEnabledRef.current;
    controls.target.set(0, 0, -1); // face negative Z until a load reframes

    let raf = 0;
    let disposed = false;
    const requestRender = () => {
      if (raf || disposed) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (disposed) return;
        renderer.render(scene, camera);
        // project authored marks onto the canvas for the pin layer
        const pins: Pin[] = [];
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        const v = new THREE.Vector3();
        for (const m of marksRef.current) {
          v.set(m.position[0], m.position[1], m.position[2]).project(camera);
          const visible =
            Number.isFinite(v.x) &&
            Number.isFinite(v.y) &&
            Math.abs(v.x) <= 1 &&
            Math.abs(v.y) <= 1 &&
            v.z < 1 &&
            v.z > -1;
          pins.push({
            id: m.id,
            x: ((v.x + 1) / 2) * w,
            y: ((1 - v.y) / 2) * h,
            visible,
          });
        }
        onPinsRef.current?.(pins);
      });
    };

    const spark = new SparkRenderer({ renderer, onDirty: requestRender });
    scene.add(spark);

    controls.addEventListener('change', requestRender);

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      requestRender();
    });
    ro.observe(mount);

    ctxRef.current = { renderer, scene, camera, controls, spark, mesh: null, requestRender };
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      loadSeq.current += 1; // cancel in-flight decodes
      const mesh = ctxRef.current?.mesh;
      if (mesh) {
        scene.remove(mesh);
        mesh.dispose();
      }
      spark.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load / reload when the chosen file changes
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const seq = ++loadSeq.current;

    const drop = () => {
      if (ctx.mesh) {
        ctx.scene.remove(ctx.mesh);
        ctx.mesh.dispose();
        ctx.mesh = null;
      }
    };

    if (!file) {
      drop();
      ctx.requestRender();
      return;
    }

    let cancelled = false;
    const stale = () => cancelled || seq !== loadSeq.current;

    (async () => {
      onLoadStateRef.current('loading', `Reading ${file.name}…`);
      let mesh: SplatMesh;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (stale()) return;

        drop();
        mesh = new SplatMesh({
          fileBytes: bytes,
          fileType: SplatFileType.SPZ,
          raycastable: true,
        });
        mesh.rotation.x = flippedRef.current ? Math.PI : 0;
        ctx.scene.add(mesh);
        ctx.mesh = mesh;
        ctx.requestRender();

        await mesh.initialized;
      } catch {
        if (stale()) return;
        drop();
        onLoadStateRef.current(
          'error',
          `Could not decode ${file.name} — it may not be a valid .spz export. Choose another file.`,
        );
        ctx.requestRender();
        return;
      }
      if (stale()) return;

      // default framing: sit just outside the bounding box facing negative Z
      let center = new THREE.Vector3(0, 0, -1);
      let radius = 1.5;
      try {
        mesh.updateMatrixWorld(true);
        const box = mesh.getBoundingBox(true).applyMatrix4(mesh.matrixWorld);
        if (!box.isEmpty() && Number.isFinite(box.min.x)) {
          center = box.getCenter(new THREE.Vector3());
          radius = Math.max(0.4, box.getSize(new THREE.Vector3()).length() / 2);
        }
      } catch {
        /* keep the origin-ish fallback */
      }
      ctx.controls.target.copy(center);
      ctx.camera.position.copy(center).add(new THREE.Vector3(0, 0, radius * 1.4));
      ctx.camera.lookAt(ctx.controls.target);
      ctx.controls.update();
      onLoadStateRef.current('ready', `${file.name} is on stage.`);
      ctx.requestRender();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // flip upright control (some exports land upside-down)
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx?.mesh) return;
    ctx.mesh.rotation.x = flipped ? Math.PI : 0;
    ctx.mesh.updateMatrixWorld(true);
    ctx.requestRender();
  }, [flipped]);

  // OrbitControls in author mode only
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.controls.enabled = controlsEnabled;
  }, [controlsEnabled]);

  useImperativeHandle(
    ref,
    () => ({
      captureView(): Pose | null {
        const ctx = ctxRef.current;
        if (!ctx?.mesh) return null;
        return {
          position: ctx.camera.position.toArray() as Vec3,
          target: ctx.controls.target.toArray() as Vec3,
        };
      },
      showView(pose: Pose): void {
        const ctx = ctxRef.current;
        if (!ctx) return;
        ctx.camera.position.fromArray(pose.position);
        ctx.controls.target.fromArray(pose.target);
        ctx.controls.update();
        ctx.requestRender();
      },
      pickCenter(): Vec3 | null {
        const ctx = ctxRef.current;
        if (!ctx?.mesh) return null;
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(0, 0), ctx.camera);
        const hits = ray.intersectObject(ctx.mesh, false);
        for (const h of hits) {
          const p = h.point;
          if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
            return [p.x, p.y, p.z];
          }
        }
        return null;
      },
    }),
    [],
  );

  return <div ref={mountRef} className="ms-stage" />;
});
