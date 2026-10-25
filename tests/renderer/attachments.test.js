import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectScope, shallowRef } from 'vue';
import { useAttachmentDraft } from '../../src/renderer/composables/useAttachmentDraft.js';
import { useTaskEditor } from '../../src/renderer/components/calendar/useTaskEditor.js';
import { DesktopError } from '../../src/shared/errors.js';
import * as attachments from '../../src/renderer/domain/attachments.js';

test('attachment edits keep saved removals and new selections independent', () => {
  const changes = { add: [{ token: 'a', name: 'A' }], remove: [4] };
  const added = attachments.appendAttachmentSelections(changes, [{ token: 'b', name: 'B' }]);
  assert.deepEqual(attachments.toggleAttachmentRemoval(added, { token: 'a' }), { add: [{ token: 'b', name: 'B' }], remove: [4] });
  assert.deepEqual(attachments.toggleAttachmentRemoval(changes, { id: 4 }), { add: [{ token: 'a', name: 'A' }], remove: [] });
  assert.deepEqual(attachments.toggleAttachmentRemoval(changes, { id: 8 }), { add: [{ token: 'a', name: 'A' }], remove: [4, 8] });
  assert.deepEqual(changes, { add: [{ token: 'a', name: 'A' }], remove: [4] });
});

test('attachment rows mark saved removals and append pending selections without changing source records', () => {
  const files = [{ id: 4, name: 'Saved' }, { id: 8, name: 'Kept' }];
  assert.deepEqual(attachments.attachmentRows(files, { add: [{ token: 'new', name: 'New' }], remove: [4] }), [
    { id: 4, name: 'Saved', removed: true }, { id: 8, name: 'Kept', removed: false }, { token: 'new', name: 'New' },
  ]);
  assert.equal(Object.hasOwn(files[0], 'removed'), false);
});

test('attachment draft selections and removals stay local until the task is saved', async t => {
  let payload;
  const editor = useTaskEditor({ task: { id: 1, title: 'Task', date: '2026-10-26' }, generation: 4, saveTask: async (_id, data) => { payload = structuredClone(data); } });
  const changes = shallowRef(editor.draft.attachments);
  const app = { database: { ready: true, generation: 4 }, withOperation: fn => fn() };
  const scope = effectScope(); t.after(() => scope.stop());
  const draft = scope.run(() => useAttachmentDraft({ entityType: 'tasks', entityId: null, generation: 4 }, changes, { app, service: {
    pick: async () => ({ files: [{ token: 'selection', name: 'file.txt', size: 10 }] }),
  } }));
  await draft.pick(); assert.equal(changes.value.add[0].name, 'file.txt'); assert.equal(payload, undefined);
  editor.draft.attachments = changes.value; assert.equal(editor.dirty.value, true);
  assert.equal(await editor.save(), true); assert.equal(payload.attachments.add[0].token, 'selection');
  draft.toggleRemove(changes.value.add[0]); assert.deepEqual(changes.value.add, []);
});

test('a failed save retains selected files and marked removals for retry', async () => {
  const editor = useTaskEditor({ task: null, date: '2026-10-26', generation: 1, saveTask: async () => { throw new DesktopError('PERMISSION_DENIED'); } });
  editor.draft.title = 'Task'; editor.draft.attachments.add.push({ token: 'selection', name: 'file.txt', size: 10 });
  editor.draft.attachments.remove.push(2);
  assert.equal(await editor.save(), false); assert.equal(editor.draft.attachments.add.length, 1); assert.deepEqual([...editor.draft.attachments.remove], [2]);
});
