import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTaskPriorityPresentation } from '../../src/renderer/features/calendar/taskPriorities.js';
import { calendarDayUrgency, presentCalendarCheckpoints, presentCalendarRecords } from '../../src/renderer/features/calendar/calendarRecords.js';

test('a month colors past days with pending plan or registry controls, respecting completed parents and the planning switch', () => {
  const today = '2026-11-26';
  const base = { date: '2026-11-25', controls: 0, checkpoints: 0, plans: 0, planCheckpoints: 2, inactivePlanCheckpoints: 1 };
  assert.equal(calendarDayUrgency(base, today, true).overduePlans, 1);
  assert.equal(calendarDayUrgency(base, today, true).urgency.tone, 'danger');
  assert.equal(calendarDayUrgency(base, today, false).urgency, null);
  assert.equal(calendarDayUrgency({ ...base, date: today }, today, true).overduePlans, 0);
  assert.equal(calendarDayUrgency({ ...base, inactivePlanCheckpoints: 2 }, today, true).urgency, null);
  assert.equal(calendarDayUrgency({ ...base, plans: 2 }, today, true).overduePlans, 3);
  assert.equal(calendarDayUrgency({ ...base, checkpoints: 1, inactiveCheckpoints: 1 }, today, false).urgency, null);
  assert.equal(calendarDayUrgency({ ...base, controls: 1 }, today, false).urgency.tone, 'danger');
});

test('task priority presentation shares labels and preserves the normal-tone chart override', () => {
  assert.deepEqual(getTaskPriorityPresentation('normal'), { label: 'Обычная', tone: 'info' });
  assert.deepEqual(getTaskPriorityPresentation('normal', 'accent'), { label: 'Обычная', tone: 'accent' });
  assert.deepEqual(getTaskPriorityPresentation('important', 'accent'), { label: 'Важная', tone: 'warning' });
  assert.deepEqual(getTaskPriorityPresentation('urgent'), { label: 'Срочная', tone: 'danger' });
});

test('calendar labels retain useful status and priority details without repeating urgency labels', () => {
  const records = presentCalendarRecords([
    { id: 1, deadline: '2026-10-25', status: 'pending' },
    { id: 2, deadline: '2026-10-27', status: 'in_progress' },
    { id: 3, deadline: '2026-12-01', status: 'in_progress' },
    { id: 4, deadline: '2026-10-25', status: 'completed' },
  ], [
    { id: 1, date: '2026-10-25', priority: 'urgent', completed: false },
    { id: 2, date: '2026-10-27', priority: 'important', completed: false },
    { id: 3, date: '2026-10-25', priority: 'urgent', completed: true },
  ], '2026-10-26');
  assert.deepEqual(records.instructions.map(row => [row.urgency.label, row.secondaryLabel]), [
    ['Просрочено', 'На контроле'], ['Срок в ближайшие 3 дня', 'В работе'], ['В работе', ''], ['Исполнено', ''],
  ]);
  assert.deepEqual(records.tasks.map(row => [row.urgency.label, row.secondaryLabel]), [['Просрочено', 'Срочная'], ['Важная', ''], ['Выполнено', '']]);
  assert.deepEqual(records.counts, { activeControls: 3, completedControls: 1, activeTasks: 2, completedTasks: 1 });
});

test('checkpoint marks take precedence over date urgency, including historical checkpoints', () => {
  const { rows, open, marked } = presentCalendarCheckpoints([
    { date: '2026-10-24', mark: 'Доклад получен', scheduled: false },
    { date: '2026-10-25', mark: '', scheduled: true },
    { date: '2026-10-26', mark: '', scheduled: true },
    { date: '2026-11-05', mark: '', scheduled: true },
    { date: '2026-10-24', mark: '', scheduled: true, recordCompleted: true, planId: 1 },
  ], '2026-10-26');
  assert.deepEqual(rows.map(({ urgency }) => urgency), [
    { tone: 'success', label: 'Есть отметка' },
    { tone: 'danger', label: 'Просрочено' },
    { tone: 'warning', label: 'Срок сегодня' },
    { tone: 'info', label: 'По графику' },
    { tone: 'success', label: 'Пункт плана исполнен' },
  ]);
  assert.equal(rows[0].scheduled, false);
  assert.equal(rows[0].mark, 'Доклад получен');
  assert.equal(open, 4);
  assert.equal(marked, 1);
});

test('checkpoint labels distinguish a different execution date without moving the planned date', () => {
  const { rows, open, marked } = presentCalendarCheckpoints([
    { date: '2026-11-02', actualDate: '2026-10-28', mark: 'Доклад получен', scheduled: true },
    { date: '2026-11-03', actualDate: '2026-11-03', mark: 'В срок', scheduled: true },
    { date: '2026-11-04', mark: 'Старая отметка', scheduled: false },
  ], '2026-11-05');
  assert.deepEqual(rows.map(({ date, urgency }) => [date, urgency]), [
    ['2026-11-02', { tone: 'success', label: 'Исполнено 28.10.2026' }],
    ['2026-11-03', { tone: 'success', label: 'Есть отметка' }],
    ['2026-11-04', { tone: 'success', label: 'Есть отметка' }],
  ]);
  assert.equal(open, 0);
  assert.equal(marked, 3);
});
