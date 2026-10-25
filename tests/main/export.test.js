import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { createRegistryWorkbook } from '../../src/main/services/RegistryWorkbook.js';

test('Excel retains eight full columns, leading zeros and literal formula text plus filter metadata', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => ({
    controlDate: '2026-10-23', incomingNumber: '0007', instructionNumber: `00${index}`,
    title: '=HYPERLINK("https://example.invalid")', summary: 'Полный текст\nВторая строка',
    deadline: '2026-10-31', executor: 'Иванов И.И.', status: 'in_progress', executionMark: 'Проверка',
  }));
  const workbook = createRegistryWorkbook({ rows, request: { filters: { executor: 'ИВАНОВ', deadlineFrom: '2026-10-01' } }, exportedAt: new Date('2026-10-23T09:00:00Z') });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(loaded.worksheets.map(sheet => sheet.name), ['Указания', 'Параметры']);
  const data = loaded.getWorksheet('Указания');
  assert.equal(data.columnCount, 8);
  assert.equal(data.rowCount, 32);
  assert.equal(data.getCell('B2').value, '0007');
  assert.equal(data.getCell('D2').value, '=HYPERLINK("https://example.invalid")');
  assert.equal(data.getCell('D2').type, ExcelJS.ValueType.String);
  assert.equal(data.getCell('E2').value, 'Полный текст\nВторая строка');
  assert.match(data.getCell('H2').value, /В работе.*Проверка/);
  const metadata = JSON.stringify(loaded.getWorksheet('Параметры').getSheetValues());
  assert.match(metadata, /ИВАНОВ/);
  assert.match(metadata, /01\.10\.2026/);
  assert.match(metadata, /31/);
  assert.match(metadata, /Все/);
});
