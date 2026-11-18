/* explorerScene — which prepared scene /studio/world explores.
   Env overrides point at site-hosted, reviewed assets only; nothing here
   triggers generation or upload. The bundled default is an object-like
   keepsake model — it does not reconstruct an entire environment. */

export type ExplorerScene = {
  poster: string;
  mesh: string;
  kind: 'keepsake' | 'environment';
  eye?: [number, number, number];
  look?: [number, number, number];
};

export const explorerScene: ExplorerScene = {
  poster: import.meta.env.VITE_WORLD_POSTER || '/showcase/0.jpg',
  mesh: import.meta.env.VITE_WORLD_SCENE_GLB || '/world.glb',
  kind: import.meta.env.VITE_WORLD_SCENE_GLB ? 'environment' : 'keepsake',
  eye: [0, 1.6, 0],
  look: [0, 1.6, -1],
};
