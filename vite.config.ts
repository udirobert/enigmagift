import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // dev API — same path as prod, where the server serves this build
      '/api': 'http://localhost:8787',
    },
  },
});
