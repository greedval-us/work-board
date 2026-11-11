import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { DatabaseLocation } from '../../src/main/database/DatabaseLocation.js';
import { DATABASE_CONFIG } from '../../src/main/database/databaseConfig.js';
import { migrations } from '../../src/main/database/migrations.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-selection-'));
  const database = new DatabaseService();
  const location = new DatabaseLocation({ userData: directory, database });
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, database, location };
}

function createLegacyRegistryDatabase(filePath, version) {
  const connection = new DatabaseSync(filePath);
  try {
    for (const migration of migrations.filter((entry) => entry.version <= version)) connection.exec(migration.sql);
    connection.exec(`PRAGMA user_version = ${version}; PRAGMA application_id = ${DATABASE_CONFIG.APPLICATION_ID}`);
    connection.exec(`INSERT INTO instructions (
      id, control_date, instruction_number, title, deadline, executor,
      instruction_number_search, executor_search, execution_mark_search, created_at, updated_at
    ) VALUES (
      17, '2026-10-23', '007/Б', 'Проверить отчёт', '2026-10-26', 'Иванов И. И.',
      '007/б', 'иванов и. и.', '', '2026-10-23T00:00:00Z', '2026-10-23T00:00:00Z'
    )`);
    if (version === 4) connection.exec("UPDATE instructions SET source = 'Архив', control_type = 'Плановый'");
  } finally { connection.close(); }
}

test('first run has no database until the user selects one', (t) => {
  const { database, location } = fixture(t);
  location.restore();
  assert.equal(database.getStatus().ready, false);
  assert.equal(database.getStatus().filePath, null);
});

test('create and reopen persist the chosen location and guard stale writes', (t) => {
  const { database, directory, location } = fixture(t);
  const filePath = path.join(directory, 'chosen.sqlite');
  database.replace({ filePath, create: true, persist: (value) => location.save(value) });
  const generation = database.getStatus().generation;
  database.assertGeneration(generation);
  database.connection.prepare('INSERT INTO app_settings VALUES (?, ?)').run('theme', 'dark');
  assert.equal(JSON.parse(readFileSync(location.configPath, 'utf8')).filePath, filePath);
  database.close();
  location.restore();
  assert.equal(database.connection.prepare('SELECT value FROM app_settings WHERE key = ?').get('theme').value, 'dark');
  assert.throws(() => database.assertGeneration(generation), /база|обновите/i);
});

test('failed config persistence leaves the original connection and file active', (t) => {
  const { database, directory } = fixture(t);
  const original = path.join(directory, 'original.sqlite');
  const next = path.join(directory, 'next.sqlite');
  database.replace({ filePath: original, create: true });
  const generation = database.getStatus().generation;
  assert.throws(() => database.replace({ filePath: next, create: true, persist() { throw new Error('disk failure'); } }), /disk failure/);
  assert.equal(database.getStatus().filePath, original);
  assert.equal(database.getStatus().generation, generation);
  assert.equal(existsSync(next), false);
  assert.equal(database.connection.prepare('SELECT 42 AS value').get().value, 42);
});

test('foreign database is rejected before journal or schema changes', (t) => {
  const { database, directory } = fixture(t);
  const foreign = path.join(directory, 'foreign.sqlite');
  const raw = new DatabaseSync(foreign);
  raw.exec('CREATE TABLE unrelated (value TEXT); PRAGMA user_version = 1;');
  raw.close();
  const before = readFileSync(foreign);
  assert.throws(() => database.replace({ filePath: foreign }), /Work Board|другая/i);
  assert.deepEqual(readFileSync(foreign), before);
  assert.equal(database.getStatus().ready, false);
});

test('known legacy database is migrated while preserving settings', (t) => {
  const { database, directory } = fixture(t);
  const legacy = path.join(directory, 'legacy.sqlite');
  const raw = new DatabaseSync(legacy);
  raw.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT; INSERT INTO app_settings VALUES ('theme','dark'); PRAGMA user_version = 1;");
  raw.close();
  database.replace({ filePath: legacy });
  assert.equal(database.connection.prepare('SELECT value FROM app_settings WHERE key = ?').get('theme').value, 'dark');
  assert.ok(database.getStatus().schemaVersion >= 2);
});

test('opening a version 3 database preserves instruction data and initializes the new fields', (t) => {
  const { database, directory } = fixture(t);
  const filePath = path.join(directory, 'version-3.sqlite');
  createLegacyRegistryDatabase(filePath, 3);
  database.replace({ filePath });
  assert.equal(database.getStatus().schemaVersion, 6);
  const { instructionNumber, executor, source, controlType, deadline, extendedUntil } = new InstructionRepository(database).get(17);
  assert.deepEqual({ instructionNumber, executor, source, controlType, deadline, extendedUntil }, {
    instructionNumber: '007/Б', executor: 'Иванов И. И.', source: '', controlType: '', deadline: '2026-10-26', extendedUntil: '',
  });
});

test('opening a version 4 database keeps existing instruction details and defaults the extension', (t) => {
  const { database, directory } = fixture(t);
  const filePath = path.join(directory, 'version-4.sqlite');
  createLegacyRegistryDatabase(filePath, 4);
  database.replace({ filePath });
  assert.equal(database.getStatus().schemaVersion, 6);
  const { source, controlType, deadline, extendedUntil } = new InstructionRepository(database).get(17);
  assert.deepEqual({ source, controlType, deadline, extendedUntil }, {
    source: 'Архив', controlType: 'Плановый', deadline: '2026-10-26', extendedUntil: '',
  });
});

test('a version 4 database with missing instruction fields is rejected', (t) => {
  const { database, directory } = fixture(t);
  const filePath = path.join(directory, 'missing-fields.sqlite');
  createLegacyRegistryDatabase(filePath, 3);
  const connection = new DatabaseSync(filePath);
  try { connection.exec('PRAGMA user_version = 4'); }
  finally { connection.close(); }
  assert.throws(() => database.replace({ filePath }), { code: 'DATABASE_INVALID' });
});

test('a version 5 database with a missing extension column is rejected', (t) => {
  const { database, directory } = fixture(t);
  const filePath = path.join(directory, 'missing-extension.sqlite');
  createLegacyRegistryDatabase(filePath, 4);
  const connection = new DatabaseSync(filePath);
  try { connection.exec('PRAGMA user_version = 5'); }
  finally { connection.close(); }
  assert.throws(() => database.replace({ filePath }), { code: 'DATABASE_INVALID' });
});

test('opening a version 5 database preserves extensions and initializes the checkpoint schedule', (t) => {
  const { database, directory } = fixture(t);
  const filePath = path.join(directory, 'version-5.sqlite');
  createLegacyRegistryDatabase(filePath, 5);
  const connection = new DatabaseSync(filePath);
  try { connection.exec("UPDATE instructions SET extended_until = '2026-11-02'"); }
  finally { connection.close(); }

  database.replace({ filePath });
  assert.equal(database.getStatus().schemaVersion, 6);
  const { deadline, extendedUntil, controlSchedule } = new InstructionRepository(database).get(17);
  assert.equal(deadline, '2026-10-26');
  assert.equal(extendedUntil, '2026-11-02');
  assert.deepEqual(controlSchedule, { frequency: '', firstDate: '', customDates: [], marks: [] });
});

test('a version 6 database with a missing checkpoint schedule column is rejected', (t) => {
  const { database, directory } = fixture(t);
  const filePath = path.join(directory, 'missing-control-schedule.sqlite');
  createLegacyRegistryDatabase(filePath, 5);
  const connection = new DatabaseSync(filePath);
  try { connection.exec('PRAGMA user_version = 6'); }
  finally { connection.close(); }
  assert.throws(() => database.replace({ filePath }), { code: 'DATABASE_INVALID' });
});

test('missing selected database and create-on-existing never destroy files', (t) => {
  const { database, directory, location } = fixture(t);
  const missing = path.join(directory, 'missing.sqlite');
  location.save(missing);
  location.restore();
  assert.equal(existsSync(missing), false);
  assert.equal(database.getStatus().ready, false);
  assert.match(database.getStatus().message, /найден|открыть/i);
  const existing = path.join(directory, 'existing.sqlite');
  database.replace({ filePath: existing, create: true });
  const before = readFileSync(existing);
  assert.throws(() => database.replace({ filePath: existing, create: true }), /существует/i);
  assert.deepEqual(readFileSync(existing), before);
});

test('an incomplete current schema cannot replace a healthy active database', (t) => {
  const { database, directory } = fixture(t);
  const original = path.join(directory, 'healthy.sqlite');
  database.replace({ filePath: original, create: true });
  const damaged = new DatabaseService({ filePath: path.join(directory, 'damaged.sqlite') });
  damaged.open();
  damaged.connection.exec('DROP TABLE instructions');
  const candidate = damaged.filePath;
  damaged.close();
  const before = readFileSync(candidate);
  assert.throws(() => database.replace({ filePath: candidate }), /структур|поврежд/i);
  assert.equal(database.getStatus().filePath, original);
  assert.deepEqual(readFileSync(candidate), before);
});
