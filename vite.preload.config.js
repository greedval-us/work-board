import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'build/main', emptyOutDir: true, target: 'node16',
    lib: { entry: 'src/main/preload.js', formats: ['cjs'], fileName: () => 'preload.cjs' },
    rollupOptions: { external: ['electron'] },
  },
});
