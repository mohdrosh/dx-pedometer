import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/* Served from the site root by default. A deployment behind a path — the
   AWS box has nginx proxying /pedometer/ to it — sets BASE_PATH so the
   assets and the API calls carry that prefix, instead of the file being
   edited on the server and conflicting with every update. */
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    host: true,   // lets phones on the same Wi-Fi open http://<your-pc-ip>:5173
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
