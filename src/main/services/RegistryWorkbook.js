import ExcelJS from 'exceljs';
import { CHECKPOINT_FILTER_LABELS, formatDate, INSTRUCTION_COLUMNS, INSTRUCTION_STATUSES, localDate, normalizeListRequest } from '../../shared/registry.js';
import { WORKBOOK_CONFIG as config, INSTRUCTION_COLUMN_WIDTHS } from '../config/workbook.js';

export function createRegistryWorkbook({ rows, request = {}, exportedAt = new Date() }) {
  const normalized = normalizeListRequest(request);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.CREATOR;
  workbook.created = exportedAt;
  const sheet = workbook.addWorksheet(config.INSTRUCTIONS_SHEET, { views: [{ state: 'frozen', ySplit: config.HEADER_ROW }] });
  sheet.columns = INSTRUCTION_COLUMNS.map(column => ({ header: column.label, key: column.key, width: INSTRUCTION_COLUMN_WIDTHS[column.key] }));
  const exportedDate = normalized.today ?? localDate(exportedAt);
  const font = { name: config.FONT_NAME, size: config.FONT_SIZE };
  const alignment = { vertical: 'top', wrapText: true };
  for (const item of rows) {
    const row = sheet.addRow({ ...item, id: item.id == null ? '' : String(item.id), controlDate: formatDate(item.controlDate),
      deadline: formatDate(item.deadline), extendedUntil: formatDate(item.extendedUntil),
      nextCheckpoint: formatDate(item.nextCheckpoint),
      executionMark: [INSTRUCTION_STATUSES[item.status], item.executionMark].filter(Boolean).join(' — ') });
    row.alignment = alignment;
    row.font = font;
    if (item.nextCheckpoint && item.nextCheckpoint < exportedDate) {
      row.getCell('nextCheckpoint').font = { ...font, color: { argb: config.OVERDUE_TEXT_COLOR } };
    }
  }
  sheet.autoFilter = { from: { row: config.HEADER_ROW, column: 1 }, to: { row: config.HEADER_ROW, column: INSTRUCTION_COLUMNS.length } };
  const header = sheet.getRow(config.HEADER_ROW);
  header.alignment = alignment;
  header.height = config.HEADER_HEIGHT;
  header.font = { ...font, bold: true, color: { argb: config.HEADER_TEXT_COLOR } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: config.HEADER_FILL_COLOR } };
  const metadata = workbook.addWorksheet(config.PARAMETERS_SHEET);
  metadata.columns = [{ header: 'Параметр', key: 'name', width: config.PARAMETER_NAME_WIDTH }, { header: 'Значение', key: 'value', width: config.PARAMETER_VALUE_WIDTH }];
  const { filters, sort } = normalized;
  const settings = [
    ['Дата выгрузки', exportedAt.toLocaleString('ru-RU')], ['Количество строк', rows.length],
    ['Подписной номер', filters.instructionNumber || 'Все'],
    ['Действующий срок с', filters.deadlineFrom ? formatDate(filters.deadlineFrom) : 'Все'],
    ['Действующий срок по', filters.deadlineTo ? formatDate(filters.deadlineTo) : 'Все'],
    ['Исполнитель', filters.executor || 'Все'], ['Статус', INSTRUCTION_STATUSES[filters.status] || 'Все'],
    ['Промежуточный контроль', filters.checkpoint ? `${CHECKPOINT_FILTER_LABELS[filters.checkpoint]} (${formatDate(exportedDate)})` : 'Все'],
    ['Текст отметки', filters.executionMark || 'Все'],
    ['Сортировка', `${INSTRUCTION_COLUMNS.find(column => column.key === sort.field)?.label ?? 'Статус'}: ${sort.direction === 'asc' ? 'по возрастанию' : 'по убыванию'}`],
  ];
  for (const [name, value] of settings) metadata.addRow({ name, value });
  metadata.eachRow((row) => { row.alignment = { wrapText: true, vertical: 'top' }; });
  metadata.getRow(config.HEADER_ROW).font = { bold: true };
  return workbook;
}
