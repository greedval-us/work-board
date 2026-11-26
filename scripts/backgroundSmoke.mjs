import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { app, dialog, ipcMain, Menu, Tray } from 'electron';
import { createWindow } from '../src/main/desktop/createWindow.js';
import { createApplicationServices } from '../src/main/createApplicationServices.js';
import { startDesktopApplication } from '../src/main/desktop/startDesktopApplication.js';
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
let clockOffset = 0;
let trayMenu; let tray; let driver;
const timeout = setTimeout(() => { console.error('Background smoke timed out.'); app.exit(1); }, 35_000);

function addExternalTask(title) {
  const external = new DatabaseService({ filePath });
  external.open();
  try { new TaskRepository(external).create({ title, date: localDate() }); }
  finally { external.close(); }
}

app.once('browser-window-created', (_event, window) => {
  driver = new DesktopSmokeDriver(window, { output }); driver.prepare();
});
const runtime = startDesktopApplication({ app, dialog, ipcMain, createWindow,
  logger: { error: (...args) => { errors.push(args); console.error(...args); } },
  createTray: () => { tray = new Tray(path.join(PROJECT_ROOT, 'build/renderer/icons/app.ico')); return tray; },
  buildMenu: template => { trayMenu = template; return Menu.buildFromTemplate(template); },
  createServices: options => createApplicationServices({ ...options, now: () => Date.now() + clockOffset, nativeNotifications: {
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
  await wait("Boolean(document.querySelector('.notification-bell:enabled')) && !document.querySelector('[aria-busy=true], #startup-screen')");
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
  addExternalTask('Срок при закрытом окне');
  wake.emit('resume');
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].state.visible, false);
  wake.emit('unlock-screen'); assert.equal(notifications.length, 2);
  notifications[1].emit('click');
  await wait("document.querySelector('.notification-panel')?.textContent.includes('Срок при закрытом окне')");
  await driver.screenshot('windows-background-notifications.png');
  await js("document.querySelector('[aria-label=\"Закрыть уведомления\"]').click()");

  const password = 'smoke-dedicated-profile';
  const timeoutMinutes = 5;
  const lockSettings = '[aria-labelledby=app-lock-settings-title]';
  const unlock = async () => {
    await fill('input[name=unlock-password]', { 0: password });
    await click('Разблокировать', '.app-lock-unlock-form button');
    await wait("!document.querySelector('.app-lock-screen[open]')");
  };
  await navigate('/settings', 'Настройки');
  await click('Установить пароль', `${lockSettings} button`);
  const options = await js("[...document.querySelectorAll('[name=app-lock-timeout] option')].map(option => option.textContent)");
  assert.deepEqual(options, ['5 минут', '1 час', '3 часа']);
  await fill('input[name=new-password]', { 0: password });
  await fill('input[name=confirm-password]', { 0: password });
  await click('Сохранить', `${lockSettings} button`);
  await wait(`document.querySelector('${lockSettings}')?.textContent.includes('Установлен')`);
  assert.deepEqual(await api('appLock', 'getStatus'), { enabled: true, locked: false, timeoutMinutes });
  window.close();
  assert.equal(window.isVisible(), false);
  clockOffset += timeoutMinutes * 60_000;
  await wait("Boolean(document.querySelector('.app-lock-screen[open] input[name=unlock-password]'))");
  assert.ok(notifications.every(notification => notification.closed));

  const lockedTitle = 'Срок, полученный при блокировке';
  addExternalTask(lockedTitle);
  wake.emit('resume');
  assert.equal(notifications.length, 3);
  const privateNotification = notifications[2];
  assert.deepEqual(privateNotification.options, { title: 'Work Board', body: 'Новое уведомление' });
  assert.equal(privateNotification.state.visible, false);
  privateNotification.emit('click');
  assert.equal(window.isVisible(), true);
  assert.equal(await js("getComputedStyle(document.querySelector('.app-shell')).visibility"), 'hidden');
  assert.equal(await js("Boolean(document.querySelector('.notification-panel'))"), false);
  assert.doesNotMatch(await js("document.querySelector('.app-lock-screen[open]').innerText"), new RegExp(lockedTitle));

  await unlock();
  await wait(`document.querySelector('.notification-panel')?.textContent.includes(${JSON.stringify(lockedTitle)})`);
  const lockedReminder = (await api('notifications', 'list', { generation })).items.find(item => item.title === lockedTitle);
  assert.equal(lockedReminder.unread, true);
  assert.equal(lockedReminder.popupPending, false);
  await js("document.querySelector('[aria-label=\"Закрыть уведомления\"]').click()");

  await navigate('/settings', 'Настройки');
  await js("document.querySelector('[name=planning-enabled]').click()");
  await wait("Boolean(document.querySelector('a[href=\"#/planning-control\"]'))");
  const planDate = localDate();
  const [plan] = await api('plans', 'create', { generation, rows: [{
    title: 'Годовой план', planItem: 'Проверка склада', instructionNumber: 'П-12', executor: 'Отдел',
    controlDate: planDate, deadline: planDate, controlSchedule: { frequency: 'custom', customDates: [planDate] },
  }] });
  const planNotification = notifications.at(-1);
  assert.notEqual(planNotification, privateNotification);
  planNotification.emit('click');
  await wait("document.querySelector('.notification-panel')?.textContent.includes('Проверка склада')");
  await js("[...document.querySelectorAll('.notification-record')].find(row => row.textContent.includes('Промежуточный контроль плана')).click()");
  await wait(`document.activeElement === document.querySelector('.planning-dialog[open] [data-checkpoint-date="${planDate}"] textarea') && Boolean(document.activeElement)`);
  assert.equal(await js("document.querySelector('.planning-dialog [name=planItem]').value"), 'Проверка склада');
  const planReminders = (await api('notifications', 'list', { generation })).items.filter(item => item.recordId === plan.id);
  assert.equal(planReminders.find(item => item.kind === 'planCheckpoint').unread, false);
  assert.equal(planReminders.find(item => item.kind === 'plan').unread, true);
  await js("document.querySelector('.planning-dialog .registry-close-button').click()");
  await wait("!document.querySelector('.planning-dialog[open]')");

  await navigate('/calendar', 'Календарь и задачи');
  await click('Новая задача', '.calendar-page-heading button');
  await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
  await fill('[name=task-title]', { 0: 'Черновик перед выходом' });
  await api('appLock', 'lock');
  await wait("document.activeElement?.getAttribute('name') === 'unlock-password'");
  assert.equal(await js("getComputedStyle(document.querySelector('.calendar-task-dialog')).visibility"), 'hidden');
  await unlock();
  assert.equal(await js("getComputedStyle(document.querySelector('.calendar-task-dialog')).visibility"), 'visible');
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
    console.log('Background Electron smoke passed: tray delivery, click restore, automatic lock, private notifications, deferred opening, draft retention and guarded Exit. Native OS delivery adapter was injected; no test toasts were published.');
  });
  trayMenu.find(item => item.label === 'Выход').click();
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Не сохранять', '.calendar-confirm-dialog button');
}).catch(async error => {
  console.error(error);
  try { await driver?.screenshot('background-smoke-failure.png'); } catch {}
  clearTimeout(timeout); app.exit(1);
});
