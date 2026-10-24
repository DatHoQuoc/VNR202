import { defineConfig } from 'vite';

// Source lives in stage/, the build goes to public/stage/ where the Nest server serves it at /stage/.
// emptyOutDir is off on purpose: public/stage/cover.local.json (git-ignored) must survive a build;
// scripts/clean-stage.js removes only the previous build files.
export default defineConfig({
  root: __dirname,
  base: '/stage/',
  build: {
    outDir: '../public/stage',
    emptyOutDir: false,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : id.includes('node_modules/gsap') ? 'gsap' : undefined),
      },
    },
  },
  server: {
    port: 5173,
    // the live game runs on the Nest server
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/state': 'http://localhost:3000',
      '/wall': 'http://localhost:3000',
      '/stage/rounds': 'http://localhost:3000',
      '/stage/finale': 'http://localhost:3000',
    },
  },
});
