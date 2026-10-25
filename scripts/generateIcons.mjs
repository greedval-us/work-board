import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electron, [fileURLToPath(new URL('./renderIcons.mjs', import.meta.url))], {
  cwd: root, env: environment, stdio: 'inherit', windowsHide: true, timeout: 30000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
