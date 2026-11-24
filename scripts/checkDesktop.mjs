import path from 'node:path';
import electron from 'electron';
import { DEV_SERVER } from '../src/shared/constants/runtime.js';
import {
  PROJECT_ROOT as root, createElectronEnvironment, readProjectMetadata,
  runProcess, TemporaryDirectory, writeElectronEntry,
} from './lib/runtime.mjs';

async function runSmoke(entry, timeoutMs, devServerUrl) {
  const profile = new TemporaryDirectory(`work-board-${entry}-`);
  try {
    writeElectronEntry(profile.directory, readProjectMetadata(), path.join(root, 'scripts', `${entry}.mjs`));
    return await runProcess(electron, [profile.directory], {
      cwd: root, stdio: 'inherit', timeoutMs, label: entry,
      env: createElectronEnvironment({ overrides: { WORK_BOARD_SMOKE_USER_DATA: profile.directory }, devServerUrl }),
    });
  } finally { profile.remove(); }
}

let devServer;
try {
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite');
    devServer = await createServer({ configFile: path.join(root, 'vite.config.js') });
    await devServer.listen();
  }
  const scenarios = process.argv.includes('--background-only') ? [] : [
    ['startupThemesSmoke', 50_000], ['registrySmoke', 90_000],
  ];
  if (process.platform === 'win32') scenarios.push(['backgroundSmoke', 45_000]);
  for (const [entry, timeoutMs] of scenarios) {
    process.exitCode = await runSmoke(entry, timeoutMs, devServer ? DEV_SERVER.URL : undefined);
    if (process.exitCode !== 0) break;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await devServer?.close();
}
