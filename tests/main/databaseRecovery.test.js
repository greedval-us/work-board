import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { DatabaseLocation } from '../../src/main/database/DatabaseLocation.js';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { DATABASE_CONFIG } from '../../src/main/database/databaseConfig.js';
import { migrations } from '../../src/main/database/migrations.js';

const attachmentPath = 'instructions/37/43e7e443-fece-4095-bc09-3fcf8aaeb819';
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-recovery-'));
  const database = new DatabaseService();
  t.after(() => { database.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, database, filePath: path.join(directory, 'archive.sqlite') };
}

function createUnsigned(filePath, version, populate, schema = migrations) {
  const db = new DatabaseSync(filePath);
  try {
    for (const entry of schema) if (entry.version <= version) db.exec(entry.sql);
    db.exec(`PRAGMA user_version = ${version}`);
    return populate?.(db);
  } finally { db.close(); }
}

function populateArchive(db, version) {
  db.exec(`INSERT INTO app_settings VALUES ('theme', 'dark'), ('former-release-key', 'серия 007');
    INSERT INTO instructions (
      id, control_date, instruction_number, title, deadline, executor, instruction_number_search,
      executor_search, execution_mark, execution_mark_search, created_at, updated_at
    ) VALUES (37, '2025-01-10', '001/К', 'Сверить отчёт', '2025-01-31', 'Иванов', '001/к',
      'иванов', 'Проверено', 'проверено', '2025-01-10T09:00:00Z', '2025-01-17T12:30:00Z');
    INSERT INTO calendar_tasks (id, title, date, description, completed, created_at, updated_at)
      VALUES (12, 'Журнал', '2025-01-13', 'Сверить\nзаписи', 0, '2025-01-10T10:00:00Z', '2025-01-15T10:00:00Z')`);
  if (version >= 3) db.prepare(`INSERT INTO attachments (id, instruction_id, name, relative_path, size, created_at)
    VALUES (19, 37, 'Резолюция.txt', ?, 123, '2025-01-10T09:01:00Z')`).run(attachmentPath);
  if (version >= 4) db.exec("UPDATE instructions SET source = 'Архив', control_type = 'Плановый'");
  if (version >= 5) db.exec("UPDATE instructions SET extended_until = '2025-02-28'");
  if (version >= 6) db.exec(`UPDATE instructions SET control_schedule =
    '{"frequency":"custom","firstDate":"","customDates":["2025-01-20"],"marks":[{"date":"2025-01-20","text":"Готово"}]}'`);
  if (version >= 7) db.exec("UPDATE instructions SET closed_at = '2025-02-17T09:00:00Z'");
  if (version >= 8) db.exec("UPDATE instructions SET document_type = 'Приказ', document_type_search = 'приказ'");
  if (version >= 9) db.exec(`UPDATE calendar_tasks SET recurrence = '{"frequency":"weekly"}';
    INSERT INTO calendar_task_completions VALUES (12, '2025-01-20')`);
  if (version >= 10) db.exec("INSERT INTO calendar_task_moves VALUES (12, '2025-01-20', '2025-01-21')");
  if (version === 9) db.exec('ANALYZE');

  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all();
  // Keep the original projection when later migrations add columns to the same rows.
  return tables.map(({ name }) => {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(col => col.name);
    const select = `SELECT ${columns.join(', ')} FROM ${name} ORDER BY rowid`;
    return { select, rows: db.prepare(select).all() };
  });
}

for (let version = 2; version <= 10; version++) {
  test(`opening unsigned Work Board v${version} preserves every original column and row across restart`, t => {
    const { directory, database, filePath } = fixture(t);
    const original = createUnsigned(filePath, version, db => populateArchive(db, version));
    const attachmentFile = path.join(filePath + '.files', attachmentPath);
    const contents = Buffer.alloc(123, version);
    if (version >= 3) {
      mkdirSync(path.dirname(attachmentFile), { recursive: true });
      writeFileSync(attachmentFile, contents);
    }
    const location = new DatabaseLocation({ userData: directory, database });
    location.save(filePath);
    // Exercise startup recovery as well as an explicit open of the repaired file.
    assert.equal(location.restore().ready, true);
    database.close();
    assert.equal(database.replace({ filePath }).schemaVersion, migrations.at(-1).version);
    assert.equal(database.connection.prepare('PRAGMA application_id').get().application_id, DATABASE_CONFIG.APPLICATION_ID);
    assert.deepEqual(database.connection.prepare('PRAGMA foreign_key_check').all(), []);
    for (const { select, rows } of original) assert.deepEqual(database.connection.prepare(select).all(), rows);
    if (version >= 3) assert.deepEqual(readFileSync(attachmentFile), contents);
  });
}

function archiveFiles(directory) {
  return Object.fromEntries(readdirSync(directory).filter(name => name.startsWith('archive.sqlite'))
    .map(name => [name, createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex')]));
}

const foreignCases = [
  ['nonzero identity on an exact schema', 9, 'PRAGMA application_id = 1234'],
  ['version inconsistent with its tables', 9, 'PRAGMA user_version = 8'],
  ['a newer version', 9, 'PRAGMA user_version = 999', 'DATABASE_NEWER'],
  ['additional business table', 9, 'CREATE TABLE records (id INTEGER PRIMARY KEY)'],
  ['a user table resembling a SQLite internal name', 9, 'CREATE TABLE sqliteXarchive (note TEXT)'],
  ['additional trigger', 9, "CREATE TRIGGER audit AFTER INSERT ON app_settings BEGIN DELETE FROM calendar_tasks; END"],
  ['additional view', 9, 'CREATE VIEW archive_records AS SELECT * FROM instructions'],
  ['partial index masquerading under the expected name', 9, `DROP INDEX calendar_tasks_date_completed_idx;
    CREATE INDEX calendar_tasks_date_completed_idx ON calendar_tasks(date, completed) WHERE completed = 1`],
  ['non-STRICT settings table imitating v1', 1, `DROP TABLE app_settings;
    CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`],
  ['unrelated database in persistent WAL mode', 2, 'PRAGMA journal_mode=WAL; CREATE TABLE alien (id INTEGER)'],
  ['broken foreign keys in the original schema', 9, `PRAGMA foreign_keys = OFF;
    INSERT INTO calendar_task_completions VALUES (9999, '2025-01-20')`, 'DATABASE_INVALID'],
  ['broken CHECK constraints in the original schema', 2, `PRAGMA ignore_check_constraints = ON;
    INSERT INTO calendar_tasks (title, date, completed, created_at, updated_at)
    VALUES ('Журнал', '2025-01-13', 2, '2025-01-13', '2025-01-13')`, 'DATABASE_INVALID'],
];

function assertRejectedWithoutChanges(database, directory, filePath, code) {
  const before = archiveFiles(directory);
  const active = database.getStatus();
  assert.throws(() => database.replace({ filePath }), { code });
  assert.deepEqual(archiveFiles(directory), before, 'candidate and its journal files must be unchanged');
  assert.deepEqual(database.getStatus(), active);
}

test('recognition of unsigned archives does not expand when the app adds migrations', t => {
  const { directory, database, filePath } = fixture(t);
  if (!migrations.some(entry => entry.version === 11)) {
    migrations.push({ version: 11, sql: 'CREATE TABLE future_feature (id INTEGER PRIMARY KEY) STRICT;' });
    t.after(() => migrations.pop());
  }
  createUnsigned(filePath, 11);
  assertRejectedWithoutChanges(database, directory, filePath, 'DATABASE_FOREIGN');

  const signed = new DatabaseSync(filePath);
  try { signed.exec(`PRAGMA application_id = ${DATABASE_CONFIG.APPLICATION_ID}`); }
  finally { signed.close(); }
  assert.equal(database.replace({ filePath }).schemaVersion, migrations.at(-1).version);
});

for (const [label, version, change, code = 'DATABASE_FOREIGN'] of foreignCases) {
  test(`opening rejects ${label} without changing the candidate or the active database`, t => {
    const { directory, database, filePath } = fixture(t);
    database.replace({ filePath: path.join(directory, 'active.sqlite'), create: true });
    createUnsigned(filePath, version, db => db.exec(change));
    assertRejectedWithoutChanges(database, directory, filePath, code);
  });
}

for (const [label, oldText, newText] of [
  ['changed whitespace in a CHECK value', "'important'", "'impor tant'"],
  ['changed case of a default value', "DEFAULT 'normal'", "DEFAULT 'NORMAL'"],
]) {
  test(`foreign schema with matching columns but ${label} is rejected`, t => {
    const { directory, database, filePath } = fixture(t);
    const schema = migrations.map(entry => entry.version === 2
      ? { ...entry, sql: entry.sql.replace(oldText, newText) } : entry);
    createUnsigned(filePath, 9, undefined, schema);
    assertRejectedWithoutChanges(database, directory, filePath, 'DATABASE_FOREIGN');
  });
}

test('recovery retains committed settings and schema changes that are still in the WAL', t => {
  const { database, filePath } = fixture(t);
  createUnsigned(filePath, 8);
  const writer = new DatabaseSync(filePath);
  try {
    writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
    writer.exec(migrations.find(entry => entry.version === 9).sql);
    writer.exec("PRAGMA user_version=9; INSERT INTO app_settings VALUES ('theme','dark')");
    assert.equal(database.replace({ filePath }).schemaVersion, migrations.at(-1).version);
    assert.equal(database.connection.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get().value, 'dark');
  } finally { writer.close(); }
});

test('a work-board-shaped main file cannot hide a foreign schema committed in its WAL', t => {
  const { database, directory, filePath } = fixture(t);
  createUnsigned(filePath, 9);
  const writer = new DatabaseSync(filePath);
  try {
    writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE other_app (id INTEGER)');
    assertRejectedWithoutChanges(database, directory, filePath, 'DATABASE_FOREIGN');
  } finally { writer.close(); }
});

test('an interruption during recovery leaves the previous connection usable and the archive retryable', t => {
  const { database, directory, filePath } = fixture(t);
  const original = createUnsigned(filePath, 8, db => populateArchive(db, 8));
  const archiveBefore = archiveFiles(directory);
  const active = database.replace({ filePath: path.join(directory, 'active.sqlite'), create: true });
  const lastMigration = migrations.at(-1);
  const interruption = new Error('simulated interruption during the last migration');
  const exec = DatabaseSync.prototype.exec;
  const failure = t.mock.method(DatabaseSync.prototype, 'exec', function (sql) {
    if (sql === lastMigration.sql && this.prepare('PRAGMA database_list').get().file === filePath) throw interruption;
    return exec.call(this, sql);
  });
  try { assert.throws(() => database.replace({ filePath }), error => error === interruption); }
  finally { failure.mock.restore(); }
  assert.deepEqual(database.getStatus(), active);
  assert.deepEqual(archiveFiles(directory), archiveBefore, 'failed recovery must roll back the schema, data and header');
  assert.equal(database.replace({ filePath }).schemaVersion, lastMigration.version);
  for (const { select, rows } of original) assert.deepEqual(database.connection.prepare(select).all(), rows);
});

test('a competing change to the schema before the writer obtains its lock cancels recovery', t => {
  const { database, filePath } = fixture(t);
  createUnsigned(filePath, 8);
  const exec = DatabaseSync.prototype.exec;
  let changed = false;
  const race = t.mock.method(DatabaseSync.prototype, 'exec', function (sql) {
    if (!changed && /^BEGIN\b/i.test(sql) && this.prepare('PRAGMA database_list').get().file === filePath) {
      const other = new DatabaseSync(filePath);
      try { other.exec('CREATE TABLE other_application (entry TEXT)'); }
      finally { other.close(); }
      changed = true;
    }
    return exec.call(this, sql);
  });
  try { assert.throws(() => database.replace({ filePath }), { code: 'DATABASE_FOREIGN' }); }
  finally { race.mock.restore(); }
  assert.equal(changed, true);
  const onDisk = new DatabaseSync(filePath, { readOnly: true });
  try {
    assert.equal(onDisk.prepare('PRAGMA user_version').get().user_version, 8);
    assert.equal(onDisk.prepare('PRAGMA application_id').get().application_id, 0);
    assert.equal(onDisk.prepare("SELECT name FROM sqlite_schema WHERE name = 'other_application'").get().name, 'other_application');
  } finally { onDisk.close(); }
});
