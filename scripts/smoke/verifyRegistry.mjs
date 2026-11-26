import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { formatDate } from '../../src/shared/registry.js';
import { chooseExcelReport, createSmokeForms } from './forms.mjs';

const resizeColumn = '.registry-table thead th[data-column=title]';
const resizeHandle = `${resizeColumn} [role=separator]`;
const columnWidth = `document.querySelector('${resizeColumn}').getBoundingClientRect().width`;

async function verifyColumnDrag({ window, js, wait, pressKey }) {
  const original = await js(columnWidth);
  const point = await js(`(() => {
    const r = document.querySelector('${resizeHandle}').getBoundingClientRect();
    return { x: Math.floor(r.x + r.width / 2), y: Math.floor(r.y + r.height / 2) };
  })()`);
  const send = event => window.webContents.sendInputEvent(event);
  send({ type: 'mouseMove', ...point });
  send({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
  send({ type: 'mouseMove', x: point.x + 48, y: point.y, modifiers: ['leftbuttondown'] });
  send({ type: 'mouseUp', x: point.x + 48, y: point.y, button: 'left', clickCount: 1 });
  const dragged = Math.round(original) + 48;
  await wait(`Math.abs(${columnWidth} - ${dragged}) < 1 && document.activeElement.matches('${resizeHandle}')`);
  await pressKey('Right');
  await wait(`Math.abs(${columnWidth} - ${dragged + 8}) < 1`);
  assert.equal(await js(`document.querySelector('${resizeColumn}').getAttribute('aria-sort')`), 'none');
  return dragged + 8;
}

export async function verifyRegistry(driver, fixture, { generation, created, overdueTextColor }) {
  const { window, js, api, wait, click, fill, openFilters, pressKey, verifyEntrance, resize, resizeDefault, resizeSweep, screenshot } = driver;
  const { exportFile, shortExportFile, openRequests, today, originalDeadline, firstCheckpointMark, nextCheckpointCell, nextCheckpointTime, controlFrequencyCell, dailyControl, customControl, registrySelections, historicalDocumentType } = fixture;
  const { instructionField, fillInstruction } = createSmokeForms(driver);

  // Fixture rows make pagination meaningful; user CRUD above exercised the actual form.
  for (let index = 0; index < 26; index++) {
    const first = index === 0;
    await api('instructions', 'create', { generation, data: {
      controlDate: today, incomingNumber: `00${index}`, instructionNumber: `К-${index}`,
      title: `Плановое указание ${index + 1}`, summary: 'Подготовить документы и проверить исполнение.',
      deadline: today, executor: first ? 'Иванов А.А.' : registrySelections.executor,
      documentType: first ? historicalDocumentType : index === 25 ? '' : registrySelections.documentType,
      controlSchedule: first ? { frequency: 'custom', customDates: [today] } : undefined,
    } });
  }
  await openFilters();
  await verifyEntrance('.registry-filters', 'filter popover');
  assert.equal(await js("Boolean(document.querySelector('.registry-filter-fields [data-filter=status]'))"), false);
  const retainedFilters = '[data-filter=deadlineFrom], [data-filter=deadlineTo], [data-filter=executor]';
  await fill(retainedFilters, { 0: today, 1: today, 2: 'иванов' });
  await click('Применить', '.registry-filters button');
  await wait("document.querySelector('.registry-count')?.textContent === '27' && document.querySelectorAll('.registry-table tbody tr').length === 25");
  assert.equal(await js(`document.querySelector('${nextCheckpointCell}:not(:has(time))')?.textContent.trim()`), '—');
  assert.equal(await js(`document.querySelector('${controlFrequencyCell}')?.textContent.trim()`), '—');

  const documentTypeCell = 'td[data-column=documentType]';
  const firstDocumentType = `[...document.querySelectorAll('.registry-row ${documentTypeCell}')].map(cell => cell.textContent.trim()).find(value => value !== '—')`;
  const changeSort = async (field, direction, expected = 'true') => {
    const heading = `.registry-table th[data-column=${field}]`;
    await js(`document.querySelector('${heading} button').click()`);
    await wait(`document.querySelector('${heading}')?.getAttribute('aria-sort') === '${direction}' &&
      !document.querySelector('.registry-table-scroll[aria-busy=true]') && (${expected})`);
  };
  await changeSort('documentType', 'ascending', `(${firstDocumentType}) === ${JSON.stringify(historicalDocumentType)}`);
  await changeSort('documentType', 'descending', `(${firstDocumentType}) === ${JSON.stringify(registrySelections.documentType)}`);
  await changeSort('controlDate', 'ascending');
  await changeSort('controlDate', 'descending');
  const savedWidth = await verifyColumnDrag(driver);

  const documentTypeFilter = '[data-filter=documentType]';
  await openFilters();
  const filterOptions = await js(`[...document.querySelector('${documentTypeFilter}').options].map(option => option.value)`);
  for (const value of [historicalDocumentType, registrySelections.documentType]) assert.ok(filterOptions.includes(value));
  await fill(documentTypeFilter, { 0: historicalDocumentType });
  await click('Применить', '.registry-filters button');
  await wait(`document.querySelector('.registry-count')?.textContent === '1' &&
    document.querySelector('.registry-row ${documentTypeCell}')?.textContent.trim() === ${JSON.stringify(historicalDocumentType)}`);
  const editedId = await js("Number(document.querySelector('.registry-row td:first-child').textContent.trim())");
  await js("document.querySelector('.registry-row .registry-record-link').click()");
  await wait(`document.querySelector(${JSON.stringify(instructionField('documentType'))})?.value === ${JSON.stringify(historicalDocumentType)}`);
  await fillInstruction({ documentType: registrySelections.documentType });
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '0'");
  assert.equal((await api('instructions', 'get', { id: editedId, generation })).documentType, registrySelections.documentType);
  await openFilters();
  assert.deepEqual(await js(`[...document.querySelectorAll('${retainedFilters}')].map(field => field.value)`), [today, today, 'иванов']);
  await fill(documentTypeFilter, { 0: '' });
  await click('Применить', '.registry-filters button');
  await wait("document.querySelector('.registry-count')?.textContent === '27'");

  // The edit removed the final row of the filtered table and unmounted it.
  await wait(`Math.abs(${columnWidth} - ${savedWidth}) < 1`);
  await js(`document.querySelector('${resizeHandle}').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await wait("!document.querySelector('.registry-table').hasAttribute('data-custom-widths')");
  await screenshot('registry-light.png');
  await resizeSweep('registry');
  await js("document.querySelector('.registry-column-toggle').click()");
  await wait("document.querySelector('.registry-column-toggle')?.getAttribute('aria-pressed') === 'true'");
  assert.equal(await js("document.querySelector('.registry-table-scroll').scrollWidth > document.querySelector('.registry-table-scroll').clientWidth"), true);
  await js("document.querySelector('.registry-table-scroll').scrollTop = 300");
  assert.equal(await js("Math.abs(document.querySelector('.registry-table th').getBoundingClientRect().top - document.querySelector('.registry-table-scroll').getBoundingClientRect().top) < 2"), true);
  await js("document.querySelector('.registry-column-toggle').click(); document.querySelector('.registry-table-scroll').scrollTop = 0");
  await resize(1024, 768);
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
  await resizeDefault();
  await openFilters();
  await fill('[data-filter=instructionNumber]', { 0: 'Черновик фильтра' });
  await pressKey('Escape');
  await wait("!document.querySelector('.registry-filters[data-open=true]') && document.activeElement?.classList.contains('registry-filter-toggle')");
  assert.equal(await js("document.querySelector('.registry-count').textContent"), '27');
  await openFilters();
  assert.equal(await js("document.querySelector('[data-filter=instructionNumber]').value"), 'Черновик фильтра');
  await fill('[data-filter=instructionNumber]', { 0: '' });
  await click('Применить', '.registry-filters button');
  await wait("!document.querySelector('.registry-filters[data-open=true]')");
  await chooseExcelReport(driver, 'Отмена');
  assert.equal(existsSync(exportFile), false);
  assert.equal(existsSync(shortExportFile), false);
  assert.deepEqual(openRequests, []);
  await chooseExcelReport(driver, 'Полный отчёт');
  await wait("document.querySelector('.registry-notice')?.textContent.includes('27')");
  assert.deepEqual(openRequests, [realpathSync(exportFile)]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(exportFile);
  const worksheet = workbook.getWorksheet('Указания');
  assert.equal(worksheet.rowCount, 28);
  const exportedRows = worksheet.getRows(2, 27);
  const exported = exportedRows.find(row => row.getCell(4).value === created.instructionNumber);
  assert.ok(exported, 'Saved instruction is missing from Excel');
  assert.equal(exported.getCell(1).value, String(created.id));
  assert.equal(exported.getCell(5).value, registrySelections.source);
  assert.equal(exported.getCell(8).value, formatDate(originalDeadline));
  assert.equal(exported.getCell(9).value, formatDate(today));
  assert.equal(exported.getCell(10).value, formatDate(originalDeadline));
  assert.equal(exported.getCell(11).value, registrySelections.executor);
  assert.equal(exported.getCell(12).value, dailyControl);
  assert.match(exported.getCell(13).value, /Ожидается ответ/);
  const manualSchedule = exportedRows.find(row => row.getCell(4).value === 'К-0');
  assert.equal(manualSchedule.getCell(12).value, customControl);
  assert.equal(manualSchedule.getCell(10).value, formatDate(today));
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
  assert.deepEqual(await js(`Object.fromEntries([...document.querySelectorAll('.registry-row')].map(row => [
    row.cells[3].textContent.trim(), row.querySelector('[data-column=controlFrequency]').textContent.trim(),
  ]))`), { [created.instructionNumber]: dailyControl, 'К-0': customControl });
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
  await fill('[data-filter=instructionNumber]', { 0: '0001/к' });
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
  assert.equal(await js("document.querySelector('.registry-instruction-dialog .attachment-panel, .registry-instruction-dialog input[type=file]') === null"), true);

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

  await chooseExcelReport(driver, 'Краткий отчёт');
  await wait("document.querySelector('.registry-notice')?.textContent === 'Выгружено записей: 1.'");
  assert.deepEqual(openRequests, [realpathSync(exportFile), realpathSync(shortExportFile)]);
  const shortWorkbook = new ExcelJS.Workbook();
  await shortWorkbook.xlsx.readFile(shortExportFile);
  const shortSheet = shortWorkbook.getWorksheet('Указания');
  assert.equal(shortSheet.rowCount, 2);
  assert.equal(shortSheet.getCell('C2').value, created.instructionNumber);
  assert.equal(shortSheet.getCell('F2').value, formatDate(today));
  assert.equal(shortSheet.getCell('H2').value, 'Ожидается ответ');
  assert.match(JSON.stringify(shortWorkbook.getWorksheet('Параметры').getSheetValues()), /Краткий отчёт/);
}
