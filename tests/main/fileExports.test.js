import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { ExcelExportService } from '../../src/main/services/ExcelExportService.js';

async function fixture(t) {
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
  const service = new ExcelExportService({ database, instructions, dialog, getWindow: () => null });
  return { directory, database, rows, dialog, service };
}

test('Excel cannot replace a working database whose name ends in .xlsx', async t => {
  const { database, dialog, service } = await fixture(t);
  dialog.showSaveDialog = async () => ({ filePath: database.filePath });
  await assert.rejects(service.export({ generation: 1 }), { code: 'VALIDATION' });
  assert.equal(await readFile(database.filePath, 'utf8'), 'working database');
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
  assert.deepEqual(await service.export({ generation: 1 }), { cancelled: false, filePath, count: 1 });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  assert.equal(workbook.getWorksheet('Указания').getCell('F2').value, 'Original snapshot');
});

test('Excel cancellation leaves the filesystem unchanged', async t => {
  const { directory, dialog, service } = await fixture(t);
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.deepEqual(await service.export({ generation: 1 }), { cancelled: true, count: 1 });
  assert.deepEqual(await readdir(directory), ['board.xlsx']);
});
