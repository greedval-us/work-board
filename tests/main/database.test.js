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

const emptyRegistryOptions = { documentType: [], source: [], executor: [], department: [], executorPhone: [], office: [] };
const defaultTypography = { fontFamily: 'inter', fontSize: 14 };
const defaultSettings = { theme: 'light', typography: defaultTypography, registryOptions: emptyRegistryOptions, executorContacts: [], office: '' };

function settingsFor(database) {
  return new SettingsService(new SettingsRepository(database));
}

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
  assert.equal(status.schemaVersion, 10);
  assert.match(status.sqliteVersion, /^3\./);
  assert.deepEqual(database.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name),
    ['app_settings', 'attachments', 'calendar_task_completions', 'calendar_task_moves', 'calendar_tasks', 'instructions']);
  assert.equal(database.connection.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(database.connection.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
});

test('reopening preserves settings and does not reapply migrations', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  assert.deepEqual(settings.get(), defaultSettings);
  settings.setTheme('dark');
  database.open();
  database.close();
  database.open();
  assert.deepEqual(new SettingsRepository(database).get(), { ...defaultSettings, theme: 'dark' });
  assert.equal(database.getStatus().schemaVersion, 10);
});

test('invalid settings cannot modify persisted data', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  for (const theme of [null, '', 'system', {}, "dark'); DROP TABLE app_settings; --"]) {
    assert.throws(() => settings.setTheme(theme), /тема/i);
  }
  assert.deepEqual(settings.get(), defaultSettings);
});

test('typography is bounded, supports both font families and persists per database', (t) => {
  const { database, filePath } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  assert.deepEqual(settings.get().typography, defaultTypography);
  const chosen = { fontFamily: 'system', fontSize: 16 };
  assert.deepEqual(settings.setTypography({ fontFamily: 'inter', fontSize: 12 }).typography, { fontFamily: 'inter', fontSize: 12 });
  assert.deepEqual(settings.setTypography(chosen).typography, chosen);
  for (const invalid of [
    null, {}, { ...chosen, fontFamily: 'constructor' }, { ...chosen, fontSize: '14' },
    { ...chosen, fontSize: 11 }, { ...chosen, fontSize: 17 }, { ...chosen, fontSize: 13.5 },
  ]) {
    assert.throws(() => settings.setTypography(invalid), { code: 'VALIDATION' });
  }

  database.replace({ filePath: path.join(path.dirname(filePath), 'other.sqlite'), create: true });
  assert.deepEqual(settings.get().typography, defaultTypography);
  database.replace({ filePath });
  assert.deepEqual(settings.get().typography, chosen);
});

test('unrecognized or damaged typography settings fall back to the default', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  const write = database.connection.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
  for (const value of ['{', '{"fontFamily":"unknown","fontSize":20}']) {
    write.run('typography', value);
    assert.deepEqual(settings.get().typography, defaultTypography);
  }
});

test('the Ф‑21 office is stored per database and preserves executor contacts', (t) => {
  const { database, filePath } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  assert.equal(settings.get().office, '');
  const executor = 'Иванов';
  const department = 'Отдел контроля';
  settings.addRegistryOption('department', department);
  settings.addRegistryOption('executor', executor, { department });
  const contacts = [{ executor, department, executorPhone: '' }];
  const saved = 'а'.repeat(500);
  const second = 'Канцелярия';
  const added = settings.addRegistryOption('office', `  ${saved}  `);
  assert.deepEqual(added.registryOptions.office, [saved]);
  assert.equal(added.office, '');
  settings.addRegistryOption('office', second);
  assert.equal(settings.setOffice(`  ${saved}  `).office, saved);
  for (const invalid of [undefined, null, 10, 'а'.repeat(501), 'Несуществующий участок']) {
    assert.throws(() => settings.setOffice(invalid), { code: 'VALIDATION' });
  }
  for (const invalid of ['', 'а'.repeat(501), 'КАНЦЕЛЯРИЯ']) {
    assert.throws(() => settings.addRegistryOption('office', invalid), { code: 'VALIDATION' });
  }
  assert.equal(settings.get().office, saved);

  database.replace({ filePath: path.join(path.dirname(filePath), 'other.sqlite'), create: true });
  assert.equal(settings.get().office, '');
  assert.deepEqual(settings.get().registryOptions.office, []);
  settings.addRegistryOption('office', 'Другой участок');
  settings.setOffice('Другой участок');
  database.replace({ filePath });
  assert.equal(settings.get().office, saved);
  assert.deepEqual(settings.get().registryOptions.office, [saved, second]);
  assert.deepEqual(settings.get().executorContacts, contacts);

  assert.equal(settings.removeRegistryOption('office', second).office, saved);
  settings.addRegistryOption('office', second);
  const renamed = settings.updateRegistryOption('office', saved, 'Делопроизводство');
  assert.equal(renamed.office, 'Делопроизводство');
  assert.deepEqual(renamed.registryOptions.office, ['Делопроизводство', second]);
  assert.throws(() => settings.setOffice(saved), { code: 'VALIDATION' });
  const removed = settings.removeRegistryOption('office', 'Делопроизводство');
  assert.equal(removed.office, '');
  assert.deepEqual(removed.registryOptions.office, [second]);
  database.close();
  database.open();
  assert.equal(settings.get().office, '');
  assert.deepEqual(settings.get().registryOptions.office, [second]);
  assert.deepEqual(settings.get().executorContacts, contacts);
});

test('the legacy Ф‑21 office remains available when clearing or changing its selection', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  const write = database.connection.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)');
  write.run('office', 'Приёмная');
  assert.equal(settings.get().office, 'Приёмная');
  assert.deepEqual(settings.get().registryOptions.office, ['Приёмная']);
  assert.throws(() => settings.addRegistryOption('office', 'ПРИЁМНАЯ'), { code: 'VALIDATION' });

  const cleared = settings.setOffice('');
  assert.equal(cleared.office, '');
  assert.deepEqual(cleared.registryOptions.office, ['Приёмная']);
  assert.equal(settings.setOffice('Приёмная').office, 'Приёмная');
});

test('registry options stay in insertion order across database connections and reopening', (t) => {
  const { database, filePath } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  const otherDatabase = new DatabaseService({ filePath });
  otherDatabase.open();
  try {
    const otherSettings = settingsFor(otherDatabase);
    settings.addRegistryOption('source', '  Канцелярия  ');
    otherSettings.addRegistryOption('source', 'Архив');
    settings.addRegistryOption('executor', 'Канцелярия');
    otherSettings.addRegistryOption('executor', 'Отдел кадров');
  } finally { otherDatabase.close(); }

  const expected = {
    ...defaultSettings,
    theme: 'dark',
    registryOptions: { ...emptyRegistryOptions, source: ['Канцелярия', 'Архив'], executor: ['Канцелярия', 'Отдел кадров'] },
  };
  assert.deepEqual(settings.setTheme('dark'), expected);
  database.close();
  database.open();
  assert.deepEqual(new SettingsRepository(database).get(), expected);
});

test('invalid and case-insensitive duplicate registry options leave settings intact', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  const existing = {
    ...defaultSettings, registryOptions: { ...emptyRegistryOptions, executor: ['Отдел кадров'] },
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
  const settings = settingsFor(database);
  const instructions = new InstructionRepository(database);
  for (const [field, values] of Object.entries({
    documentType: ['Письмо', 'Распоряжение'],
    source: ['Канцелярия', 'Архив', 'Приёмная'],
    executor: ['Отдел кадров', 'Бухгалтерия'],
    department: ['Отдел контроля', 'Отдел отчётности'],
    executorPhone: ['+7 900 555-01-23', '102'],
  })) {
    for (const value of values) settings.addRegistryOption(field, value);
  }
  settings.setTheme('dark');
  const instruction = instructions.create({
    title: 'Проверить отчёт', instructionNumber: '12', controlDate: '2026-11-10', deadline: '2026-11-12',
    source: 'Архив', executor: 'Отдел кадров', documentType: 'Распоряжение',
  });

  const updated = settings.updateRegistryOption('source', 'Архив', '  Общий архив  ');
  assert.deepEqual(updated.registryOptions.source, ['Канцелярия', 'Общий архив', 'Приёмная']);
  settings.updateRegistryOption('documentType', 'Письмо', 'Служебное письмо');
  settings.removeRegistryOption('documentType', 'Распоряжение');
  settings.updateRegistryOption('executor', 'Отдел кадров', 'Отдел Кадров');
  settings.updateRegistryOption('department', 'Отдел контроля', 'Управление контроля');
  settings.updateRegistryOption('executorPhone', '102', '103');
  settings.removeRegistryOption('department', 'Отдел отчётности');
  settings.removeRegistryOption('executorPhone', '+7 900 555-01-23');
  settings.removeRegistryOption('source', 'Канцелярия');
  const removed = settings.removeRegistryOption('executor', 'Бухгалтерия');
  const expected = {
    ...defaultSettings,
    theme: 'dark',
    registryOptions: {
      documentType: ['Служебное письмо'],
      source: ['Общий архив', 'Приёмная'], executor: ['Отдел Кадров'],
      department: ['Управление контроля'], executorPhone: ['103'], office: [],
    },
  };
  assert.deepEqual(removed, expected);
  database.close();
  database.open();
  assert.deepEqual(settings.get(), expected);
  assert.deepEqual(instructions.get(instruction.id), instruction);
  assert.deepEqual(instructions.list().documentTypes, ['Распоряжение']);
});

test('invalid, duplicate, or stale registry option changes leave settings intact', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
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

test('legacy control type options remain stored and are excluded from active settings', (t) => {
  const { database } = fixture(t);
  database.open();
  const key = 'registryOptions.controlType';
  const legacyOptions = JSON.stringify(['Плановый']);
  database.connection.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(key, legacyOptions);
  const settings = settingsFor(database);
  assert.deepEqual(settings.get().registryOptions, emptyRegistryOptions);
  assert.throws(() => settings.addRegistryOption('controlType', 'Внеплановый'), { code: 'VALIDATION' });
  assert.throws(() => settings.updateRegistryOption('controlType', 'Плановый', 'Внеплановый'), { code: 'VALIDATION' });
  assert.throws(() => settings.removeRegistryOption('controlType', 'Плановый'), { code: 'VALIDATION' });
  settings.addRegistryOption('source', 'Архив');
  assert.equal(database.connection.prepare('SELECT value FROM app_settings WHERE key = ?').get(key).value, legacyOptions);
});

test('executor contacts persist after reopening and follow edits and deletions in the option lists', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  const executor = 'Иванов И. И.';
  const department = 'Отдел контроля';
  const executorPhone = '+7 900 555-01-23';
  settings.addRegistryOption('executor', executor);
  settings.addRegistryOption('department', department);
  settings.addRegistryOption('executorPhone', executorPhone);
  const contact = { executor, department, executorPhone };
  assert.deepEqual(settings.setExecutorContact(executor, { department, executorPhone }).executorContacts, [contact]);
  assert.throws(() => settings.setExecutorContact('Неизвестный исполнитель', { department }), { code: 'VALIDATION' });
  assert.throws(() => settings.setExecutorContact(executor, { department: 'Удалённое подразделение' }), { code: 'VALIDATION' });
  assert.throws(() => settings.setExecutorContact(executor, null), { code: 'VALIDATION' });

  database.close();
  database.open();
  assert.deepEqual(settings.get().executorContacts, [contact]);
  const renamed = 'Иванов И. П.';
  assert.deepEqual(settings.updateRegistryOption('executor', executor, renamed).executorContacts, [{ ...contact, executor: renamed }]);
  assert.deepEqual(settings.updateRegistryOption('department', department, 'Управление контроля').executorContacts,
    [{ executor: renamed, department: 'Управление контроля', executorPhone }]);
  assert.deepEqual(settings.removeRegistryOption('executorPhone', executorPhone).executorContacts,
    [{ executor: renamed, department: 'Управление контроля', executorPhone: '' }]);
  assert.deepEqual(settings.setExecutorContact(renamed, { department: '', executorPhone: '' }).executorContacts, []);
  settings.setExecutorContact(renamed, { department: 'Управление контроля' });
  assert.deepEqual(settings.removeRegistryOption('executor', renamed).executorContacts, []);
  assert.deepEqual(settings.get().executorContacts, []);
});

test('adding or editing an executor saves the name and optional contacts in one transaction', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  const executor = 'Иванов И. И.';
  const renamed = 'Иванов И. П.';
  const contact = { department: 'Отдел контроля', executorPhone: '103' };
  settings.addRegistryOption('department', contact.department);
  settings.addRegistryOption('executorPhone', contact.executorPhone);

  assert.throws(() => settings.addRegistryOption('executor', executor, { ...contact, executorPhone: '999' }), { code: 'VALIDATION' });
  assert.deepEqual(settings.get().registryOptions.executor, []);
  const created = settings.addRegistryOption('executor', executor, contact);
  assert.deepEqual(created.registryOptions.executor, [executor]);
  assert.deepEqual(created.executorContacts, [{ executor, ...contact }]);

  assert.throws(() => settings.updateRegistryOption('executor', executor, renamed, { department: 'Удалённый отдел' }), { code: 'VALIDATION' });
  assert.throws(() => settings.addRegistryOption('source', 'Архив', contact), { code: 'VALIDATION' });
  assert.deepEqual(settings.get(), created);
  const edited = settings.updateRegistryOption('executor', executor, executor, { ...contact, executorPhone: '' });
  assert.deepEqual(edited.executorContacts, [{ executor, department: contact.department, executorPhone: '' }]);
  const updated = settings.updateRegistryOption('executor', executor, renamed, { department: '', executorPhone: contact.executorPhone });
  assert.deepEqual(updated.registryOptions.executor, [renamed]);
  assert.deepEqual(updated.executorContacts, [{ executor: renamed, department: '', executorPhone: contact.executorPhone }]);
  assert.deepEqual(settings.updateRegistryOption('executor', renamed, renamed, { department: '', executorPhone: '' }).executorContacts, []);
});

test('a failed contact write rolls back the associated executor rename', (t) => {
  const { database } = fixture(t);
  database.open();
  const settings = settingsFor(database);
  settings.addRegistryOption('department', 'Канцелярия');
  const before = settings.addRegistryOption('executor', 'Иванов', { department: 'Канцелярия' });
  database.connection.exec(`CREATE TRIGGER fail_contact_update BEFORE UPDATE ON app_settings
    WHEN OLD.key = 'executorContacts' BEGIN SELECT RAISE(ABORT, 'contact write failed'); END`);

  assert.throws(() => settings.updateRegistryOption('executor', 'Иванов', 'Петров'), /contact write failed/);
  assert.deepEqual(settings.get(), before);
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
    status: 'in_progress', deadline: base.deadline, extendedUntil: '', createdAt: item.createdAt, controlSchedule: history,
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
