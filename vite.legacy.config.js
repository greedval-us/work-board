import path from 'node:path';
import { defineConfig } from 'vite';

// Main and smoke bundles run from <application root>/build/<directory>.
export function createLegacyBuildConfig({
  entry = 'src/main/index.js', outDir = 'build/legacy', fileName = 'main.cjs', emptyOutDir = true,
} = {}) {
  return defineConfig({
    configFile: false,
    define: { __WORK_BOARD_APP_ROOT__: '__workBoardAppRoot', 'import.meta.url': '__workBoardModuleUrl' },
    build: {
      outDir, emptyOutDir, target: 'node16', minify: false, copyPublicDir: false,
      lib: { entry, formats: ['cjs'], fileName: () => fileName },
      // Native addons and installed runtime dependencies must resolve in the app.
      rollupOptions: {
        external: id => !id.startsWith('.') && !path.isAbsolute(id),
        output: { intro: 'const __workBoardAppRoot = require("node:path").resolve(__dirname, "../..");\nconst __workBoardModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
      },
    },
  });
}

export default createLegacyBuildConfig();
