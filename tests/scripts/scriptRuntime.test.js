import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createElectronEnvironment, TemporaryDirectory, removeTemporaryDirectory,
  runProcess, runProcessSync, writeElectronEntry,
} from '../../scripts/lib/runtime.mjs';

test('Electron launch environments isolate control variables without changing the parent environment', () => {
  const source = { PATH: 'tools', ELECTRON_RUN_AS_NODE: '1', WORK_BOARD_DEV_SERVER_URL: 'http://stale', KEEP: 'value' };
  assert.deepEqual(createElectronEnvironment({ source, overrides: { SMOKE: 'temporary' } }), {
    PATH: 'tools', KEEP: 'value', SMOKE: 'temporary',
  });
  assert.equal(source.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(source.WORK_BOARD_DEV_SERVER_URL, 'http://stale');
  assert.deepEqual(createElectronEnvironment({ source, runAsNode: true, devServerUrl: 'http://current' }), {
    PATH: 'tools', KEEP: 'value', ELECTRON_RUN_AS_NODE: '1', WORK_BOARD_DEV_SERVER_URL: 'http://current',
  });
});

test('temporary Electron entries preserve application metadata and cleanup only their own directory', (t) => {
  const temporary = new TemporaryDirectory('work-board-script-test-');
  t.after(() => temporary.remove());
  const entryPoint = path.resolve('scripts/registrySmoke.mjs');
  writeElectronEntry(temporary.directory, { name: 'test-app', version: '1.2.3', private: true }, entryPoint);
  assert.deepEqual(JSON.parse(readFileSync(path.join(temporary.directory, 'package.json'), 'utf8')), {
    name: 'test-app', version: '1.2.3', main: entryPoint,
  });
  const nested = path.join(temporary.directory, 'nested');
  mkdirSync(nested);
  writeFileSync(path.join(nested, 'data.txt'), 'temporary');
  temporary.remove();
  assert.equal(existsSync(temporary.directory), false);
});

test('temporary cleanup rejects roots, sibling paths, relative paths, and unexpected names', (t) => {
  const temporary = new TemporaryDirectory('work-board-script-test-');
  t.after(() => temporary.remove());
  const options = { root: temporary.root, prefix: 'work-board-script-test-' };
  for (const directory of [temporary.root, path.join(temporary.root, '..', 'outside'), '.', path.join(temporary.root, 'unrelated')]) {
    assert.throws(() => removeTemporaryDirectory(directory, options), /Refusing to remove/);
  }
  assert.equal(existsSync(temporary.directory), true);
});

test('temporary directory prefixes cannot escape their parent directory', () => {
  for (const prefix of ['', '.', '..', path.join('nested', 'prefix')]) {
    assert.throws(() => new TemporaryDirectory(prefix), /prefix must be a simple name/);
  }
});

test('process runners preserve unsuccessful exit codes and report launch errors', async () => {
  assert.equal(await runProcess(process.execPath, ['-e', 'process.exitCode = 7'], { stdio: 'ignore', timeoutMs: 5000 }), 7);
  assert.equal(runProcessSync(process.execPath, ['-e', 'process.exitCode = 4'], { stdio: 'ignore', timeoutMs: 5000 }), 4);
  await assert.rejects(runProcess(path.resolve('missing-work-board-executable'), [], { stdio: 'ignore', timeoutMs: 5000 }), { code: 'ENOENT' });
});

test('a timed out process is stopped before its failure is reported', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore', timeoutMs: 100, label: 'Script test',
  }), /Script test timed out/);
});
