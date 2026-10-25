import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreloadApis } from '../../src/shared/createPreloadApis.js';

test('bridge exposes named operations and sends only their explicit payloads', async () => {
  const calls = [];
  const api = createPreloadApis({ invoke: async (...args) => { calls.push(args); return { ok: true, value: 'ok' }; } });
  assert.deepEqual(Object.keys(api).sort(), ['app', 'calendar', 'database', 'instructions', 'settings', 'tasks']);
  assert.equal(api.invoke, undefined);
  await api.app.getInfo();
  await api.database.getStatus();
  await api.settings.get(1);
  assert.deepEqual(await api.settings.setTheme('dark', 1), { ok: true, value: 'ok' });
  await api.instructions.create({ generation: 1, data: { title: 'Указание' } });
  await api.database.open();
  assert.deepEqual(calls, [
    ['app:get-info'], ['database:get-status'], ['settings:get', { generation: 1 }], ['settings:set-theme', { theme: 'dark', generation: 1 }],
    ['instructions:create', { generation: 1, data: { title: 'Указание' } }], ['database:open'],
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
