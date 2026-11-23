import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { PROJECT_ROOT, createElectronEnvironment, runProcessSync } from './lib/runtime.mjs';

process.exitCode = runProcessSync(electron, [fileURLToPath(new URL('./renderIcons.mjs', import.meta.url))], {
  cwd: PROJECT_ROOT, env: createElectronEnvironment(), stdio: 'inherit',
});
