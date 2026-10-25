import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app, dialog } from 'electron';
import ExcelJS from 'exceljs';
import { localDate } from '../src/shared/registry.js';
import { PROJECT_ROOT } from './lib/runtime.mjs';
import { DesktopSmokeDriver } from './lib/DesktopSmokeDriver.mjs';

const SMOKE_TIMEOUT_MS = 80_000;
const userData = process.env.WORK_BOARD_SMOKE_USER_DATA;
if (!userData) throw new Error('Run npm run test:desktop.');
app.setPath('userData', userData);
const firstFile = path.join(userData, 'selected-controls.sqlite');
const secondFile = path.join(userData, 'another.sqlite');
const exportFile = path.join(userData, 'filtered.xlsx');
const attachmentSource = path.join(userData, 'Приложение к отчёту.txt');
const downloadedFile = path.join(userData, 'downloaded.txt');
writeFileSync(attachmentSource, 'Документ для задачи и указания.');
const today = localDate();
const createFiles = [firstFile, secondFile];
let openingFile = null;
dialog.showSaveDialog = async (_window, { title }) => {
  const filePath = title.includes('Excel') ? exportFile
    : title.includes('вложение') ? downloadedFile : createFiles.shift();
  return { canceled: false, filePath };
};
dialog.showOpenDialog = async (_window, { title }) => {
  if (title === 'Прикрепить файлы') return { canceled: false, filePaths: [attachmentSource] };
  return openingFile ? { canceled: false, filePaths: [openingFile] } : { canceled: true, filePaths: [] };
};
const timeout = setTimeout(() => { console.error('Registry desktop smoke timed out.'); app.exit(1); }, SMOKE_TIMEOUT_MS);
const output = path.join(PROJECT_ROOT, 'output');
mkdirSync(output, { recursive: true });

app.once('browser-window-created', (_event, window) => {
  const driver = new DesktopSmokeDriver(window, { output });
  driver.prepare();
  const { js, api, wait, click, navigate, fill, openFilters, pressKey, verifyEntrance,
    geometry, resize, resizeDefault, resizeSweep, screenshot, errors } = driver;

  window.webContents.once('did-finish-load', async () => {
    try {
      window.showInactive();
      await wait("document.querySelector('h1')?.textContent === 'Реестр указаний' && !document.querySelector('[aria-busy=true]')");
      window.webContents.debugger.attach('1.3');
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      assert.equal((await api('database', 'getStatus')).ready, false);
      assert.equal(await js('typeof window.require'), 'undefined');
      assert.equal(await js('typeof window.desktopAPI.invoke'), 'undefined');
      await screenshot('registry-first-run.png');

      await navigate('/settings', 'Настройки');
      await click('Создать базу', '.storage-button');
      await wait("document.querySelector('.file-path')?.textContent.includes('selected-controls.sqlite')");
      const initial = await api('database', 'getStatus');
      const generation = initial.generation;
      assert.equal(initial.schemaVersion, 3);
      assert.equal(initial.filePath, firstFile);

      await navigate('/', 'Реестр указаний');
      await click('Добавить указание', '.registry-toolbar button');
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
      await verifyEntrance('.registry-instruction-dialog', 'instruction card');
      assert.equal(await js("document.querySelector('.registry-form-grid').disabled"), false);
      await fill('.registry-form-grid input,.registry-form-grid textarea,.registry-form-grid select', {
        0: today, 1: '0017', 2: '0001/К', 3: today, 4: 'Проверить отчёт',
        5: 'Сверить сведения\nПодготовить итоговую справку.', 6: 'Иванов И.И.', 7: 'pending', 8: 'Ожидается ответ',
      });
      await js("document.querySelector('.registry-instruction-dialog .attachment-add').click()");
      await wait("document.querySelectorAll('.attachment-list li').length === 1 && !document.querySelector('.attachment-add').disabled");
      await js("document.querySelector('.registry-instruction-form').requestSubmit()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '1'");
      const created = (await api('instructions', 'list', { generation })).items[0];
      assert.equal(created.incomingNumber, '0017');
      const instructionFiles = await api('attachments', 'list', { entityType: 'instructions', entityId: created.id, generation });
      assert.equal(instructionFiles.length, 1);
      assert.equal(readFileSync(path.join(firstFile + '.files', instructionFiles[0].relativePath), 'utf8'), 'Документ для задачи и указания.');

      // Fixture rows make pagination meaningful; user CRUD above exercised the actual form.
      await js(`(async () => { for(let index=0;index<26;index++) await window.desktopAPI.instructions.create({generation:${generation},data:{controlDate:${JSON.stringify(today)},incomingNumber:'00'+index,instructionNumber:'К-'+index,title:'Плановое указание '+(index+1),summary:'Подготовить документы и проверить исполнение.',deadline:${JSON.stringify(today)},executor:'Иванов И.И.',status:'pending',executionMark:''}}); })()`);
      await openFilters();
      await verifyEntrance('.registry-filters', 'filter popover');
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 1: today, 2: today, 3: 'иванов' });
      await click('Применить', '.registry-filters button');
      await wait("document.querySelector('.registry-count')?.textContent === '27' && document.querySelectorAll('.registry-table tbody tr').length === 25");
      await screenshot('registry-light.png');
      await resizeSweep('registry');
      await js("document.querySelector('.registry-column-toggle').click()");
      await wait("document.querySelector('.registry-column-toggle')?.getAttribute('aria-pressed') === 'true'");
      assert.equal(await js("document.querySelector('.registry-table-scroll').scrollWidth > document.querySelector('.registry-table-scroll').clientWidth"), true);
      await js("document.querySelector('.registry-table-scroll').scrollTop = 300");
      assert.equal(await js("Math.abs(document.querySelector('.registry-table th').getBoundingClientRect().top - document.querySelector('.registry-table-scroll').getBoundingClientRect().top) < 2"), true);
      await js("document.querySelector('.registry-column-toggle').click(); document.querySelector('.registry-table-scroll').scrollTop = 0");
      const workspaceWidth = await js("document.querySelector('.main-content').getBoundingClientRect().width");
      await js("document.querySelector('.sidebar-toggle').click()");
      await wait("Boolean(document.querySelector('.sidebar-frame-overlay')) && document.activeElement?.classList.contains('sidebar-close')");
      await verifyEntrance('.sidebar-floating', 'navigation panel');
      assert.equal(await js("document.querySelector('.main-content').getBoundingClientRect().width"), workspaceWidth,
        'Expanded compact navigation must overlay rather than squeeze the table');
      assert.equal(await js("document.querySelector('.app-body').inert"), true);
      await js("document.querySelector('#expanded-navigation nav a:last-child').focus()");
      await pressKey('Tab');
      await wait("document.activeElement?.classList.contains('brand')");
      await pressKey('Tab', ['shift']);
      await wait("document.activeElement === document.querySelector('#expanded-navigation nav a:last-child')");
      await pressKey('Escape');
      await wait("!document.querySelector('.sidebar-frame-overlay') && document.activeElement?.classList.contains('sidebar-toggle')");
      assert.equal(await js("document.querySelector('.app-body').inert"), false);
      await openFilters();
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: 'Черновик фильтра' });
      await pressKey('Escape');
      await wait("!document.querySelector('.registry-filters:popover-open') && document.activeElement?.classList.contains('registry-filter-toggle')");
      assert.equal(await js("document.querySelector('.registry-count').textContent"), '27');
      await openFilters();
      assert.equal(await js("document.querySelector('[data-filter=instructionNumber]').value"), 'Черновик фильтра');
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: '' });
      await click('Применить', '.registry-filters button');
      await wait("!document.querySelector('.registry-filters:popover-open')");
      await click('Выгрузить Excel', '.registry-toolbar button');
      await wait("document.querySelector('.registry-notice')?.textContent.includes('27')");
      assert.equal(existsSync(exportFile), true);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(exportFile);
      assert.equal(workbook.getWorksheet('Указания').rowCount, 28);
      assert.equal(workbook.getWorksheet('Указания').columnCount, 8);
      assert.match(JSON.stringify(workbook.getWorksheet('Параметры').getSheetValues()), /иванов/);

      await openFilters();
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: '0001/к' });
      await click('Применить', '.registry-filters button');
      await wait("document.querySelector('.registry-count')?.textContent === '1'");
      await js("document.querySelector('.registry-table tbody tr').click()");
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
      await wait("Boolean(document.querySelector('.attachment-list button.attachment-name'))");
      await js("document.querySelector('.attachment-list button.attachment-name').click()");
      await wait("document.querySelector('.attachment-panel')?.textContent.includes('сохранён.')");
      assert.equal(readFileSync(downloadedFile, 'utf8'), 'Документ для задачи и указания.');
      await js("document.querySelector('.attachment-panel').scrollIntoView({block:'center'})");
      await screenshot('instruction-attachments.png');
      await fill('.registry-form-grid input,.registry-form-grid textarea,.registry-form-grid select', { 7: 'completed', 8: 'Исполнено в срок' });
      await js("document.querySelector('.registry-instruction-form').requestSubmit()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]')");
      assert.equal((await api('instructions', 'get', { id: created.id, generation })).status, 'completed');

      await navigate('/calendar', 'Календарь и задачи');
      await wait("Boolean(document.querySelector('.calendar-date[aria-current=date]')) && !document.querySelector('.calendar-day-panel[aria-busy=true]')");
      let day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
      assert.equal(day.controls, 26);
      assert.equal(day.completedControls, 1);
      await click('Новая задача', '.calendar-page-heading button');
      await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
      await verifyEntrance('.calendar-task-dialog', 'task card');
      assert.equal(await js("document.querySelector('.calendar-task-form fieldset').disabled"), false);
      await fill('.calendar-task-form input:not([type=checkbox]),.calendar-task-form select,.calendar-task-form textarea', { 0: 'Подготовить совещание', 1: today, 2: 'urgent', 3: 'Согласовать повестку и участников.' });
      await js("document.querySelector('.calendar-task-dialog .attachment-add').click()");
      await wait("document.querySelectorAll('.attachment-list li').length === 1 && !document.querySelector('.attachment-add').disabled");
      await js("document.querySelector('.calendar-task-form').requestSubmit()");
      await wait("!document.querySelector('.calendar-task-dialog[open]') && Boolean(document.querySelector('.calendar-task-open'))");
      day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
      assert.equal(day.tasks, 1);
      const savedTask = (await api('calendar', 'day', { date: today, generation })).tasks[0];
      const taskFiles = await api('attachments', 'list', { entityType: 'tasks', entityId: savedTask.id, generation });
      assert.equal(taskFiles.length, 1);
      await screenshot('calendar-light.png');
      await resizeSweep('calendar');
      for (let attempt = 0; attempt < 12; attempt++) {
        await js("document.querySelector('[aria-label=\"Следующий месяц\"]').click()");
        await wait("document.querySelector('.calendar-month-panel')?.getAttribute('aria-busy') === 'false'");
        if (await js("document.querySelector('.calendar-month-grid')?.style.getPropertyValue('--calendar-weeks') === '6'")) break;
      }
      assert.equal(await js("document.querySelector('.calendar-month-grid').style.getPropertyValue('--calendar-weeks')"), '6');
      await resize(720, 540);
      await geometry('calendar', 'six-week month 720×540');
      await click('Сегодня', '.calendar-month-navigation button');
      await wait("Boolean(document.querySelector('.calendar-task-open'))");
      await resizeDefault();

      // A failed native checkbox save must keep the visible control consistent with SQLite.
      const lock = new DatabaseSync(firstFile);
      lock.exec('BEGIN IMMEDIATE');
      try {
        await js("document.querySelector('.calendar-task-checkbox').click()");
        await wait("Boolean(document.querySelector('.calendar-task-error'))");
      } finally { lock.exec('ROLLBACK'); lock.close(); }
      assert.equal(await js("document.querySelector('.calendar-task-checkbox').checked"), false);
      await js("document.querySelector('.calendar-task-checkbox').click()");
      await wait("document.querySelector('.calendar-task-checkbox')?.checked && Boolean(document.querySelector('.calendar-task-completed'))");
      assert.equal((await api('calendar', 'day', { date: today, generation })).tasks[0].completed, true);

      // Dirty-task close guard stays in Electron until the user chooses an action.
      await js("document.querySelector('.calendar-task-open').click()");
      await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
      await wait("Boolean(document.querySelector('.attachment-list button.attachment-name'))");
      await js("document.querySelector('.calendar-task-dialog .attachment-add').click()");
      await wait("document.querySelectorAll('.attachment-list li').length === 2 && !document.querySelector('.attachment-add').disabled");
      await fill('[name=task-title]', { 0: 'Несохранённое изменение' });
      window.close();
      await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
      await click('Продолжить редактирование', '.calendar-confirm-dialog button');
      await wait("!document.querySelector('.calendar-confirm-dialog[open]') && !document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').disabled");
      assert.equal(window.isDestroyed(), false);
      await js("document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').click()");
      await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
      await click('Не сохранять', '.calendar-confirm-dialog button');
      await wait("!document.querySelector('.calendar-task-dialog[open]')");
      assert.equal((await api('attachments', 'list', { entityType: 'tasks', entityId: savedTask.id, generation })).length, 1);

      await navigate('/analytics', 'Аналитика');
      await wait("document.querySelector('[data-metric=total]')?.textContent === '28'");
      assert.equal(await js("document.querySelector('[data-metric=completed]').textContent"), '2');
      assert.equal(await js("document.querySelector('[data-metric=active]').textContent"), '26');
      await screenshot('analytics-light.png');
      await js("document.querySelector('.analytics-filter-toggle').click()");
      await wait("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded') === 'true'");
      await fill('[name=analytics-priority]', { 0: 'urgent' });
      await click('Применить', '.analytics-filters button');
      await wait("document.querySelector('[data-metric=total]')?.textContent === '1'");
      assert.equal(await js("document.querySelector('[data-metric=completed]').textContent"), '1');
      await click('Сбросить', '.analytics-filters button');
      await wait("document.querySelector('[data-metric=total]')?.textContent === '28'");
      await fill('[name=analytics-from]', { 0: '2000-01-01' }); await fill('[name=analytics-to]', { 0: '2000-01-31' });
      await click('Применить', '.analytics-filters button');
      await wait("document.querySelector('.analytics-empty h2')?.textContent === 'В этой выборке нет записей'");
      await click('Сбросить', '.analytics-filters button');
      await wait("document.querySelector('[data-metric=total]')?.textContent === '28'");
      await resize(720, 540);
      await js("document.querySelector('.analytics-filter-toggle').click()");
      await wait("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded') === 'false'");
      assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
      assert.equal(await js("document.querySelector('.main-content').scrollWidth > document.querySelector('.main-content').clientWidth"), false);
      await screenshot('analytics-compact.png');
      await resizeDefault();

      await navigate('/settings', 'Настройки');
      await js("document.querySelector('button[value=dark]').click()");
      await wait("document.documentElement.dataset.appearance === 'dark'");
      await navigate('/analytics', 'Аналитика');
      await wait("document.querySelector('[data-metric=total]')?.textContent === '28'");
      await screenshot('analytics-dark.png');
      await navigate('/calendar', 'Календарь и задачи');
      await wait("Boolean(document.querySelector('.calendar-task-open'))");
      await screenshot('calendar-dark.png');
      assert.equal(await js('getComputedStyle(document.querySelector(".brand-title")).color === getComputedStyle(document.body).color'), true,
        'Brand text must follow the dark palette');
      await navigate('/', 'Реестр указаний');
      await wait("document.querySelectorAll('.registry-table tbody tr').length > 0");
      await screenshot('registry-dark.png');

      await navigate('/settings', 'Настройки');
      await click('Создать другую базу', '.storage-button');
      await wait("document.querySelector('.file-path')?.textContent.includes('another.sqlite')");
      const next = await api('database', 'getStatus');
      assert.notEqual(next.generation, generation);
      assert.equal((await api('instructions', 'list', { generation: next.generation })).total, 0);
      assert.equal((await api('analytics', 'summary', { generation: next.generation })).totals.total, 0);
      await assert.rejects(api('instructions', 'update', { id: created.id, data: { title: 'Wrong DB' }, generation }));
      await click('Открыть базу', '.storage-button');
      assert.equal((await api('database', 'getStatus')).generation, next.generation);
      openingFile = firstFile;
      await click('Открыть базу', '.storage-button');
      await wait("document.querySelector('.file-path')?.textContent.includes('selected-controls.sqlite')");
      const reopened = await api('database', 'getStatus');
      assert.equal((await api('instructions', 'list', { generation: reopened.generation })).total, 27);
      assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 1);
      assert.equal((await api('attachments', 'list', { entityType: 'instructions', entityId: created.id, generation: reopened.generation })).length, 1);
      assert.equal(JSON.parse(readFileSync(path.join(userData, 'database-location.json'), 'utf8')).filePath, firstFile);

      await navigate('/', 'Реестр указаний');
      await openFilters();
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: '0001/К' });
      await click('Применить', '.registry-filters button');
      await wait("document.querySelector('.registry-count')?.textContent === '1'");
      await js("document.querySelector('.registry-table tbody tr').click()");
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
      await click('Удалить', '.registry-instruction-dialog button');
      await wait("Boolean(document.querySelector('.registry-confirm-dialog[open]'))");
      await click('Удалить', '.registry-confirm-dialog button');
      await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '0'");
      assert.equal(await api('instructions', 'get', { id: created.id, generation: reopened.generation }), null);
      assert.equal(existsSync(path.join(firstFile + '.files', instructionFiles[0].relativePath)), false);
      await navigate('/calendar', 'Календарь и задачи');
      await wait("Boolean(document.querySelector('.calendar-task-open'))");
      await js("document.querySelector('.calendar-task-open').click()");
      await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
      await click('Удалить', '.calendar-task-dialog button');
      await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
      await click('Удалить', '.calendar-confirm-dialog button');
      await wait("!document.querySelector('.calendar-task-dialog[open]') && !document.querySelector('.calendar-task-open')");
      assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 0);
      assert.equal(existsSync(path.join(firstFile + '.files', taskFiles[0].relativePath)), false);
      // Reduced motion must remove visual delays without changing focus or editing.
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await wait("matchMedia('(prefers-reduced-motion: reduce)').matches");
      await click('Новая задача', '.calendar-page-heading button');
      await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
      assert.equal(await js("document.querySelector('.calendar-task-dialog').getAnimations().filter(a=>a.playState==='running').length"), 0);
      assert.equal(await js("document.querySelector('.calendar-task-dialog').dataset.motionState"), undefined);
      await js("document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').click()");
      await wait("!document.querySelector('.calendar-task-dialog[open]')");
      await navigate('/', 'Реестр указаний');
      await openFilters();
      assert.equal(await js("document.querySelector('.registry-filters').getAnimations().filter(a=>a.playState==='running').length"), 0);
      await pressKey('Escape');
      await wait("!document.querySelector('.registry-filters:popover-open')");
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await js("document.querySelector('nav a[href=\"#/calendar\"]').click(); document.querySelector('nav a[href=\"#/settings\"]').click(); document.querySelector('nav a[href=\"#/\"]').click()");
      await wait("document.querySelector('h1')?.textContent === 'Реестр указаний' && location.hash === '#/' && !document.querySelector('.workspace-enter-active,.workspace-leave-active')");
      assert.equal(await js("document.querySelectorAll('.page').length"), 1);
      console.log('Motion rapid navigation and reduced-motion checks passed.');
      await navigate('/calendar', 'Календарь и задачи');
      await resize(720, 640);
      assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
      await screenshot('calendar-compact.png');
      assert.deepEqual(errors, []);
      window.webContents.debugger.detach();
      clearTimeout(timeout);
      console.log('Registry desktop smoke passed: create/open DB, CRUD UI, attachments/download/discard, analytics/filter/empty state, 27-row Excel, calendar, generation isolation, unsaved close guard, light/dark, compact window.');
      app.quit();
    } catch (error) {
      console.error(error);
      try { await screenshot('registry-smoke-failure.png'); } catch {}
      clearTimeout(timeout);
      app.exit(1);
    }
  });
});

await import('../src/main/index.js');
