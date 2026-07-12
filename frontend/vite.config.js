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
      // All /api/* → Flask (strips the /api prefix)
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Video files are served directly by Flask at /video/<id>
      // No prefix stripping needed — the path is forwarded as-is
      '/video': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      // text-to-sign routes (vocabulary endpoint, etc.)
      '/text-to-sign': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Production build: emit into backend/static/dist so Flask can serve it
  build: {
    outDir: '../backend/static/dist',
    emptyOutDir: true,
  },
});
