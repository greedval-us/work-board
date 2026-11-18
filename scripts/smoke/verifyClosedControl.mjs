import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { chooseExcelReport } from './forms.mjs';

export async function verifyClosedControl(driver, { shortExportFile, openRequests, failNextOpen, today, renamedSelections }, generation) {
  const { api, click, fill, js, navigate, openFilters, screenshot, wait } = driver;
  const card = '.registry-instruction-dialog[open]';
  const cardAction = `${card} .registry-dialog-header button`;
  const confirmation = '.registry-confirm-dialog[open]';
  const countIs = (value) => `document.querySelector('.registry-count')?.textContent === '${value}' && !document.querySelector('.registry-table[aria-busy=true], .registry-table-scroll[aria-busy=true]')`;
  const controlNumber = `${card} [name=instructionNumber]`;
  const closeCard = `${card} [aria-label="Закрыть карточку"]`;
  const filterByNumber = async (number) => {
    await openFilters();
    await fill('[data-filter=deadlineFrom], [data-filter=deadlineTo], [data-filter=executor]', { 0: '', 1: '', 2: '' });
    await fill('[data-filter=instructionNumber]', { 0: number });
    await click('Применить', '.registry-filters button');
    await wait(`${countIs(1)} && document.querySelector('.registry-row td:nth-child(4)')?.textContent.trim() === ${JSON.stringify(number)}`);
  };

  const created = await api('instructions', 'create', { generation, data: {
    title: 'Указание для закрытия контроля', instructionNumber: 'ЗК-1', controlDate: today, deadline: today,
    executor: renamedSelections.executor, documentType: renamedSelections.documentType, executionMark: 'Доклад подготовлен',
    controlSchedule: { frequency: 'custom', customDates: [today] },
  } });
  const rowRecord = (await api('instructions', 'list', { generation, filters: { instructionNumber: 'К-0' } })).items[0];
  const upcoming = await api('calendar', 'day', { date: today, generation });
  for (const id of [created.id, rowRecord.id]) {
    assert.ok(upcoming.instructions.some(item => item.id === id));
    assert.ok(upcoming.checkpoints.some(item => item.instructionId === id));
  }

  await navigate('/', 'Реестр указаний');
  await filterByNumber(created.instructionNumber);
  await js("document.querySelector('.registry-row').click()");
  await wait(`document.querySelector(${JSON.stringify(controlNumber)})?.value === ${JSON.stringify(created.instructionNumber)}`);
  const before = await api('instructions', 'get', { id: created.id, generation });
  await click('Закрытие контроля', cardAction);
  await wait(`Boolean(document.querySelector('${confirmation}'))`);
  await click('Отмена', `${confirmation} button`);
  const archiveButton = `([...document.querySelectorAll('${cardAction}')].find(button => button.textContent.trim() === 'Закрытие контроля'))`;
  await wait(`!document.querySelector('${confirmation}') && ${archiveButton}?.matches(':enabled')`);
  assert.equal((await api('instructions', 'get', { id: created.id, generation })).closedAt, null);
  await fill(`${card} [name=executionMark]`, { 0: 'Несохранённый черновик' });
  await wait(`${archiveButton}?.disabled`);
  await fill(`${card} [name=executionMark]`, { 0: before.executionMark });
  await wait(`${archiveButton}?.matches(':enabled')`);
  await screenshot('instruction-close-control.png');
  await click('Закрытие контроля', cardAction);
  await wait(`Boolean(document.querySelector('${confirmation}'))`);
  await click('Закрыть контроль', `${confirmation} button`);
  await wait(`!document.querySelector('${card}') && ${countIs(0)}`);

  await filterByNumber('К-0');
  const rowAction = '.registry-row button[aria-label="Закрытие контроля"]';
  await js(`document.querySelector(${JSON.stringify(rowAction)}).click()`);
  await wait(`Boolean(document.querySelector('${confirmation}'))`);
  assert.equal(await js(`Boolean(document.querySelector('${card}'))`), false);
  await click('Закрыть контроль', `${confirmation} button`);
  await wait(countIs(0));

  await navigate('/closed-control', 'Закрытый контроль');
  await wait(countIs(2));
  assert.equal(await js(`Boolean(document.querySelector(${JSON.stringify(rowAction)}))`), false);
  assert.equal(await js("Boolean(document.querySelector('.registry-row .registry-status'))"), false);
  assert.equal(await js("document.querySelectorAll('.registry-row td[data-column=closedAt] time').length"), 2);
  assert.equal(await js("document.documentElement.scrollWidth > innerWidth"), false);
  await screenshot('closed-control.png');
  const archive = await api('instructions', 'list', { generation, closed: true });
  const item = archive.items.find(({ id }) => id === created.id);
  const other = archive.items.find(({ instructionNumber }) => instructionNumber === 'К-0');
  assert.ok(item?.closedAt);
  assert.equal(item.status, before.status);
  assert.ok(other?.closedAt);
  const documentTypes = await js("[...document.querySelectorAll('.registry-row td[data-column=documentType]')].map(cell => cell.textContent.trim())");
  assert.deepEqual(new Set(documentTypes), new Set([renamedSelections.documentType, rowRecord.documentType]));
  const calendar = await api('calendar', 'day', { date: today, generation });
  assert.ok(calendar.instructions.every(({ id }) => id !== item.id && id !== other.id));
  assert.ok(calendar.checkpoints.every(({ instructionId }) => instructionId !== item.id && instructionId !== other.id));

  const beforeExport = openRequests.length;
  failNextOpen();
  await chooseExcelReport(driver, 'Краткий отчёт');
  await wait("document.querySelector('.registry-export-warning[role=status]')?.textContent.includes('Не удалось открыть файл автоматически.')");
  assert.deepEqual(openRequests.slice(beforeExport), [realpathSync(shortExportFile)]);
  assert.equal(await js("document.querySelector('.registry-export-path')?.textContent.trim()"), realpathSync(shortExportFile));
  assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(shortExportFile);
  const sheet = workbook.getWorksheet('Указания');
  const numbers = sheet.getRows(2, 2).map(row => row.getCell(3).value).sort();
  assert.deepEqual(numbers, [created.instructionNumber, 'К-0'].sort());

  await filterByNumber(created.instructionNumber);
  await js("document.querySelector('.registry-row').click()");
  await wait(`document.querySelector(${JSON.stringify(controlNumber)})?.value === ${JSON.stringify(created.instructionNumber)}`);
  assert.equal(await js(`Boolean(${archiveButton})`), false);
  assert.equal(await js(`document.querySelector('${card} .attachment-panel, ${card} input[type=file]') === null`), true);
  assert.deepEqual((await api('instructions', 'get', { id: item.id, generation })).controlSchedule, before.controlSchedule);
  await js(`document.querySelector(${JSON.stringify(closeCard)}).click()`);
  await wait(`!document.querySelector('${card}')`);

  await navigate('/analytics', 'Аналитика');
  const executor = 'select[name=analytics-executor]';
  const executorKey = other.executor.normalize('NFKC').toLocaleLowerCase('ru-RU');
  await wait(`[...document.querySelector('${executor}')?.options ?? []].some(option => option.value === ${JSON.stringify(executorKey)})`);
  await fill(executor, { 0: executorKey });
  const archivedLink = `.analytics-instructions tr[data-instruction-id="${other.id}"] a`;
  await wait(`Boolean(document.querySelector(${JSON.stringify(archivedLink)}))`);
  await js(`document.querySelector(${JSON.stringify(archivedLink)}).click()`);
  await wait(`location.hash.startsWith('#/closed-control?') && document.querySelector(${JSON.stringify(controlNumber)})?.value === 'К-0'`);
  await js(`document.querySelector(${JSON.stringify(closeCard)}).click()`);
  await wait(`!document.querySelector('${card}')`);
}
