/* DEV-ONLY calibration helper — localhost use, never shipped in the gift build.
   Renders the splat world at the fixed 900x640 calibration pose; each click
   raycasts to the collider and prints world XYZ + NDC for pasting into
   ANCHORS in world.ts. Yaw/pitch inputs let the opening pose be tuned. */
import * as THREE from 'three';
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const stage = document.getElementById('stage')!;
const out = document.getElementById('out') as HTMLTextAreaElement;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(900, 640);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 900 / 640, 0.01, 2000);
const spark = new SparkRenderer({ renderer, enableLod: true });
scene.add(spark);

const root = new THREE.Group();
root.position.set(0, 1.5, 0);
root.rotation.set(Math.PI, Math.PI, 0);
root.scale.setScalar(2.5);
scene.add(root);

const boot = async () => {
const cfg = await (await fetch('./world.json')).json();
const splat = new SplatMesh({
  url: cfg.rad,
  fileType: SplatFileType.RAD,
  paged: true,
  raycastable: false,
});
root.add(splat);
const collider = (await new GLTFLoader().loadAsync(cfg.collider)).scene;
collider.traverse((o) => (o.visible = false));
root.add(collider);
await splat.initialized;
root.updateMatrixWorld(true);

const setPose = () => {
  camera.position.set(0, 1.5, 0);
  camera.rotation.set(0, 0, 0, 'YXZ');
  camera.rotation.y = parseFloat((document.getElementById('yaw') as HTMLInputElement).value) || 0;
  camera.rotation.x = parseFloat((document.getElementById('pitch') as HTMLInputElement).value) || 0;
};
setPose();
document.getElementById('apply')!.addEventListener('click', setPose);

renderer.setAnimationLoop(() => renderer.render(scene, camera));

const ray = new THREE.Raycaster();
renderer.domElement.addEventListener('pointerup', (e) => {
  const r = renderer.domElement.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hits = ray.intersectObject(collider, true);
  const hit = hits[0];
  out.value +=
    `ndc=(${nx.toFixed(3)},${ny.toFixed(3)}) ` +
    (hit
      ? `xyz=(${hit.point.x.toFixed(2)},${hit.point.y.toFixed(2)},${hit.point.z.toFixed(2)}) dist=${hit.distance.toFixed(2)}`
      : 'NO COLLIDER HIT') + '\n';
});

out.value = 'ready — click the rendered room\n';
};
boot().catch((e) => {
  out.value = 'FAILED: ' + e;
});
