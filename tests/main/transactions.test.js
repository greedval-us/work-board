import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { runTransaction } from '../../src/main/database/transaction.js';
import { publicError } from '../../src/main/utils/publicError.js';

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

for (const phase of ['operation', 'COMMIT']) {
  test(`transaction retains the ${phase} failure when rollback also fails`, () => {
    const primary = Object.freeze(Object.assign(new Error('private database is locked'), { code: 'SQLITE_BUSY' }));
    const rollback = new Error('private rollback failure');
    const commands = [];
    const connection = { exec(sql) {
      commands.push(sql);
      if (sql === 'ROLLBACK') throw rollback;
      if (phase === 'COMMIT' && sql === 'COMMIT') throw primary;
    } };
    assert.throws(() => runTransaction(connection, () => {
      if (phase === 'operation') throw primary;
    }), error => {
      assert.equal(error.cause, primary);
      assert.deepEqual(error.errors, [primary, rollback]);
      assert.equal(publicError(error).code, 'DATABASE_LOCKED');
      assert.doesNotMatch(JSON.stringify(publicError(error)), /private|rollback/);
      return true;
    });
    assert.deepEqual(commands, phase === 'COMMIT'
      ? ['BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'] : ['BEGIN IMMEDIATE', 'ROLLBACK']);
  });
}

test('transaction does not roll back or execute the operation when begin fails', () => {
  const failure = new Error('begin failed');
  const commands = [];
  let called = false;
  assert.throws(() => runTransaction({ exec(sql) { commands.push(sql); throw failure; } }, () => { called = true; }), error => error === failure);
  assert.equal(called, false);
  assert.deepEqual(commands, ['BEGIN IMMEDIATE']);
});
