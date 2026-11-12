import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinia, disposePinia } from 'pinia';
import { effectScope, reactive } from 'vue';
import { createNotificationsStore } from '../../src/renderer/stores/notificationsStore.js';
import { useNotifications } from '../../src/renderer/composables/useNotifications.js';

const day = '2026-11-12';
const reminder = (overrides = {}) => ({
  id: 'task:1:created', occurrence: `${day}:${day}`, kind: 'task', recordId: 1,
  date: day, title: 'Подготовить отчёт', unread: true, popupPending: true, ...overrides,
});
const snapshot = items => ({ today: day, items });
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
function setup(t, service, options = {}) {
  const app = reactive({ database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    pendingOperations: 0,
    async withOperation(operation) { this.pendingOperations++; try { return await operation(); } finally { this.pendingOperations--; } },
  });
  const pinia = createPinia();
  const store = createNotificationsStore({ getApp: () => app, service, canShowPopup: () => true, ...options })(pinia);
  t.after(() => disposePinia(pinia));
  return { app, store };
}

test('popup acknowledgement keeps reminders unread and does not repeat after refresh', async t => {
  let item = reminder(); const acknowledgements = [];
  const { store } = setup(t, {
    list: async () => snapshot([item]),
    acknowledge: async payload => {
      acknowledgements.push(payload);
      item = { ...item, popupPending: payload.popup ? false : item.popupPending, unread: payload.read ? false : item.unread };
      return snapshot([item]);
    },
  });
  await store.refresh(); await flush();
  assert.equal(store.popup.items.length, 1);
  assert.equal(store.unreadCount, 1);
  assert.equal(acknowledgements[0].popup, true);
  assert.equal(acknowledgements[0].read, undefined);
  store.dismissPopup(); await store.refresh(); await flush();
  assert.equal(store.popup, null);
  assert.equal(acknowledgements.length, 1);
  assert.equal(await store.markAllRead(), true);
  assert.equal(store.unreadCount, 0);
});

test('old database replies and popups never leak into the newly selected database', async t => {
  const pending = deferred();
  const { app, store } = setup(t, { list: ({ generation }) => generation === 1 ? pending.promise : Promise.resolve(snapshot([])) });
  const old = store.refresh(); await flush();
  app.database = { ready: true, generation: 2 };
  await store.refresh();
  pending.resolve(snapshot([reminder()])); await old;
  assert.deepEqual(store.items, []); assert.equal(store.popup, null); assert.equal(store.error, '');
});

test('new daily occurrences alert again but dismissed popups do not repeat after a failed receipt write', async t => {
  let item = reminder(); let writes = 0;
  const { store } = setup(t, {
    list: async () => snapshot([item]),
    acknowledge: async () => { writes++; throw new Error('SQL sensitive detail'); },
  });
  await store.refresh(); await flush();
  assert.match(store.error, /сохранить/i); assert.doesNotMatch(store.error, /SQL/);
  store.dismissPopup(); await store.refresh(); await flush();
  assert.equal(store.popup, null); assert.ok(writes >= 1);
  item = reminder({ occurrence: `${day}:2026-11-13` });
  await store.refresh(); await flush(); assert.equal(store.popup.items[0].occurrence, item.occurrence);
});

test('completion and date changes remove stale entries from an already visible popup', async t => {
  let items = [reminder()];
  const { store } = setup(t, {
    list: async () => snapshot(items),
    acknowledge: async () => snapshot(items.map(item => ({ ...item, popupPending: false }))),
  });
  await store.refresh(); await flush(); assert.ok(store.popup);
  items = []; await store.refresh(); assert.equal(store.popup, null); assert.deepEqual(store.items, []);
});

test('hidden or modal-covered application waits to show and acknowledge a popup', async t => {
  let visible = false; let writes = 0;
  const { store } = setup(t, {
    list: async () => snapshot([reminder()]),
    acknowledge: async () => { writes++; return snapshot([reminder({ popupPending: false })]); },
  }, { canShowPopup: () => visible });
  await store.refresh(); assert.equal(store.popup, null); assert.equal(writes, 0);
  visible = true; await store.refresh(); await flush(); assert.ok(store.popup); assert.equal(writes, 1);
});

test('a read acknowledgement cannot replace newer record data after revision changes', async t => {
  const write = deferred(); let items = [reminder({ popupPending: false })];
  const { app, store } = setup(t, { list: async () => snapshot(items), acknowledge: () => write.promise });
  await store.refresh(); const marked = store.markAllRead(); await flush();
  assert.equal(app.pendingOperations, 1);
  items = []; app.revision++;
  const updated = store.refresh();
  write.resolve(snapshot([reminder({ unread: false, popupPending: false })]));
  await marked; await updated;
  assert.deepEqual(store.items, []); assert.equal(app.pendingOperations, 0);
});

test('a list response from before acknowledgement cannot regain validity during a newer same-revision refresh', async t => {
  const oldRead = deferred(); const newRead = deferred(); let reads = 0;
  const item = reminder({ popupPending: false });
  const { store } = setup(t, {
    list: () => ++reads === 1 ? Promise.resolve(snapshot([item])) : reads === 2 ? oldRead.promise : newRead.promise,
    acknowledge: async () => snapshot([{ ...item, unread: false }]),
  });
  await store.refresh();
  const old = store.refresh(); await flush();
  await store.markAllRead(); assert.equal(store.unreadCount, 0);
  const latest = store.refresh(); await flush();
  oldRead.resolve(snapshot([item])); await old;
  assert.equal(store.unreadCount, 0);
  newRead.resolve(snapshot([{ ...item, unread: false }])); await latest;
  assert.equal(store.unreadCount, 0);
});

test('disposal suppresses late failures and readiness loss clears displayed notifications immediately', async t => {
  const failure = deferred(); let first = true;
  const { app, store } = setup(t, { list: () => first ? Promise.resolve(snapshot([reminder({ popupPending: false })])) : failure.promise });
  await store.refresh(); assert.equal(store.items.length, 1);
  app.databaseSwitching = true; assert.deepEqual(store.items, []);
  app.databaseSwitching = false; first = false;
  const request = store.refresh(); await flush(); store.$dispose();
  failure.reject(new Error('private')); await request; assert.equal(store.error, '');
});

test('refresh lifecycle follows midnight, visibility and focus and releases its listeners', () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget(); documentTarget.visibilityState = 'visible';
  let acquired = 0; let released = 0; let refreshed = 0; let timer;
  const scope = effectScope();
  scope.run(() => useNotifications({
    store: { acquire: () => { acquired++; return () => released++; }, refresh: () => refreshed++ },
    windowTarget, documentTarget, now: () => new Date(2026, 10, 12, 23, 59, 59),
    schedule: (callback, delay) => { timer = { callback, delay }; return timer; }, cancel: () => {},
  }));
  assert.equal(acquired, 1); assert.ok(timer.delay < 2000);
  timer.callback(); assert.equal(refreshed, 1);
  documentTarget.visibilityState = 'hidden';
  documentTarget.dispatchEvent(new Event('visibilitychange')); assert.equal(refreshed, 1);
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatchEvent(new Event('visibilitychange')); assert.equal(refreshed, 2);
  windowTarget.dispatchEvent(new Event('focus')); assert.equal(refreshed, 3);
  scope.stop(); assert.equal(released, 1);
  windowTarget.dispatchEvent(new Event('focus')); assert.equal(refreshed, 3);
});

test('native delivery suppresses renderer popups and surfaces delivery errors without marking unread items', async t => {
  let delivery = { mode: 'system', error: '' }; let writes = 0;
  const { store } = setup(t, {
    list: async () => ({ ...snapshot([reminder()]), delivery }),
    acknowledge: async () => { writes++; return snapshot([]); },
  });
  await store.refresh(); await flush();
  assert.equal(store.popup, null); assert.equal(writes, 0); assert.equal(store.unreadCount, 1);
  delivery = { mode: 'system', error: 'Windows не удалось показать напоминание.' };
  await store.refresh(); assert.equal(store.error, delivery.error);
});

test('native click requests the bell only for the current database and leaves unread state intact', async t => {
  const { app, store } = setup(t, { list: async () => ({ ...snapshot([reminder()]), delivery: { mode: 'system', error: '' } }) });
  assert.equal(await store.openFromSystem({ generation: 9 }), false);
  assert.equal(store.openRequest, 0);
  assert.equal(await store.openFromSystem({ generation: 1 }), true);
  assert.equal(store.openRequest, 1); assert.equal(store.unreadCount, 1);
  app.database = { ready: true, generation: 2 };
  assert.equal(await store.openFromSystem({ generation: 1 }), false);
});

for (const selectedGeneration of [1, 2]) test(`a native click during bootstrap is deferred and checked against generation ${selectedGeneration}`, async t => {
  const { app, store } = setup(t, { list: async () => ({ ...snapshot([]), delivery: { mode: 'system', error: '' } }) });
  app.database = null; app.initialized = false;
  await store.openFromSystem({ generation: 1 });
  app.database = { ready: true, generation: selectedGeneration };
  app.initialized = true;
  await flush();
  assert.equal(store.openRequest, selectedGeneration === 1 ? 1 : 0);
});
