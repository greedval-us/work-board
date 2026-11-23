import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'build/preload', emptyOutDir: true, target: 'node16',
    lib: { entry: 'src/preload/index.js', formats: ['cjs'], fileName: () => 'preload.cjs' },
    rollupOptions: { external: ['electron'] },
  },
});
