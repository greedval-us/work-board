import ExcelJS from 'exceljs';
import { formatDate, INSTRUCTION_COLUMNS, INSTRUCTION_STATUSES, normalizeListRequest } from '../../shared/registry.js';

export function createRegistryWorkbook({ rows, request = {}, exportedAt = new Date() }) {
  const normalized = normalizeListRequest(request);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Work Board';
  workbook.created = exportedAt;
  const sheet = workbook.addWorksheet('Указания', { views: [{ state: 'frozen', ySplit: 1 }] });
  const widths = [23, 20, 20, 40, 65, 21, 30, 50];
  sheet.columns = INSTRUCTION_COLUMNS.map((column, index) => ({ header: column.label, key: column.key, width: widths[index] }));
  for (const item of rows) {
    sheet.addRow({ ...item, controlDate: formatDate(item.controlDate), deadline: formatDate(item.deadline),
      executionMark: [INSTRUCTION_STATUSES[item.status], item.executionMark].filter(Boolean).join(' — ') });
  }
  sheet.autoFilter = { from: 'A1', to: 'H1' };
  sheet.eachRow((row, number) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { name: 'Calibri', size: 11 };
    if (number === 1) {
      row.height = 34;
      row.font = { name: 'Calibri', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0068D9' } };
    }
  });
  const metadata = workbook.addWorksheet('Параметры');
  metadata.columns = [{ header: 'Параметр', key: 'name', width: 32 }, { header: 'Значение', key: 'value', width: 75 }];
  const { filters, sort } = normalized;
  const settings = [
    ['Дата выгрузки', exportedAt.toLocaleString('ru-RU')], ['Количество строк', rows.length],
    ['Номер указания', filters.instructionNumber || 'Все'],
    ['Срок исполнения с', filters.deadlineFrom ? formatDate(filters.deadlineFrom) : 'Все'],
    ['Срок исполнения по', filters.deadlineTo ? formatDate(filters.deadlineTo) : 'Все'],
    ['Исполнитель', filters.executor || 'Все'], ['Статус', INSTRUCTION_STATUSES[filters.status] || 'Все'],
    ['Текст отметки', filters.executionMark || 'Все'],
    ['Сортировка', `${INSTRUCTION_COLUMNS.find(column => column.key === sort.field)?.label ?? 'Статус'}: ${sort.direction === 'asc' ? 'по возрастанию' : 'по убыванию'}`],
  ];
  for (const [name, value] of settings) metadata.addRow({ name, value });
  metadata.eachRow((row) => { row.alignment = { wrapText: true, vertical: 'top' }; });
  metadata.getRow(1).font = { bold: true };
  return workbook;
}
