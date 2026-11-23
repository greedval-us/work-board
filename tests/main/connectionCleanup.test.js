import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discardConnection } from '../../src/main/database/prepareConnection.js';

test('discarding a failed new connection still removes its file when close fails', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-cleanup-'));
  const filePath = path.join(directory, 'new.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(filePath, 'uncommitted database');
  const failure = new Error('close failed');
  assert.throws(() => discardConnection({ created: true, connection: { close() { throw failure; } } }, filePath), error => error === failure);
  assert.equal(existsSync(filePath), false);
});

test('discarding an existing connection never removes its database', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-cleanup-'));
  const filePath = path.join(directory, 'existing.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(filePath, 'existing database');
  const failure = new Error('close failed');
  assert.throws(() => discardConnection({ created: false, connection: { close() { throw failure; } } }, filePath), error => error === failure);
  assert.equal(existsSync(filePath), true);
});
