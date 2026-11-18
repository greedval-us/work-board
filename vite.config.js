import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { DEV_SERVER } from './src/shared/constants/runtime.js';

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  define: {
    'import.meta.env.HMR_CONNECT_SOURCE': JSON.stringify(command === 'serve' ? ` ws://${DEV_SERVER.HOST}:${DEV_SERVER.PORT}` : ''),
  },
  root: 'src/renderer',
  base: './',
  publicDir: '../public',
  cacheDir: '../../.cache/vite',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: DEV_SERVER.HOST, port: DEV_SERVER.PORT, strictPort: true },
  build: { outDir: '../../build/renderer', emptyOutDir: true, target: 'chrome108' },
}));
