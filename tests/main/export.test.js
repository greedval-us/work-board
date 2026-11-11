import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { createRegistryWorkbook } from '../../src/main/services/RegistryWorkbook.js';

test('Excel exports all registry columns, leading zeros, literal formula text and filter metadata', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => ({
    id: Number.MAX_SAFE_INTEGER - index, controlDate: '2026-10-23', incomingNumber: '0007', instructionNumber: `00${index}`,
    source: 'Канцелярия', title: '=HYPERLINK("https://example.invalid")', summary: 'Полный текст\nВторая строка',
    deadline: '2026-10-31', extendedUntil: index ? '' : '2026-11-10', executor: 'Иванов И.И.', controlType: 'Плановый', status: 'in_progress', executionMark: 'Проверка',
  }));
  const workbook = createRegistryWorkbook({ rows, request: { filters: { executor: 'ИВАНОВ', deadlineFrom: '2026-10-01' } }, exportedAt: new Date('2026-10-23T09:00:00Z') });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(loaded.worksheets.map(sheet => sheet.name), ['Указания', 'Параметры']);
  const data = loaded.getWorksheet('Указания');
  assert.equal(data.columnCount, 13);
  assert.equal(data.autoFilter, 'A1:M1');
  assert.equal(data.rowCount, 32);
  assert.equal(data.getCell('A1').value, 'ID');
  assert.equal(data.getCell('A2').value, String(Number.MAX_SAFE_INTEGER));
  assert.equal(data.getCell('C2').value, '0007');
  assert.equal(data.getCell('D1').value, 'Подписной номер');
  assert.equal(data.getCell('D2').value, '000');
  assert.equal(data.getCell('E1').value, 'Откуда');
  assert.equal(data.getCell('E2').value, 'Канцелярия');
  assert.equal(data.getCell('F2').value, '=HYPERLINK("https://example.invalid")');
  assert.equal(data.getCell('F2').type, ExcelJS.ValueType.String);
  assert.equal(data.getCell('G1').value, 'Резолюция');
  assert.equal(data.getCell('G2').value, 'Полный текст\nВторая строка');
  assert.equal(data.getCell('H2').value, '31.10.2026');
  assert.equal(data.getCell('I1').value, 'Продлён до');
  assert.equal(data.getCell('I2').value, '10.11.2026');
  assert.equal(data.getCell('I3').value ?? '', '');
  assert.equal(data.getCell('J1').value, 'Ближайший промежуточный контроль');
  assert.equal(data.getCell('K2').value, 'Иванов И.И.');
  assert.equal(data.getCell('L1').value, 'Вид контроля');
  assert.equal(data.getCell('L2').value, 'Плановый');
  assert.match(data.getCell('M2').value, /В работе.*Проверка/);
  const metadata = JSON.stringify(loaded.getWorksheet('Параметры').getSheetValues());
  assert.match(metadata, /ИВАНОВ/);
  assert.match(metadata, /Подписной номер/);
  assert.match(metadata, /01\.10\.2026/);
  assert.match(metadata, /31/);
  assert.match(metadata, /Все/);
});

test('Excel colors only overdue intermediate control dates using the local export date', async () => {
  const rows = ['2026-11-11', '2026-11-12', '2026-11-13', '', undefined].map((nextCheckpoint, index) => ({
    id: index + 1, deadline: '2026-11-11', nextCheckpoint, executor: 'Иванов И.И.',
  }));
  const workbook = createRegistryWorkbook({ rows, exportedAt: new Date(2026, 10, 12, 0, 30) });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const data = loaded.getWorksheet('Указания');
  assert.deepEqual([2, 3, 4, 5, 6].map(row => data.getCell(`J${row}`).value ?? ''), [
    '11.11.2026', '12.11.2026', '13.11.2026', '', '',
  ]);
  assert.deepEqual(data.getCell('J2').font, { name: 'Calibri', size: 11, color: { argb: 'FFB32630' } });
  assert.deepEqual(data.getCell('J2').alignment, { vertical: 'top', wrapText: true });
  for (const cell of ['H2', 'K2', 'J3', 'J4', 'J5', 'J6']) {
    assert.equal(data.getCell(cell).font?.color, undefined);
  }
});

test('Excel uses the date of the applied checkpoint filter for its metadata and highlighting', () => {
  const rows = [{ id: 1, deadline: '2026-11-11', nextCheckpoint: '2026-11-11' }];
  const workbook = createRegistryWorkbook({
    rows, request: { filters: { checkpoint: 'today' }, today: '2026-11-11' }, exportedAt: new Date(2026, 10, 12, 0, 5),
  });
  const parameters = workbook.getWorksheet('Параметры');
  const filterRow = parameters.getColumn(1).values.indexOf('Промежуточный контроль');
  assert.ok(filterRow > 0);
  assert.equal(parameters.getCell(`B${filterRow}`).value, 'На сегодня (11.11.2026)');
  assert.equal(workbook.getWorksheet('Указания').getCell('J2').font.color, undefined);
});
