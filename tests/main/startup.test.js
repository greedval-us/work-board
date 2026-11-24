import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';
import { startDesktopApplication } from '../../src/main/desktop/startDesktopApplication.js';
import { DatabaseLocation } from '../../src/main/database/DatabaseLocation.js';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { TaskRepository } from '../../src/main/repositories/TaskRepository.js';
import { localDate } from '../../src/shared/dates.js';

test('starting application services leaves report libraries unloaded', t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-startup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const services = createApplicationServices({
    app: { getPath: () => directory }, ipcMain: Object.assign(new EventEmitter(), { handle() {}, removeHandler() {} }),
  });
  t.after(() => services.shutdown());

  const require = createRequire(import.meta.url);
  const loaded = ['exceljs', 'jszip'].filter(name => require.cache[require.resolve(name)]);
  assert.deepEqual(loaded, []);
});

test('application lock allows only safe requests and ignores activity from child frames', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-lock-ipc-'));
  const handlers = new Map();
  const ipcMain = Object.assign(new EventEmitter(), {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: channel => handlers.delete(channel),
  });
  const webContents = { mainFrame: {} };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const updates = [];
  let now = 0;
  const services = createApplicationServices({
    app: { getPath: () => directory }, ipcMain,
    getWindow: () => ({ isDestroyed: () => false, webContents }), logger: { error() {} },
    now: () => now, onAppLockStatusChange: status => updates.push(status),
  });
  t.after(() => { services.shutdown(); rmSync(directory, { recursive: true, force: true }); });
  const invoke = (channel, payload) => handlers.get(channel)(event, payload);
  assert.deepEqual(await invoke('app-lock:configure', { password: 'test password', timeoutMinutes: 5 }), {
    ok: true, value: { enabled: true, locked: false, timeoutMinutes: 5 },
  });
  now = 299_000;
  ipcMain.emit('app-lock:activity', event);
  now += 299_000;
  ipcMain.emit('app-lock:activity', { ...event, senderFrame: {} });
  now += 1_000;
  assert.equal((await invoke('database:get-status')).error.code, 'APPLICATION_LOCKED');
  assert.equal((await invoke('notifications:list', { generation: 0 })).error.code, 'APPLICATION_LOCKED');
  assert.equal((await invoke('app-lock:configure', { password: '', timeoutMinutes: 5 })).error.code, 'APPLICATION_LOCKED');
  assert.deepEqual(await invoke('app-lock:has-pending-notifications'), { ok: true, value: false });
  assert.equal((await invoke('app-lock:get-status')).value.locked, true);
  assert.equal((await invoke('app-lock:unlock', { password: 'test password' })).value.locked, false);
  assert.equal((await invoke('database:get-status')).ok, true);
  assert.deepEqual(updates.map(status => status.locked), [false, true, false]);
  services.shutdown();
  assert.equal(ipcMain.listenerCount('app-lock:activity'), 0);
});

test('locked in-app reminders reveal availability and pending native file dialogs cannot publish data', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-lock-dialog-'));
  const databasePath = path.join(directory, 'work.sqlite');
  const outputPath = path.join(directory, 'report.xlsx');
  const database = new DatabaseService({ filePath: databasePath });
  database.open();
  new TaskRepository(database).create({ title: 'Рабочее напоминание', date: localDate() });
  new DatabaseLocation({ userData: directory, database }).save(databasePath);
  database.close();
  const handlers = new Map();
  const ipcMain = Object.assign(new EventEmitter(), {
    handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel),
  });
  const webContents = { mainFrame: {} };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const pickOutput = Promise.withResolvers();
  const pickDatabase = Promise.withResolvers();
  const openPaths = [];
  const services = createApplicationServices({
    app: { getPath: () => directory }, ipcMain,
    getWindow: () => ({ isDestroyed: () => false, webContents }), logger: { error() {} },
    dialog: { showSaveDialog: () => pickOutput.promise, showOpenDialog: () => pickDatabase.promise },
    openPath: filePath => openPaths.push(filePath),
    nativeNotifications: { isSupported: () => true, createNotification() { throw new Error('System delivery unavailable'); } },
  });
  t.after(() => { services.shutdown(); rmSync(directory, { recursive: true, force: true }); });
  const invoke = (channel, payload) => handlers.get(channel)(event, payload);
  const { generation } = (await invoke('database:get-status')).value;
  await invoke('app-lock:configure', { password: 'test password', timeoutMinutes: 5 });
  const exportResult = invoke('instructions:export', { generation });
  const selectResult = invoke('database:open');
  await invoke('app-lock:lock');
  assert.deepEqual(await invoke('app-lock:has-pending-notifications'), { ok: true, value: true });
  assert.equal(services.startNotifications(), true);
  assert.deepEqual(await invoke('app-lock:has-pending-notifications'), { ok: true, value: true });
  pickOutput.resolve({ filePath: outputPath });
  pickDatabase.resolve({ filePaths: [path.join(directory, 'other.sqlite')] });
  assert.equal((await exportResult).error?.code, 'APPLICATION_LOCKED');
  assert.equal((await selectResult).error?.code, 'APPLICATION_LOCKED');
  assert.deepEqual(openPaths, []);
  assert.equal(existsSync(outputPath), false);
  await invoke('app-lock:unlock', { password: 'test password' });
  assert.equal((await invoke('database:get-status')).value.generation, generation);
  assert.equal((await invoke('notifications:list', { generation })).value.items[0].popupPending, true);
  assert.deepEqual(await invoke('app-lock:has-pending-notifications'), { ok: true, value: false });
});

test('native notification clicks restore the window and defer opening until unlock', async () => {
  const app = Object.assign(new EventEmitter(), {
    setName() {}, requestSingleInstanceLock: () => true, whenReady: async () => {},
  });
  const messages = [];
  const webContents = Object.assign(new EventEmitter(), { send: (...args) => messages.push(args) });
  let restored = false;
  const window = Object.assign(new EventEmitter(), {
    webContents, isDestroyed: () => false, isMinimized: () => false,
    show() { restored = true; }, focus() {},
  });
  let callbacks;
  let locked = true;
  const desktop = startDesktopApplication({ app, platform: 'linux',
    createWindow: () => ({ window, loaded: Promise.resolve() }),
    createServices(options) {
      callbacks = options;
      return { startNotifications() {}, getAppLockStatus: () => ({ locked }) };
    },
  });
  await desktop.ready;
  await callbacks.onNotificationOpen({ generation: 3, items: [{ title: 'Скрытое название' }] });
  assert.equal(restored, true);
  assert.deepEqual(messages, []);

  locked = false;
  const status = { enabled: true, locked, timeoutMinutes: 5 };
  callbacks.onAppLockStatusChange(status);
  await Promise.resolve();
  assert.deepEqual(messages, [['app-lock:status-changed', status], ['notifications:open', { generation: 3 }]]);
});
