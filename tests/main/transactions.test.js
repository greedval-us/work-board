import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-transaction-'));
  const database = new DatabaseService({ filePath: path.join(directory, 'database.sqlite') });
  database.open();
  t.after(() => { database.close(); const target = path.resolve(directory); assert.ok(target.startsWith(path.resolve(tmpdir()) + path.sep)); rmSync(target, { recursive: true, force: true }); });
  return database;
}

test('transaction commits all writes and returns the operation value', t => {
  const database = fixture(t);
  const result = database.transaction(() => {
    database.connection.prepare('INSERT INTO app_settings VALUES (?, ?)').run('test', 'saved');
    return 'committed';
  });
  assert.equal(result, 'committed');
  assert.equal(database.connection.prepare('SELECT value FROM app_settings WHERE key = ?').get('test').value, 'saved');
});

test('transaction rolls back failed operations and leaves connection usable', t => {
  const database = fixture(t);
  assert.throws(() => database.transaction(() => {
    database.connection.prepare('INSERT INTO app_settings VALUES (?, ?)').run('test', 'partial');
    throw new Error('operation failed');
  }), /operation failed/);
  assert.equal(database.connection.prepare('SELECT COUNT(*) AS total FROM app_settings').get().total, 0);
  assert.equal(database.transaction(() => 42), 42);
});

test('transaction rejects asynchronous callbacks before they execute', t => {
  const database = fixture(t); let called = false;
  assert.throws(() => database.transaction(async () => { called = true; }), /синхрон/i);
  assert.equal(called, false);
});
