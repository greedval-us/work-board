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
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 6);
    assert.equal(database.prepare("SELECT value FROM app_settings WHERE key = 'theme'").get().value, 'dark');
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM instructions').get().count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM calendar_tasks').get().count, 0);
  } finally { database.close(); }
});

test('instruction CRUD persists full data and accepts duplicate text identifiers', (t) => {
  const { instructions, database, filePath } = fixture(t);
  const created = instructions.create(instruction({ source: 'Канцелярия', controlType: 'Плановый' }));
  assert.equal(typeof created.id, 'number');
  assert.equal(created.incomingNumber, '001/А');
  assert.equal(created.summary, '  Текст\nподробностей  ');
  assert.equal(created.source, 'Канцелярия');
  assert.equal(created.controlType, 'Плановый');
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(instructions.create(instruction()).instructionNumber, '007/Б');
  const changed = instructions.update(created.id, {
    title: 'Другой отчёт', status: 'completed', executionMark: '  Принят\nбез замечаний  ',
    source: '', controlType: 'Внеплановый',
  });
  assert.equal(changed.createdAt, created.createdAt);
  assert.equal(changed.title, 'Другой отчёт');
  database.connection.close();
  database.connection = new DatabaseSync(filePath);
  const reopened = instructions.get(created.id);
  assert.equal(reopened.executionMark, '  Принят\nбез замечаний  ');
  assert.equal(reopened.status, 'completed');
  assert.equal(reopened.source, '');
  assert.equal(reopened.controlType, 'Внеплановый');
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

test('date ranges follow extensions while preserving the original deadline', (t) => {
  const { instructions } = fixture(t);
  const extended = instructions.create(instruction({ extendedUntil: '2026-11-01' }));
  const originalRange = { deadlineFrom: '2026-10-01', deadlineTo: '2026-10-31' };
  const extensionRange = { deadlineFrom: '2026-11-01', deadlineTo: '2026-11-01' };
  assert.deepEqual(instructions.list({ filters: originalRange }), { items: [], total: 0 });
  const { controlSchedule, ...row } = extended;
  assert.deepEqual(instructions.list({ filters: extensionRange }), { items: [{ ...row, nextCheckpoint: '' }], total: 1 });
  assert.equal(instructions.get(extended.id).deadline, '2026-10-26');
  assert.equal(instructions.get(extended.id).extendedUntil, '2026-11-01');
  assert.throws(() => instructions.update(extended.id, { deadline: '2026-11-02' }), ValidationError);
  assert.deepEqual(instructions.get(extended.id), extended);
  assert.equal(instructions.update(extended.id, { extendedUntil: '' }).extendedUntil, '');
  assert.equal(instructions.list({ filters: originalRange }).total, 1);
  assert.equal(instructions.list({ filters: extensionRange }).total, 0);
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

test('registry queries sort and return source and control type', (t) => {
  const { instructions } = fixture(t);
  const a = instructions.create(instruction({ source: 'Янтарь', controlType: 'Проверка' }));
  const b = instructions.create(instruction({ source: 'Архив', controlType: 'Аудит' }));
  assert.deepEqual(instructions.list({ sort: { field: 'source', direction: 'asc' } }).items.map(({ id, source }) => [id, source]), [
    [b.id, 'Архив'], [a.id, 'Янтарь'],
  ]);
  assert.deepEqual(instructions.all({ sort: { field: 'controlType', direction: 'desc' } }).map(({ id, controlType }) => [id, controlType]), [
    [a.id, 'Проверка'], [b.id, 'Аудит'],
  ]);
});

test('registry sorts by ID, original deadline and extension with stable pagination', (t) => {
  const { instructions } = fixture(t);
  const a = instructions.create(instruction({ deadline: '2026-10-26', extendedUntil: '2026-11-02' }));
  const b = instructions.create(instruction({ deadline: '2026-10-27', extendedUntil: '2026-11-01' }));
  const c = instructions.create(instruction({ deadline: '2026-10-28', extendedUntil: '2026-11-01' }));
  const ids = (field, direction) => instructions.all({ sort: { field, direction } }).map(row => row.id);
  assert.deepEqual(ids('id', 'desc'), [c.id, b.id, a.id]);
  assert.deepEqual(ids('deadline', 'asc'), [a.id, b.id, c.id]);
  assert.deepEqual(ids('extendedUntil', 'asc'), [b.id, c.id, a.id]);
  assert.deepEqual(instructions.list({ sort: { field: 'extendedUntil', direction: 'asc' }, limit: 1, offset: 1 }).items.map(row => row.id), [c.id]);
});

test('registry rows expose the next unmarked checkpoint through the effective deadline', (t) => {
  const { instructions } = fixture(t);
  const item = instructions.create(instruction({
    extendedUntil: '2026-10-30',
    controlSchedule: {
      frequency: 'weekly', firstDate: '2026-10-23',
      marks: [{ date: '2026-10-23', text: 'Доклад получен' }, { date: '2026-10-24', text: 'История' }],
    },
  }));

  const [row] = instructions.list().items;
  assert.equal(row.nextCheckpoint, '2026-10-30');
  assert.equal(Object.hasOwn(row, 'controlSchedule'), false);
  assert.deepEqual(instructions.all(), [row]);
  assert.deepEqual(instructions.get(item.id).controlSchedule, item.controlSchedule);

  instructions.update(item.id, { extendedUntil: '' });
  assert.equal(instructions.list().items[0].nextCheckpoint, '');
});

test('registry checkpoint sorting puts undated rows last with stable pagination', (t) => {
  const { instructions } = fixture(t);
  const blank = instructions.create(instruction());
  const last = instructions.create(instruction({ controlSchedule: { frequency: 'custom', customDates: ['2026-10-26'] } }));
  const first = instructions.create(instruction({ controlSchedule: { frequency: 'custom', customDates: ['2026-10-24'] } }));
  const tied = instructions.create(instruction({ controlSchedule: { frequency: 'daily', firstDate: '2026-10-24' } }));
  const marked = instructions.create(instruction({
    controlSchedule: { frequency: 'custom', customDates: ['2026-10-25'], marks: [{ date: '2026-10-25', text: 'Готово' }] },
  }));

  const ascending = { field: 'nextCheckpoint', direction: 'asc' };
  const descending = { field: 'nextCheckpoint', direction: 'desc' };
  assert.deepEqual(instructions.all({ sort: ascending }).map(row => row.id), [first.id, tied.id, last.id, blank.id, marked.id]);
  assert.deepEqual(instructions.all({ sort: descending }).map(row => row.id), [last.id, tied.id, first.id, marked.id, blank.id]);
  const page = instructions.list({ sort: descending, offset: 1, limit: 2 });
  assert.equal(page.total, 5);
  assert.deepEqual(page.items.map(row => [row.id, row.nextCheckpoint]), [[tied.id, '2026-10-24'], [first.id, '2026-10-24']]);
});

test('today and overdue checkpoint filters can match the same instruction', (t) => {
  const { instructions } = fixture(t);
  const today = '2026-10-25';
  const both = instructions.create(instruction({
    status: 'completed', controlSchedule: { frequency: 'daily', firstDate: '2026-10-23' },
  }));
  const todayOnly = instructions.create(instruction({
    controlSchedule: { frequency: 'custom', customDates: [today] },
  }));
  const overdueOnly = instructions.create(instruction({
    controlSchedule: { frequency: 'weekly', firstDate: '2026-10-23' },
  }));
  const markedToday = instructions.create(instruction({
    controlSchedule: { frequency: 'daily', firstDate: '2026-10-24', marks: [{ date: today, text: 'Доклад получен' }] },
  }));
  instructions.create(instruction({ controlSchedule: { marks: [{ date: today, text: 'История' }] } }));
  instructions.create(instruction({ controlSchedule: { frequency: 'custom', customDates: ['2026-10-26'] } }));
  instructions.create(instruction());

  const rows = checkpoint => instructions.all({ today, filters: { checkpoint }, sort: { field: 'id', direction: 'asc' } })
    .map(({ id, nextCheckpoint }) => [id, nextCheckpoint]);
  assert.deepEqual(rows('today'), [[both.id, today], [todayOnly.id, today]]);
  assert.deepEqual(rows('overdue'), [[both.id, '2026-10-23'], [overdueOnly.id, '2026-10-23'], [markedToday.id, '2026-10-24']]);

  const page = instructions.list({ today, filters: { checkpoint: 'overdue' }, sort: { field: 'id', direction: 'asc' }, offset: 1, limit: 1 });
  assert.equal(page.total, 3);
  assert.deepEqual(page.items.map(row => [row.id, row.nextCheckpoint]), [[overdueOnly.id, '2026-10-23']]);
});

test('today checkpoint filtering follows extensions and applies before pagination', (t) => {
  const { instructions } = fixture(t);
  const today = '2026-10-27';
  const first = instructions.create(instruction({
    extendedUntil: today, controlSchedule: { frequency: 'daily', firstDate: '2026-10-26' },
  }));
  const second = instructions.create(instruction({
    extendedUntil: today, controlSchedule: { frequency: 'daily', firstDate: '2026-10-24' },
  }));
  instructions.create(instruction({ controlSchedule: { frequency: 'daily', firstDate: '2026-10-24' } }));
  instructions.create(instruction({
    executor: 'Петров', extendedUntil: today, controlSchedule: { frequency: 'daily', firstDate: '2026-10-24' },
  }));
  instructions.create(instruction({
    status: 'in_progress', extendedUntil: today, controlSchedule: { frequency: 'daily', firstDate: '2026-10-24' },
  }));

  const request = {
    today, filters: { checkpoint: 'today', executor: 'иванов', status: 'pending' },
    sort: { field: 'nextCheckpoint', direction: 'asc' }, offset: 1, limit: 1,
  };
  const page = instructions.list(request);
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map(row => [row.id, row.nextCheckpoint]), [[second.id, today]]);
  assert.deepEqual(instructions.all(request).map(row => [row.id, row.nextCheckpoint]), [[first.id, today], [second.id, today]]);

  instructions.update(second.id, { extendedUntil: '' });
  assert.deepEqual(instructions.list(request), { items: [], total: 1 });
});

test('checkpoint filters use the local date when the request omits today', (t) => {
  const { instructions } = fixture(t);
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 25, 12) });
  const today = '2026-10-25';
  const item = instructions.create(instruction({
    controlDate: today, deadline: today, controlSchedule: { frequency: 'custom', customDates: [today] },
  }));
  assert.deepEqual(instructions.list({ filters: { checkpoint: 'today' } }).items.map(row => [row.id, row.nextCheckpoint]), [[item.id, today]]);
  assert.equal(instructions.list({ filters: { checkpoint: 'overdue' } }).total, 0);
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
  assert.equal(instructions.list().total, 1);
  database.connection.close();
  database.connection = new DatabaseSync(':memory:');
  migrate(database.connection);
  assert.deepEqual(instructions.list(), { items: [], total: 0 });
  assert.deepEqual(tasks.list(), []);
  instructions.create(instruction({ title: 'Новая база', controlSchedule: { frequency: 'daily', firstDate: '2026-10-25' } }));
  assert.deepEqual(instructions.list().items.map(row => [row.title, row.nextCheckpoint]), [['Новая база', '2026-10-25']]);
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
  assert.deepEqual(month.days[22], { date: '2026-10-23', controls: 1, completedControls: 1, tasks: 1, completedTasks: 1, checkpoints: 0, completedCheckpoints: 0 });
  assert.deepEqual(month.days[0], { date: '2026-10-01', controls: 0, completedControls: 0, tasks: 0, completedTasks: 0, checkpoints: 0, completedCheckpoints: 0 });
  assert.equal(calendar.day({ date: '2026-10-23' }).instructions.length, 2);
  assert.equal(calendar.day({ date: '2026-10-23' }).tasks.length, 2);
  instructions.update(pending.id, { deadline: '2026-10-24' });
  tasks.update(task.id, { completed: true });
  assert.deepEqual(calendar.month({ month: '2026-10' }).days[22], { date: '2026-10-23', controls: 0, completedControls: 1, tasks: 0, completedTasks: 2, checkpoints: 0, completedCheckpoints: 0 });
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

test('calendar moves an extended instruction to its new deadline across months', (t) => {
  const { instructions, calendar } = fixture(t);
  const original = instructions.create(instruction({ deadline: '2026-10-31' }));
  assert.equal(calendar.month({ month: '2026-10' }).days[30].controls, 1);
  const extended = instructions.update(original.id, { extendedUntil: '2026-11-01' });
  assert.equal(calendar.month({ month: '2026-10' }).days[30].controls, 0);
  assert.equal(calendar.month({ month: '2026-11' }).days[0].controls, 1);
  assert.deepEqual(calendar.day({ date: '2026-10-31' }).instructions, []);
  assert.equal(calendar.day({ date: '2026-11-01' }).instructions[0].id, extended.id);
});

test('calendar counts intermediate checkpoints independently of final deadlines and tasks', (t) => {
  const { instructions, tasks, calendar } = fixture(t);
  const pending = instructions.create(instruction({
    instructionNumber: '011/Б', deadline: '2026-10-30',
    controlSchedule: { frequency: 'weekly', firstDate: '2026-10-23' },
  }));
  const marked = instructions.create(instruction({
    instructionNumber: '012/Б', deadline: '2026-10-23',
    controlSchedule: { frequency: 'custom', customDates: ['2026-10-23'], marks: [{ date: '2026-10-23', text: 'Доклад получен' }] },
  }));
  tasks.create({ title: 'Сверка', date: '2026-10-23' });

  const month = calendar.month({ month: '2026-10' });
  assert.deepEqual(month.days[22], { date: '2026-10-23', controls: 1, completedControls: 0, tasks: 1, completedTasks: 0, checkpoints: 1, completedCheckpoints: 1 });
  assert.equal(month.days[29].checkpoints, 1);
  const day = calendar.day({ date: '2026-10-23' });
  assert.deepEqual(day.instructions.map(item => item.id), [marked.id]);
  assert.equal(day.tasks.length, 1);
  assert.deepEqual(day.checkpoints.sort((a, b) => a.instructionId - b.instructionId), [
    { instructionId: pending.id, title: 'Проверить отчёт', instructionNumber: '011/Б', executor: 'Иванов И. И.', date: '2026-10-23', mark: '', scheduled: true },
    { instructionId: marked.id, title: 'Проверить отчёт', instructionNumber: '012/Б', executor: 'Иванов И. И.', date: '2026-10-23', mark: 'Доклад получен', scheduled: true },
  ]);
});

test('calendar keeps marked history outside the current schedule and uses the effective deadline', (t) => {
  const { instructions, calendar } = fixture(t);
  const item = instructions.create(instruction({
    deadline: '2026-10-26', extendedUntil: '2026-11-06',
    controlSchedule: { frequency: 'weekly', firstDate: '2026-10-23', marks: [{ date: '2026-10-30', text: 'Доклад получен' }] },
  }));

  assert.equal(calendar.month({ month: '2026-10' }).days[29].completedCheckpoints, 1);
  assert.equal(calendar.day({ date: '2026-10-30' }).checkpoints[0].scheduled, true);
  assert.equal(calendar.month({ month: '2026-11' }).days[5].checkpoints, 1);
  assert.deepEqual(calendar.day({ date: '2026-11-13' }).checkpoints, []);
  instructions.update(item.id, { extendedUntil: '' });
  const [history] = calendar.day({ date: '2026-10-30' }).checkpoints;
  assert.equal(history.instructionId, item.id);
  assert.equal(history.mark, 'Доклад получен');
  assert.equal(history.scheduled, false);
  assert.equal(calendar.month({ month: '2026-10' }).days[29].completedCheckpoints, 1);
});
