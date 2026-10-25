import ExcelJS from 'exceljs';
import { formatDate, INSTRUCTION_COLUMNS, INSTRUCTION_STATUSES, normalizeListRequest } from '../../shared/registry.js';
import { WORKBOOK_CONFIG as config, INSTRUCTION_COLUMN_WIDTHS } from '../config/workbook.js';

export function createRegistryWorkbook({ rows, request = {}, exportedAt = new Date() }) {
  const normalized = normalizeListRequest(request);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.CREATOR;
  workbook.created = exportedAt;
  const sheet = workbook.addWorksheet(config.INSTRUCTIONS_SHEET, { views: [{ state: 'frozen', ySplit: config.HEADER_ROW }] });
  sheet.columns = INSTRUCTION_COLUMNS.map(column => ({ header: column.label, key: column.key, width: INSTRUCTION_COLUMN_WIDTHS[column.key] }));
  for (const item of rows) {
    sheet.addRow({ ...item, controlDate: formatDate(item.controlDate), deadline: formatDate(item.deadline),
      executionMark: [INSTRUCTION_STATUSES[item.status], item.executionMark].filter(Boolean).join(' — ') });
  }
  sheet.autoFilter = { from: { row: config.HEADER_ROW, column: 1 }, to: { row: config.HEADER_ROW, column: INSTRUCTION_COLUMNS.length } };
  sheet.eachRow((row, number) => {
    row.alignment = { vertical: 'top', wrapText: true };
    row.font = { name: config.FONT_NAME, size: config.FONT_SIZE };
    if (number === config.HEADER_ROW) {
      row.height = config.HEADER_HEIGHT;
      row.font = { name: config.FONT_NAME, bold: true, color: { argb: config.HEADER_TEXT_COLOR }, size: config.FONT_SIZE };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: config.HEADER_FILL_COLOR } };
    }
  });
  const metadata = workbook.addWorksheet(config.PARAMETERS_SHEET);
  metadata.columns = [{ header: 'Параметр', key: 'name', width: config.PARAMETER_NAME_WIDTH }, { header: 'Значение', key: 'value', width: config.PARAMETER_VALUE_WIDTH }];
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
  metadata.getRow(config.HEADER_ROW).font = { bold: true };
  return workbook;
}
