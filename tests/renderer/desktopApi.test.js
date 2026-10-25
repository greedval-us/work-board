import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as gateway from '../../src/renderer/infrastructure/desktopApi.js';
import { errorMessage } from '../../src/renderer/infrastructure/errorMessage.js';
import { DesktopError } from '../../src/shared/errors.js';
import { ValidationError } from '../../src/shared/registry.js';
import { createPreloadApis } from '../../src/shared/createPreloadApis.js';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers.js';

function bridge(t, value) {
  const previous = globalThis.window;
  globalThis.window = { desktopAPI: value };
  t.after(() => { globalThis.window = previous; });
}

test('renderer decodes success values once and preserves named method payloads', async (t) => {
  assert.equal(typeof gateway.requestDesktop, 'function');
  const calls = [];
  bridge(t, createPreloadApis({ invoke: async (...args) => {
    calls.push(args);
    return { ok: true, value: { id: 3 } };
  } }));
  const request = { generation: 1, data: { title: 'Сохранить' } };
  assert.deepEqual(await gateway.requestDesktop('tasks', 'create', request), { id: 3 });
  assert.deepEqual(calls, [['tasks:create', request]]);
});

test('desktop service mappings expose declared aliases and preserve positional arguments', async (t) => {
  const calls = [];
  bridge(t, createPreloadApis({ invoke: async (...args) => {
    calls.push(args);
    return { ok: true, value: 'saved' };
  } }));
  const service = gateway.createDesktopService({ status: ['database', 'getStatus'], theme: ['settings', 'setTheme'] });
  assert.equal(await service.status(), 'saved');
  assert.equal(await service.theme('dark', 7), 'saved');
  assert.deepEqual(calls, [['database:get-status'], ['settings:set-theme', { theme: 'dark', generation: 7 }]]);
  assert.deepEqual(Object.keys(service), ['status', 'theme']);
  assert.throws(() => gateway.createDesktopService({ unsafe: ['database', 'executeSql'] }), TypeError);
  assert.throws(() => gateway.createDesktopService({ unsafe: ['filesystem', 'read'] }), TypeError);
});

test('a main-process sqlite failure reaches the UI with a safe message and a stable code', async (t) => {
  assert.equal(typeof gateway.requestDesktop, 'function');
  const handlers = new Map();
  registerIpcHandlers({
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn), removeHandler() {} },
    requests: { 'tasks:create': () => { throw Object.assign(new Error('SQLITE_BUSY SELECT * FROM C:\\secret\\data.sqlite'), { code: 'SQLITE_BUSY' }); } },
    isTrusted: () => true, logger: { error() {} },
  });
  bridge(t, createPreloadApis({ invoke: (channel, ...args) => handlers.get(channel)({}, ...args) }));
  await assert.rejects(gateway.requestDesktop('tasks', 'create', {}), (error) => {
    assert.ok(error instanceof DesktopError);
    assert.equal(error.code, 'DATABASE_LOCKED');
    assert.match(errorMessage(error), /занят/);
    assert.doesNotMatch(errorMessage(error), /SQLITE|SELECT|secret|stack/);
    return true;
  });
});

test('transport rejection and absent named methods become safe availability errors', async (t) => {
  assert.equal(typeof gateway.requestDesktop, 'function');
  bridge(t, { tasks: { list: async () => { throw new Error("Error invoking remote method 'tasks:list': SELECT * FROM C:\\secret\\data.sqlite"); } } });
  for (const call of [() => gateway.requestDesktop('tasks', 'list', {}), () => gateway.requestDesktop('tasks', 'remove', {}), () => gateway.requestDesktop('missing', 'invoke', {})]) {
    await assert.rejects(call(), (error) => {
      assert.equal(error.code, 'IPC_UNAVAILABLE');
      assert.doesNotMatch(errorMessage(error), /SQL|secret|remote|tasks:list/);
      return true;
    });
  }
  delete globalThis.window.desktopAPI;
  await assert.rejects(gateway.requestDesktop('app', 'getInfo'), (error) => error.code === 'IPC_UNAVAILABLE');
});

test('malformed and legacy unwrapped IPC replies are rejected instead of used as data', async (t) => {
  assert.equal(typeof gateway.requestDesktop, 'function');
  let response;
  bridge(t, { tasks: { list: async () => response } });
  for (response of [
    null, undefined, [], { items: [] }, { ok: true }, { ok: 1, value: [] },
    { ok: true, value: [], error: {} }, { ok: false },
    { ok: false, error: { code: 'EACCES', message: 'C:\\secret\\data.sqlite' } },
    { ok: false, error: { code: 'VALIDATION', message: '' } },
    { ok: false, error: { code: 'VALIDATION', message: 'Правильно', stack: 'private stack' } },
  ]) {
    await assert.rejects(gateway.requestDesktop('tasks', 'list'), (error) => error.code === 'IPC_PROTOCOL');
  }
});

test('UI messages show only classified public errors and shared validation failures', () => {
  const unsafe = Object.assign(new Error('SELECT * FROM C:\\secret\\data.sqlite'), { publicMessage: 'SQL secret', code: 'VALIDATION' });
  for (const error of [unsafe, unsafe.message, { message: unsafe.message, publicMessage: 'SQL secret' }, null]) {
    assert.equal(errorMessage(error, 'Безопасное сообщение.'), 'Безопасное сообщение.');
  }
  assert.match(errorMessage(new ValidationError('Название: укажите текстовое значение.')), /Название/);
  assert.equal(errorMessage(new DesktopError('DATABASE_CHANGED', 'База изменилась.')), 'База изменилась.');
});
