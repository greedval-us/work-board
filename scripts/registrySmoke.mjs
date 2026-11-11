import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app, dialog } from 'electron';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { addCalendarDays, formatDate, localDate } from '../src/shared/registry.js';
import { PROJECT_ROOT } from './lib/runtime.mjs';
import { DesktopSmokeDriver } from './lib/DesktopSmokeDriver.mjs';

const SMOKE_TIMEOUT_MS = 80_000;
const userData = process.env.WORK_BOARD_SMOKE_USER_DATA;
if (!userData) throw new Error('Run npm run test:desktop.');
app.setPath('userData', userData);
const firstFile = path.join(userData, 'selected-controls.sqlite');
const secondFile = path.join(userData, 'another.sqlite');
const exportFile = path.join(userData, 'filtered.xlsx');
const controlCardFile = path.join(userData, 'control-card.docx');
const attachmentSource = path.join(userData, 'Приложение к отчёту.txt');
const downloadedFile = path.join(userData, 'downloaded.txt');
writeFileSync(attachmentSource, 'Документ для задачи и указания.');
const today = localDate();
const originalDeadline = addCalendarDays(today, -1);
const firstCheckpointMark = 'Первый промежуточный контроль выполнен';
const nextCheckpointCell = '.registry-table tbody td[data-column=nextCheckpoint]';
const nextCheckpointTime = `${nextCheckpointCell} time[datetime]`;
const nextCheckpointHeader = 'Ближайший промежуточный контроль';
const overdueColor = 'FFB32630';
const registrySelections = { source: 'Канцелярия', executor: 'Иванов И.И.', controlType: 'Плановый' };
const renamedRegistrySelections = { source: 'Секретариат', executor: 'Петров П.П.', controlType: 'Внеплановый' };
const createFiles = [firstFile, secondFile];
let openingFile = null;
let cancelNextControlCardSave;
dialog.showSaveDialog = async (_window, { title, filters }) => {
  if (filters?.some(filter => filter.extensions.includes('docx'))) {
    if (cancelNextControlCardSave) {
      const cancelled = cancelNextControlCardSave;
      cancelNextControlCardSave = undefined;
      await cancelled;
      return { canceled: true };
    }
    return { canceled: false, filePath: controlCardFile };
  }
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
  const instructionField = (field) => `.registry-form-grid [name="${field}"]`;
  const fillInstruction = async (values) => {
    for (const [field, value] of Object.entries(values)) await fill(instructionField(field), { 0: value });
  };
  const optionForm = (field) => `[data-registry-option="${field}"]`;
  const optionRow = (field, value) =>
    `.registry-option-group:has(> ${optionForm(field)}) [data-registry-option-value=${JSON.stringify(value)}]`;
  const addRegistryOption = async (field, value) => {
    const form = optionForm(field);
    const input = `${form} input`;
    await wait(`document.querySelector(${JSON.stringify(input)})?.matches(':enabled')`);
    await fill(input, { 0: value });
    await js(`document.querySelector(${JSON.stringify(form)}).requestSubmit()`);
    await wait(`document.querySelector(${JSON.stringify(input)})?.value === ''`);
  };

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
      assert.equal(initial.schemaVersion, 6);
      assert.equal(initial.filePath, firstFile);
      await navigate('/', 'Реестр указаний');
      await click('Добавить указание', '.registry-toolbar button');
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open] .registry-options-hint a'))");
      assert.equal(await js("document.querySelector('select[name=executor]').validity.valueMissing"), true);
      await js("document.querySelector('.registry-options-hint a').click()");
      await wait("Boolean(document.querySelector('#registry-options-title'))");
      await wait("!document.querySelector('.registry-instruction-dialog[open]')");
      for (const [field, option] of Object.entries(registrySelections)) {
        await addRegistryOption(field, option);
      }
      const configuredOptions = { source: ['Канцелярия'], executor: ['Иванов И.И.'], controlType: ['Плановый'] };
      assert.deepEqual((await api('settings', 'get', generation)).registryOptions, configuredOptions);

      await navigate('/', 'Реестр указаний');
      await click('Добавить указание', '.registry-toolbar button');
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
      await verifyEntrance('.registry-instruction-dialog', 'instruction card');
      assert.equal(await js("document.querySelector('.registry-form-grid').disabled"), false);
      for (const [field, option] of Object.entries(registrySelections)) {
        const selector = `.registry-form-grid select[name="${field}"]`;
        await wait(`[...document.querySelector(${JSON.stringify(selector)})?.options ?? []].some(option => option.value === ${JSON.stringify(option)})`);
      }
      await fillInstruction({
        controlDate: addCalendarDays(originalDeadline, -1), incomingNumber: '0017', instructionNumber: '0001/К', deadline: originalDeadline, title: 'Проверить отчёт',
        extendedUntil: addCalendarDays(originalDeadline, -1),
        summary: 'Сверить сведения\nПодготовить итоговую справку.', status: 'pending', executionMark: 'Ожидается ответ',
        ...registrySelections,
      });
      assert.equal(await js("document.querySelector('[name=extendedUntil]').validity.rangeUnderflow"), true);
      assert.equal(await js("document.querySelector('[name=summary]').labels[0].textContent.trim()"), 'Резолюция');
      await fillInstruction({ extendedUntil: today });
      await fill('[name=control-frequency]', { 0: 'daily' });
      await fill('[name=control-first-date]', { 0: originalDeadline });
      await js("document.querySelector('.registry-instruction-dialog .attachment-add').click()");
      await wait("document.querySelectorAll('.attachment-list li').length === 1 && !document.querySelector('.attachment-add').disabled");
      await js("document.querySelector('.registry-instruction-form').requestSubmit()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '1'");
      const created = (await api('instructions', 'list', { generation })).items[0];
      assert.equal(created.incomingNumber, '0017');
      assert.equal(created.deadline, originalDeadline);
      assert.equal(created.extendedUntil, today);
      const savedSchedule = (await api('instructions', 'get', { id: created.id, generation })).controlSchedule;
      assert.deepEqual(savedSchedule, { frequency: 'daily', firstDate: originalDeadline, customDates: [], marks: [] });
      for (const [field, option] of Object.entries(registrySelections)) assert.equal(created[field], option);
      const headings = await js("[...document.querySelectorAll('.registry-table th')].map(cell => cell.textContent.trim())");
      assert.equal(headings[0], 'ID');
      assert.equal(headings[3], 'Подписной номер');
      assert.equal(headings[4], 'Откуда');
      assert.equal(headings[6], 'Резолюция');
      assert.equal(headings[8], 'Продлён до');
      assert.equal(headings[11], 'Вид контроля');
      assert.deepEqual(await js(`(() => {
        const header = document.querySelector('.registry-table th[data-column=nextCheckpoint]');
        return { position: header.cellIndex, title: header.title };
      })()`), { position: 9, title: nextCheckpointHeader });
      const cells = await js("[...document.querySelectorAll('.registry-table tbody tr td')].map(cell => cell.textContent.trim())");
      assert.equal(cells[0], String(created.id));
      assert.equal(cells[4], registrySelections.source);
      assert.equal(cells[10], registrySelections.executor);
      assert.equal(cells[11], registrySelections.controlType);
      assert.equal(await js("document.querySelector('.registry-row td:nth-child(9) time').dateTime"), today);
      assert.equal(await js("document.querySelector('.registry-row td:nth-child(9) .registry-urgency').textContent"), 'Срок сегодня');
      assert.equal(await js(`document.querySelector('${nextCheckpointTime}.registry-checkpoint-overdue')?.dateTime`), originalDeadline);
      const overdueTextColor = await js(`getComputedStyle(document.querySelector('${nextCheckpointTime}')).color`);
      assert.equal(overdueTextColor, 'rgb(179, 38, 48)');
      const instructionFiles = await api('attachments', 'list', { entityType: 'instructions', entityId: created.id, generation });
      assert.equal(instructionFiles.length, 1);
      assert.equal(readFileSync(path.join(firstFile + '.files', instructionFiles[0].relativePath), 'utf8'), 'Документ для задачи и указания.');

      // Fixture rows make pagination meaningful; user CRUD above exercised the actual form.
      await js(`(async () => { for(let index=0;index<26;index++) await window.desktopAPI.instructions.create({generation:${generation},data:{controlDate:${JSON.stringify(today)},incomingNumber:'00'+index,instructionNumber:'К-'+index,title:'Плановое указание '+(index+1),summary:'Подготовить документы и проверить исполнение.',deadline:${JSON.stringify(today)},executor:index === 0 ? 'Иванов А.А.' : 'Иванов И.И.',status:'pending',executionMark:'',controlSchedule:index === 0 ? {frequency:'custom',customDates:[${JSON.stringify(today)}]} : undefined}}); })()`);
      await openFilters();
      await verifyEntrance('.registry-filters', 'filter popover');
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 1: today, 2: today, 3: 'иванов' });
      await click('Применить', '.registry-filters button');
      await wait("document.querySelector('.registry-count')?.textContent === '27' && document.querySelectorAll('.registry-table tbody tr').length === 25");
      assert.equal(await js(`document.querySelector('${nextCheckpointCell}:not(:has(time))')?.textContent.trim()`), '—');
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
      const worksheet = workbook.getWorksheet('Указания');
      assert.equal(worksheet.rowCount, 28);
      assert.equal(worksheet.columnCount, 13);
      assert.equal(worksheet.getCell('J1').value, nextCheckpointHeader);
      const exported = worksheet.getRows(2, 27).find(row => row.getCell(4).value === created.instructionNumber);
      assert.ok(exported, 'Saved instruction is missing from Excel');
      assert.equal(exported.getCell(1).value, String(created.id));
      assert.equal(exported.getCell(5).value, registrySelections.source);
      assert.equal(exported.getCell(8).value, formatDate(originalDeadline));
      assert.equal(exported.getCell(9).value, formatDate(today));
      assert.equal(exported.getCell(10).value, formatDate(originalDeadline));
      assert.equal(exported.getCell(10).font.color?.argb, overdueColor);
      assert.equal(exported.getCell(11).value, registrySelections.executor);
      assert.equal(exported.getCell(12).value, registrySelections.controlType);
      assert.match(exported.getCell(13).value, /Ожидается ответ/);
      const todayCheckpoint = worksheet.getRows(2, 27).find(row => row.getCell(4).value === 'К-0').getCell(10);
      assert.equal(todayCheckpoint.value, formatDate(today));
      assert.notEqual(todayCheckpoint.font.color?.argb, overdueColor);
      assert.match(JSON.stringify(workbook.getWorksheet('Параметры').getSheetValues()), /иванов/);

      const checkpointFilter = '[data-filter=checkpoint]';
      const applyCheckpointFilter = async (value, expectedCount) => {
        await openFilters();
        await fill(checkpointFilter, { 0: value });
        await click('Применить', '.registry-filters button');
        await wait(`document.querySelector('.registry-count')?.textContent === '${expectedCount}'`);
      };
      const visibleCheckpoints = () => js(`Object.fromEntries([...document.querySelectorAll('.registry-row')].map(row => {
        const date = row.querySelector('button.registry-checkpoint-link time');
        return [row.cells[3].textContent.trim(), {
          date: date?.dateTime,
          overdue: date?.classList.contains('registry-checkpoint-overdue'),
        }];
      }))`);

      await applyCheckpointFilter('overdue', 1);
      assert.deepEqual(await js(`[...document.querySelector('${checkpointFilter}').options]
        .filter(option => option.value).map(option => [option.value, option.textContent.trim()])`), [
        ['overdue', 'Просрочено'], ['today', 'На сегодня'],
      ]);
      assert.deepEqual(await visibleCheckpoints(), {
        [created.instructionNumber]: { date: originalDeadline, overdue: true },
      });
      assert.equal(await js(`getComputedStyle(document.querySelector('${nextCheckpointTime}')).color`), overdueTextColor);

      await applyCheckpointFilter('today', 2);
      assert.deepEqual(await visibleCheckpoints(), {
        [created.instructionNumber]: { date: today, overdue: false },
        'К-0': { date: today, overdue: false },
      });
      const todayCheckpointLink = `.registry-row:has(td:first-child [title="${created.id}"]) button.registry-checkpoint-link`;
      const todayCheckpointEditor = `.registry-instruction-dialog[open] [data-checkpoint-date="${today}"] textarea`;
      await js(`document.querySelector(${JSON.stringify(todayCheckpointLink)}).click()`);
      await wait(`document.activeElement === document.querySelector(${JSON.stringify(todayCheckpointEditor)})`);
      await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]')");

      await applyCheckpointFilter('', 27);
      assert.deepEqual(await js(`['deadlineFrom', 'deadlineTo', 'executor']
        .map(key => document.querySelector('[data-filter=' + key + ']').value)`), [today, today, 'иванов']);

      await openFilters();
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: '0001/к' });
      await click('Применить', '.registry-filters button');
      await wait("document.querySelector('.registry-count')?.textContent === '1'");
      const checkpointDate = `${nextCheckpointCell} button.registry-checkpoint-link time[datetime="${originalDeadline}"]`;
      const firstCheckpointEditor = `.registry-instruction-dialog[open] [data-checkpoint-date="${originalDeadline}"] textarea`;
      const firstCheckpointFocused = `document.activeElement === document.querySelector(${JSON.stringify(firstCheckpointEditor)})`;
      const registryRoute = await js('location.hash');
      assert.equal(await js(`document.querySelector(${JSON.stringify(checkpointDate)})?.closest('button').getAttribute('aria-label')`),
        `Открыть отметку об исполнении за ${formatDate(originalDeadline)} · Просрочено`);
      await js(`document.querySelector(${JSON.stringify(checkpointDate)}).click()`);
      await wait(firstCheckpointFocused);
      assert.equal(await js('location.hash'), registryRoute);
      assert.match(await js("document.querySelector('.registry-card-id').textContent"), new RegExp(`ID ${created.id}$`));
      await wait("Boolean(document.querySelector('.attachment-list button.attachment-name'))");
      await js("document.querySelector('.attachment-list button.attachment-name').click()");
      await wait("document.querySelector('.attachment-panel')?.textContent.includes('сохранён.')");
      assert.equal(readFileSync(downloadedFile, 'utf8'), 'Документ для задачи и указания.');
      await js("document.querySelector('.attachment-panel').scrollIntoView({block:'center'})");
      await screenshot('instruction-attachments.png');

      await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
      await wait("!document.querySelector('.registry-instruction-dialog')");
      await js(`document.querySelector(${JSON.stringify(checkpointDate)}).closest('button').focus()`);
      // Chromium activates a focused button from the Enter key's character event.
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
      await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await wait(firstCheckpointFocused);
      await fill(firstCheckpointEditor, { 0: firstCheckpointMark });
      await js("document.querySelector('.registry-instruction-form').requestSubmit()");
      await wait(`!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('${nextCheckpointTime}')?.dateTime === ${JSON.stringify(today)}`);
      assert.equal(await js(`document.querySelector('${nextCheckpointTime}').classList.contains('registry-checkpoint-overdue')`), false);
      assert.notEqual(await js(`getComputedStyle(document.querySelector('${nextCheckpointTime}')).color`), overdueTextColor);

      await applyCheckpointFilter('today', 1);
      assert.deepEqual(await visibleCheckpoints(), {
        [created.instructionNumber]: { date: today, overdue: false },
      });
      await applyCheckpointFilter('overdue', 0);
      await wait("document.querySelector('.registry-empty-results h2')?.textContent === 'Указания не найдены'");
      await applyCheckpointFilter('', 1);

      await js("document.querySelector('.registry-table tbody tr').click()");
      await wait("document.querySelector('.registry-instruction-dialog[open] .registry-form-grid')?.matches(':enabled')");
      const instructionBeforeExport = await api('instructions', 'get', { id: created.id, generation });
      const controlCardDialog = '.registry-control-card-dialog[open]';
      const controlCardSave = `${controlCardDialog} .registry-control-card-save`;
      const reportField = name => `${controlCardDialog} [name="${name}"]`;
      await click('Ф‑21 в Word', '.registry-instruction-dialog .registry-control-card-open');
      await wait(`Boolean(document.querySelector('${controlCardDialog}'))`);
      const prefilledReport = await js(`Object.fromEntries([...document.querySelectorAll('${controlCardDialog} form [name]')]
        .map(field => [field.name, field.value]))`);
      assert.equal(prefilledReport.instructionNumber, created.instructionNumber);
      assert.equal(prefilledReport.incomingNumber, created.incomingNumber);
      assert.equal(prefilledReport.executor, created.executor);
      assert.equal(prefilledReport.summary, created.summary);
      assert.equal(prefilledReport.deadline, originalDeadline);
      assert.equal(prefilledReport.extendedUntil, today);
      assert.equal(prefilledReport.documentDate, '');
      assert.equal(prefilledReport.incomingDate, '');
      assert.equal(await js(`document.querySelector('${controlCardDialog} form').checkValidity()`), true);
      const reportPhone = '+7 900 555-01-23';
      await fill(reportField('executorPhone'), { 0: reportPhone });
      await fill(reportField('executionMark'), { 0: '' });

      const cancellation = Promise.withResolvers();
      cancelNextControlCardSave = cancellation.promise;
      await click('Сохранить Word', controlCardSave);
      await wait(`document.querySelector('${controlCardSave}')?.disabled`);
      cancellation.resolve();
      await wait(`document.querySelector('${controlCardSave}')?.matches(':enabled')`);
      assert.equal(existsSync(controlCardFile), false);
      assert.equal(await js(`document.querySelector(${JSON.stringify(reportField('executorPhone'))}).value`), reportPhone);

      await click('Сохранить Word', controlCardSave);
      await wait(`document.querySelector('${controlCardDialog} [role=status]')?.textContent.trim() === 'Контрольная карточка сохранена.'`);
      const reportBytes = readFileSync(controlCardFile);
      const report = await JSZip.loadAsync(reportBytes);
      const reportXml = await report.file('word/document.xml').async('string');
      const reportText = Array.from(reportXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), match => match[1]).join(' ');
      for (const value of [created.instructionNumber, created.incomingNumber, created.executor, reportPhone, firstCheckpointMark]) {
        assert.ok(reportText.includes(value), `Value missing in control card: ${value}`);
      }
      assert.ok(!reportText.includes(instructionBeforeExport.executionMark));
      assert.deepEqual(await api('instructions', 'get', { id: created.id, generation }), instructionBeforeExport);
      writeFileSync(path.join(output, 'control-card-f21.docx'), reportBytes);
      await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
      await wait(`!document.querySelector('${controlCardDialog}')`);
      await fillInstruction({ status: 'completed', executionMark: 'Исполнено в срок' });
      await js("document.querySelector('.registry-instruction-form').requestSubmit()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]')");
      assert.equal((await api('instructions', 'get', { id: created.id, generation })).status, 'completed');

      await navigate('/calendar', 'Календарь и задачи');
      await wait("Boolean(document.querySelector('.calendar-date[aria-current=date]')) && !document.querySelector('.calendar-day-panel[aria-busy=true]')");
      let day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
      assert.equal(day.controls, 26);
      assert.equal(day.completedControls, 1);
      assert.equal(day.checkpoints, 2);
      const previousDay = await api('calendar', 'day', { date: originalDeadline, generation });
      assert.equal(previousDay.instructions.length, 0);
      assert.equal(previousDay.checkpoints[0].instructionId, created.id);
      assert.equal(previousDay.checkpoints[0].mark, firstCheckpointMark);
      await wait("Boolean(document.querySelector('.calendar-checkpoint-card'))");
      await js("document.querySelector('.calendar-checkpoint-card').click()");
      const checkpointEditor = `[data-checkpoint-date="${today}"] textarea`;
      await wait(`document.activeElement === document.querySelector(${JSON.stringify(checkpointEditor)})`);
      await fill(checkpointEditor, { 0: 'Промежуточный отчёт проверен' });
      await fill('[name=control-frequency]', { 0: 'custom' });
      await fill('[name=control-custom-date]', { 0: originalDeadline });
      await click('Добавить дату', '.registry-instruction-dialog button');
      await js("document.querySelector('.registry-instruction-form').requestSubmit()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]')");
      const markedDay = await api('calendar', 'day', { date: today, generation });
      assert.equal(markedDay.checkpoints[0].mark, 'Промежуточный отчёт проверен');
      assert.equal(markedDay.checkpoints[0].scheduled, false);
      assert.deepEqual((await api('instructions', 'get', { id: created.id, generation })).controlSchedule, {
        frequency: 'custom', firstDate: '', customDates: [originalDeadline],
        marks: [
          { date: originalDeadline, text: firstCheckpointMark },
          { date: today, text: 'Промежуточный отчёт проверен' },
        ],
      });
      await navigate('/calendar', 'Календарь и задачи');
      await wait("Boolean(document.querySelector('.calendar-checkpoint-card'))");
      day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
      assert.equal(day.checkpoints, 1);
      assert.equal(day.completedCheckpoints, 1);
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
      for (const height of [640, 540]) {
        await resize(720, height);
        assert.deepEqual(await js("[...document.querySelectorAll('.calendar-day-section .calendar-list-body')].map(list => list.clientHeight > 0)"), [true, true, true]);
        const badgeLayout = await js(`(() => {
          const date = document.querySelector('.calendar-date[aria-current=date]');
          const bounds = date.getBoundingClientRect();
          return [...date.querySelectorAll('.calendar-date-count')].map(badge => {
            const rect = badge.getBoundingClientRect();
            return rect.bottom <= bounds.bottom && rect.right <= bounds.right;
          });
        })()`);
        assert.deepEqual(badgeLayout, [true, true, true, true]);
      }
      await resizeDefault();
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

      const { items: allInstructions } = await api('instructions', 'list', { generation, limit: 50 });
      const primaryExecutor = registrySelections.executor;
      const similarExecutor = 'Иванов А.А.';
      const primaryExecutorKey = 'иванов и.и.';
      const similarExecutorKey = 'иванов а.а.';
      const primaryInstructionIds = allInstructions.filter(row => row.executor === primaryExecutor).map(row => row.id);
      const similarInstruction = allInstructions.find(row => row.executor === similarExecutor);
      assert.ok(similarInstruction);
      const executorSelect = 'select[name=analytics-executor]';
      const executorOptions = () => js(`[...document.querySelector('${executorSelect}').options].map(option => [option.value, option.textContent.trim()])`);
      const instructionRows = '.analytics-instructions tr[data-instruction-id]';
      const analyticsInstructionIds = () => js(`[...document.querySelectorAll('${instructionRows}')].map(row => Number(row.dataset.instructionId))`);

      await navigate('/analytics', 'Аналитика');
      await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
      assert.equal(await js("document.querySelector('[data-metric=completed]').textContent"), '1');
      assert.equal(await js("document.querySelector('[data-metric=active]').textContent"), '26');
      const executorMetric = (label, metric) => js(`document.querySelector(${JSON.stringify(`[data-executor=${JSON.stringify(label)}] [data-executor-metric=${metric}]`)})?.textContent.trim()`);
      assert.equal(await executorMetric(primaryExecutor, 'total'), '26');
      assert.equal(await executorMetric(primaryExecutor, 'completed'), '1');
      assert.equal(await executorMetric(similarExecutor, 'active'), '1');
      assert.equal(await js("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded')"), 'false');
      assert.ok(await js(`document.querySelector('${executorSelect}').getClientRects().length`));
      const options = await executorOptions();
      assert.equal(options.length, 3);
      assert.equal(options[0][0], '');
      assert.deepEqual(new Map(options.slice(1)), new Map([[primaryExecutorKey, primaryExecutor], [similarExecutorKey, similarExecutor]]));
      await screenshot('analytics-light.png');

      await fill(executorSelect, { 0: primaryExecutorKey });
      await wait("document.querySelector('[data-metric=total]')?.textContent === '26'");
      assert.equal(await js("document.querySelector('[data-metric=completed]').textContent"), '1');
      assert.equal(await js("document.querySelectorAll('[data-executor]').length"), 1);
      assert.equal(await executorMetric(primaryExecutor, 'overdue'), '0');
      assert.deepEqual(await executorOptions(), options);
      await wait("document.querySelector('button[data-instructions-page=next]')?.matches(':enabled')");
      const firstPageIds = await analyticsInstructionIds();
      assert.equal(firstPageIds.length, 25);
      await js("document.querySelector('button[data-instructions-page=next]').click()");
      await wait(`document.querySelectorAll('${instructionRows}').length === 1 && document.querySelector('button[data-instructions-page=previous]')?.matches(':enabled')`);
      const secondPageIds = await analyticsInstructionIds();
      const byId = (left, right) => left - right;
      assert.deepEqual([...firstPageIds, ...secondPageIds].sort(byId), primaryInstructionIds.sort(byId));

      const openedInstruction = allInstructions.find(row => row.id === secondPageIds[0]);
      const instructionLink = `${instructionRows}[data-instruction-id="${openedInstruction.id}"] a`;
      assert.equal(await js(`document.querySelector('${instructionLink}').textContent.trim()`), openedInstruction.title);
      await js(`document.querySelector('${instructionLink}').click()`);
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
      assert.match(await js("document.querySelector('.registry-card-id').textContent"), new RegExp(`ID ${openedInstruction.id}$`));
      assert.equal(await js("document.querySelector('.registry-instruction-dialog input[name=title]').value"), openedInstruction.title);
      await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]')");

      await navigate('/analytics', 'Аналитика');
      await wait(`Boolean(document.querySelector('${instructionLink}'))`);
      assert.deepEqual(await analyticsInstructionIds(), secondPageIds);
      assert.equal(await js(`document.querySelector('${executorSelect}').value`), primaryExecutorKey);
      await fill(executorSelect, { 0: similarExecutorKey });
      await wait(`document.querySelector('[data-metric=total]')?.textContent === '1' && Boolean(document.querySelector('${instructionRows}[data-instruction-id="${similarInstruction.id}"]'))`);
      assert.deepEqual(await analyticsInstructionIds(), [similarInstruction.id]);
      assert.deepEqual(await executorOptions(), options);
      await fill(executorSelect, { 0: '' });
      await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
      assert.deepEqual(await analyticsInstructionIds(), []);

      await fill(executorSelect, { 0: primaryExecutorKey });
      await wait("document.querySelector('[data-metric=total]')?.textContent === '26'");
      await js("document.querySelector('.analytics-filter-toggle').click()");
      await wait("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded') === 'true'");
      assert.equal(await js("document.querySelector('[name=analytics-type], [name=analytics-priority]') === null"), true);
      await fill('[name=analytics-from]', { 0: '2000-01-01' }); await fill('[name=analytics-to]', { 0: '2000-01-31' });
      await click('Применить', '.analytics-filters button');
      await wait("document.querySelector('.analytics-empty h2')?.textContent === 'По этим фильтрам нет указаний'");
      assert.deepEqual(await analyticsInstructionIds(), []);
      assert.equal(await js(`document.querySelector('${executorSelect}').value`), primaryExecutorKey);
      assert.deepEqual(await executorOptions(), options);
      await click('Сбросить', '.analytics-filters button');
      await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
      assert.equal(await js(`document.querySelector('${executorSelect}').value`), '');
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
      await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
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
      for (const [field, savedValue] of Object.entries(registrySelections)) {
        const renamedValue = renamedRegistrySelections[field];
        const savedRow = optionRow(field, savedValue);
        const renamedRow = optionRow(field, renamedValue);
        const editButton = `${savedRow} button[data-option-action=edit]`;
        const editInput = `${savedRow} input[name=value]`;
        const saveButton = `${savedRow} button[type=submit]`;
        const removeButton = `${savedRow} button[data-option-action=remove]`;

        await wait(`document.querySelector(${JSON.stringify(editButton)})?.matches(':enabled')`);
        await js(`document.querySelector(${JSON.stringify(editButton)}).click()`);
        await wait(`document.querySelector(${JSON.stringify(editInput)})?.value === ${JSON.stringify(savedValue)}`);
        await fill(editInput, { 0: renamedValue });
        await js(`document.querySelector(${JSON.stringify(saveButton)}).click()`);
        await wait(`!document.querySelector(${JSON.stringify(savedRow)}) && Boolean(document.querySelector(${JSON.stringify(renamedRow)}))`);
        assert.deepEqual((await api('settings', 'get', generation)).registryOptions[field], [renamedValue]);
        assert.equal((await api('instructions', 'get', { id: created.id, generation }))[field], savedValue);

        // Re-add the original choice so deletion also acts on a value stored in an instruction.
        await addRegistryOption(field, savedValue);
        await wait(`document.querySelector(${JSON.stringify(removeButton)})?.matches(':enabled')`);
        if (field === 'source') {
          await js(`document.querySelector(${JSON.stringify(editButton)}).click()`);
          await wait(`document.activeElement === document.querySelector(${JSON.stringify(editInput)})`);
          await fill(editInput, { 0: renamedValue });
          await js(`document.querySelector(${JSON.stringify(saveButton)}).click()`);
          await wait(`document.querySelector(${JSON.stringify(`${savedRow} [role=alert]`)})?.textContent.includes('уже есть')`);
          assert.equal(await js(`document.querySelector(${JSON.stringify(editInput)}).value`), renamedValue);
          await js(`document.querySelector(${JSON.stringify(`${savedRow} [data-option-action=cancel]`)}).click()`);
          await wait(`document.querySelector(${JSON.stringify(removeButton)})?.matches(':enabled')`);
        }
        await js(`document.querySelector(${JSON.stringify(removeButton)}).click()`);
        await wait(`!document.querySelector(${JSON.stringify(savedRow)})`);
        assert.deepEqual((await api('settings', 'get', generation)).registryOptions[field], [renamedValue]);
        assert.equal((await api('instructions', 'get', { id: created.id, generation }))[field], savedValue);
      }
      const updatedOptions = { source: ['Секретариат'], executor: ['Петров П.П.'], controlType: ['Внеплановый'] };

      await click('Создать другую базу', '.storage-button');
      await wait("document.querySelector('.file-path')?.textContent.includes('another.sqlite')");
      const next = await api('database', 'getStatus');
      assert.notEqual(next.generation, generation);
      assert.deepEqual((await api('settings', 'get', next.generation)).registryOptions, { source: [], executor: [], controlType: [] });
      assert.equal((await api('instructions', 'list', { generation: next.generation })).total, 0);
      assert.equal((await api('analytics', 'summary', { generation: next.generation })).totals.total, 0);
      await assert.rejects(api('instructions', 'update', { id: created.id, data: { title: 'Wrong DB' }, generation }));
      await click('Открыть базу', '.storage-button');
      assert.equal((await api('database', 'getStatus')).generation, next.generation);
      openingFile = firstFile;
      await click('Открыть базу', '.storage-button');
      await wait("document.querySelector('.file-path')?.textContent.includes('selected-controls.sqlite')");
      const reopened = await api('database', 'getStatus');
      assert.deepEqual((await api('settings', 'get', reopened.generation)).registryOptions, updatedOptions);
      assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).checkpoints[0].mark,
        'Промежуточный отчёт проверен');
      assert.equal((await api('instructions', 'list', { generation: reopened.generation })).total, 27);
      assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 1);
      assert.equal((await api('attachments', 'list', { entityType: 'instructions', entityId: created.id, generation: reopened.generation })).length, 1);
      assert.equal(JSON.parse(readFileSync(path.join(userData, 'database-location.json'), 'utf8')).filePath, firstFile);

      await navigate('/', 'Реестр указаний');
      await click('Добавить указание', '.registry-toolbar button');
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
      for (const [field, options] of Object.entries(updatedOptions)) {
        const actual = await js(`[...document.querySelector(${JSON.stringify(instructionField(field))}).options]
          .map(option => option.value).filter(Boolean)`);
        assert.deepEqual(actual, options, `New instruction dropdown for ${field}`);
      }
      await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
      await wait("!document.querySelector('.registry-instruction-dialog[open]')");
      await openFilters();
      await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: '0001/К' });
      await click('Применить', '.registry-filters button');
      await wait("document.querySelector('.registry-count')?.textContent === '1'");
      await js("document.querySelector('.registry-table tbody tr').click()");
      await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
      for (const [field, option] of Object.entries(registrySelections)) {
        assert.equal(await js(`document.querySelector(${JSON.stringify(instructionField(field))}).value`), option);
      }
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
      console.log('Registry desktop smoke passed: create/open DB, dropdown settings, CRUD UI, attachments/download/discard, analytics/filter/empty state, 27-row Excel, F-21 Word export, calendar, checkpoint filters and marks, generation isolation, unsaved close guard, light/dark, compact window.');
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
