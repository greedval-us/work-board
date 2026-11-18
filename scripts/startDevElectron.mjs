import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import electron from 'electron';
import waitOn from 'wait-on';
import { DEV_SERVER } from '../src/shared/constants/runtime.js';
import { createElectronEnvironment, PROJECT_ROOT } from './lib/runtime.mjs';

await waitOn({ resources: [DEV_SERVER.URL, path.join(PROJECT_ROOT, 'build/main/preload.cjs')] });
const desktop = spawn(electron, ['.'], {
  cwd: PROJECT_ROOT, stdio: 'inherit', windowsHide: true,
  env: createElectronEnvironment({ devServerUrl: DEV_SERVER.URL }),
});
const [exitCode] = await once(desktop, 'exit');
process.exitCode = exitCode ?? 1;
