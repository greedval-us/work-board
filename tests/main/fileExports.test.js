import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../../src/main/database/DatabaseService.js';
import { InstructionRepository } from '../../src/main/repositories/InstructionRepository.js';
import { ExcelExportService } from '../../src/main/services/ExcelExportService.js';

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
