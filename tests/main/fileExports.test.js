import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { ExcelExportService } from '../../src/main/services/ExcelExportService.js';
import { PLANNING_REPORT, REGISTRY_REPORT } from '../../src/main/exports/excel/workbookConfig.js';
import { formatDate, localDate } from '../../src/shared/dates.js';

async function fixture(t, openPath = async () => '') {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'work-board-file-export-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = {
    filePath: path.join(directory, 'board.xlsx'), generation: 1,
    assertGeneration(generation) { assert.equal(generation, this.generation); },
  };
  await writeFile(database.filePath, 'working database');
  const rows = [{ id: 1, title: 'Original snapshot', instructionNumber: '001' }];
  const instructions = { all: () => structuredClone(rows) };
  const dialog = { showSaveDialog: async () => ({ filePath: path.join(directory, 'export.xlsx') }) };
  const openedPaths = [];
  const service = new ExcelExportService({
    database, instructions, dialog, getWindow: () => null,
    openPath: filePath => { openedPaths.push(filePath); return openPath(filePath); },
  });
  return { directory, database, rows, dialog, service, openedPaths };
}

test('Excel cannot replace a working database whose name ends in .xlsx', async t => {
  const { database, dialog, service, openedPaths } = await fixture(t);
  dialog.showSaveDialog = async () => ({ filePath: database.filePath });
  await assert.rejects(service.export({ generation: 1 }), { code: 'VALIDATION' });
  assert.equal(await readFile(database.filePath, 'utf8'), 'working database');
  assert.deepEqual(openedPaths, []);
});

test('Excel cannot replace a file inside the working attachment directory', async t => {
  const { database, dialog, service } = await fixture(t);
  const directory = `${database.filePath}.files`;
  await mkdir(directory);
  const filePath = path.join(directory, 'attachment.xlsx');
  await writeFile(filePath, 'saved attachment');
  dialog.showSaveDialog = async () => ({ filePath });
  await assert.rejects(service.export({ generation: 1 }), { code: 'VALIDATION' });
  assert.equal(await readFile(filePath, 'utf8'), 'saved attachment');
  assert.deepEqual(await readdir(directory), ['attachment.xlsx']);
});

test('Excel retains its original rows when data and the selected database change during the dialog', async t => {
  const { database, directory, dialog, rows, service } = await fixture(t);
  const filePath = path.join(directory, 'snapshot.xlsx');
  dialog.showSaveDialog = async () => {
    rows[0].title = 'Changed after snapshot';
    database.filePath = path.join(directory, 'next.sqlite');
    database.generation = 2;
    await writeFile(database.filePath, 'next database');
    return { filePath };
  };
  assert.deepEqual(await service.export({ generation: 1 }), { cancelled: false, filePath, count: 1, opened: true });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  assert.equal(workbook.getWorksheet('Указания').getCell('F2').value, 'Original snapshot');
});

test('Excel cancellation leaves the filesystem unchanged', async t => {
  const { directory, dialog, service, openedPaths } = await fixture(t);
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.deepEqual(await service.export({ generation: 1 }), { cancelled: true, count: 1 });
  assert.deepEqual(await readdir(directory), ['board.xlsx']);
  assert.deepEqual(openedPaths, []);
});

test('Excel opens each report type only once its final workbook can be read', async t => {
  const inspected = [];
  const { directory, dialog, service, openedPaths } = await fixture(t, async filePath => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Указания');
    inspected.push([filePath, sheet.columnCount, sheet.getCell('A2').value]);
    return '';
  });
  for (const [reportType, columns] of [['full', 13], ['short', 8]]) {
    const selected = path.join(directory, reportType);
    const filePath = `${selected}.xlsx`;
    dialog.showSaveDialog = async () => ({ filePath: selected });
    assert.deepEqual(await service.export({ generation: 1, reportType }), { cancelled: false, filePath, count: 1, opened: true });
    assert.deepEqual(openedPaths.at(-1), filePath);
    assert.deepEqual(inspected.at(-1), [filePath, columns, '1']);
  }
  assert.equal(openedPaths.length, 2);
});

test('Excel keeps the saved workbook when the default app fails to launch', async t => {
  for (const openPath of [async () => 'No associated app', async () => { throw new Error('Launch failed'); }]) {
    const { directory, service, openedPaths } = await fixture(t, openPath);
    const filePath = path.join(directory, 'export.xlsx');
    assert.deepEqual(await service.export({ generation: 1 }), { cancelled: false, filePath, count: 1, opened: false });
    assert.deepEqual(openedPaths, [filePath]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    assert.equal(workbook.getWorksheet('Указания').getCell('F2').value, 'Original snapshot');
  }
});

test('Excel does not open a destination when replacing it fails', async t => {
  const { directory, service, dialog, openedPaths } = await fixture(t);
  const filePath = path.join(directory, 'occupied.xlsx');
  await mkdir(filePath);
  dialog.showSaveDialog = async () => ({ filePath });
  await assert.rejects(service.export({ generation: 1 }));
  assert.deepEqual(openedPaths, []);
  assert.deepEqual((await readdir(directory)).sort(), ['board.xlsx', 'occupied.xlsx']);
});

test('Excel rejects an unknown report type before opening the save dialog', async t => {
  const { dialog, service } = await fixture(t);
  dialog.showSaveDialog = async () => assert.fail('The save dialog must not open for an invalid report type');
  await assert.rejects(service.export({ generation: 1, reportType: 'compact' }), { code: 'VALIDATION' });
});

test('overdue workbooks use the local export date and keep only compact control details for each section', async t => {
  const { directory, database } = await fixture(t);
  for (const report of [REGISTRY_REPORT, PLANNING_REPORT]) {
    const planning = report === PLANNING_REPORT;
    const entry = { instructionNumber: '0007', title: '=1+1', executor: 'Петров', ...(planning && { planItem: '01.2' }) };
    const controls = [{ ...entry, dueDate: '2020-10-01', controlKind: 'checkpoint' },
      { ...entry, dueDate: '2020-10-03', controlKind: 'deadline' }];
    let cutOff;
    const repository = { overdueControls(today) { cutOff = today; return structuredClone(controls); } };
    const filePath = path.join(directory, report.sheet + '.xlsx');
    const dialog = { async showSaveDialog(_window, options) {
      assert.match(options.defaultPath, new RegExp('^' + report.sheet + ' — просроченные контроли '));
      controls.length = 0;
      return { filePath };
    } };
    const service = new ExcelExportService({ database, repository, report, dialog, getWindow: () => null });
    const result = await service.export({ generation: 1, reportType: 'overdue', closed: true, today: '2010-01-01',
      filters: { executor: 'Другой исполнитель', deadlineFrom: '2030-01-01' }, offset: 25, limit: 1 });
    assert.equal(result.count, 2);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    assert.equal(cutOff, localDate(workbook.created));
    const sheet = workbook.getWorksheet(report.sheet);
    const headings = ['Подписной №', 'Название', ...(planning ? ['Пункт плана'] : []), 'Исполнитель', 'Вид контроля', 'Срок'];
    assert.deepEqual(sheet.getRow(1).values.slice(1), headings);
    const fields = ['0007', '=1+1', ...(planning ? ['01.2'] : []), 'Петров'];
    assert.deepEqual(sheet.getRow(2).values.slice(1), [...fields, 'Промежуточная проверка', '01.10.2020']);
    assert.deepEqual(sheet.getRow(3).values.slice(1), [...fields, 'Итоговый срок', '03.10.2020']);
    assert.equal(sheet.getCell('B2').type, ExcelJS.ValueType.String);
    const parameters = new Map(workbook.getWorksheet('Параметры').getSheetValues().filter(Boolean).slice(1).map(row => row.slice(1)));
    assert.equal(parameters.get('Вид отчёта'), 'Просроченные контроли');
    assert.equal(parameters.get('Раздел'), report.section);
    assert.equal(parameters.get('Период'), 'За всё время');
    assert.equal(parameters.get('Состояние на'), formatDate(cutOff));
    assert.equal(parameters.get('Количество строк'), 2);
    assert.equal(parameters.has('Исполнитель'), false);
  }
});

test('plan spreadsheets preserve the point and identify the planning section in both formats', async t => {
  const { directory, database } = await fixture(t);
  const row = { id: 1, title: 'Проверка', instructionNumber: '004', planItem: '02.1' };
  const repository = { all(request) { assert.equal(request.sort.field, 'planItem'); return [row]; } };
  for (const reportType of ['short', 'full']) {
    const filePath = path.join(directory, reportType + '.xlsx');
    const dialog = { async showSaveDialog(_window, options) {
      assert.match(options.defaultPath, /Планы/);
      return { filePath };
    } };
    const service = new ExcelExportService({ database, repository, report: PLANNING_REPORT, dialog, getWindow: () => null });
    const result = await service.export({ generation: 1, reportType, sort: { field: 'planItem', direction: 'asc' } });
    assert.equal(result.count, 1);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Планы');
    const point = sheet.getRow(1).values.indexOf('Пункт плана');
    assert.equal(sheet.getRow(2).getCell(point).value, row.planItem);
    assert.match(JSON.stringify(workbook.getWorksheet('Параметры').getSheetValues()), /Контроль планирования/);
  }
});

test('Excel exports only the selected registry scope', async t => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'work-board-file-export-')));
  const database = new DatabaseService({ filePath: path.join(directory, 'board.sqlite') });
  database.open();
  t.after(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });
  const instructions = new InstructionRepository(database);
  const data = { controlDate: '2026-10-23', instructionNumber: '007/Б', executor: 'Иванов', deadline: '2026-10-26' };
  instructions.create({ ...data, title: 'Открытое указание' });
  const archived = instructions.create({ ...data, title: 'Архивное указание', controlSchedule: { frequency: 'daily', firstDate: '2026-10-24' } });
  instructions.closeControl(archived.id);

  const generation = database.getStatus().generation;
  for (const [closed, title] of [[false, 'Открытое указание'], [true, 'Архивное указание']]) {
    const filePath = path.join(directory, `export-${closed}.xlsx`);
    const dialog = { showSaveDialog: async () => ({ filePath }) };
    const service = new ExcelExportService({ database, instructions, dialog, getWindow: () => null });
    assert.equal((await service.export({ generation, closed })).count, 1);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet('Указания');
    assert.equal(sheet.getCell('F2').value, title);
    if (closed) assert.equal(sheet.getCell('J2').value ?? '', '');
  }

  const other = instructions.create({ ...data, instructionNumber: '008/Б', title: 'Другое закрытое указание' });
  instructions.closeControl(other.id);
  const filePath = path.join(directory, 'short-archive.xlsx');
  const dialog = { showSaveDialog: async (_window, options) => {
    assert.match(options.defaultPath, /^Закрытый контроль — краткий отчёт/);
    return { filePath };
  } };
  const service = new ExcelExportService({ database, instructions, dialog, getWindow: () => null });
  const result = await service.export({ generation, closed: true, reportType: 'short', filters: { instructionNumber: '007/б' } });
  assert.equal(result.count, 1);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Указания');
  assert.equal(sheet.columnCount, 8);
  assert.equal(sheet.getCell('D2').value, 'Архивное указание');
});
