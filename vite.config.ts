import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['chrome >= 56'],
      renderModernChunks: false
    })
  ],
  base: './', // Crucial for Tizen Web Application WGT packaging
  server: {
    port: 5174,
    host: true
  },
  build: {
    target: 'chrome56',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true
  }
});

