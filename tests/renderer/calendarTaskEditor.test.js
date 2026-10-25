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
  assert.equal(saved.generation, 4);
  assert.equal(saved.data.title, 'Подготовить доклад');
  assert.equal(saved.data.completed, false);
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
