import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../../src/main/database/migrations.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';

function openConnection(t) {
  const connection = new DatabaseSync(':memory:');
  t.after(() => connection.close());
  migrate(connection);
  return connection;
}

function fixture(t) {
  const connection = openConnection(t);
  return { connection, tasks: new TaskRepository({ connection }) };
}

test('recurring task reads and writes follow the active database when task ids overlap', t => {
  const first = openConnection(t);
  const database = { connection: first };
  const tasks = new TaskRepository(database);
  const date = '2026-11-16';
  const data = { date, title: 'Проверка', recurrence: { frequency: 'weekly' } };
  const id = tasks.create(data).id;
  tasks.moveOccurrence(id, date, '2026-11-17');
  tasks.updateOccurrence(id, '2026-11-17', true);

  database.connection = openConnection(t);
  assert.equal(tasks.create(data).id, id);
  tasks.moveOccurrence(id, date, '2026-11-18');
  assert.deepEqual(tasks.occurrenceMoves(), [{ taskId: id, originalDate: date, date: '2026-11-18' }]);
  const [secondDay] = tasks.list({ agendaDate: date });
  assert.deepEqual([secondDay.date, secondDay.completed], ['2026-11-18', false]);
  assert.equal(tasks.get(id, '2026-11-17'), null);

  database.connection = first;
  const [firstDay] = tasks.occurrences({ from: date, to: '2026-11-18' });
  assert.deepEqual([firstDay.date, firstDay.completed], ['2026-11-17', true]);
  assert.equal(tasks.get(id, '2026-11-18'), null);
});

test('weekly tasks project the selected weekday and preserve the series start', (t) => {
  const { tasks } = fixture(t);
  const date = '2026-11-16';
  const recurrence = { frequency: 'weekly', dayOfWeek: 3 };
  const series = tasks.create({ date, recurrence, title: 'Проверить журнал' });
  assert.deepEqual(series.recurrence, recurrence);
  assert.deepEqual(tasks.occurrences({ from: date, to: '2026-11-25' })
    .map(({ id, date, seriesDate, completed }) => [id, date, seriesDate, completed]), [
    [series.id, '2026-11-18', date, false],
    [series.id, '2026-11-25', date, false],
  ]);
  assert.equal(tasks.get(series.id, '2026-11-19'), null);
  assert.equal(tasks.get(series.id, '2026-11-25').seriesDate, date);
  assert.deepEqual(tasks.list().map(({ id, date }) => [id, date]), [[series.id, date]]);
});

test('the task agenda uses one effective occurrence per series and keeps all one-time tasks', (t) => {
  const { tasks } = fixture(t);
  const old = tasks.create({ date: '2026-10-01', title: 'Старая задача', completed: true });
  const future = tasks.create({ date: '2027-01-03', title: 'Будущая задача' });
  const weekly = tasks.create({ date: '2026-11-16', title: 'Повтор', recurrence: { frequency: 'weekly', dayOfWeek: 3 } });
  const manual = tasks.create({ date: '2026-11-10', title: 'По датам', recurrence: { frequency: 'custom', customDates: ['2026-11-15'] } });
  tasks.updateOccurrence(weekly.id, '2026-11-18', true);
  tasks.moveOccurrence(weekly.id, '2026-11-18', '2026-11-19');
  tasks.moveOccurrence(manual.id, '2026-11-15', '2026-11-17');
  tasks.updateOccurrence(manual.id, '2026-11-17', true);

  assert.deepEqual(tasks.list({ agendaDate: '2026-11-19' }), [
    old, tasks.get(manual.id, '2026-11-17'), tasks.get(weekly.id, '2026-11-19'), future,
  ]);
  assert.deepEqual(tasks.list({ agendaDate: '2026-11-20' }), [
    old, tasks.get(manual.id, '2026-11-17'), tasks.get(weekly.id, '2026-11-25'), future,
  ]);
});

test('the task agenda respects date limits and moves before a series start', (t) => {
  const { tasks } = fixture(t);
  const first = tasks.create({ date: '0001-01-01', title: 'Начало', recurrence: { frequency: 'custom' } });
  const last = tasks.create({ date: '9999-12-31', title: 'Конец', recurrence: { frequency: 'weekly' } });
  tasks.moveOccurrence(last.id, '9999-12-31', '9999-12-30');

  for (const agendaDate of ['0001-01-01', '9999-12-31']) {
    assert.deepEqual(tasks.list({ agendaDate }), [tasks.get(first.id, '0001-01-01'), tasks.get(last.id, '9999-12-30')]);
  }
});

test('a task month returns all effective occurrences and reflects moves across months', (t) => {
  const { tasks } = fixture(t);
  const series = tasks.create({ date: '2028-01-31', title: 'Проверка', recurrence: { frequency: 'monthly' } });
  const oneTime = tasks.create({ date: '2028-02-29', title: 'Отчёт' });
  tasks.moveOccurrence(series.id, '2028-01-31', '2028-02-02');
  tasks.updateOccurrence(series.id, '2028-02-02', true);
  tasks.moveOccurrence(series.id, '2028-02-29', '2028-03-01');

  assert.deepEqual(tasks.list({ month: '2028-02' }), [tasks.get(series.id, '2028-02-02'), oneTime]);
  assert.deepEqual(tasks.list({ month: '9999-12' }), [tasks.get(series.id, '9999-12-31')]);
});

test('task agenda and month queries require a valid and unambiguous date selection', (t) => {
  const { tasks } = fixture(t);
  for (const request of [
    { agendaDate: null }, { agendaDate: '2028-02-30' }, { month: '2028-2' }, { month: ['2028-02'] }, { month: '0000-01' },
    { agendaDate: '2028-02-29', month: '2028-02' }, { month: '2028-02', from: '2028-02-01' }, { agendaDate: '2028-02-29', to: '' },
  ]) assert.throws(() => tasks.list(request), { code: 'VALIDATION' });
});

test('recurring task updates save completion only for the selected date', (t) => {
  const { connection, tasks } = fixture(t);
  const series = tasks.create({ date: '2026-01-01', recurrence: { frequency: 'monthly', dayOfMonth: 31 }, title: 'Отчёт' });
  const first = '2026-01-31';
  const second = '2026-02-28';
  tasks.update(series.id, { title: 'Месячный отчёт' }, { date: first, completed: true });
  assert.equal(tasks.get(series.id, first).completed, true);
  assert.equal(tasks.get(series.id, second).completed, false);
  assert.equal(tasks.get(series.id, second).title, 'Месячный отчёт');

  assert.throws(() => tasks.update(series.id, { title: 'Новый заголовок' }, { date: '2026-03-30', completed: true }));
  assert.equal(tasks.get(series.id).title, 'Месячный отчёт');
  tasks.updateOccurrence(series.id, first, true);
  assert.equal(connection.prepare('SELECT COUNT(*) AS count FROM calendar_task_completions').get().count, 1);
  tasks.updateOccurrence(series.id, first, false);
  assert.equal(tasks.get(series.id, first).completed, false);
});

test('quarterly, yearly and manually selected dates use the same occurrence query', (t) => {
  const { tasks } = fixture(t);
  const date = '2026-11-16';
  const quarterly = tasks.create({ date, title: 'Квартал', recurrence: { frequency: 'quarterly', dayOfMonth: 31 } });
  const yearly = tasks.create({ date, title: 'Год', recurrence: { frequency: 'yearly', monthOfYear: 2, dayOfMonth: 29 } });
  const custom = tasks.create({ date, title: 'Даты', recurrence: { frequency: 'custom', customDates: ['2026-12-02', date, '2026-12-02'] } });
  assert.deepEqual(custom.recurrence.customDates, ['2026-12-02']);
  assert.deepEqual(tasks.occurrences({ from: date, to: '2027-02-28' }).map(({ id, date }) => [id, date]), [
    [custom.id, '2026-11-16'], [quarterly.id, '2026-11-30'], [custom.id, '2026-12-02'],
    [quarterly.id, '2027-02-28'], [yearly.id, '2027-02-28'],
  ]);
  assert.throws(() => tasks.update(custom.id, { recurrence: { frequency: 'custom', customDates: ['2026-11-15'] } }));
});

test('converting a completed one-time task preserves its completed date only', (t) => {
  const { tasks } = fixture(t);
  const date = '2026-11-16';
  const original = tasks.create({ date, title: 'Проверка', completed: true });
  tasks.update(original.id, { recurrence: { frequency: 'weekly' } });
  assert.equal(tasks.get(original.id, date).completed, true);
  assert.equal(tasks.get(original.id, '2026-11-23').completed, false);
  const cleared = tasks.update(original.id, { recurrence: { frequency: '' }, completed: false });
  assert.equal(cleared.recurrence, undefined);
  assert.equal(cleared.completed, false);
  tasks.update(original.id, { recurrence: { frequency: 'weekly' } });
  assert.equal(tasks.get(original.id, date).completed, false);
});

test('moving an occurrence keeps its completion and leaves the rest of the series scheduled', (t) => {
  const { connection, tasks } = fixture(t);
  const anchor = '2026-11-16';
  const originalDate = '2026-11-23';
  const date = '2026-11-18';
  const series = tasks.create({ date: anchor, recurrence: { frequency: 'weekly' }, title: 'Проверка' });
  tasks.updateOccurrence(series.id, originalDate, true);

  assert.deepEqual(tasks.moveOccurrence(series.id, originalDate, date), {
    ...series, date, seriesDate: anchor, originalDate, completed: true,
  });
  assert.equal(tasks.get(series.id, originalDate), null);
  assert.deepEqual(tasks.occurrences({ from: anchor, to: '2026-11-30' })
    .map(({ date, completed }) => [date, completed]), [[anchor, false], [date, true], ['2026-11-30', false]]);
  assert.equal(tasks.occurrences({ from: date, to: date })[0].completed, true);
  assert.throws(() => tasks.updateOccurrence(series.id, originalDate, false), /На эту дату/);
  const edited = tasks.update(series.id, { title: 'Новый заголовок' }, { date, completed: false });
  assert.equal(edited.title, 'Новый заголовок');
  assert.equal(edited.originalDate, originalDate);
  assert.equal(edited.completed, false);
  tasks.updateOccurrence(series.id, date, true);

  const secondDate = '2026-12-02';
  assert.equal(tasks.moveOccurrence(series.id, date, secondDate).originalDate, originalDate);
  assert.equal(tasks.get(series.id, date), null);
  const restored = tasks.moveOccurrence(series.id, secondDate, originalDate);
  assert.equal(restored.originalDate, undefined);
  assert.equal(restored.completed, true);
  assert.equal(tasks.get(series.id, secondDate), null);
  assert.deepEqual(tasks.occurrenceMoves(), []);
  assert.equal(connection.prepare('SELECT date FROM calendar_task_completions').get().date, originalDate);
});

test('moved dates may precede the series or replace another date only after it is vacated', (t) => {
  const { tasks } = fixture(t);
  const anchor = '2026-11-16';
  const originalDate = '2026-11-23';
  const movedDate = '2026-11-01';
  const series = tasks.create({ date: anchor, recurrence: { frequency: 'weekly' }, title: 'Проверка' });
  const oneTime = tasks.create({ date: originalDate, title: 'Задача' });
  assert.throws(() => tasks.moveOccurrence(series.id, originalDate, anchor), /уже запланировано/);
  assert.throws(() => tasks.moveOccurrence(oneTime.id, originalDate, movedDate), /повторяющейся/);
  assert.equal(tasks.moveOccurrence(series.id, originalDate, originalDate).date, originalDate);
  assert.deepEqual(tasks.occurrenceMoves(), []);

  tasks.moveOccurrence(series.id, anchor, movedDate);
  tasks.moveOccurrence(series.id, originalDate, anchor);
  assert.equal(tasks.get(series.id, anchor).originalDate, originalDate);
  assert.equal(tasks.get(series.id, originalDate), null);
  assert.throws(() => tasks.moveOccurrence(series.id, movedDate, anchor), /уже запланировано/);
  assert.deepEqual(tasks.occurrenceMoves(), [
    { taskId: series.id, originalDate: anchor, date: movedDate },
    { taskId: series.id, originalDate, date: anchor },
  ]);
  assert.deepEqual(tasks.occurrences({ from: movedDate, to: movedDate })
    .map(({ id, date }) => [id, date]), [[series.id, movedDate]]);
  assert.deepEqual(tasks.occurrences({ from: anchor, to: originalDate })
    .map(({ id, date }) => [id, date]), [[series.id, anchor], [oneTime.id, originalDate]]);
});

test('editing the schedule preserves valid moves, removes obsolete ones and rejects new collisions', (t) => {
  const { tasks } = fixture(t);
  const date = '2026-11-16';
  const originalDate = '2026-11-23';
  const targetDate = '2026-11-25';
  const series = tasks.create({ date, recurrence: { frequency: 'weekly' }, title: 'Проверка' });
  tasks.moveOccurrence(series.id, originalDate, targetDate);
  tasks.update(series.id, { recurrence: { frequency: 'custom', customDates: [originalDate] } });
  assert.equal(tasks.get(series.id, targetDate).originalDate, originalDate);

  assert.throws(() => tasks.update(series.id, {
    title: 'Новый заголовок', recurrence: { frequency: 'custom', customDates: [originalDate, targetDate] },
  }), /на дату переноса/);
  assert.equal(tasks.get(series.id).title, 'Проверка');
  assert.equal(tasks.get(series.id, targetDate).originalDate, originalDate);

  // The Wednesday becomes a new scheduled occurrence in place of the old moved Monday.
  const newSchedule = { recurrence: { frequency: 'weekly', dayOfWeek: 3 } };
  assert.throws(() => tasks.update(series.id, newSchedule, { date: targetDate, completed: true }), { code: 'VALIDATION' });
  assert.equal(tasks.get(series.id, targetDate).originalDate, originalDate);
  tasks.update(series.id, newSchedule);
  assert.deepEqual(tasks.occurrenceMoves(), []);
  assert.equal(tasks.get(series.id, targetDate).originalDate, undefined);
  assert.equal(tasks.get(series.id, targetDate).completed, false);
});
