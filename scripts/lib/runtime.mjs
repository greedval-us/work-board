import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_PROCESS_TIMEOUT_MS = 30_000;
const TEMP_CLEANUP_OPTIONS = { recursive: true, force: true, maxRetries: 3, retryDelay: 100 };

export function readProjectMetadata() {
  return JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
}

export function createElectronEnvironment({ source = process.env, runAsNode = false, devServerUrl, overrides = {} } = {}) {
  const environment = { ...source, ...overrides };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.WORK_BOARD_DEV_SERVER_URL;
  if (runAsNode) environment.ELECTRON_RUN_AS_NODE = '1';
  if (devServerUrl) environment.WORK_BOARD_DEV_SERVER_URL = devServerUrl;
  return environment;
}

export function writeElectronEntry(directory, metadata, entryPoint) {
  // An application directory lets Electron read the real application version.
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
    name: metadata.name, version: metadata.version, main: entryPoint,
  }));
}

export function removeTemporaryDirectory(directory, { root, prefix }) {
  const target = path.resolve(directory);
  const parent = path.resolve(root);
  if (!path.isAbsolute(directory) || !path.isAbsolute(root) || !prefix
    || path.dirname(target) !== parent || !path.basename(target).startsWith(prefix)) {
    throw new Error(`Refusing to remove an unowned temporary directory: ${target}`);
  }
  rmSync(target, TEMP_CLEANUP_OPTIONS);
}

export class TemporaryDirectory {
  constructor(prefix, root = tmpdir()) {
    if (!prefix || prefix === '.' || prefix === '..' || path.basename(prefix) !== prefix) {
      throw new Error('A temporary directory prefix must be a simple name.');
    }
    this.root = path.resolve(root);
    this.prefix = prefix;
    this.directory = mkdtempSync(path.join(this.root, prefix));
  }

  remove() {
    removeTemporaryDirectory(this.directory, { root: this.root, prefix: this.prefix });
  }
}

export function runProcess(command, args, { timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS, label = 'Process', ...options } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (timedOut) reject(new Error(`${label} timed out after ${timeoutMs} ms.`));
      else resolve(code ?? 1);
    });
  });
}

export function runProcessSync(command, args, { timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS, ...options } = {}) {
  const result = spawnSync(command, args, { ...options, windowsHide: true, timeout: timeoutMs });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
