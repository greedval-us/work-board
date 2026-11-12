import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createRenderer, h, markRaw, nextTick, reactive, ref } from 'vue';
import { createPinia, defineStore, disposePinia } from 'pinia';

function find(node, predicate) {
  if (!node) return undefined;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = find(child, predicate);
    if (match) return match;
  }
}

async function mountCenter(t, options = {}) {
  const component = new URL('../../src/renderer/components/notifications/NotificationCenter.vue', import.meta.url);
  assert.ok(existsSync(component), 'the header has a notification center');
  const fixtureKey = `notificationUi${Math.random().toString(36).slice(2)}`;
  const pinia = createPinia();
  const calls = [];
  const item = { id: 'checkpoint:4:2026-11-12', occurrence: 'due', kind: 'checkpoint', recordId: 4, date: '2026-11-12', title: 'Проверить отчёт', instructionNumber: '12', unread: true };
  const appState = reactive({ database: { ready: true, generation: 1 }, databaseSwitching: false });
  const store = defineStore(fixtureKey, () => ({
    items: ref(options.items ?? [item]), today: ref('2026-11-12'), unreadCount: ref(options.unreadCount ?? 1),
    loading: ref(false), error: ref(options.error ?? ''), saving: ref(false), popup: ref(options.popup ? { items: [item] } : null),
    openRequest: ref(0),
    refresh() {}, markAllRead() {},
    markRead(value) { calls.push(['read', value]); },
    dismissPopup() { calls.push(['dismiss']); this.popup = null; },
  }))(pinia);
  const router = { async push(value) { calls.push(['navigate', value]); return options.navigate ? options.navigate() : options.navigationResult; } };
  globalThis[fixtureKey] = { store, appState, router };
  const boundary = `data:text/javascript;base64,${Buffer.from(`export const useNotifications = () => globalThis.${fixtureKey}.store; export const useAppStore = () => globalThis.${fixtureKey}.appState; export const useRouter = () => globalThis.${fixtureKey}.router; export const isNavigationFailure = result => Boolean(result);`).toString('base64')}`;
  const filename = fileURLToPath(component);
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  const code = compileScript(descriptor, { id: fixtureKey, inlineTemplate: true }).content
    .replace(/from\s+(['"])([^'"]+)\1/g, (_match, quote, path) => {
      const resolved = /useNotifications|appStore|^vue-router$/.test(path) ? boundary
        : path.startsWith('.') ? new URL(path, component).href : import.meta.resolve(path);
      return `from ${quote}${resolved}${quote}`;
    });
  const { default: Center } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const listeners = new Map();
  const previousDocument = globalThis.document;
  const ownerDocument = {
    activeElement: null,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
  };
  globalThis.document = ownerDocument;
  const root = { children: [] };
  const renderer = createRenderer({
    createElement: type => markRaw({ type, children: [], props: {}, ownerDocument,
      focus() { ownerDocument.activeElement = this; },
      contains(target) { return Boolean(find(this, node => node === target)); },
      closest() { return null; },
    }),
    createText: text => ({ text }), createComment: text => ({ text }),
    setText: (node, text) => { node.text = text; }, setElementText: (node, text) => { node.text = text; },
    parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    patchProp: (node, key, _previous, value) => { node.props[key] = value; },
    insert(node, parent, anchor) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = parent; parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, node); },
    remove(node) { node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; },
  });
  const app = renderer.createApp({ render: () => h(Center) });
  app.mount(root);
  t.after(() => { app.unmount(); disposePinia(pinia); delete globalThis[fixtureKey]; globalThis.document = previousDocument; });
  const element = name => find(root, node => node.props?.['data-notification-action'] === name);
  return { root, item, store, appState, calls, listeners, ownerDocument, element };
}

test('notification bell exposes the full unread count, caps its badge and restores focus on Escape', async t => {
  const { element, root, ownerDocument, listeners } = await mountCenter(t, { unreadCount: 123 });
  const bell = element('toggle');
  assert.match(bell.props['aria-label'], /123/);
  assert.equal(find(root, node => node.props?.class === 'notification-count')?.text, '99+');
  await bell.props.onClick();
  await nextTick();
  assert.equal(bell.props['aria-expanded'], true);
  assert.equal(ownerDocument.activeElement, element('panel'));
  listeners.get('keydown')({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  await nextTick();
  assert.equal(bell.props['aria-expanded'], false);
  assert.equal(ownerDocument.activeElement, bell);
});

test('checkpoint navigation includes its date and a new token before marking it read', async t => {
  const { element, calls } = await mountCenter(t);
  await element('toggle').props.onClick();
  await nextTick();
  await element('open-item').props.onClick();
  assert.equal(calls[0][0], 'navigate');
  assert.equal(calls[0][1].name, 'Registry');
  assert.equal(calls[0][1].query.instruction, 4);
  assert.equal(calls[0][1].query.checkpoint, '2026-11-12');
  assert.ok(calls[0][1].query.notification);
  assert.equal(calls[1][0], 'read');
  const firstToken = calls[0][1].query.notification;
  await element('toggle').props.onClick();
  await nextTick();
  await element('open-item').props.onClick();
  assert.notEqual(calls[2][1].query.notification, firstToken);
});

test('cancelled navigation keeps the panel open and reminders unread', async t => {
  const { element, calls } = await mountCenter(t, { navigationResult: { type: 4 } });
  await element('toggle').props.onClick();
  await nextTick();
  await element('open-item').props.onClick();
  assert.equal(calls.filter(call => call[0] === 'read').length, 0);
  assert.equal(element('toggle').props['aria-expanded'], true);
});

test('opening the popup acknowledges only its presentation and focuses the notification list', async t => {
  const { element, calls, ownerDocument, appState } = await mountCenter(t, { popup: true });
  await element('show-list').props.onClick();
  await nextTick();
  assert.equal(ownerDocument.activeElement, element('panel'));
  assert.deepEqual(calls.map(call => call[0]), ['dismiss']);
  appState.database = { ready: true, generation: 2 };
  await nextTick();
  assert.equal(element('panel'), undefined);
});

test('a long overdue history keeps today visible while rendering a bounded initial list', async t => {
  const overdue = Array.from({ length: 60 }, (_, index) => ({ id: `old-${index}`, kind: 'task', recordId: index + 1, date: '2026-11-01', title: `Старая задача ${index}`, unread: true }));
  const { root, element } = await mountCenter(t, { items: [...overdue, { id: 'today', kind: 'task', recordId: 99, date: '2026-11-12', title: 'Сегодняшняя запись', unread: true }] });
  await element('toggle').props.onClick();
  await nextTick();
  assert.ok(find(root, node => node.type === 'strong' && node.text === 'Сегодняшняя запись'));
  assert.ok(!find(root, node => node.type === 'strong' && node.text === 'Старая задача 59'), 'later overdue records wait for show more');
  const more = element('show-more');
  assert.ok(more);
  await more.props.onClick();
  await nextTick();
  assert.ok(find(root, node => node.type === 'strong' && node.text === 'Старая задача 20'));
});

test('a notification refresh failure remains discoverable on a closed bell with no unread items', async t => {
  const { root, element } = await mountCenter(t, { unreadCount: 0, error: 'Не удалось загрузить уведомления.' });
  assert.match(element('toggle').props['aria-label'], /не удалось/i);
  assert.ok(find(root, node => node.props?.class === 'notification-error-indicator'));
});

test('a task notification routes to its date and a database switch during navigation prevents marking read', async t => {
  let completeNavigation;
  const navigating = new Promise(resolve => { completeNavigation = resolve; });
  const { element, calls, appState } = await mountCenter(t, {
    items: [{ id: 'task:3', kind: 'task', recordId: 3, date: '2026-11-13', title: 'Позвонить', unread: true }],
    navigate: () => navigating,
  });
  await element('toggle').props.onClick();
  await nextTick();
  const pending = element('open-item').props.onClick();
  assert.equal(calls[0][1].name, 'Calendar');
  assert.equal(calls[0][1].query.task, 3);
  assert.equal(calls[0][1].query.date, '2026-11-13');
  appState.database = { ready: true, generation: 2 };
  completeNavigation();
  await pending;
  assert.equal(calls.filter(call => call[0] === 'read').length, 0);
});

test('a native click waits for a modal draft to close before focusing the bell panel', async t => {
  const { store, element, ownerDocument, listeners } = await mountCenter(t);
  let modalOpen = true;
  ownerDocument.querySelector = () => modalOpen ? {} : null;
  store.openRequest++;
  await nextTick(); await nextTick();
  assert.ok(!element('panel'));
  modalOpen = false;
  listeners.get('close')();
  await nextTick(); await nextTick();
  assert.ok(element('panel'));
  assert.equal(ownerDocument.activeElement, element('panel'));
});
