import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useTaskEditor } from '../../src/renderer/components/calendar/useTaskEditor.js';
import { DesktopError } from '../../src/shared/errors.js';

test('task save failures retain the edited fields for another attempt', async () => {
  let fail = true;
  let saved;
  const editor = useTaskEditor({
    task: null, date: '2026-10-23', generation: 4,
    saveTask: async (id, data, generation) => {
      if (fail) throw new DesktopError('DATABASE_UNAVAILABLE', 'Не удалось записать файл.');
      saved = { id, data, generation };
    },
  });
  editor.draft.title = 'Подготовить доклад';
  editor.draft.description = 'Сохранённый в форме текст';
  assert.equal(editor.dirty.value, true);
  assert.equal(await editor.save(), false);
  assert.match(editor.error.value, /записать/);
  assert.equal(editor.draft.description, 'Сохранённый в форме текст');
  assert.equal(editor.busy.value, false);
  fail = false;
  assert.equal(await editor.save(), true);
  assert.deepEqual(saved, {
    id: null,
    generation: 4,
    data: { title: 'Подготовить доклад', date: '2026-10-23', description: 'Сохранённый в форме текст', priority: 'normal', completed: false },
  });
});

test('invalid task form cannot reach persistence and stays editable', async () => {
  let writes = 0;
  const editor = useTaskEditor({ task: null, date: '2026-10-23', generation: 1, saveTask: async () => { writes += 1; } });
  editor.draft.title = '   ';
  assert.equal(await editor.save(), false);
  assert.equal(writes, 0);
  assert.match(editor.error.value, /Название/);
  assert.equal(editor.draft.title, '   ');
});

test('existing task edits and deletion remain attached to their source database', async () => {
  let removed;
  const editor = useTaskEditor({
    task: { id: 10, title: 'Контроль', date: '2026-10-23', description: '', priority: 'urgent', completed: true },
    date: '2026-10-23', generation: 6,
    removeTask: async (id, generation) => { removed = { id, generation }; },
  });
  assert.equal(editor.dirty.value, false);
  editor.draft.completed = false;
  assert.equal(editor.dirty.value, true);
  assert.equal(await editor.remove(), true);
  assert.deepEqual(removed, { id: 10, generation: 6 });
});

test('failed task deletion reports the failed action and preserves the editable draft', async () => {
  const editor = useTaskEditor({
    task: { id: 10, title: 'Контроль', date: '2026-10-23', description: '', priority: 'urgent', completed: true },
    generation: 6,
    removeTask: async () => { throw new Error('private SQLite failure'); },
  });
  editor.draft.description = 'Несохранённый текст';
  assert.equal(await editor.remove(), false);
  assert.match(editor.error.value, /удалить задачу/i);
  assert.doesNotMatch(editor.error.value, /private|SQLite/);
  assert.equal(editor.draft.description, 'Несохранённый текст');
  assert.equal(editor.dirty.value, true);
  assert.equal(editor.busy.value, false);
});

test('editing a moved recurring task keeps the series start and sends completion for its effective date', async () => {
  let saved;
  const editor = useTaskEditor({
    task: { id: 10, title: 'Еженедельный отчёт', date: '2026-11-18', originalDate: '2026-11-17', seriesDate: '2026-11-10',
      recurrence: { frequency: 'weekly', dayOfWeek: 2 }, completed: false },
    date: '2026-11-18', generation: 6,
    saveTask: async (id, data, generation, occurrence) => { saved = { id, data, generation, occurrence }; },
  });
  assert.equal(editor.draft.date, '2026-11-10');
  assert.equal(editor.dirty.value, false);
  editor.occurrenceCompleted.value = true;
  assert.equal(editor.dirty.value, true);
  assert.equal(await editor.save(), true);
  assert.deepEqual(saved, {
    id: 10, generation: 6,
    data: { title: 'Еженедельный отчёт', date: '2026-11-10', description: '', priority: 'normal', completed: false,
      recurrence: { frequency: 'weekly', dayOfWeek: 2 } },
    occurrence: { date: '2026-11-18', completed: true },
  });
});

test('changing repeat rules discards unrelated selectors and clearing repeat is explicit', async () => {
  const writes = [];
  const editor = useTaskEditor({
    task: { id: 10, title: 'Задача', date: '2026-11-17', seriesDate: '2026-11-10',
      recurrence: { frequency: 'weekly', dayOfWeek: 2 } },
    date: '2026-11-17', generation: 6,
    saveTask: async (_id, data, _generation, occurrence) => { writes.push({ data, occurrence }); },
  });
  editor.draft.recurrence.frequency = 'yearly';
  editor.draft.recurrence.monthOfYear = 12;
  editor.draft.recurrence.dayOfMonth = 25;
  assert.equal(await editor.save(), true);
  assert.deepEqual(writes[0].data.recurrence, { frequency: 'yearly', monthOfYear: 12, dayOfMonth: 25 });
  assert.equal(writes[0].occurrence, undefined);
  editor.draft.recurrence.frequency = '';
  assert.equal(await editor.save(), true);
  assert.deepEqual(writes[1].data.recurrence, { frequency: '' });
});

test('moving a previously moved occurrence binds its effective date and blocks unsaved edits', async () => {
  const calls = [];
  let fail = true;
  const editor = useTaskEditor({
    task: { id: 10, title: 'Задача', date: '2026-11-18', originalDate: '2026-11-17',
      seriesDate: '2026-11-10', recurrence: { frequency: 'weekly' } },
    generation: 6,
    moveTaskOccurrence: async (...args) => {
      calls.push(args);
      if (fail) throw new DesktopError('VALIDATION', 'Выбранная дата занята.');
    },
  });
  assert.equal(editor.movableOccurrence, true);
  editor.draft.title = 'Изменение';
  assert.equal(await editor.moveOccurrence('2026-11-17'), false);
  assert.deepEqual(calls, []);
  editor.draft.title = 'Задача';
  assert.equal(await editor.moveOccurrence('2026-11-17'), false);
  assert.match(editor.error.value, /дата занята/);
  assert.equal(editor.busy.value, false);
  fail = false;
  assert.equal(await editor.moveOccurrence('2026-11-17'), true);
  assert.deepEqual(calls, [[10, '2026-11-18', '2026-11-17', 6], [10, '2026-11-18', '2026-11-17', 6]]);
});
