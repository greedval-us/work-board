import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  root: 'src/renderer',
  base: './',
  publicDir: '../public',
  cacheDir: '../../.cache/vite',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: '../../build/renderer', emptyOutDir: true },
});
