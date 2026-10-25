import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { app, dialog } from 'electron';
import ExcelJS from 'exceljs';
import { localDate } from '../src/shared/registry.js';

const userData = process.env.WORK_BOARD_SMOKE_USER_DATA;
if (!userData) throw new Error('Run npm run test:desktop.');
app.setPath('userData', userData);
const firstFile = path.join(userData, 'selected-controls.sqlite');
const secondFile = path.join(userData, 'another.sqlite');
const exportFile = path.join(userData, 'filtered.xlsx');
const today = localDate();
const createFiles = [firstFile, secondFile];
let openingFile = null;
dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: options.title.includes('Excel') ? exportFile : createFiles.shift() });
dialog.showOpenDialog = async () => openingFile ? { canceled: false, filePaths: [openingFile] } : { canceled: true, filePaths: [] };
const timeout = setTimeout(() => { console.error('Registry desktop smoke timed out.'); app.exit(1); }, 80000);
const output = fileURLToPath(new URL('../output/', import.meta.url));
mkdirSync(output, { recursive: true });

app.once('browser-window-created', (_event, window) => {
  window.webContents.setBackgroundThrottling(false);
  queueMicrotask(() => window.removeAllListeners('ready-to-show'));
  // CSS transitions need a live compositor. Keep the verification window
  // transparent, absent from the taskbar, and unable to intercept user clicks.
  window.setOpacity(0);
  window.setSkipTaskbar(true);
  window.setIgnoreMouseEvents(true);
  const errors = [];
  window.webContents.on('preload-error', (_event, _path, error) => errors.push(error.message));
  window.webContents.on('console-message', (details) => { if (details.level === 'error') errors.push(details.message); });
  const js = (source) => window.webContents.executeJavaScript(source);
  const api = async (namespace, method, payload) => {
    const result = await js(`window.desktopAPI.${namespace}.${method}(${payload === undefined ? '' : JSON.stringify(payload)})`);
    assert.equal(typeof result?.ok, 'boolean', 'IPC must return an explicit result envelope');
    if (!result.ok) throw Object.assign(new Error(result.error.message), { code: result.error.code });
    return result.value;
  };
  let pageMotionVerified = false;

  async function wait(expression) {
    for (let count = 0; count < 200; count++) {
      if (await js(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Renderer condition not met: ${expression}`);
  }
  async function click(text, selector = 'button') {
    await js(`(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(el => el.textContent.trim() === ${JSON.stringify(text)}); if (!node) throw new Error('Button missing: ' + ${JSON.stringify(text)}); node.click(); })()`);
  }
  async function navigate(route, heading) {
    await js(`document.querySelector('nav a[href=${JSON.stringify('#' + route)}]').click()`);
    await wait(`document.querySelector('h1')?.textContent === ${JSON.stringify(heading)}`);
    if (!pageMotionVerified) {
      await verifyEntrance('.page', 'page navigation');
      pageMotionVerified = true;
    }
  }
  async function fill(selector, values) {
    await js(`(() => { const fields = document.querySelectorAll(${JSON.stringify(selector)}); for (const [index, value] of Object.entries(${JSON.stringify(values)})) { const field=fields[Number(index)]; if (!field) throw new Error('Field missing '+index); field.value=value; field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true})); } })()`);
  }
  async function openFilters() {
    await js("document.querySelector('.registry-filter-toggle').click()");
    await wait("Boolean(document.querySelector('.registry-filters:popover-open')) && document.querySelector('.registry-filter-toggle').getAttribute('aria-expanded') === 'true' && Boolean(document.activeElement?.closest('.registry-filters'))");
  }
  async function escapeKey() {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  }
  async function verifyEntrance(selector, label) {
    const frame = await js(`(async () => {
      let frame;
      for(let attempt=0;attempt<30;attempt++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const element=document.querySelector(${JSON.stringify(selector)});
        const style=getComputedStyle(element);
        frame={opacity:Number(style.opacity),transform:style.transform,animations:element.getAnimations().map(a=>({state:a.playState,duration:a.effect.getTiming().duration}))};
        if(frame.opacity > .01 && frame.opacity < .99 && frame.animations.some(a=>a.state==='running')) break;
      }
      return frame;
    })()`);
    assert.ok(frame.animations.some(animation => animation.state === 'running' && animation.duration > 0), `${label}: no real entrance animation ${JSON.stringify(frame)}`);
    assert.ok(frame.opacity > 0 && frame.opacity < 1, `${label}: no intermediate fade frame ${JSON.stringify(frame)}`);
    console.log(`Motion ${label}: intermediate opacity ${frame.opacity.toFixed(3)}.`);
  }
  async function geometry(kind, label) {
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const measurements = await js(`(() => {
      const rect = selector => { const el=document.querySelector(selector); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight}; };
      const selectors=${JSON.stringify(['.main-content', '.page', '.registry-toolbar', '.registry-pagination', '.registry-table-scroll', '.registry-table thead', '.registry-table tbody tr', '.calendar-page-heading', '.calendar-month-panel', '.calendar-month-grid', '.calendar-day-panel', '.calendar-add-task'])};
      return {width:innerWidth,height:innerHeight,document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},elements:Object.fromEntries(selectors.map(s=>[s,rect(s)])),dates:[...document.querySelectorAll('.calendar-date')].map(el=>{const r=el.getBoundingClientRect();return{right:r.right,bottom:r.bottom,x:r.x,y:r.y}}),columns:document.querySelectorAll('.registry-table th').length};
    })()`);
    const { width, height, elements, document: bounds } = measurements;
    assert.ok(bounds.width <= width + 1 && bounds.height <= height + 1, `${label}: document overflow ${JSON.stringify(measurements)}`);
    const main = elements['.main-content'];
    const page = elements['.page'];
    assert.ok(main.scrollHeight <= main.clientHeight + 1, `${label}: main page scrolls ${JSON.stringify(measurements)}`);
    assert.ok(page.bottom <= main.bottom + 1 && page.right <= main.right + 1, `${label}: clipped workspace`);
    for (const selector of kind === 'registry'
      ? ['.registry-toolbar', '.registry-pagination']
      : ['.calendar-page-heading', '.calendar-month-panel', '.calendar-day-panel', '.calendar-add-task']) {
      const element = elements[selector];
      assert.ok(element && element.y >= main.y - 1 && element.bottom <= main.bottom + 1 && element.right <= main.right + 1,
        `${label}: ${selector} is outside the workspace ${JSON.stringify(measurements)}`);
    }
    if (kind === 'registry') {
      const scroller = elements['.registry-table-scroll'];
      assert.equal(measurements.columns, 8);
      assert.ok(scroller.scrollWidth <= scroller.clientWidth + 1, `${label}: default table needs horizontal scrolling`);
      const header = elements['.registry-table thead'];
      const row = elements['.registry-table tbody tr'];
      assert.ok(scroller.height + 1 >= header.height + row.height * 3, `${label}: fewer than three visible rows ${JSON.stringify({scroller:scroller.height,header:header.height,row:row.height})}`);
    } else {
      const grid = elements['.calendar-month-grid'];
      assert.ok([35,42].includes(measurements.dates.length));
      assert.ok(measurements.dates.every(day => day.bottom <= grid.bottom + 1 && day.y >= grid.y - 1 && day.right <= grid.right + 1), `${label}: calendar dates are clipped`);
    }
    console.log(`Adaptive ${label}: ${width}×${height}, workspace fits.`);
  }
  async function resizeSweep(kind) {
    for (const [width, height] of [[1200,780], [1024,768], [720,640], [720,540], [1440,900]]) {
      window.setSize(width, height);
      await new Promise(resolve => setTimeout(resolve, 230));
      await geometry(kind, `${kind} ${width}×${height}`);
      if ((width === 720 && height === 640) || (width === 1200 && height === 780)) await screenshot(`${kind}-adaptive-${width}.png`);
    }
    window.setSize(1200,780);
    await new Promise(resolve => setTimeout(resolve, 230));
  }
  async function screenshot(name) {
    // Invalidate every layer: hidden Chromium windows can retain an earlier
    // raster for backdrop-filtered navigation after a theme change.
    const [width, height] = window.getContentSize();
    window.setContentSize(width + 1, height);
    await js('new Promise(resolve => requestAnimationFrame(resolve))');
    window.setContentSize(width, height);
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await new Promise(resolve => setTimeout(resolve, 220));
    writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG());
  }

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
      assert.equal(initial.schemaVersion, 2);
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
      await js("document.querySelector('.registry-instruction-form').requestSubmit()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '1'");
      const created = (await api('instructions', 'list', { generation })).items[0];
      assert.equal(created.incomingNumber, '0017');

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
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await wait("document.activeElement?.classList.contains('brand')");
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers: ['shift'] });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers: ['shift'] });
      await wait("document.activeElement === document.querySelector('#expanded-navigation nav a:last-child')");
      await escapeKey();
      await wait("!document.querySelector('.sidebar-frame-overlay') && document.activeElement?.classList.contains('sidebar-toggle')");
      assert.equal(await js("document.querySelector('.app-body').inert"), false);
      await openFilters();
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: 'Черновик фильтра' });
      await escapeKey();
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
      await js("document.querySelector('.calendar-task-form').requestSubmit()");
      await wait("!document.querySelector('.calendar-task-dialog[open]') && Boolean(document.querySelector('.calendar-task-open'))");
      day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
      assert.equal(day.tasks, 1);
      await screenshot('calendar-light.png');
      await resizeSweep('calendar');
      for (let attempt = 0; attempt < 12; attempt++) {
        await js("document.querySelector('[aria-label=\"Следующий месяц\"]').click()");
        await wait("document.querySelector('.calendar-month-panel')?.getAttribute('aria-busy') === 'false'");
        if (await js("document.querySelector('.calendar-month-grid')?.style.getPropertyValue('--calendar-weeks') === '6'")) break;
      }
      assert.equal(await js("document.querySelector('.calendar-month-grid').style.getPropertyValue('--calendar-weeks')"), '6');
      window.setSize(720,540);
      await new Promise(resolve => setTimeout(resolve, 230));
      await geometry('calendar', 'six-week month 720×540');
      await click('Сегодня', '.calendar-month-navigation button');
      await wait("Boolean(document.querySelector('.calendar-task-open'))");
      window.setSize(1200,780);
      await new Promise(resolve => setTimeout(resolve, 230));

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

      await navigate('/settings', 'Настройки');
      await js("document.querySelector('button[value=dark]').click()");
      await wait("document.documentElement.dataset.appearance === 'dark'");
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
      await assert.rejects(api('instructions', 'update', { id: created.id, data: { title: 'Wrong DB' }, generation }));
      await click('Открыть базу', '.storage-button');
      assert.equal((await api('database', 'getStatus')).generation, next.generation);
      openingFile = firstFile;
      await click('Открыть базу', '.storage-button');
      await wait("document.querySelector('.file-path')?.textContent.includes('selected-controls.sqlite')");
      const reopened = await api('database', 'getStatus');
      assert.equal((await api('instructions', 'list', { generation: reopened.generation })).total, 27);
      assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 1);
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
      await navigate('/calendar', 'Календарь и задачи');
      await wait("Boolean(document.querySelector('.calendar-task-open'))");
      await js("document.querySelector('.calendar-task-open').click()");
      await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
      await click('Удалить', '.calendar-task-dialog button');
      await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
      await click('Удалить', '.calendar-confirm-dialog button');
      await wait("!document.querySelector('.calendar-task-dialog[open]') && !document.querySelector('.calendar-task-open')");
      assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 0);
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
      await escapeKey();
      await wait("!document.querySelector('.registry-filters:popover-open')");
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await js("document.querySelector('nav a[href=\"#/calendar\"]').click(); document.querySelector('nav a[href=\"#/settings\"]').click(); document.querySelector('nav a[href=\"#/\"]').click()");
      await wait("document.querySelector('h1')?.textContent === 'Реестр указаний' && location.hash === '#/' && !document.querySelector('.workspace-enter-active,.workspace-leave-active')");
      assert.equal(await js("document.querySelectorAll('.page').length"), 1);
      console.log('Motion rapid navigation and reduced-motion checks passed.');
      await navigate('/calendar', 'Календарь и задачи');
      window.setSize(720, 640);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
      await screenshot('calendar-compact.png');
      assert.deepEqual(errors, []);
      window.webContents.debugger.detach();
      clearTimeout(timeout);
      console.log('Registry desktop smoke passed: create/open DB, CRUD UI, filters, 27-row Excel, calendar counts/tasks, generation isolation, unsaved close guard, light/dark, compact window.');
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
