import * as THREE from 'three';
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** shared transform for splat + collider — never move one without the other */
const ROOT_POS: [number, number, number] = [0, 1.5, 0];
const ROOT_ROT: [number, number, number] = [Math.PI, Math.PI, 0];
const ROOT_SCALE = 2.5;

const EYE: [number, number, number] = [0, 1.5, 0];
const WALK_SPEED = 2.2;
const WALK_RADIUS = 5;
const WALL_STOP = 0.45;
const TAP_TRAVEL_PX = 7;
const READY_TIMEOUT_MS = 30_000;

export type Target =
  | 'dog' | 'table' | 'chair' | 'plant' | 'coats' | 'tv' | 'shelves' | 'door'
  | 'postcard' | 'ribbon';

/**
 * CALIBRATION — measured against the *rendered* room, not the photo.
 * revision: byteSize of the RAD stream these anchors were taken against.
 * Poses: calibration viewport 900x640, camera at CALIB_POS, CALIB_YAW/PITCH.
 * Values in anchor positions are world-space XYZ on the collider, obtained by
 * raycasting the calibration pose through the measured pixel, plus a generous
 * world-space radius for coarse-collider tolerance.
 */
export const ANCHOR_REVISION = 44124720;
export const CALIB_VIEW = { w: 900, h: 640 };
export const CALIB_POS: [number, number, number] = [0, 1.5, 0];
/* measured: yaw π is the pose where the rendered dining view matches the
   reference photo (dog front-centre, table ahead, plant right, rack left) */
export const CALIB_YAW = Math.PI;
export const CALIB_PITCH = 0;
/* measured 2026-02-18 on the real 900x640 render by raycasting the collider:
   dog floor ndc(0.244..0.556,-0.61..-0.73) → ~(-1.4,-0.6,6.3)
   table base ndc(0.122,-0.188) → (-1.00,0.41,11.17)
   plant pot ndc(0.92..0.93,-0.41..-0.47) → ~(-3.6,0.3,5.4)
   coats rack ndc(-0.61..-0.63,-0.16..0.09) → ~(3.3,0.9,7.4)
   radii are generous world-space volumes for the coarse collider */
export const ANCHORS: Record<Target, { pos: [number, number, number]; r: number }> = {
  dog: { pos: [-1.4, -0.6, 6.3], r: 1.0 },
  table: { pos: [-1.0, 0.6, 11.2], r: 1.6 },
  chair: { pos: [-1.3, 0.6, 9.8], r: 1.0 },
  plant: { pos: [-3.6, 0.5, 5.4], r: 1.0 },
  coats: { pos: [3.3, 0.9, 7.4], r: 1.2 },
  tv: { pos: [-0.9, 3.15, 13], r: 0.9 },
  shelves: { pos: [-3.4, 1.4, 8.8], r: 1.2 },
  door: { pos: [2.3, 1.1, 13], r: 0.9 },
  /* rear keepsakes project from their placed meshes, not these stubs */
  postcard: { pos: [0, 0, 0], r: 0 },
  ribbon: { pos: [0, 0, 0], r: 0 },
};

/* ---- hand-traced semantic patches, tied to ANCHOR_REVISION ----
   Authored in the scaled calibration frame (canvas 900x640 shown at 633x450,
   offset +6/+6); each vertex is back-projected at a constant world z into a
   real 3D plane. Picking = ray ∩ plane + even-odd test — no spheres. */
const PICK_K = 225 / Math.tan((55 * Math.PI) / 360);
const toWorld = (px: number, py: number, z: number): [number, number] => [
  (-(px - 322.5) * z) / PICK_K,
  1.5 - ((py - 231) * z) / PICK_K,
];
interface Patch {
  t: Target;
  z: number;
  poly: [number, number][]; // world XY on the plane z
}
const PATCHES: Patch[] = [
  /* z=5.7 (not the 6.3 anchor): patch z must sit at/near the collider surface
   * seen through these pixels — floor-adjacent dog rays meet geometry sooner */
  { t: 'dog', z: 5.7, poly: [[391,380],[394,364],[414,355],[425,345],[456,334],[489,333],[517,338],[547,354],[561,377],[560,397],[537,409],[509,412],[485,402],[459,405],[426,404],[426,388],[397,388]].map(([x,y])=>toWorld(x,y,5.7)) },
  { t: 'table', z: 10.2, poly: [[279,241],[300,237],[429,238],[436,243],[403,252],[363,254],[339,251],[280,250]].map(([x,y])=>toWorld(x,y,10.2)) },
  { t: 'table', z: 10.2, poly: [[330,252],[338,252],[395,295],[388,295]].map(([x,y])=>toWorld(x,y,10.2)) },
  { t: 'table', z: 10.2, poly: [[395,250],[403,250],[340,293],[333,293]].map(([x,y])=>toWorld(x,y,10.2)) },
  { t: 'chair', z: 9.4, poly: [[299,245],[320,244],[334,253],[342,271],[357,278],[356,289],[332,291],[316,280],[307,267]].map(([x,y])=>toWorld(x,y,9.4)) },
  { t: 'chair', z: 9.4, poly: [[394,271],[407,249],[421,243],[448,242],[451,255],[442,280],[428,290],[397,288],[387,282]].map(([x,y])=>toWorld(x,y,9.4)) },
  { t: 'chair', z: 9.4, poly: [[300,290],[308,290],[300,330],[292,330]].map(([x,y])=>toWorld(x,y,9.4)) },
  { t: 'chair', z: 9.4, poly: [[400,290],[408,290],[405,330],[397,330]].map(([x,y])=>toWorld(x,y,9.4)) },
  { t: 'tv', z: 13, poly: [[319,158],[385,157],[386,194],[319,196]].map(([x,y])=>toWorld(x,y,13)) },
  { t: 'shelves', z: 8.8, poly: [[461,147],[574,71],[585,91],[548,155],[545,250],[567,298],[567,334],[461,307]].map(([x,y])=>toWorld(x,y,8.8)) },
  { t: 'door', z: 13, poly: [[235,172],[277,171],[278,277],[232,279]].map(([x,y])=>toWorld(x,y,13)) },
  { t: 'plant', z: 5.4, poly: [[598,150],[639,140],[639,335],[604,335],[590,300],[594,215]].map(([x,y])=>toWorld(x,y,5.4)) },
  { t: 'coats', z: 7.4, poly: [[106,195],[117,185],[141,185],[151,198],[153,227],[149,265],[138,274],[120,269],[112,262],[104,262]].map(([x,y])=>toWorld(x,y,7.4)) },
];
const WALL_TOLERANCE = 0.8; // coarse collider may sit in front of a target
const SCREEN_TOLERANCE_PX = 5;

export interface WorldEvents {
  onInspect?: (t: Target) => void;
  /** fired on every confirmed tap (<7px travel, primary button, no overlay) —
   *  t is null for floor/wall/ceiling misses; x/y are client CSS coords */
  onTap?: (t: Target | null, x: number, y: number) => void;
  /** the tap landed directly on the folded paper mesh itself */
  onPaperTap?: () => void;
  /** camera moved to/restored from the dog's viewpoint or a 'Take me there' look */
  onViewChanged?: (v: 'home' | 'dog' | 'see') => void;
  onVisibleDog?: () => void;
  onMove?: () => void;
}

export interface WorldHandle {
  reset(): void;
  step(amount: number): void;
  /** project a target anchor to CSS px within the canvas, or null when off-view */
  project(t: Target): { x: number; y: number } | null;
  /** project the tabletop paper to CSS px, or null when off-view */
  paperScreen(): { x: number; y: number } | null;
  /** move the camera down to the dog's spot (pose saved for leaveDog) */
  visitDog(): void;
  leaveDog(): void;
  isAtDog(): boolean;
  /** aim the standing camera at a target ('Take me there'); pose is saved */
  see(t: Target): void;
  /** restore the pose saved by see/visitDog */
  unsee(): void;
  isSeeing(): boolean;
  /** folded paper on the table lip: closed edge/folded looks, open unfolds */
  showPaper(state: 'edge' | 'folded' | 'open'): void;
  /** brief outline flash around the paper — used by the help ladder */
  flashPaper(): void;
  setTargetsEnabled(on: boolean): void;
  dispose(): void;
}

export async function enterWorld(
  node: HTMLElement,
  assets: { rad: string; collider: string },
  events: WorldEvents = {},
  signal?: AbortSignal,
): Promise<WorldHandle> {
  if (signal?.aborted) throw new Error('aborted');

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

  const fail = (err: unknown): never => {
    splat.dispose();
    spark.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    throw err;
  };

  let colliderGltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  const abortP = new Promise<never>((_, rej) => {
    signal?.addEventListener('abort', () => rej(new Error('aborted')), { once: true });
  });
  const deadlineP = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error('world download stalled')), READY_TIMEOUT_MS),
  );
  try {
    [, colliderGltf] = await Promise.race([
      Promise.all([splat.initialized, new GLTFLoader().loadAsync(assets.collider)]),
      abortP,
      deadlineP,
    ]);
  } catch (err) {
    fail(err);
  }
  if (signal?.aborted) return fail(new Error('aborted'));

  const collider = colliderGltf!.scene;
  collider.traverse((o) => {
    o.visible = false;
  });
  root.add(collider);
  root.updateMatrixWorld(true);

  /* ---- the folded paper on the table lip (world-anchored, same frame as
     patches/anchors) — a flat card plus a short flap hanging over the edge,
     readable from standing height and visible from the dog's low angle ---- */
  const PAPER_POS = new THREE.Vector3(-0.8, 1.32, 9.6);
  const DOG_POS = new THREE.Vector3(-1.2, -0.25, 4.4);
  const DOG_LOOK = new THREE.Vector3(-0.8, 1.2, 10.2);
  /* a cream envelope on the table lip: flat card, hinged tab hanging over the
     edge (cream silhouette from the dog's low view), rust wax seal and a
     lifted corner fold. depthWrite off + renderOrder keep it legible through
     the transparent splat pass; collider check hides it behind real walls. */
  const paper = new THREE.Group();
  const paperMat = new THREE.MeshBasicMaterial({
    color: 0xf3e2c4,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true, // splats render in the transparent pass — join it to stay on top
    opacity: 1,
  });
  const paperBase = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.34), paperMat);
  paperBase.rotation.x = -Math.PI / 2 + 0.1; // nearly flat, tilted to the room
  paperBase.position.set(0, 0, 0.06);
  paperBase.renderOrder = 5;
  // triangular corner fold on the card itself
  const cornerShape = new THREE.Shape([
    new THREE.Vector2(0.28, 0.17),
    new THREE.Vector2(0.375, 0.17),
    new THREE.Vector2(0.375, 0.04),
  ]);
  const cornerMat = new THREE.MeshBasicMaterial({
    color: 0xfff4d9,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  const paperCorner = new THREE.Mesh(new THREE.ShapeGeometry(cornerShape), cornerMat);
  paperCorner.rotation.x = -Math.PI / 2 + 0.32; // folded back a little
  paperCorner.position.set(0, 0.005, 0.06);
  paperCorner.renderOrder = 6;
  // hinged overhanging tab: geometry shifted so the hinge edge is the pivot
  const paperFlap = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 0.32).translate(0, -0.16, 0),
    paperMat,
  );
  paperFlap.position.set(0, -0.01, -0.11); // hinge at the card's forward (lip) edge
  paperFlap.renderOrder = 6;
  const FLAP_CLOSED = -Math.PI / 2 - 0.85; // hanging down over the lip
  const FLAP_OPEN = -Math.PI / 2 + 0.04;   // folded back flat on the card
  paperFlap.rotation.x = FLAP_CLOSED;
  const waxMat = new THREE.MeshBasicMaterial({
    color: 0x9c4a2c,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  const wax = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), waxMat);
  wax.position.set(0, -0.22, 0.012);
  wax.renderOrder = 7;
  paperFlap.add(wax);
  paper.add(paperBase, paperCorner, paperFlap);
  paper.position.copy(PAPER_POS);
  scene.add(paper);
  let paperAnim: { t0: number } | null = null;
  const paperCull = new THREE.Raycaster();
  const paperDir = new THREE.Vector3();

  /* ---- keepsakes behind the start view (the 360 side of the hunt) ----
     Postcard on a stand and a ribbon bookmark, placed by raycasting the
     collider backwards from the start pose — real meshes, no HUD hotspots. */
  const rearRay = new THREE.Raycaster();
  const rearPoint = (dx: number, dz: number, maxD = 3.5): THREE.Vector3 => {
    const dir = new THREE.Vector3(dx, 0, dz).normalize();
    rearRay.set(new THREE.Vector3(0, 1.4, 0), dir);
    const hits = rearRay.intersectObject(collider, true);
    const d = hits.length ? Math.min(hits[0].distance - 0.12, maxD) : maxD;
    return new THREE.Vector3(0, 1.4, 0).addScaledVector(dir, Math.max(d, 0.6));
  };

  /* cream illustrated postcard: procedural paw stamp on card stock */
  const stampCanvas = document.createElement('canvas');
  stampCanvas.width = 256;
  stampCanvas.height = 320;
  {
    const g = stampCanvas.getContext('2d')!;
    g.fillStyle = '#f6ead0';
    g.fillRect(0, 0, 256, 320);
    g.strokeStyle = '#a8845a';
    g.lineWidth = 3;
    g.strokeRect(14, 14, 228, 292);
    g.strokeStyle = '#c9ad82';
    g.lineWidth = 1;
    g.strokeRect(22, 22, 212, 276);
    /* paw print in rust ink */
    g.fillStyle = '#9c4a2c';
    const toe = (x: number, y: number, r: number) => {
      g.beginPath();
      g.ellipse(x, y, r, r * 1.25, 0, 0, Math.PI * 2);
      g.fill();
    };
    toe(88, 120, 15); toe(118, 105, 15); toe(148, 105, 15); toe(178, 120, 15);
    g.beginPath();
    g.ellipse(133, 175, 42, 34, 0, 0, Math.PI * 2);
    g.fill();
    /* hand-lettered rule underneath */
    g.strokeStyle = '#9c4a2c';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(78, 235); g.quadraticCurveTo(128, 245, 178, 235);
    g.stroke();
  }
  const postcardTex = new THREE.CanvasTexture(stampCanvas);
  const postcard = new THREE.Group();
  const cardMat = new THREE.MeshBasicMaterial({ map: postcardTex, depthWrite: false, transparent: true });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.52), cardMat);
  card.renderOrder = 5;
  postcard.add(card);
  /* a small easel so it reads as placed, not floating */
  const woodMat = new THREE.MeshBasicMaterial({ color: 0x4a3320 });
  const legGeo = new THREE.BoxGeometry(0.03, 0.7, 0.03);
  const legL = new THREE.Mesh(legGeo, woodMat);
  legL.position.set(-0.14, -0.6, 0.02);
  legL.rotation.z = 0.12;
  const legR = legL.clone();
  legR.position.x = 0.14;
  legR.rotation.z = -0.12;
  const legB = legL.clone();
  legB.position.set(0, -0.6, -0.06);
  legB.rotation.x = -0.35;
  legB.rotation.z = 0;
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.06), woodMat);
  shelf.position.set(0, -0.3, 0.03);
  postcard.add(legL, legR, legB, shelf);
  const POSTCARD_POS = rearPoint(0, -1);
  postcard.position.copy(POSTCARD_POS);
  postcard.position.y = 1.35;
  postcard.lookAt(0, 1.35, 0);
  scene.add(postcard);

  /* a ribbon bookmark keepsake on a wall peg, a little to the side */
  const ribbon = new THREE.Group();
  const ribbonShape = new THREE.Shape([
    new THREE.Vector2(-0.05, 0),
    new THREE.Vector2(0.05, 0),
    new THREE.Vector2(0.05, -0.42),
    new THREE.Vector2(0, -0.36),
    new THREE.Vector2(-0.05, -0.42),
  ]);
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: 0xa33c2a,
    side: THREE.DoubleSide,
    depthWrite: false,
    transparent: true,
  });
  const ribbonCloth = new THREE.Mesh(new THREE.ShapeGeometry(ribbonShape), ribbonMat);
  ribbonCloth.renderOrder = 5;
  const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 10), woodMat);
  peg.rotation.x = Math.PI / 2;
  peg.position.z = 0.04;
  ribbon.add(ribbonCloth, peg);
  const RIBBON_POS = rearPoint(-0.85, -1);
  ribbon.position.copy(RIBBON_POS);
  ribbon.position.y = 1.45;
  ribbon.lookAt(0, 1.45, 0);
  scene.add(ribbon);
  const keepsakes: { mesh: THREE.Object3D; t: Target; pos: THREE.Vector3 }[] = [
    { mesh: postcard, t: 'postcard', pos: postcard.position },
    { mesh: ribbon, t: 'ribbon', pos: ribbon.position },
  ];
  const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const showPaper = (state: 'edge' | 'folded' | 'open') => {
    paper.visible = true;
    if (state === 'open') {
      if (reducedMotion()) {
        paperFlap.rotation.x = FLAP_OPEN;
        paperAnim = null;
      } else {
        paperAnim = { t0: performance.now() };
      }
    } else {
      paperFlap.rotation.x = FLAP_CLOSED;
      paperAnim = null;
    }
  };

  /* ---- camera pose ---- */
  const home = { pos: new THREE.Vector3(...EYE), yaw: CALIB_YAW, pitch: CALIB_PITCH };
  let yaw = home.yaw;
  let pitch = home.pitch;

  const applyLook = () => {
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  };
  let atDog = false;
  const reset = () => {
    if (atDog) {
      atDog = false;
      events.onViewChanged?.('home');
    }
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

  const clearAlong = (dir: THREE.Vector3, dist: number): boolean => {
    if (dir.lengthSq() < 1e-6) return true;
    origin.copy(camera.position);
    ray.set(origin, dir);
    ray.far = Math.abs(dist) + WALL_STOP;
    return ray.intersectObject(collider, true).length === 0;
  };

  const move = (dir: THREE.Vector3, amount: number) => {
    if (atDog) return; // a low visitor looks around but does not wander
    if (amount === 0 || dir.lengthSq() < 1e-6) return;
    if (!clearAlong(dir.clone().multiplyScalar(Math.sign(amount)), Math.abs(amount))) return;
    const candidate = camera.position.clone().addScaledVector(dir, amount);
    candidate.y = home.pos.y;
    if (candidate.distanceTo(home.pos) <= WALK_RADIUS) {
      camera.position.copy(candidate);
      events.onMove?.();
    }
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

  /* ---- real world picking against calibrated anchors ---- */
  let targetsEnabled = true;
  const pickRay = new THREE.Raycaster();
  const anchorVec = new THREE.Vector3();

  /** even-odd point-in-polygon on the patch plane (world XY) */
  const inPoly = (poly: [number, number][], x: number, y: number): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  /** min distance from screen point (px) to a projected patch polygon */
  const screenDist = (poly: [number, number][], z: number, sx: number, sy: number, rect: DOMRect): number => {
    const v = new THREE.Vector3();
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const pa = v.set(ax, ay, z).project(camera);
      const sa = { x: (pa.x * 0.5 + 0.5) * rect.width, y: (-pa.y * 0.5 + 0.5) * rect.height };
      const pb = v.set(bx, by, z).project(camera);
      const sb = { x: (pb.x * 0.5 + 0.5) * rect.width, y: (-pb.y * 0.5 + 0.5) * rect.height };
      const dx = sb.x - sa.x;
      const dy = sb.y - sa.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((sx - sa.x) * dx + (sy - sa.y) * dy) / len2)) : 0;
      const cx = sa.x + t * dx - sx;
      const cy = sa.y + t * dy - sy;
      best = Math.min(best, Math.hypot(cx, cy));
    }
    return best;
  };

  interface PickHit {
    t: Target;
    d: number;
    patch: Patch | null; // the actual polygon that caught the tap
    paper: boolean;      // true when the tap landed on the paper mesh itself
  }
  const pick = (ndcX: number, ndcY: number, sx: number, sy: number, rect: DOMRect): PickHit | null => {
    pickRay.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const r = pickRay.ray;
    const wallHits = pickRay.intersectObject(collider, true);
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;
    let best: { t: Target; d: number; patch: Patch } | null = null;
    for (const p of PATCHES) {
      const dz = p.z - r.origin.z;
      if (Math.abs(r.direction.z) < 1e-6) continue;
      const along = dz / r.direction.z;
      if (along <= 0) continue;
      const hx = r.origin.x + r.direction.x * along;
      const hy = r.origin.y + r.direction.y * along;
      if (!inPoly(p.poly, hx, hy)) continue;
      if (along - WALL_TOLERANCE > wallDist) continue; // real wall in front
      if (!best || along < best.d) best = { t: p.t, d: along, patch: p };
    }
    /* the physical paper outranks a patch when it is nearer and not occluded */
    const paperHits = paper.visible ? pickRay.intersectObject(paper, true) : [];
    if (
      paperHits.length &&
      paperHits[0].distance - WALL_TOLERANCE <= wallDist &&
      (!best || paperHits[0].distance < best.d + 0.3) // it lies on the table —
    ) {
      return { t: 'table', d: paperHits[0].distance, patch: null, paper: true };
    }
    /* rear keepsakes are true meshes — nearest non-occluded hit wins */
    let keep: { t: Target; d: number } | null = null;
    for (const k of keepsakes) {
      const hits = pickRay.intersectObject(k.mesh, true);
      if (hits.length && hits[0].distance - WALL_TOLERANCE <= wallDist) {
        if (!keep || hits[0].distance < keep.d) keep = { t: k.t, d: hits[0].distance };
      }
    }
    if (keep && (!best || keep.d <= best.d)) {
      return { t: keep.t, d: keep.d, patch: null, paper: false };
    }
    if (best) return { t: best.t, d: best.d, patch: best.patch, paper: false };
    /* ~5px grace only when no polygon was hit at all */
    let near: { t: Target; px: number; patch: Patch } | null = null;
    for (const p of PATCHES) {
      const along = (p.z - r.origin.z) / r.direction.z;
      if (!Number.isFinite(along) || along <= 0 || along - WALL_TOLERANCE > wallDist) continue;
      const d = screenDist(p.poly, p.z, sx, sy, rect);
      if (d <= SCREEN_TOLERANCE_PX && (!near || d < near.px)) near = { t: p.t, px: d, patch: p };
    }
    if (near) return { t: near.t, d: 0, patch: near.patch, paper: false };
    return null;
  };

  const projectVec = (v: THREE.Vector3): { x: number; y: number } | null => {
    anchorVec.copy(v).project(camera);
    if (anchorVec.z > 1) return null; // behind camera
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (anchorVec.x * 0.5 + 0.5) * rect.width;
    const y = (-anchorVec.y * 0.5 + 0.5) * rect.height;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    return { x, y };
  };
  const project = (t: Target): { x: number; y: number } | null => {
    const k = keepsakes.find((k) => k.t === t);
    if (k) return projectVec(k.pos);
    const a = ANCHORS[t];
    if (a.r <= 0) return null;
    return projectVec(anchorVec.set(...a.pos).clone());
  };
  const paperScreen = () => projectVec(PAPER_POS);

  /* ---- dog viewpoint: save pose, crouch beside the dog, look at the lip ---- */
  const savedPose = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
  const visitDog = () => {
    if (atDog) return;
    savedPose.pos.copy(camera.position);
    savedPose.yaw = yaw;
    savedPose.pitch = pitch;
    camera.position.copy(DOG_POS);
    const dir = DOG_LOOK.clone().sub(DOG_POS);
    const horiz = Math.hypot(dir.x, dir.z);
    yaw = Math.atan2(-dir.x, -dir.z);
    pitch = Math.atan2(dir.y, horiz);
    applyLook();
    atDog = true;
    events.onViewChanged?.('dog');
  };
  const leaveDog = () => {
    if (!atDog) return;
    camera.position.copy(savedPose.pos);
    yaw = savedPose.yaw;
    pitch = savedPose.pitch;
    applyLook();
    atDog = false;
    events.onViewChanged?.('home');
  };
  /* 'Take me there': stand where you started and face the thing — a look,
     not a walk. The same saved-pose slot restores it exactly. */
  let seeing = false;
  const see = (t: Target) => {
    if (atDog) leaveDog();
    if (!seeing) {
      savedPose.pos.copy(camera.position);
      savedPose.yaw = yaw;
      savedPose.pitch = pitch;
    }
    camera.position.copy(home.pos);
    const p = keepsakes.find((k) => k.t === t)?.pos
      ?? new THREE.Vector3(...(ANCHORS[t]?.pos ?? [0, 1.5, 8]));
    const d = p.clone().sub(camera.position);
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    applyLook();
    seeing = true;
    events.onViewChanged?.('see');
  };
  const unsee = () => {
    if (!seeing) return;
    camera.position.copy(savedPose.pos);
    yaw = savedPose.yaw;
    pitch = savedPose.pitch;
    applyLook();
    seeing = false;
    events.onViewChanged?.('home');
  };

  /* keyboard */
  const editable = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  const overlayOpen = () =>
    !!document.querySelector('.photo-sheet:not([hidden]), .note:not([hidden]), .help:not([hidden])');
  const onKey = (e: KeyboardEvent) => {
    if (editable() || overlayOpen()) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      keys.add(k);
      e.preventDefault();
      events.onMove?.();
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

  /* ---- chair accent: trace the exact picked patch for ~450ms ---- */
  const el = renderer.domElement;
  const accentSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  accentSvg.setAttribute('class', 'accent-svg');
  accentSvg.setAttribute('aria-hidden', 'true');
  const accentPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  accentSvg.appendChild(accentPoly);
  accentSvg.style.display = 'none';
  node.appendChild(accentSvg);
  let accentPatch: Patch | null = null;
  let accentUntil = 0;
  const accent = (p: Patch) => {
    accentPatch = p;
    accentUntil = performance.now() + 450;
  };
  /* help ladder spotlight: reuse the accent pass with the paper's outline */
  const flashPaper = () => {
    accentPatch = {
      t: 'table',
      z: 0,
      poly: [
        [-0.4, 0.1],
        [0.4, 0.1],
        [0.4, -0.2],
        [-0.4, -0.2],
      ],
    };
    accentPatch.z = PAPER_POS.z;
    accentPatch.poly = accentPatch.poly.map(
      ([x, y]) => [PAPER_POS.x + x, PAPER_POS.y + y] as [number, number],
    );
    accentUntil = performance.now() + 1200;
  };
  const projV = new THREE.Vector3();
  const drawAccent = (rect: DOMRect) => {
    if (!accentPatch) return;
    const pts = accentPatch.poly
      .map(([x, y]) => {
        projV.set(x, y, accentPatch!.z).project(camera);
        return `${((projV.x * 0.5 + 0.5) * rect.width).toFixed(1)},${((-projV.y * 0.5 + 0.5) * rect.height).toFixed(1)}`;
      })
      .join(' ');
    accentPoly.setAttribute('points', pts);
    accentSvg.style.display = '';
  };

  /* drag look + tap pick (tap = <7px total travel) */
  let dragging = false;
  let moved = 0;
  let lx = 0;
  let ly = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    lx = e.clientX;
    ly = e.clientY;
    el.setPointerCapture(e.pointerId);
  };
  const onMovePtr = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved >= TAP_TRAVEL_PX) {
      yaw -= dx * 0.004;
      pitch -= dy * 0.004;
      pitch = Math.max(-1.4, Math.min(1.4, pitch));
      applyLook();
      events.onMove?.();
    }
    lx = e.clientX;
    ly = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (dragging && moved < TAP_TRAVEL_PX && e.isPrimary && targetsEnabled && !overlayOpen()) {
      const rect = el.getBoundingClientRect();
      const hit = pick(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect,
      );
      events.onTap?.(hit?.t ?? null, e.clientX, e.clientY);
      if (hit) {
        events.onInspect?.(hit.t);
        if (hit.patch && hit.patch.t === 'chair') accent(hit.patch);
        if (hit.paper) events.onPaperTap?.();
      }
    }
    dragging = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  const onCancel = (e: PointerEvent) => {
    dragging = false; // a cancelled gesture is never a pick
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMovePtr);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);

  /* resize */
  const fit = () => {
    const w = node.clientWidth || 1;
    const h = node.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    /* portrait must not crop the floor: keep the calibrated horizontal
       angle by widening vertical FOV when the aspect narrows */
    const hf = Math.tan(THREE.MathUtils.degToRad(55 / 2));
    camera.fov = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan(hf / Math.min(camera.aspect, 1))),
      55,
      100,
    );
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
    /* hide the paper when a real wall blocks the camera's line to it */
    paperDir.copy(PAPER_POS).sub(camera.position);
    const pd = paperDir.length();
    paperCull.set(camera.position, paperDir.normalize());
    paperCull.far = pd - WALL_TOLERANCE;
    paper.visible = paperCull.intersectObject(collider, true).length === 0;
    if (paperAnim) {
      const k = Math.min((performance.now() - paperAnim.t0) / 500, 1);
      const e = 1 - (1 - k) * (1 - k); // ease-out
      paperFlap.rotation.x = FLAP_CLOSED + (FLAP_OPEN - FLAP_CLOSED) * e;
      if (k >= 1) paperAnim = null;
    }
    if (accentPatch) {
      if (performance.now() > accentUntil) {
        accentPatch = null;
        accentSvg.style.display = 'none';
      } else {
        drawAccent(el.getBoundingClientRect());
      }
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

  /* everything registered after init is torn down here — used by both a
     readiness failure and dispose() */
  const teardown = () => {
    observer.disconnect();
    ro.disconnect();
    renderer.setAnimationLoop(null);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMovePtr);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
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
    accentSvg.remove();
    el.remove();
  };

  /* ready = collider loaded + splats actually populating rendered frames */
  await new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + READY_TIMEOUT_MS;
    const poll = () => {
      if (signal?.aborted) return reject(new Error('aborted'));
      renderer.render(scene, camera); // keep the GPU pass warm
      if (spark.activeSplats > 0) return resolve();
      if (performance.now() > deadline) return reject(new Error('world stayed empty'));
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }).catch((err) => {
    teardown();
    throw err;
  });
  if (signal?.aborted) {
    teardown();
    throw new Error('aborted');
  }

  events.onVisibleDog?.();

  return {
    reset,
    step,
    project,
    paperScreen,
    visitDog,
    leaveDog,
    isAtDog: () => atDog,
    see,
    unsee,
    isSeeing: () => seeing,
    showPaper,
    flashPaper,
    setTargetsEnabled: (on) => {
      targetsEnabled = on;
    },
    dispose: teardown,
  };
}
