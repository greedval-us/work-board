import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';

test('starting application services leaves report libraries unloaded', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-startup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const services = createApplicationServices({
    app: { getPath: () => directory }, ipcMain: { handle() {}, removeHandler() {} },
  });
  t.after(() => services.shutdown());

  const require = createRequire(import.meta.url);
  const loaded = ['exceljs', 'jszip'].filter(name => require.cache[require.resolve(name)]);
  assert.deepEqual(loaded, []);
});
