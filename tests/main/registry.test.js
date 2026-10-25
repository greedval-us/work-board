import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/main/database/migrations.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { CalendarService } from '../../src/main/services/CalendarService.js';
import { ValidationError } from '../../src/shared/registry.js';
import { AppError } from '../../src/main/utils/AppError.js';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-registry-'));
  const filePath = path.join(directory, 'registry.sqlite');
  const database = { connection: new DatabaseSync(filePath) };
  migrate(database.connection);
  t.after(() => { database.connection.close(); rmSync(directory, { recursive: true, force: true }); });
  const instructions = new InstructionRepository(database);
  const tasks = new TaskRepository(database);
  return { database, filePath, instructions, tasks, calendar: new CalendarService(instructions, tasks) };
}

function instruction(changes = {}) {
  return {
    controlDate: '2026-10-23', incomingNumber: '001/А', instructionNumber: '007/Б',
    title: 'Проверить отчёт', summary: '  Текст\nподробностей  ', deadline: '2026-10-26',
    executor: 'Иванов И. И.', status: 'pending', executionMark: '', ...changes,
  };
}

test('migration upgrades legacy settings once and preserves existing values', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT; INSERT INTO app_settings VALUES ('theme', 'dark'); PRAGMA user_version = 1");
    migrate(database);
    migrate(database);
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 3);
    assert.equal(database.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get().value, 'dark');
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM instructions').get().count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM calendar_tasks').get().count, 0);
  } finally { database.close(); }
});

test('instruction CRUD persists full data and accepts duplicate text identifiers', (t) => {
  const { instructions, database, filePath } = fixture(t);
  const created = instructions.create(instruction());
  assert.equal(typeof created.id, 'number');
  assert.equal(created.incomingNumber, '001/А');
  assert.equal(created.summary, '  Текст\nподробностей  ');
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(instructions.create(instruction()).instructionNumber, '007/Б');
  const changed = instructions.update(created.id, { title: 'Другой отчёт', status: 'completed', executionMark: '  Принят\nбез замечаний  ' });
  assert.equal(changed.createdAt, created.createdAt);
  assert.equal(changed.title, 'Другой отчёт');
  database.connection.close();
  database.connection = new DatabaseSync(filePath);
  assert.equal(instructions.get(created.id).executionMark, '  Принят\nбез замечаний  ');
  assert.equal(instructions.get(created.id).status, 'completed');
  assert.deepEqual(instructions.remove(created.id), { removed: true });
  assert.equal(instructions.get(created.id), null);
  assert.equal(instructions.list().total, 1);
});

test('invalid mutations and missing records produce safe errors without losing persisted data', (t) => {
  const { instructions, tasks } = fixture(t);
  const created = instructions.create(instruction());
  for (const run of [() => instructions.create(instruction({ deadline: '2026-02-29' })), () => instructions.update(created.id, { executor: '' }), () => instructions.get('1 OR 1 = 1'), () => tasks.create({ title: 'Нет', date: '2026-02-29' })]) {
    assert.throws(run, error => error instanceof ValidationError && Boolean(error.publicMessage));
  }
  for (const run of [() => instructions.update(999, { title: 'Нет' }), () => instructions.remove(999), () => tasks.update(999, { title: 'Нет' }), () => tasks.remove(999)]) {
    assert.throws(run, error => error instanceof AppError && error.code === 'NOT_FOUND' && Boolean(error.publicMessage));
  }
  assert.equal(instructions.get(created.id).executor, 'Иванов И. И.');
  assert.equal(instructions.list().total, 1);
});

test('instruction filters match Russian case, normalized Unicode and literal SQL wildcard characters', (t) => {
  const { instructions } = fixture(t);
  const a = instructions.create(instruction({ instructionNumber: 'ЁЖ_100%/И\u0306', executor: 'ПЁТР СЕРГЕЕВ', executionMark: 'ЖДЁТ_50%' }));
  instructions.create(instruction({ instructionNumber: 'ёжX100ABC/Й', executor: 'Другой', executionMark: 'ЖдётX50ABC' }));
  assert.deepEqual(instructions.list({ filters: { instructionNumber: 'ёж_100%/й', executor: 'пётр', executionMark: 'ждёт_50%' } }).items.map(row => row.id), [a.id]);
  assert.equal(instructions.list({ filters: { instructionNumber: '%' } }).total, 1);
  assert.equal(instructions.list({ filters: { instructionNumber: '_' } }).total, 1);
  assert.equal(instructions.list({ filters: { executor: "' OR 1=1 --" } }).total, 0);
});

test('deadline ranges include both endpoints and filters are combined with AND', (t) => {
  const { instructions } = fixture(t);
  instructions.create(instruction({ deadline: '2026-10-23', status: 'completed' }));
  const first = instructions.create(instruction({ deadline: '2026-10-24' }));
  const last = instructions.create(instruction({ deadline: '2026-10-26', status: 'in_progress' }));
  instructions.create(instruction({ deadline: '2026-10-27' }));
  assert.deepEqual(instructions.all({ filters: { deadlineFrom: '2026-10-24', deadlineTo: '2026-10-26' }, sort: { field: 'deadline', direction: 'asc' } }).map(row => row.id), [first.id, last.id]);
  assert.deepEqual(instructions.all({ filters: { deadlineFrom: '2026-10-24', deadlineTo: '2026-10-26', status: 'in_progress', executor: 'иванов' } }).map(row => row.id), [last.id]);
});

test('stable sorting and pagination preserve totals while all returns every matching row', (t) => {
  const { instructions } = fixture(t);
  const a = instructions.create(instruction({ controlDate: '2026-10-21' }));
  const b = instructions.create(instruction({ controlDate: '2026-10-23' }));
  const c = instructions.create(instruction({ controlDate: '2026-10-23' }));
  const request = { offset: 1, limit: 1 };
  const page = instructions.list(request);
  assert.equal(page.total, 3);
  assert.deepEqual(page.items.map(row => row.id), [b.id]);
  assert.deepEqual(instructions.all(request).map(row => row.id), [c.id, b.id, a.id]);
  assert.deepEqual(instructions.all({ sort: { field: 'controlDate', direction: 'asc' } }).map(row => row.id), [a.id, b.id, c.id]);
  assert.throws(() => instructions.list({ sort: { field: 'title; DROP TABLE instructions', direction: 'asc' } }), ValidationError);
  assert.equal(instructions.list({ offset: 99 }).total, 3);
});

test('task CRUD uses its own table, returns booleans and filters inclusive date ranges', (t) => {
  const { instructions, tasks, database, filePath } = fixture(t);
  instructions.create(instruction());
  const a = tasks.create({ title: 'Личная задача', date: '2026-10-23', description: '  Строка\nещё  ', priority: 'urgent' });
  const b = tasks.create({ title: 'Другая задача', date: '2026-10-26' });
  tasks.create({ title: 'Позже', date: '2026-10-27' });
  assert.equal(a.completed, false);
  assert.equal(tasks.update(a.id, { completed: true }).completed, true);
  assert.deepEqual(tasks.list({ from: '2026-10-23', to: '2026-10-26' }).map(row => row.id), [a.id, b.id]);
  database.connection.close();
  database.connection = new DatabaseSync(filePath);
  assert.equal(tasks.get(a.id).description, '  Строка\nещё  ');
  assert.equal(tasks.get(a.id).completed, true);
  assert.deepEqual(tasks.remove(b.id), { removed: true });
  assert.equal(tasks.get(b.id), null);
  assert.equal(instructions.list().total, 1);
  assert.throws(() => tasks.update(a.id, { completed: 'yes' }), ValidationError);
  assert.throws(() => tasks.remove(999), error => error.code === 'NOT_FOUND');
  assert.throws(() => tasks.list({ from: '2026-10-27', to: '2026-10-23' }), ValidationError);
  for (const request of [{ from: false }, { from: 0 }, { to: null }, { to: [] }]) {
    assert.throws(() => tasks.list(request), ValidationError);
  }
});

test('repositories resolve the active connection for every operation', (t) => {
  const { instructions, tasks, database } = fixture(t);
  instructions.create(instruction());
  tasks.create({ title: 'Старая база', date: '2026-10-23' });
  database.connection.close();
  database.connection = new DatabaseSync(':memory:');
  migrate(database.connection);
  assert.deepEqual(instructions.list(), { items: [], total: 0 });
  assert.deepEqual(tasks.list(), []);
  assert.equal(instructions.create(instruction({ title: 'Новая база' })).title, 'Новая база');
});

test('calendar derives independent active and completed counts live from both repositories', (t) => {
  const { instructions, tasks, calendar } = fixture(t);
  const pending = instructions.create(instruction({ deadline: '2026-10-23' }));
  instructions.create(instruction({ deadline: '2026-10-23', status: 'completed' }));
  const task = tasks.create({ title: 'Отчёт', date: '2026-10-23' });
  tasks.create({ title: 'Готово', date: '2026-10-23', completed: true });
  instructions.create(instruction({ deadline: '2026-11-01' }));
  const month = calendar.month({ month: '2026-10' });
  assert.equal(month.days.length, 31);
  assert.deepEqual(month.days[22], { date: '2026-10-23', controls: 1, completedControls: 1, tasks: 1, completedTasks: 1 });
  assert.deepEqual(month.days[0], { date: '2026-10-01', controls: 0, completedControls: 0, tasks: 0, completedTasks: 0 });
  assert.equal(calendar.day({ date: '2026-10-23' }).instructions.length, 2);
  assert.equal(calendar.day({ date: '2026-10-23' }).tasks.length, 2);
  instructions.update(pending.id, { deadline: '2026-10-24' });
  tasks.update(task.id, { completed: true });
  assert.deepEqual(calendar.month({ month: '2026-10' }).days[22], { date: '2026-10-23', controls: 0, completedControls: 1, tasks: 0, completedTasks: 2 });
  instructions.update(pending.id, { status: 'completed' });
  assert.equal(calendar.month({ month: '2026-10' }).days[23].completedControls, 1);
  instructions.remove(pending.id);
  assert.equal(calendar.month({ month: '2026-10' }).days[23].completedControls, 0);
});

test('calendar validates calendar dates and handles leap and year boundaries', (t) => {
  const { calendar } = fixture(t);
  assert.equal(calendar.month({ month: '2024-02' }).days.length, 29);
  assert.equal(calendar.month({ month: '1900-02' }).days.length, 28);
  assert.equal(calendar.month({ month: '2026-12' }).days.at(-1).date, '2026-12-31');
  for (const month of ['2026-13', '0000-01', '2026-1', '2026-10-23']) assert.throws(() => calendar.month({ month }), ValidationError);
  assert.throws(() => calendar.day({ date: '2026-02-29' }), ValidationError);
  assert.throws(() => calendar.month(null), ValidationError);
  assert.throws(() => calendar.day(null), ValidationError);
});
