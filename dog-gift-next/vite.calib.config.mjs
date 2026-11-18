import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/* dev-only calibration build — produces calibrate.html alongside index.html.
   The normal `vite build dog-gift-next` never emits it. */
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        calibrate: resolve(__dirname, 'calibrate.html'),
      },
    },
  },
});
