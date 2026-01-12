import { defineConfig } from 'vite';
import version from 'vite-plugin-package-version';
import injectHTML from 'vite-plugin-html-inject';

export default defineConfig({
  base: 'https://momijizukamori.github.io/bookbinder-js/',
  test: {
    environment: 'jsdom',
  },
  plugins: [version(), injectHTML()],
  optimizeDeps: {
    // Exclude pdfjs-dist from optimization to prevent worker issues
    exclude: ['pdfjs-dist']
  },
  worker: {
    format: 'es', // Use ES modules for workers
  },
});
