import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApplicationServices } from '../../src/main/createApplicationServices.js';
import { DatabaseLocation } from '../../src/main/database/DatabaseLocation.js';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { isStartupDatabasePath, readWindowAppearance, saveStartupAppearance } from '../../src/main/desktop/startupAppearance.js';
import { SettingsRepository } from '../../src/main/repositories/SettingsRepository.js';

function profile(t, close = () => {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'work-board-startup-appearance-'));
  t.after(() => { close(); rmSync(directory, { recursive: true, force: true }); });
  return directory;
}

function createDatabase(directory, name, preferences) {
  const filePath = path.join(directory, name);
  const database = new DatabaseService({ filePath });
  database.open();
  try { new SettingsRepository(database).saveAppearance(preferences); }
  finally { database.close(); }
  return filePath;
}

test('first-paint migration avoids other Windows drives and UNC shares before probing the filesystem', () => {
  const profile = 'C:\\Users\\test\\AppData\\Roaming\\Work Board';
  assert.equal(isStartupDatabasePath('c:\\Documents\\board.sqlite', profile, 'win32'), true);
  assert.equal(isStartupDatabasePath('X:\\remote\\board.sqlite', profile, 'win32'), false);
  assert.equal(isStartupDatabasePath('\\\\server\\shared\\board.sqlite', profile, 'win32'), false);
  assert.equal(isStartupDatabasePath('board.sqlite', profile, 'win32'), false);
});

test('cold startup reads only public, checkpointed preferences from an older profile', async t => {
  const directory = profile(t);
  const appearance = { theme: 'system', appearanceStyle: 'gzhel' };
  const filePath = createDatabase(directory, 'old.sqlite', appearance);
  new DatabaseLocation({ userData: directory }).save(filePath);
  const contents = readFileSync(filePath);
  const names = readdirSync(directory);
  assert.deepEqual(await readWindowAppearance(directory), appearance);
  assert.deepEqual(readdirSync(directory), names);
  assert.deepEqual(readFileSync(filePath), contents);

  const cached = { theme: 'dark', appearanceStyle: 'witcher' };
  saveStartupAppearance(directory, { ...cached, password: 'private' });
  const ini = path.join(directory, 'startup-appearance.ini');
  assert.equal(readFileSync(ini, 'ascii'), '[Appearance]\r\ntheme=dark\r\nstyle=witcher\r\n');
  assert.deepEqual(await readWindowAppearance(directory), cached);

  writeFileSync(ini, '[Appearance]\ntheme=dark\nstyle=unknown\n');
  assert.deepEqual(await readWindowAppearance(directory), appearance);
  writeFileSync(`${filePath}-wal`, '');
  assert.deepEqual(await readWindowAppearance(directory), { theme: 'light', appearanceStyle: 'standard' });
});

test('successful edits and database switches update both startup screens while locked profiles retain their colors', async t => {
  let services;
  const directory = profile(t, () => services?.shutdown());
  const first = createDatabase(directory, 'first.sqlite', { theme: 'system', appearanceStyle: 'gzhel' });
  const second = createDatabase(directory, 'second.sqlite', { theme: 'light', appearanceStyle: 'harry-potter' });
  new DatabaseLocation({ userData: directory }).save(first);
  const handlers = new Map();
  const ipcMain = Object.assign(new EventEmitter(), {
    handle: (channel, handler) => handlers.set(channel, handler), removeHandler: channel => handlers.delete(channel),
  });
  const webContents = { mainFrame: {} };
  const window = { isDestroyed: () => false, webContents };
  services = createApplicationServices({
    app: { getPath: () => directory }, ipcMain, getWindow: () => window, logger: { error() {} },
    dialog: { showOpenDialog: async () => ({ filePaths: [second] }) },
  });
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const invoke = (name, args) => handlers.get(name)(event, args);
  const initial = { theme: 'system', appearanceStyle: 'gzhel' };
  assert.deepEqual(services.getStartupAppearance(), initial);
  let { value: { generation } } = await invoke('database:get-status');
  assert.equal((await invoke('settings:set-theme', { theme: 'dark', generation })).ok, true);
  assert.equal((await invoke('settings:set-appearance-style', { appearanceStyle: 'cyberpunk', generation })).ok, true);
  assert.deepEqual(await readWindowAppearance(directory), { theme: 'dark', appearanceStyle: 'cyberpunk' });

  const selection = await invoke('database:open');
  assert.equal(selection.ok, true);
  const next = { theme: 'light', appearanceStyle: 'harry-potter' };
  assert.deepEqual(await readWindowAppearance(directory), next);
  assert.equal((await invoke('settings:set-theme', { theme: 'dark', generation })).ok, false);
  assert.deepEqual(services.getStartupAppearance(), next);
  await invoke('app-lock:configure', { password: 'startup-test', timeoutMinutes: 5 });
  await invoke('app-lock:lock');
  assert.deepEqual(services.getStartupAppearance(), next);
  generation = selection.value.status.generation;
  assert.equal((await invoke('settings:get', { generation })).error.code, 'APPLICATION_LOCKED');
});
