import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { SettingsRepository } from '../../src/main/repositories/SettingsRepository.js';
import { SettingsService } from '../../src/main/services/SettingsService.js';

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
  assert.equal(status.schemaVersion, 6);
  assert.match(status.sqliteVersion, /^3\./);
  assert.deepEqual(database.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name), ['app_settings', 'attachments', 'calendar_tasks', 'instructions']);
  assert.equal(database.connection.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(database.connection.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
});

test('reopening preserves settings and does not reapply migrations', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = new SettingsRepository(database);
  assert.deepEqual(settings.get(), { theme: 'light', registryOptions: { source: [], executor: [], controlType: [] } });
  settings.setTheme('dark');
  database.open();
  database.close();
  database.open();
  assert.deepEqual(new SettingsRepository(database).get(), { theme: 'dark', registryOptions: { source: [], executor: [], controlType: [] } });
  assert.equal(database.getStatus().schemaVersion, 6);
});

test('invalid settings cannot modify persisted data', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = new SettingsRepository(database);
  for (const theme of [null, '', 'system', {}, "dark'); DROP TABLE app_settings; --"]) {
    assert.throws(() => settings.setTheme(theme), /тема/i);
  }
  assert.deepEqual(settings.get(), { theme: 'light', registryOptions: { source: [], executor: [], controlType: [] } });
});

test('registry options stay in insertion order across database connections and reopening', (t) => {
  const { database, filePath } = fixture(t);
  database.open();
  const settings = new SettingsService(new SettingsRepository(database));
  const otherDatabase = new DatabaseService({ filePath });
  otherDatabase.open();
  try {
    const otherSettings = new SettingsService(new SettingsRepository(otherDatabase));
    settings.addRegistryOption('source', '  Канцелярия  ');
    otherSettings.addRegistryOption('source', 'Архив');
    settings.addRegistryOption('executor', 'Канцелярия');
    otherSettings.addRegistryOption('controlType', 'Еженедельный');
  } finally { otherDatabase.close(); }

  const expected = {
    theme: 'dark',
    registryOptions: { source: ['Канцелярия', 'Архив'], executor: ['Канцелярия'], controlType: ['Еженедельный'] },
  };
  assert.deepEqual(settings.setTheme('dark'), expected);
  database.close();
  database.open();
  assert.deepEqual(new SettingsRepository(database).get(), expected);
});

test('invalid and case-insensitive duplicate registry options leave settings intact', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = new SettingsService(new SettingsRepository(database));
  const existing = {
    theme: 'light', registryOptions: { source: [], executor: ['Отдел кадров'], controlType: [] },
  };
  assert.deepEqual(settings.addRegistryOption('executor', 'Отдел кадров'), existing);
  for (const [field, value] of [
    ['title', 'Новый вариант'], ['constructor', 'Новый вариант'], ['executor', null],
    ['executor', '   '], ['executor', 'а'.repeat(301)], ['executor', ' ОТДЕЛ КАДРОВ '],
  ]) {
    assert.throws(() => settings.addRegistryOption(field, value), { code: 'VALIDATION' });
  }
  assert.deepEqual(settings.get(), existing);
});

test('renaming and removing registry options preserves their order and saved instructions after reopening', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = new SettingsService(new SettingsRepository(database));
  const instructions = new InstructionRepository(database);
  for (const [field, values] of Object.entries({
    source: ['Канцелярия', 'Архив', 'Приёмная'],
    executor: ['Отдел кадров', 'Бухгалтерия'],
    controlType: ['Ежемесячный', 'Плановый'],
  })) {
    for (const value of values) settings.addRegistryOption(field, value);
  }
  settings.setTheme('dark');
  const instruction = instructions.create({
    title: 'Проверить отчёт', instructionNumber: '12', controlDate: '2026-11-10', deadline: '2026-11-12',
    source: 'Архив', executor: 'Отдел кадров', controlType: 'Плановый',
  });

  const updated = settings.updateRegistryOption('source', 'Архив', '  Общий архив  ');
  assert.deepEqual(updated.registryOptions.source, ['Канцелярия', 'Общий архив', 'Приёмная']);
  settings.updateRegistryOption('executor', 'Отдел кадров', 'Отдел Кадров');
  settings.updateRegistryOption('controlType', 'Ежемесячный', 'Еженедельный');
  settings.removeRegistryOption('source', 'Канцелярия');
  settings.removeRegistryOption('executor', 'Бухгалтерия');
  const removed = settings.removeRegistryOption('controlType', 'Плановый');
  const expected = {
    theme: 'dark',
    registryOptions: { source: ['Общий архив', 'Приёмная'], executor: ['Отдел Кадров'], controlType: ['Еженедельный'] },
  };
  assert.deepEqual(removed, expected);
  database.close();
  database.open();
  assert.deepEqual(settings.get(), expected);
  assert.deepEqual(instructions.get(instruction.id), instruction);
});

test('invalid, duplicate, or stale registry option changes leave settings intact', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = new SettingsService(new SettingsRepository(database));
  settings.addRegistryOption('source', 'Канцелярия');
  const existing = settings.addRegistryOption('source', 'Архив');

  for (const run of [
    () => settings.updateRegistryOption('source', 'Канцелярия', ' АРХИВ '),
    () => settings.updateRegistryOption('source', 'Канцелярия', ' '),
    () => settings.updateRegistryOption('source', 'Канцелярия', 'а'.repeat(301)),
    () => settings.updateRegistryOption('source', 'КАНЦЕЛЯРИЯ', 'Приёмная'),
    () => settings.removeRegistryOption('source', 'КАНЦЕЛЯРИЯ'),
    () => settings.removeRegistryOption('source', ' Архив '),
    () => settings.removeRegistryOption('constructor', 'Архив'),
  ]) {
    assert.throws(run, { code: 'VALIDATION' });
  }
  assert.deepEqual(settings.get(), existing);
});

test('checkpoint schedules persist after reopening and survive partial instruction updates', (t) => {
  const { database } = fixture(t);
  database.open();
  const instructions = new InstructionRepository(database);
  const base = {
    title: 'Проверить отчёт', instructionNumber: '12', controlDate: '2026-11-10',
    deadline: '2026-11-25', executor: 'Отдел кадров',
  };
  const controlSchedule = {
    frequency: 'weekly', firstDate: '2026-11-11', customDates: [],
    marks: [{ date: '2026-11-11', text: '  Готово\nс замечаниями  ' }],
  };
  const item = instructions.create({ ...base, controlSchedule });
  const withoutSchedule = instructions.create(base);
  assert.equal(database.connection.prepare('SELECT control_schedule FROM instructions WHERE id = ?')
    .get(withoutSchedule.id).control_schedule, '');

  database.close();
  database.open();
  assert.deepEqual(instructions.get(item.id).controlSchedule, controlSchedule);
  assert.deepEqual(instructions.update(item.id, { status: 'in_progress' }).controlSchedule, controlSchedule);
  const [first] = instructions.list().items;
  assert.equal(Object.hasOwn(first, 'controlSchedule'), false);

  const history = { frequency: '', firstDate: '', customDates: [], marks: controlSchedule.marks };
  instructions.update(item.id, { controlSchedule: history });
  assert.deepEqual(instructions.scheduledForCalendar(), [{
    id: item.id, title: base.title, instructionNumber: base.instructionNumber, executor: base.executor,
    status: 'in_progress', deadline: base.deadline, extendedUntil: '', controlSchedule: history,
  }]);
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
