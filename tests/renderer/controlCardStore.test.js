import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { reactive } from 'vue';
import { DesktopError, ERROR_CODES } from '../../src/shared/errors.js';
import { useAppStore } from '../../src/renderer/stores/appStore.js';
import { createControlCardStore } from '../../src/renderer/stores/controlCardStore.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(t, exportControlCard) {
  const pinia = createPinia();
  const app = useAppStore(pinia);
  app.database = { ready: true, generation: 7 };
  const store = createControlCardStore({ app, service: { exportControlCard } })(pinia);
  t.after(() => disposePinia(pinia));
  return { app, store };
}

function draft() {
  const defaults = { instructionNumber: '001', title: 'Сохранённый текст', deadline: '2026-11-12', department: 'Архив', executorPhone: '123' };
  return { id: 42, generation: 7, defaults, fields: reactive({ ...defaults, title: '  Текст отчёта  ', department: '' }) };
}

test('export sends a plain normalized snapshot without changing the report draft or data revision', async t => {
  let sent;
  const { app, store } = setup(t, async request => {
    sent = structuredClone(request);
    assert.equal(app.pendingOperations, 1);
    return { cancelled: false };
  });
  const input = draft();
  assert.equal(await store.exportCard(input), true);
  assert.deepEqual(sent, {
    id: 42, generation: 7,
    fields: { instructionNumber: '001', title: 'Текст отчёта', deadline: '2026-11-12', department: '', executorPhone: '123' },
  });
  assert.equal(input.fields.title, '  Текст отчёта  ');
  assert.equal(input.fields.department, '');
  assert.equal(app.revision, 0);
  assert.equal(app.pendingOperations, 0);
  assert.equal(store.exporting, false);
  assert.match(store.notice, /сохранена/);
  assert.equal(store.error, '');
});

test('duplicate submissions share one pending operation and cancellation preserves the editable draft', async t => {
  const result = deferred();
  let calls = 0;
  const { app, store } = setup(t, () => { calls++; return result.promise; });
  const input = draft();
  const saving = store.exportCard(input);
  assert.equal(store.exporting, true);
  assert.equal(app.pendingOperations, 1);
  assert.equal(await store.exportCard(input), false);
  assert.equal(calls, 1);
  assert.equal(app.pendingOperations, 1);
  result.resolve({ cancelled: true });
  assert.equal(await saving, false);
  assert.equal(store.exporting, false);
  assert.equal(app.pendingOperations, 0);
  assert.equal(store.notice, '');
  assert.equal(store.error, '');
  assert.equal(input.fields.title, '  Текст отчёта  ');
  assert.equal(input.fields.department, '');
});

test('failed exports show safe feedback and release guards for retry without clearing the draft', async t => {
  let fail = true;
  const { app, store } = setup(t, async () => {
    if (fail) throw new Error('SELECT secret FROM C:/private/customer.sqlite');
    return { cancelled: false };
  });
  const input = draft();
  assert.equal(await store.exportCard(input), false);
  assert.match(store.error, /Не удалось сохранить/);
  assert.doesNotMatch(store.error, /secret|private|customer/);
  assert.equal(store.exporting, false);
  assert.equal(app.pendingOperations, 0);
  assert.equal(input.fields.title, '  Текст отчёта  ');
  fail = false;
  assert.equal(await store.exportCard(input), true);
  assert.equal(store.error, '');
  assert.match(store.notice, /сохранена/);
});

test('trusted desktop errors remain readable and replace an earlier success notice', async t => {
  let fail = false;
  const { app, store } = setup(t, async () => {
    if (fail) throw new DesktopError(ERROR_CODES.PERMISSION_DENIED);
    return { cancelled: false };
  });
  assert.equal(await store.exportCard(draft()), true);
  fail = true;
  assert.equal(await store.exportCard(draft()), false);
  assert.match(store.error, /Нет доступа/);
  assert.equal(store.notice, '');
  assert.equal(app.pendingOperations, 0);
});

test('invalid report fields do not start desktop work and retain the invalid draft for correction', async t => {
  let calls = 0;
  const { app, store } = setup(t, async () => { calls++; return { cancelled: false }; });
  const input = draft();
  input.fields.deadline = '2026-02-31';
  assert.equal(await store.exportCard(input), false);
  assert.equal(calls, 0);
  assert.match(store.error, /дат/);
  assert.equal(input.fields.deadline, '2026-02-31');
  assert.equal(app.pendingOperations, 0);
  assert.equal(store.exporting, false);
});

test('a report cannot silently rebind its source record to the newly selected database', async t => {
  let calls = 0;
  const { app, store } = setup(t, async () => { calls++; return { cancelled: false }; });
  app.database = { ready: true, generation: 8 };
  assert.equal(await store.exportCard(draft()), false);
  assert.equal(calls, 0);
  assert.match(store.error, /база изменилась/);
  assert.equal(app.pendingOperations, 0);
  assert.equal(store.exporting, false);
});

test('database selection blocks exports through the application guard and allows a later retry', async t => {
  let calls = 0;
  const { app, store } = setup(t, async () => { calls++; return { cancelled: false }; });
  app.databaseSwitching = true;
  assert.equal(await store.exportCard(draft()), false);
  assert.equal(calls, 0);
  assert.match(store.error, /Дождитесь/);
  assert.equal(app.pendingOperations, 0);
  assert.equal(store.exporting, false);
  app.databaseSwitching = false;
  assert.equal(await store.exportCard(draft()), true);
});

test('changing databases discards late export feedback while releasing the pending operation', async t => {
  const result = deferred();
  const { app, store } = setup(t, () => result.promise);
  const saving = store.exportCard(draft());
  app.database = { ready: true, generation: 8 };
  result.resolve({ cancelled: false });
  assert.equal(await saving, false);
  assert.equal(store.notice, '');
  assert.equal(store.error, '');
  assert.equal(store.exporting, false);
  assert.equal(app.pendingOperations, 0);
});

test('a fresh dialog clears old feedback without allowing a second export or accepting late errors', async t => {
  const result = deferred();
  let pending = false;
  let calls = 0;
  const { app, store } = setup(t, () => {
    calls++;
    return pending ? result.promise : { cancelled: false };
  });
  assert.equal(await store.exportCard(draft()), true);
  store.reset();
  assert.equal(store.notice, '');
  pending = true;
  const saving = store.exportCard(draft());
  store.reset();
  assert.equal(store.exporting, true);
  assert.equal(await store.exportCard(draft()), false);
  assert.equal(calls, 2);
  result.reject(new DesktopError(ERROR_CODES.PERMISSION_DENIED));
  assert.equal(await saving, false);
  assert.equal(store.error, '');
  assert.equal(store.notice, '');
  assert.equal(store.exporting, false);
  assert.equal(app.pendingOperations, 0);
});

test('disposing the store suppresses late feedback and still releases the application operation', async t => {
  const result = deferred();
  const { app, store } = setup(t, () => result.promise);
  const saving = store.exportCard(draft());
  store.$dispose();
  result.resolve({ cancelled: false });
  assert.equal(await saving, false);
  assert.equal(store.notice, '');
  assert.equal(store.exporting, false);
  assert.equal(app.pendingOperations, 0);
  assert.equal(await store.exportCard(draft()), false);
});
