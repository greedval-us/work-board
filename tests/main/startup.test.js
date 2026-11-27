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
import { CleanupError } from '../../src/main/errors/cleanup.js';
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

function cleanupFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-shutdown-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const handlers = new Map();
  const ipcMain = Object.assign(new EventEmitter(), {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: channel => handlers.delete(channel),
  });
  const stopError = new Error('Cannot detach power monitor');
  const databaseClose = t.mock.method(DatabaseService.prototype, 'close');
  const options = {
    app: { getPath: () => directory }, ipcMain,
    nativeNotifications: { powerMonitor: { removeListener() { throw stopError; } } },
  };
  return { options, handlers, stopError, databaseClose };
}

test('startup keeps the primary error and still closes the database if stopping reminders fails', t => {
  const { options, stopError, databaseClose } = cleanupFixture(t);
  const startupError = new Error('Cannot register IPC');
  options.ipcMain.handle = () => { throw startupError; };
  assert.throws(() => createApplicationServices(options), error => {
    assert.ok(error instanceof CleanupError);
    assert.equal(error.cause, startupError);
    assert.deepEqual(error.errors, [startupError, stopError]);
    return true;
  });
  assert.equal(databaseClose.mock.callCount(), 1);
});

test('shutdown detaches IPC and closes the database even if stopping reminders fails', t => {
  const { options, handlers, stopError, databaseClose } = cleanupFixture(t);
  const services = createApplicationServices(options);
  assert.ok(handlers.size > 0);
  assert.throws(() => services.shutdown(), error => error === stopError);
  assert.equal(handlers.size, 0);
  assert.equal(options.ipcMain.listenerCount('app-lock:activity'), 0);
  assert.equal(databaseClose.mock.callCount(), 1);
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

function desktopFixture(createServices) {
  const app = Object.assign(new EventEmitter(), {
    setName() {}, requestSingleInstanceLock: () => true, whenReady: async () => {}, quit() {},
  });
  const handlers = new Map();
  const ipcMain = Object.assign(new EventEmitter(), {
    handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel),
  });
  const messages = [];
  const webContents = Object.assign(new EventEmitter(), { mainFrame: {}, send: (...args) => messages.push(args) });
  const window = Object.assign(new EventEmitter(), {
    webContents, isDestroyed: () => false, isMinimized: () => false, shows: 0,
    show() { this.shows++; this.emit('focus'); }, focus() {},
  });
  const errors = [];
  const desktop = startDesktopApplication({ app, ipcMain, platform: 'linux',
    logger: { error: (...args) => errors.push(args) }, dialog: { showErrorBox() {} },
    createWindow: () => ({ window, loaded: Promise.resolve() }), createServices,
  });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  return { app, desktop, window, errors, messages, event, handlers, ipcMain };
}

test('first paint and service initialization precede renderer access to the workspace', async () => {
  const initializing = Promise.withResolvers();
  const initialized = Promise.withResolvers();
  let serviceCalls = 0;
  const f = desktopFixture(() => { serviceCalls++; initializing.resolve(); return initialized.promise; });
  await Promise.resolve();
  assert.equal(f.desktop.getWindow(), f.window);
  f.app.emit('second-instance');
  assert.equal(f.window.shows, 0);
  const whenReady = f.handlers.get('app:when-ready');
  await assert.rejects(whenReady({ ...f.event, senderFrame: {} }));
  assert.equal(serviceCalls, 0);
  let released = false;
  const boot = whenReady(f.event).then(() => { released = true; });
  f.window.emit('ready-to-show');
  await initializing.promise;
  assert.equal(f.window.shows, 1);
  assert.equal(released, false);
  const appearance = { theme: 'dark', appearanceStyle: 'witcher' };
  const services = { startNotifications() {}, getAppLockStatus() {}, getStartupAppearance: () => appearance, shutdown() {} };
  initialized.resolve(services);
  await boot;
  assert.deepEqual(await whenReady(f.event), appearance);
  assert.equal(f.desktop.getServices(), services);
  f.app.emit('will-quit');
  assert.equal(f.handlers.has('app:when-ready'), false);
});

test('quitting during deferred initialization shuts down the newly created services', async () => {
  const initialized = Promise.withResolvers();
  const f = desktopFixture(() => initialized.promise);
  await Promise.resolve();
  f.window.emit('ready-to-show');
  await Promise.resolve();
  f.app.emit('before-quit');
  f.app.emit('will-quit');
  let shutdowns = 0;
  initialized.resolve({ shutdown() { shutdowns++; } });
  await f.desktop.ready;
  assert.equal(shutdowns, 1);
  assert.equal(f.desktop.getServices(), undefined);
  assert.deepEqual(f.errors, []);
});

test('a failed service startup rejects the renderer handshake', async () => {
  const f = desktopFixture(() => { throw new Error('cannot initialize services'); });
  await Promise.resolve();
  const boot = f.handlers.get('app:when-ready')(f.event);
  f.window.emit('ready-to-show');
  await assert.rejects(boot, /Не удалось открыть Work Board/);
  assert.equal(f.errors.length, 1);
});

test('native notification clicks wait for both the renderer subscription and unlock', async () => {
  let callbacks;
  let locked = true;
  const f = desktopFixture(options => {
    callbacks = options;
    return { startNotifications() {}, getAppLockStatus: () => ({ locked }) };
  });
  await Promise.resolve();
  f.window.emit('ready-to-show');
  await f.desktop.ready;
  await callbacks.onNotificationOpen({ generation: 3, items: [{ title: 'Скрытое название' }] });
  assert.equal(f.window.shows, 2);
  assert.deepEqual(f.messages, []);

  locked = false;
  const status = { enabled: true, locked, timeoutMinutes: 5 };
  callbacks.onAppLockStatusChange(status);
  await Promise.resolve();
  assert.deepEqual(f.messages, [['app-lock:status-changed', status]]);
  f.ipcMain.emit('notifications:listening', { ...f.event, senderFrame: {} });
  await Promise.resolve();
  assert.equal(f.messages.length, 1);
  f.ipcMain.emit('notifications:listening', f.event);
  await Promise.resolve();
  assert.deepEqual(f.messages, [['app-lock:status-changed', status], ['notifications:open', { generation: 3 }]]);
});
