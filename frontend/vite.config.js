import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // Dev server: React on :3000, all /api/* proxied to Flask on :5000
  server: {
    port: 3000,
    strictPort: true,          // fail clearly if port is taken
    https: false,              // never use TLS on the dev server

    // SPA fallback: serve index.html for every route not matched by a real file.
    // Required so direct browser navigations (e.g. OAuth callback /auth/callback)
    // hit React Router instead of getting a 404 from Vite's file server.
    historyApiFallback: true,

    proxy: {
      // Flask API routes — forward directly (no prefix stripping)
      // Exact-prefix match for the two Flask OAuth routes ONLY.
      // Do NOT proxy /auth/callback — that is a React Router client-side route.
      '/auth/google/callback': { target: 'http://localhost:5000', changeOrigin: true },
      '/auth/google':          { target: 'http://localhost:5000', changeOrigin: true },
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
      '/otp':               { target: 'http://localhost:5000', changeOrigin: true },
    },
  },

  // Production build:
  //   Render static service → output goes to frontend/dist (default, do not change)
  //   Same-origin Flask deploy → change outDir to '../backend/static/dist'
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
