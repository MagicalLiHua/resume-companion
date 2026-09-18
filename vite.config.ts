import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'extension', base: './',
  build: {
    outDir: '../dist', emptyOutDir: true,
    rollupOptions: { input: {
      options: resolve('extension/options.html'),
    } },
  },
});
