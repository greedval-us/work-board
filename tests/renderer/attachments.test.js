import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectScope, nextTick, reactive, shallowRef } from 'vue';
import { useAttachmentDraft } from '../../src/renderer/composables/useAttachmentDraft.js';
import { useTaskEditor } from '../../src/renderer/components/calendar/useTaskEditor.js';
import { DesktopError } from '../../src/shared/errors.js';
import * as attachments from '../../src/renderer/domain/attachments.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function attachmentFixture(t, service = {}) {
  const props = reactive({ entityType: 'tasks', entityId: null, generation: 4 });
  const changes = shallowRef({ add: [], remove: [] });
  const app = reactive({ database: { ready: true, generation: 4 }, withOperation: fn => fn() });
  const released = [];
  const scope = effectScope();
  const draft = scope.run(() => useAttachmentDraft(props, changes, { app, service: {
    list: async () => [],
    release: async request => { released.push(request); },
    ...service,
  } }));
  t.after(() => scope.stop());
  return { app, props, changes, released, scope, draft };
}

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

test('a picker finishing after disposal releases its tokens with the original owner', async t => {
  const selection = deferred();
  const state = attachmentFixture(t, { pick: () => selection.promise });
  const picking = state.draft.pick();
  state.scope.stop();
  selection.resolve({ cancelled: false, files: [{ token: 'late', name: 'file.txt', size: 10 }] });
  await picking;
  assert.deepEqual(state.changes.value, { add: [], remove: [] });
  assert.deepEqual(state.released, [{ entityType: 'tasks', entityId: null, generation: 4, tokens: ['late'] }]);
});

test('a late picker cannot attach tokens to a replacement owner', async t => {
  const selection = deferred();
  const state = attachmentFixture(t, { pick: () => selection.promise });
  const picking = state.draft.pick();
  Object.assign(state.props, { entityType: 'instructions', entityId: 7 });
  await nextTick();
  selection.resolve({ cancelled: false, files: [{ token: 'old-owner', name: 'file.txt', size: 10 }] });
  await picking;
  state.scope.stop();
  assert.deepEqual(state.changes.value, { add: [], remove: [] });
  assert.deepEqual(state.released, [{ entityType: 'tasks', entityId: null, generation: 4, tokens: ['old-owner'] }]);
});

test('returning to the original owner does not revive an abandoned picker', async t => {
  const selection = deferred();
  const state = attachmentFixture(t, { pick: () => selection.promise });
  const picking = state.draft.pick();
  state.props.entityId = 7;
  state.props.entityId = null;
  selection.resolve({ cancelled: false, files: [{ token: 'abandoned', name: 'file.txt', size: 10 }] });
  await picking;
  assert.deepEqual(state.changes.value.add, []);
  assert.deepEqual(state.released, [{ entityType: 'tasks', entityId: null, generation: 4, tokens: ['abandoned'] }]);
});

test('changing owner releases accepted selections once without consuming the next draft', async t => {
  let picks = 0;
  const state = attachmentFixture(t, { pick: async () => ({ cancelled: false, files: [{ token: `pick-${++picks}`, name: 'file.txt', size: 10 }] }) });
  await state.draft.pick();
  Object.assign(state.props, { entityType: 'instructions', entityId: 7 });
  await nextTick();
  assert.deepEqual(state.changes.value.add, []);
  await state.draft.pick();
  assert.deepEqual(state.changes.value.add.map(file => file.token), ['pick-2']);
  state.scope.stop();
  assert.deepEqual(state.released, [
    { entityType: 'tasks', entityId: null, generation: 4, tokens: ['pick-1'] },
    { entityType: 'instructions', entityId: 7, generation: 4, tokens: ['pick-2'] },
  ]);
});

test('replacing the draft before its owner changes still releases only the old owned tokens', async t => {
  const state = attachmentFixture(t, { pick: async () => ({ cancelled: false, files: [{ token: 'owned', name: 'old.txt', size: 10 }] }) });
  await state.draft.pick();
  const replacement = { token: 'replacement', name: 'new.txt', size: 20 };
  state.changes.value = { add: [replacement], remove: [9] };
  state.props.entityType = 'instructions';
  assert.deepEqual(state.changes.value, { add: [replacement], remove: [9] });
  assert.deepEqual(state.released, [{ entityType: 'tasks', entityId: null, generation: 4, tokens: ['owned'] }]);
});

test('a failed old-owner picker cannot overwrite the replacement owner error', async t => {
  const selection = deferred();
  const state = attachmentFixture(t, {
    pick: () => selection.promise,
    list: async () => { throw new DesktopError('NOT_FOUND', 'Текущая запись не найдена.'); },
  });
  const picking = state.draft.pick();
  state.props.entityId = 7;
  await state.draft.load();
  selection.reject(new Error('private picker failure'));
  await picking;
  assert.equal(state.draft.error.value, 'Текущая запись не найдена.');
  assert.equal(state.draft.busy.value, false);
});

test('late tokens from a replaced generation are neither accepted nor released against the new database', async t => {
  const selection = deferred();
  const state = attachmentFixture(t, { pick: () => selection.promise });
  const picking = state.draft.pick();
  state.app.database.generation = 5;
  state.props.generation = 5;
  await nextTick();
  selection.resolve({ cancelled: false, files: [{ token: 'old-database', name: 'file.txt', size: 10 }] });
  await picking;
  assert.deepEqual(state.changes.value.add, []);
  assert.deepEqual(state.released, []);
});

test('refreshing the same owner while choosing files keeps the selected tokens', async t => {
  const selection = deferred();
  const state = attachmentFixture(t, { pick: () => selection.promise });
  const picking = state.draft.pick();
  await state.draft.load();
  selection.resolve({ cancelled: false, files: [{ token: 'current', name: 'file.txt', size: 10 }] });
  await picking;
  assert.deepEqual(state.changes.value.add.map(file => file.token), ['current']);
  assert.deepEqual(state.released, []);
});

test('synchronous and asynchronous cleanup failures do not prevent removing a local selection', async t => {
  for (const release of [
    () => { throw new Error('private cleanup failure'); },
    async () => { throw new Error('private cleanup failure'); },
  ]) {
    const state = attachmentFixture(t, {
      pick: async () => ({ cancelled: false, files: [{ token: 'remove', name: 'file.txt', size: 10 }] }),
      release,
    });
    await state.draft.pick();
    assert.doesNotThrow(() => state.draft.toggleRemove(state.changes.value.add[0]));
    await nextTick();
    assert.deepEqual(state.changes.value.add, []);
    assert.equal(state.draft.error.value, '');
    assert.doesNotThrow(() => state.scope.stop());
  }
});
