import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreloadApis } from '../../src/shared/createPreloadApis.js';

test('bridge exposes named operations and sends only their explicit payloads', async () => {
  const calls = [];
  const api = createPreloadApis({ invoke: async (...args) => { calls.push(args); return { ok: true, value: 'ok' }; } });
  assert.deepEqual(Object.keys(api).sort(), ['analytics', 'app', 'attachments', 'calendar', 'database', 'instructions', 'notifications', 'settings', 'tasks']);
  assert.equal(api.invoke, undefined);
  await api.app.getInfo();
  await api.database.getStatus();
  await api.settings.get(1);
  assert.deepEqual(await api.settings.setTheme('dark', 1), { ok: true, value: 'ok' });
  await api.settings.addRegistryOption('source', 'Канцелярия', 1);
  await api.settings.updateRegistryOption('source', 'Канцелярия', 'Архив', 1);
  await api.settings.removeRegistryOption('source', 'Архив', 1);
  const contact = { department: 'Отдел контроля', executorPhone: '103' };
  await api.settings.addRegistryOption('executor', 'Иванов', 1, contact);
  await api.settings.updateRegistryOption('executor', 'Иванов', 'Иванов И. И.', 1, contact);
  await api.settings.setExecutorContact('Иванов', { department: 'Отдел контроля', executorPhone: '' }, 1);
  await api.instructions.create({ generation: 1, data: { title: 'Указание' } });
  await api.instructions.exportControlCard({ generation: 1, id: 4, fields: { executorPhone: '' } });
  await api.database.open();
  await api.notifications.list({ generation: 1 });
  await api.notifications.acknowledge({ generation: 1, items: [{ id: 'task:1', occurrence: '2026-11-12:2026-11-12' }], read: true });
  assert.deepEqual(calls, [
    ['app:get-info'], ['database:get-status'], ['settings:get', { generation: 1 }], ['settings:set-theme', { theme: 'dark', generation: 1 }],
    ['settings:add-registry-option', { field: 'source', value: 'Канцелярия', generation: 1 }],
    ['settings:update-registry-option', { field: 'source', previousValue: 'Канцелярия', value: 'Архив', generation: 1 }],
    ['settings:remove-registry-option', { field: 'source', value: 'Архив', generation: 1 }],
    ['settings:add-registry-option', { field: 'executor', value: 'Иванов', generation: 1, contact }],
    ['settings:update-registry-option', { field: 'executor', previousValue: 'Иванов', value: 'Иванов И. И.', generation: 1, contact }],
    ['settings:set-executor-contact', { executor: 'Иванов', contact: { department: 'Отдел контроля', executorPhone: '' }, generation: 1 }],
    ['instructions:create', { generation: 1, data: { title: 'Указание' } }],
    ['instructions:export-control-card', { generation: 1, id: 4, fields: { executorPhone: '' } }], ['database:open'],
    ['notifications:list', { generation: 1 }],
    ['notifications:acknowledge', { generation: 1, items: [{ id: 'task:1', occurrence: '2026-11-12:2026-11-12' }], read: true }],
  ]);
});

test('bridge keeps failure envelopes as plain data across the isolated-world boundary', async () => {
  const api = createPreloadApis({ invoke: async () => ({
    ok: false, error: { code: 'DATABASE_CHANGED', message: 'Активная база изменилась.' },
  }) });
  assert.deepEqual(await api.tasks.update({ generation: 1, id: 4, data: {} }), {
    ok: false, error: { code: 'DATABASE_CHANGED', message: 'Активная база изменилась.' },
  });
  for (const namespace of Object.values(api)) {
    assert.equal(namespace.invoke, undefined);
    assert.equal(namespace.execute, undefined);
    assert.equal(namespace.query, undefined);
  }
});

test('native notification subscription strips the Electron event and unsubscribes its own listener', () => {
  const listeners = new Map(); const received = [];
  const api = createPreloadApis({
    on: (channel, handler) => listeners.set(channel, handler),
    removeListener: (channel, handler) => { assert.equal(listeners.get(channel), handler); listeners.delete(channel); },
  });
  const dispose = api.notifications.onOpen(payload => received.push(payload));
  assert.equal(listeners.size, 1);
  const listener = listeners.get('notifications:open');
  listener({ sender: 'must never reach renderer' }, { generation: 4, extra: 'private' });
  listener({}, { generation: '4' });
  assert.deepEqual(received, [{ generation: 4 }]);
  dispose(); assert.equal(listeners.size, 0);
});
