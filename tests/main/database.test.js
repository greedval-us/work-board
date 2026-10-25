import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { SettingsRepository } from '../../src/main/repositories/SettingsRepository.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-test-'));
  const filePath = path.join(directory, 'data', 'work-board.sqlite');
  const database = new DatabaseService({ filePath });
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  return { database, filePath };
}

test('initializes a nested SQLite file with registry schema and settings', (t) => {
  const { database, filePath } = fixture(t);
  database.open();
  const status = database.getStatus();
  assert.equal(status.ready, true);
  assert.equal(status.filePath, filePath);
  assert.equal(status.schemaVersion, 2);
  assert.match(status.sqliteVersion, /^3\./);
  assert.deepEqual(database.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name), ['app_settings', 'calendar_tasks', 'instructions']);
  assert.equal(database.connection.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(database.connection.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
});

test('reopening preserves settings and does not reapply migrations', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = new SettingsRepository(database);
  assert.deepEqual(settings.get(), { theme: 'light' });
  settings.setTheme('dark');
  database.open();
  database.close();
  database.open();
  assert.deepEqual(new SettingsRepository(database).get(), { theme: 'dark' });
  assert.equal(database.getStatus().schemaVersion, 2);
});

test('invalid settings cannot modify persisted data', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = new SettingsRepository(database);
  for (const theme of [null, '', 'system', {}, "dark'); DROP TABLE app_settings; --"]) {
    assert.throws(() => settings.setTheme(theme), /тема/i);
  }
  assert.deepEqual(settings.get(), { theme: 'light' });
});

test('closing is idempotent and reports an unavailable connection', (t) => {
  const { database } = fixture(t);
  database.open();
  database.close();
  database.close();
  assert.equal(database.getStatus().ready, false);
  assert.throws(() => database.connection, /открыта/i);
});

test('a newer database schema is rejected without downgrading it', (t) => {
  const { database, filePath } = fixture(t);
  database.open();
  database.connection.exec('PRAGMA user_version = 99');
  database.close();
  assert.throws(() => database.open(), /новее/i);
  assert.equal(database.getStatus().ready, false);
  const raw = new DatabaseSync(filePath);
  try { assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 99); }
  finally { raw.close(); }
});
