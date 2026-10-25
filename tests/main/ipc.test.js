import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IPCManager } from '../../src/main/ipc/IPCManager.js';
import { registerIpcHandlers } from '../../src/main/ipc/registerIpcHandlers.js';
import { AppError } from '../../src/main/utils/AppError.js';
import { ValidationError } from '../../src/shared/registry.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function fixture() {
  const handlers = new Map();
  const window = { isDestroyed: () => false, webContents: { mainFrame: {} } };
  let theme = 'light';
  const manager = new IPCManager({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler: (channel) => handlers.delete(channel) },
    appService: { getInfo: () => ({ name: 'Work Board' }) },
    database: { getStatus: () => ({ ready: true }) },
    settingsService: { get: () => ({ theme }), setTheme: (value) => { theme = value; return { theme }; } },
    getWindow: () => window,
    logger: { error() {} },
  });
  manager.init();
  return { manager, handlers, window, event: { sender: window.webContents, senderFrame: window.webContents.mainFrame } };
}

test('IPC rejects other windows and child frames before changing local data', async () => {
  const { handlers, event } = fixture();
  const setTheme = handlers.get('settings:set-theme');
  for (const untrusted of [{ ...event, sender: {} }, { ...event, senderFrame: {} }]) {
    const result = await setTheme(untrusted, { theme: 'dark' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PERMISSION_DENIED');
    assert.match(result.error.message, /источник/);
  }
  assert.deepEqual(await handlers.get('settings:get')(event), { ok: true, value: { theme: 'light' } });
  assert.deepEqual(await setTheme(event, { theme: 'dark' }), { ok: true, value: { theme: 'dark' } });
});

test('IPC setup and shutdown are idempotent and release all channels', () => {
  const { manager, handlers } = fixture();
  manager.init();
  assert.equal(handlers.size, 4);
  manager.shutdown();
  manager.shutdown();
  assert.equal(handlers.size, 0);
});

test('IPC returns safe structured failures and logs the original cause with operation context', async () => {
  const handlers = new Map();
  const logged = [];
  const unsafe = Object.assign(new Error('SELECT * FROM private_table at C:\\private\\work.sqlite'), {
    code: 'SQLITE_ERROR', publicMessage: 'SELECT secret FROM C:\\private\\work.sqlite',
  });
  registerIpcHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
    requests: { 'tasks:list': () => { throw unsafe; } },
    isTrusted: () => true,
    logger: { error: (...args) => logged.push(args) },
  });
  const result = await handlers.get('tasks:list')({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'UNEXPECTED');
  assert.deepEqual(Object.keys(result.error).sort(), ['code', 'message']);
  assert.doesNotMatch(JSON.stringify(result), /SELECT|private_table|private|stack|SQLITE_ERROR/);
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1].channel, 'tasks:list');
  assert.equal(logged[0][1].code, 'UNEXPECTED');
  assert.equal(logged[0][2], unsafe);
});

test('IPC retains application, validation, sqlite lock, database and permission error codes', async () => {
  const handlers = new Map();
  const failures = [
    [new AppError('Активная база изменилась.', 'DATABASE_CHANGED'), 'DATABASE_CHANGED', /изменилась/],
    [new AppError('База данных не открыта.', 'DATABASE_REQUIRED'), 'DATABASE_REQUIRED', /не открыта/],
    [new AppError('Запись не найдена.', 'NOT_FOUND'), 'NOT_FOUND', /не найдена/],
    [new ValidationError('Название: укажите текстовое значение.'), 'VALIDATION', /Название/],
    [Object.assign(new Error('database is locked at C:\\private\\work.sqlite'), { code: 'SQLITE_BUSY' }), 'DATABASE_LOCKED', /занят/],
    [Object.assign(new Error('database table is locked'), { code: 'ERR_SQLITE_ERROR', errcode: 262 }), 'DATABASE_LOCKED', /занят/],
    [Object.assign(new Error('unable to open database C:\\private\\work.sqlite'), { code: 'ERR_SQLITE_ERROR', errcode: 14 }), 'DATABASE_UNAVAILABLE', /недоступ/],
    [Object.assign(new Error('EACCES C:\\private\\work.sqlite'), { code: 'EACCES' }), 'PERMISSION_DENIED', /доступ/],
    [Object.assign(new Error('attempt to write readonly database'), { code: 'ERR_SQLITE_ERROR', errcode: 8 }), 'PERMISSION_DENIED', /доступ/],
  ];
  registerIpcHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
    requests: Object.fromEntries(failures.map(([error], index) => [`case:${index}`, () => { throw error; }])),
    isTrusted: () => true, logger: { error() {} },
  });
  for (const [index, [, code, message]] of failures.entries()) {
    const result = await handlers.get(`case:${index}`)({});
    assert.equal(result.error.code, code);
    assert.match(result.error.message, message);
    assert.doesNotMatch(JSON.stringify(result), /private|SQLITE|readonly|EACCES/);
  }
});

test('application error retains its cause for main-process diagnostics', () => {
  const cause = new Error('raw sqlite context');
  const error = new AppError('Не удалось сохранить данные.', 'DATABASE_UNAVAILABLE', { cause });
  assert.equal(error.cause, cause);
});

test('native sqlite SQL errors never cross IPC and retain full diagnostics in the main logger', async (t) => {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  const handlers = new Map();
  const logged = [];
  registerIpcHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
    requests: { 'instructions:list': () => database.prepare('SELECT * FROM private_instruction_table').all() },
    isTrusted: () => true,
    logger: { error: (...args) => logged.push(args) },
  });
  const result = await handlers.get('instructions:list')({});
  assert.equal(result.error.code, 'UNEXPECTED');
  assert.doesNotMatch(JSON.stringify(result), /private_instruction_table|SQL|stack/);
  assert.equal(logged[0][2].code, 'ERR_SQLITE_ERROR');
  assert.match(logged[0][2].message, /private_instruction_table/);
  assert.ok(logged[0][2].stack);
});

test('native sqlite locks and readonly files produce actionable public failures', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-ipc-'));
  const filePath = path.join(directory, 'private.sqlite');
  const owner = new DatabaseSync(filePath);
  owner.exec('CREATE TABLE private_records (id INTEGER);');
  const writer = new DatabaseSync(filePath);
  const readonly = new DatabaseSync(filePath, { readOnly: true });
  t.after(() => { readonly.close(); writer.close(); owner.close(); rmSync(directory, { recursive: true, force: true }); });
  const handlers = new Map();
  registerIpcHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
    requests: {
      'tasks:create': () => writer.prepare('INSERT INTO private_records VALUES (1)').run(),
      'tasks:update': () => readonly.prepare('INSERT INTO private_records VALUES (2)').run(),
    },
    isTrusted: () => true, logger: { error() {} },
  });
  owner.exec('BEGIN IMMEDIATE');
  assert.equal((await handlers.get('tasks:create')({})).error.code, 'DATABASE_LOCKED');
  owner.exec('ROLLBACK');
  const denied = await handlers.get('tasks:update')({});
  assert.equal(denied.error.code, 'PERMISSION_DENIED');
  assert.doesNotMatch(JSON.stringify(denied), /private|sqlite|INSERT|readonly|stack/);
});

test('unknown application codes cannot expose their diagnostic message', async () => {
  const handlers = new Map();
  registerIpcHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), removeHandler() {} },
    requests: { 'tasks:list': () => { throw new AppError('SELECT * FROM C:\\private\\data.sqlite', 'UNREVIEWED'); } },
    isTrusted: () => true, logger: { error() {} },
  });
  const result = await handlers.get('tasks:list')({});
  assert.equal(result.error.code, 'UNEXPECTED');
  assert.doesNotMatch(JSON.stringify(result), /SELECT|private|UNREVIEWED/);
});
