import { defineConfig } from 'vite';

// The site is published to GitHub Pages from the `master` branch, served out
// of `docs/`. Assets therefore use relative URLs so the game also works when
// opened from a local file or a sub-path preview.
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs',
    assetsDir: 'assets',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 2048,
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
});
