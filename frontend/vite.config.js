import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // Dev server: React on :3000, all /api/* proxied to Flask on :5000
  server: {
    port: 3000,
    strictPort: true,          // fail clearly if port is taken
    https: false,              // never use TLS on the dev server
    proxy: {
      // Flask API routes — forward directly (no prefix stripping)
      '/auth/google':       { target: 'http://localhost:5000', changeOrigin: true },
      '/register':          { target: 'http://localhost:5000', changeOrigin: true },
      '/login':             { target: 'http://localhost:5000', changeOrigin: true },
      '/profile':           { target: 'http://localhost:5000', changeOrigin: true },
      '/predict':           { target: 'http://localhost:5000', changeOrigin: true },
      '/predict-letter':    { target: 'http://localhost:5000', changeOrigin: true },
      '/generate-sentence': { target: 'http://localhost:5000', changeOrigin: true },
      '/generate-letter-sentence': { target: 'http://localhost:5000', changeOrigin: true },
      '/model':             { target: 'http://localhost:5000', changeOrigin: true },
      '/history':           { target: 'http://localhost:5000', changeOrigin: true },
      '/health':            { target: 'http://localhost:5000', changeOrigin: true },
      '/text-to-sign':      { target: 'http://localhost:5000', changeOrigin: true },
      '/video':             { target: 'http://localhost:5000', changeOrigin: true },
      '/ai':                { target: 'http://localhost:5000', changeOrigin: true },
    },
  },

  // Production build: emit into backend/static/dist
  // (also deployable as a standalone static site pointing at the Render backend)
  build: {
    outDir: '../backend/static/dist',
    emptyOutDir: true,
  },
});
