import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { formatDate } from '../../src/shared/registry.js';

export async function verifyRegistry(driver, fixture, { generation, created, overdueTextColor }) {
  const { window, js, wait, click, fill, openFilters, pressKey, verifyEntrance, resizeSweep, screenshot } = driver;
  const { exportFile, downloadedFile, today, originalDeadline, firstCheckpointMark, nextCheckpointCell, nextCheckpointTime, nextCheckpointHeader, controlFrequencyCell, controlFrequencyHeader, dailyControl, customControl, overdueColor, registrySelections } = fixture;

  // Fixture rows make pagination meaningful; user CRUD above exercised the actual form.
  await js(`(async () => { for(let index=0;index<26;index++) await window.desktopAPI.instructions.create({generation:${generation},data:{controlDate:${JSON.stringify(today)},incomingNumber:'00'+index,instructionNumber:'К-'+index,title:'Плановое указание '+(index+1),summary:'Подготовить документы и проверить исполнение.',deadline:${JSON.stringify(today)},executor:index === 0 ? 'Иванов А.А.' : 'Иванов И.И.',status:'pending',executionMark:'',controlSchedule:index === 0 ? {frequency:'custom',customDates:[${JSON.stringify(today)}]} : undefined}}); })()`);
  await openFilters();
  await verifyEntrance('.registry-filters', 'filter popover');
  await fill('.registry-filter-fields input,.registry-filter-fields select', { 1: today, 2: today, 3: 'иванов' });
  await click('Применить', '.registry-filters button');
  await wait("document.querySelector('.registry-count')?.textContent === '27' && document.querySelectorAll('.registry-table tbody tr').length === 25");
  assert.equal(await js(`document.querySelector('${nextCheckpointCell}:not(:has(time))')?.textContent.trim()`), '—');
  assert.equal(await js(`document.querySelector('${controlFrequencyCell}')?.textContent.trim()`), '—');
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
  await wait("!document.querySelector('.registry-filters[data-open=true]') && document.activeElement?.classList.contains('registry-filter-toggle')");
  assert.equal(await js("document.querySelector('.registry-count').textContent"), '27');
  await openFilters();
  assert.equal(await js("document.querySelector('[data-filter=instructionNumber]').value"), 'Черновик фильтра');
  await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: '' });
  await click('Применить', '.registry-filters button');
  await wait("!document.querySelector('.registry-filters[data-open=true]')");
  await click('Выгрузить Excel', '.registry-toolbar button');
  await wait("document.querySelector('.registry-notice')?.textContent.includes('27')");
  assert.equal(existsSync(exportFile), true);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(exportFile);
  const worksheet = workbook.getWorksheet('Указания');
  assert.equal(worksheet.rowCount, 28);
  assert.equal(worksheet.columnCount, 13);
  assert.equal(worksheet.getCell('J1').value, nextCheckpointHeader);
  assert.equal(worksheet.getCell('L1').value, controlFrequencyHeader);
  const exportedRows = worksheet.getRows(2, 27);
  const exported = exportedRows.find(row => row.getCell(4).value === created.instructionNumber);
  assert.ok(exported, 'Saved instruction is missing from Excel');
  assert.equal(exported.getCell(1).value, String(created.id));
  assert.equal(exported.getCell(5).value, registrySelections.source);
  assert.equal(exported.getCell(8).value, formatDate(originalDeadline));
  assert.equal(exported.getCell(9).value, formatDate(today));
  assert.equal(exported.getCell(10).value, formatDate(originalDeadline));
  assert.equal(exported.getCell(10).font.color?.argb, overdueColor);
  assert.equal(exported.getCell(11).value, registrySelections.executor);
  assert.equal(exported.getCell(12).value, dailyControl);
  assert.match(exported.getCell(13).value, /Ожидается ответ/);
  const manualSchedule = exportedRows.find(row => row.getCell(4).value === 'К-0');
  assert.equal(manualSchedule.getCell(12).value, customControl);
  assert.equal(exportedRows.find(row => row.getCell(4).value === 'К-1').getCell(12).value ?? '', '');
  const todayCheckpoint = manualSchedule.getCell(10);
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
}
