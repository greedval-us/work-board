import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { createRegistryWorkbook } from '../../src/main/exports/excel/RegistryWorkbook.js';

async function reloadWorkbook(options) {
  const workbook = createRegistryWorkbook(options);
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  return loaded;
}

test('Excel exports all registry columns, leading zeros, literal formula text and filter metadata', async () => {
  const rows = Array.from({ length: 31 }, (_, index) => ({
    id: Number.MAX_SAFE_INTEGER - index, controlDate: '2026-10-23', incomingNumber: '0007', instructionNumber: `00${index}`,
    source: 'Канцелярия', title: '=HYPERLINK("https://example.invalid")', summary: 'Полный текст\nВторая строка',
    deadline: '2026-10-31', extendedUntil: index ? '' : '2026-11-10', executor: 'Иванов И.И.',
    controlFrequency: ['weekly', '', 'custom'][index % 3], status: 'in_progress', executionMark: 'Проверка',
  }));
  const loaded = await reloadWorkbook({ rows, request: { filters: { executor: 'ИВАНОВ', deadlineFrom: '2026-10-01' } }, exportedAt: new Date('2026-10-23T09:00:00Z') });
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
  assert.equal(data.getCell('L1').value, 'Промежуточный контроль');
  assert.equal(data.getCell('L2').value, 'Еженедельно');
  assert.equal(data.getCell('L3').value ?? '', '');
  assert.equal(data.getCell('L4').value, 'Другое (даты вручную)');
  assert.match(data.getCell('M2').value, /В работе.*Проверка/);
  assert.equal(data.getCell('J1').font.size, 13);
  assert.equal(data.getCell('M2').font.size, 13);
  const parameters = loaded.getWorksheet('Параметры');
  const metadata = JSON.stringify(parameters.getSheetValues());
  assert.deepEqual(parameters.getRow(4).values.slice(1), ['Вид отчёта', 'Полный отчёт']);
  assert.equal(parameters.getCell('A1').font.size, 13);
  assert.equal(parameters.getCell('B4').font.size, 13);
  assert.match(metadata, /ИВАНОВ/);
  assert.match(metadata, /Подписной номер/);
  assert.match(metadata, /01\.10\.2026/);
  assert.match(metadata, /31/);
  assert.match(metadata, /Все/);
});

test('Excel short mode uses the eight requested columns with effective deadlines and execution notes', async () => {
  const rows = [{
    id: 42, controlDate: '2026-10-23', incomingNumber: '0007', instructionNumber: '0014',
    source: 'Не входит в краткую выгрузку', title: '=HYPERLINK("https://example.invalid")', summary: 'Первый абзац\nВторой абзац',
    deadline: '2026-10-31', extendedUntil: '2026-11-10', executor: 'Иванов И.И.',
    nextCheckpoint: '2026-10-29', controlFrequency: 'weekly', status: 'in_progress', executionMark: 'Проверка',
  }, { id: 43, deadline: '2026-11-12', status: 'completed' }];
  const loaded = await reloadWorkbook({ rows, request: { reportType: 'short', closed: true } });
  const data = loaded.getWorksheet('Указания');
  assert.equal(data.columnCount, 8);
  assert.equal(data.autoFilter, 'A1:H1');
  assert.deepEqual(data.getRow(1).values.slice(1), ['ID', 'Входящий №', 'Подписной №', 'Название', 'Резолюция', 'Срок', 'Исполнитель', 'Исполнение']);
  assert.deepEqual(data.getRow(2).values.slice(1), ['42', '0007', '0014', '=HYPERLINK("https://example.invalid")',
    'Первый абзац\nВторой абзац', '10.11.2026', 'Иванов И.И.', 'Проверка']);
  assert.equal(data.getCell('D2').type, ExcelJS.ValueType.String);
  assert.equal(data.getCell('F3').value, '12.11.2026');
  assert.equal(data.getCell('H3').value ?? '', '');
  assert.equal(data.getCell('H1').font.size, 13);
  assert.equal(data.getCell('F2').font.size, 13);
  const parameters = new Map(loaded.getWorksheet('Параметры').getSheetValues().filter(Boolean).slice(1).map(row => row.slice(1)));
  assert.equal(parameters.get('Вид отчёта'), 'Краткий отчёт');
  assert.equal(parameters.get('Раздел'), 'Закрытый контроль');
});

test('Excel saves borders around every cell in both report tables, including blank fields', async () => {
  const sides = ['top', 'right', 'bottom', 'left'];
  for (const [reportType, columns] of [['full', 13], ['short', 8]]) {
    const workbook = await reloadWorkbook({ request: { reportType }, rows: [{ id: 1, deadline: '2026-11-12' }] });
    for (const [name, width] of [['Указания', columns], ['Параметры', 2]]) {
      const sheet = workbook.getWorksheet(name);
      const height = sheet.rowCount;
      for (let row = 1; row <= height; row++) {
        for (let column = 1; column <= width; column++) {
          const cell = sheet.getCell(row, column);
          for (const side of sides) {
            assert.equal(cell.border?.[side]?.style, 'thin', `${reportType}: ${name}!${cell.address} ${side}`);
          }
        }
      }
      for (const cell of [sheet.getCell(1, width + 1), sheet.getCell(height + 1, 1)]) {
        assert.ok(sides.every(side => !cell.border?.[side]?.style), `${name}!${cell.address} is outside the table`);
      }
    }
  }
});

test('Excel adapts widths to the longest line and retains full values in wrapped cells', async () => {
  const description = 'Проверить данные и подготовить итоговую справку';
  const longValue = `Первый абзац\n${'Второй абзац содержит полный текст поручения. '.repeat(70)}`;
  for (const [reportType, column] of [['full', 'G'], ['short', 'E']]) {
    const exportSummary = async summary => (await reloadWorkbook({
      request: { reportType }, rows: [{ id: 1, summary }],
    })).getWorksheet('Указания');
    const narrow = await exportSummary('Справка');
    const finite = await exportSummary(description);
    const multiline = await exportSummary(`${description}\n${description}\n${description}`);
    const capped = await exportSummary(longValue);
    assert.ok(finite.getColumn(column).width > narrow.getColumn(column).width);
    assert.equal(multiline.getColumn(column).width, finite.getColumn(column).width);
    assert.ok(capped.getColumn(column).width >= finite.getColumn(column).width);
    assert.ok(capped.getColumn(column).width <= 64);
    assert.equal(capped.getCell(`${column}2`).value, longValue);
    assert.equal(capped.getCell(`${column}2`).alignment.wrapText, true);
    assert.ok(multiline.getRow(2).height > finite.getRow(2).height);
  }
});

test('Excel colors only overdue intermediate control dates using the local export date', async () => {
  const rows = ['2026-11-11', '2026-11-12', '2026-11-13', '', undefined].map((nextCheckpoint, index) => ({
    id: index + 1, deadline: '2026-11-11', nextCheckpoint, executor: 'Иванов И.И.',
  }));
  const loaded = await reloadWorkbook({ rows, exportedAt: new Date(2026, 10, 12, 0, 30) });
  const data = loaded.getWorksheet('Указания');
  assert.deepEqual([2, 3, 4, 5, 6].map(row => data.getCell(`J${row}`).value ?? ''), [
    '11.11.2026', '12.11.2026', '13.11.2026', '', '',
  ]);
  assert.deepEqual(data.getCell('J2').font, { name: 'Calibri', size: 13, color: { argb: 'FFB32630' } });
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
