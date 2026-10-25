import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(path.join(tmpdir(), 'work-board-smoke-'));
const metadata = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
// Launch as an Electron application so getVersion() reads real package metadata.
writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
  name: metadata.name, version: metadata.version,
  main: path.join(root, 'scripts', 'registrySmoke.mjs'),
}));
const environment = { ...process.env, WORK_BOARD_SMOKE_USER_DATA: directory };
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.WORK_BOARD_DEV_SERVER_URL;
let devServer;
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  devServer = await createServer({ configFile: path.join(root, 'vite.config.js') });
  await devServer.listen();
  environment.WORK_BOARD_DEV_SERVER_URL = 'http://127.0.0.1:5173';
}
const child = spawn(electron, [directory], {
  cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
});
const timeout = setTimeout(() => { console.error('Desktop smoke timed out.'); child.kill(); }, 90000);
let finished = false;
async function cleanup(code) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  await devServer?.close();
  const tempRoot = path.resolve(tmpdir());
  const target = path.resolve(directory);
  if (target.startsWith(tempRoot + path.sep) && path.basename(target).startsWith('work-board-smoke-')) {
    rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  process.exitCode = code;
}
child.on('error', (error) => { console.error(error); cleanup(1); });
child.on('close', (code) => cleanup(code ?? 1));
