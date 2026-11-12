import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { app, dialog, ipcMain, Menu, Tray } from 'electron';
import { createWindow } from '../src/main/app.js';
import { createApplicationServices } from '../src/main/createApplicationServices.js';
import { startDesktopApplication } from '../src/main/startDesktopApplication.js';
import { DatabaseService } from '../src/main/database/DatabaseService.js';
import { DatabaseLocation } from '../src/main/database/DatabaseLocation.js';
import { TaskRepository } from '../src/main/repositories/TaskRepository.js';
import { localDate } from '../src/shared/dates.js';
import { DesktopSmokeDriver } from './lib/DesktopSmokeDriver.mjs';
import { PROJECT_ROOT } from './lib/runtime.mjs';

const userData = process.env.WORK_BOARD_SMOKE_USER_DATA;
if (!userData) throw new Error('Run npm run test:desktop.');
app.setPath('userData', userData);
const filePath = path.join(userData, 'background.sqlite');
const seed = new DatabaseService({ filePath });
seed.open(); new DatabaseLocation({ userData, database: seed }).save(filePath); seed.close();
const output = process.env.WORK_BOARD_SMOKE_OUTPUT ?? path.join(PROJECT_ROOT, 'output'); mkdirSync(output, { recursive: true });
const wake = new EventEmitter();
const notifications = [];
const errors = [];
let trayMenu; let tray; let driver;
const timeout = setTimeout(() => { console.error('Background smoke timed out.'); app.exit(1); }, 35_000);
app.once('browser-window-created', (_event, window) => {
  driver = new DesktopSmokeDriver(window, { output }); driver.prepare();
});
const runtime = startDesktopApplication({ app, dialog, ipcMain, createWindow,
  logger: { error: (...args) => { errors.push(args); console.error(...args); } },
  createTray: () => { tray = new Tray(path.join(PROJECT_ROOT, 'build/renderer/icons/app.ico')); return tray; },
  buildMenu: template => { trayMenu = template; return Menu.buildFromTemplate(template); },
  createServices: options => createApplicationServices({ ...options, nativeNotifications: {
    isSupported: () => true, powerMonitor: wake,
    createNotification: options => {
      const native = new EventEmitter(); native.options = options;
      native.show = () => { native.state = { visible: runtime.getWindow().isVisible(), minimized: runtime.getWindow().isMinimized() }; native.emit('show'); };
      native.close = () => { native.closed = true; native.emit('close'); };
      notifications.push(native); return native;
    },
  } }),
});

void runtime.ready.then(async () => {
  const window = runtime.getWindow();
  const { js, api, wait, navigate, fill, click } = driver;
  window.showInactive();
  await wait("Boolean(document.querySelector('.notification-bell:enabled')) && !document.querySelector('[aria-busy=true]')");
  const generation = (await api('database', 'getStatus')).generation;
  assert.equal(runtime.getServices().getNotificationStatus().mode, 'system');
  assert.equal(tray.isDestroyed(), false);
  window.minimize();
  await new Promise(resolve => setTimeout(resolve, 100));
  await api('tasks', 'create', { generation, data: { title: 'Срок при свёрнутом окне', date: localDate() } });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].state.minimized, true);
  assert.ok((await api('notifications', 'list', { generation })).items.every(item => !item.popupPending && item.unread));
  notifications[0].emit('click');
  await wait("Boolean(document.querySelector('.notification-panel'))");
  assert.equal(window.isMinimized(), false); assert.equal(window.isVisible(), true);
  assert.equal(await js("Boolean(document.querySelector('.notification-popup'))"), false);
  await js("document.querySelector('[aria-label=\"Закрыть уведомления\"]').click()");

  window.close();
  assert.equal(window.isDestroyed(), false); assert.equal(window.isVisible(), false);
  // An external database edit and OS resume reach main without any renderer refresh.
  const external = new DatabaseService({ filePath }); external.open();
  new TaskRepository(external).create({ title: 'Срок при закрытом окне', date: localDate() }); external.close();
  wake.emit('resume');
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].state.visible, false);
  wake.emit('unlock-screen'); assert.equal(notifications.length, 2);
  notifications[1].emit('click');
  await wait("document.querySelector('.notification-panel')?.textContent.includes('Срок при закрытом окне')");
  await driver.screenshot('windows-background-notifications.png');
  await js("document.querySelector('[aria-label=\"Закрыть уведомления\"]').click()");

  await navigate('/calendar', 'Календарь и задачи');
  await click('Новая задача', '.calendar-page-heading button');
  await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
  await fill('[name=task-title]', { 0: 'Черновик перед выходом' });
  window.close(); assert.equal(window.isVisible(), false); assert.equal(window.isDestroyed(), false);
  trayMenu.find(item => item.label === 'Открыть Work Board').click();
  assert.equal(window.isVisible(), true);
  assert.equal(await js("document.querySelector('[name=task-title]').value"), 'Черновик перед выходом');
  window.close();
  trayMenu.find(item => item.label === 'Выход').click();
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  assert.equal(window.isVisible(), true);
  await click('Продолжить редактирование', '.calendar-confirm-dialog button');
  await wait("!document.querySelector('.calendar-confirm-dialog[open]')");
  assert.equal(window.isDestroyed(), false);
  assert.deepEqual(errors, []); assert.deepEqual(driver.errors, []);
  app.once('will-quit', () => {
    assert.equal(tray.isDestroyed(), true);
    assert.equal(wake.listenerCount('resume'), 0);
    clearTimeout(timeout);
    console.log('Background Electron smoke passed: minimize, close-to-tray, main-only delivery, click restore, daily dedupe, draft retention, guarded Exit and cleanup. Native OS delivery adapter was injected; no test toasts were published.');
  });
  trayMenu.find(item => item.label === 'Выход').click();
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Не сохранять', '.calendar-confirm-dialog button');
}).catch(async error => {
  console.error(error);
  try { await driver?.screenshot('background-smoke-failure.png'); } catch {}
  clearTimeout(timeout); app.exit(1);
});
