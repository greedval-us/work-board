import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatFileSize } from '../../src/renderer/presentation/formatters.js';
import { getTaskPriorityPresentation } from '../../src/renderer/presentation/taskPriorities.js';
import { presentCalendarRecords } from '../../src/renderer/presentation/calendarRecords.js';

test('attachment size labels switch at binary unit boundaries and retain the one-decimal display', () => {
  for (const [bytes, label] of [[0, '0 Б'], [1023, '1023 Б'], [1024, '1 КБ'], [1536, '1,5 КБ'], [1048575, '1 024 КБ'], [1048576, '1 МБ'], [1572864, '1,5 МБ']]) {
    assert.equal(formatFileSize(bytes), label);
  }
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
