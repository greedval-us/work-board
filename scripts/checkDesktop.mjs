import path from 'node:path';
import electron from 'electron';
import { DEV_SERVER } from '../src/shared/constants/runtime.js';
import {
  PROJECT_ROOT as root, createElectronEnvironment, readProjectMetadata,
  runProcess, TemporaryDirectory, writeElectronEntry,
} from './lib/runtime.mjs';

const SMOKE_TIMEOUT_MS = 90_000;
const temporary = new TemporaryDirectory('work-board-smoke-');
let devServer;
try {
  writeElectronEntry(temporary.directory, readProjectMetadata(), path.join(root, 'scripts', 'registrySmoke.mjs'));
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite');
    devServer = await createServer({ configFile: path.join(root, 'vite.config.js') });
    await devServer.listen();
  }
  process.exitCode = process.argv.includes('--background-only') ? 0 : await runProcess(electron, [temporary.directory], {
    cwd: root, stdio: 'inherit', timeoutMs: SMOKE_TIMEOUT_MS, label: 'Desktop smoke',
    env: createElectronEnvironment({
      overrides: { WORK_BOARD_SMOKE_USER_DATA: temporary.directory },
      devServerUrl: devServer ? DEV_SERVER.URL : undefined,
    }),
  });
  if (process.exitCode === 0 && process.platform === 'win32') {
    const background = new TemporaryDirectory('work-board-background-smoke-');
    try {
      writeElectronEntry(background.directory, readProjectMetadata(), path.join(root, 'scripts', 'backgroundSmoke.mjs'));
      process.exitCode = await runProcess(electron, [background.directory], {
        cwd: root, stdio: 'inherit', timeoutMs: 45_000, label: 'Background desktop smoke',
        env: createElectronEnvironment({ overrides: { WORK_BOARD_SMOKE_USER_DATA: background.directory },
          devServerUrl: devServer ? DEV_SERVER.URL : undefined }),
      });
    } finally { background.remove(); }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try { await devServer?.close(); }
  finally { temporary.remove(); }
}
