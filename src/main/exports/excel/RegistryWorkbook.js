import {
  CHECKPOINT_FILTER_LABELS, formatDate, INSTRUCTION_COLUMNS, INSTRUCTION_STATUSES, instructionDeadline,
  localDate, normalizeExportRequest, REGISTRY_REPORT_TYPE,
} from '../../../shared/registry.js';
import { CONTROL_FREQUENCIES } from '../../../shared/controlSchedule.js';
import { requireFromApp } from '../../runtime/appPaths.js';
import { FULL_INSTRUCTION_COLUMNS, SHORT_INSTRUCTION_COLUMNS, WORKBOOK_CONFIG as config } from './workbookConfig.js';

const FONT = { name: config.FONT_NAME, size: config.FONT_SIZE };
const ALIGNMENT = { vertical: 'top', wrapText: true };
const BORDER_EDGE = { style: 'thin', color: { argb: config.TABLE_BORDER_COLOR } };
const TABLE_BORDER = { top: BORDER_EDGE, right: BORDER_EDGE, bottom: BORDER_EDGE, left: BORDER_EDGE };
const BOLD_WIDTH_SCALE = 1.08;
const NARROW_GLYPHS = /[ .,:;!|il]/u;
const WIDE_GLYPHS = /[MW@%ЖМФШЩЮжмфшщю]/u;
const FULLWIDTH_GLYPHS = /[\u2e80-\u9fff\uac00-\ud7af\uff01-\uff60\u{1f300}-\u{1faff}]/u;
const PARAMETER_COLUMNS = [{ key: 'name', label: 'Параметр' }, { key: 'value', label: 'Значение' }];

function textLines(value) {
  return String(value ?? '').split(/\r\n?|\n/);
}

function lineWidth(text) {
  let units = 0;
  for (const glyph of text) {
    if (glyph === '\t') units += 4;
    else if (NARROW_GLYPHS.test(glyph)) units += 0.55;
    else if (WIDE_GLYPHS.test(glyph)) units += 1.4;
    else if (FULLWIDTH_GLYPHS.test(glyph)) units += 2;
    else units++;
  }
  // Excel measures column widths using the default 11-point font.
  return units * config.FONT_SIZE / 11;
}

function wrappedLines(text, width) {
  let lines = 1;
  let available = width;
  for (const token of text.match(/\S+|\s+/g) ?? []) {
    const tokenWidth = lineWidth(token);
    if (token.trim() && tokenWidth > available) {
      if (available < width) lines++;
      const extraLines = Math.ceil(tokenWidth / width) - 1;
      lines += extraLines;
      available = width - (tokenWidth - extraLines * width);
    } else {
      available = Math.max(0, available - tokenWidth);
    }
  }
  return lines;
}

function formatTable(sheet, columns, filterPadding = 0) {
  const widths = columns.map(({ label }) => lineWidth(label) * BOLD_WIDTH_SCALE + config.CELL_PADDING + filterPadding);
  sheet.eachRow((row, index) => {
    if (index === config.HEADER_ROW) return;
    row.eachCell((cell, column) => {
      for (const line of textLines(cell.value)) {
        widths[column - 1] = Math.max(widths[column - 1], lineWidth(line) + config.CELL_PADDING);
      }
    });
  });
  for (let index = 0; index < widths.length; index++) {
    widths[index] = Math.max(config.MIN_COLUMN_WIDTH, Math.min(config.MAX_COLUMN_WIDTH, Math.ceil(widths[index])));
    sheet.getColumn(index + 1).width = widths[index];
  }
  sheet.eachRow((row, index) => {
    const isHeader = index === config.HEADER_ROW;
    let lines = 1;
    for (let column = 0; column < widths.length; column++) {
      const cell = row.getCell(column + 1);
      cell.border = TABLE_BORDER;
      const width = widths[column] - config.CELL_PADDING - (isHeader ? filterPadding : 0);
      const capacity = isHeader ? width / BOLD_WIDTH_SCALE : width;
      const height = textLines(cell.value).reduce((count, line) => count + wrappedLines(line, capacity), 0);
      lines = Math.max(lines, height);
    }
    row.height = Math.min(config.MAX_ROW_HEIGHT, lines * config.LINE_HEIGHT + config.ROW_PADDING);
  });
}

function formatRow(item, short) {
  const id = item.id == null ? '' : String(item.id);
  if (short) return { ...item, id, deadline: formatDate(instructionDeadline(item)) };
  return {
    ...item, id,
    controlDate: formatDate(item.controlDate),
    deadline: formatDate(item.deadline),
    extendedUntil: formatDate(item.extendedUntil),
    nextCheckpoint: formatDate(item.nextCheckpoint),
    controlFrequency: item.controlFrequency ? CONTROL_FREQUENCIES[item.controlFrequency] ?? '' : '',
    executionMark: [INSTRUCTION_STATUSES[item.status], item.executionMark].filter(Boolean).join(' — '),
  };
}

export function createRegistryWorkbook({ rows, request = {}, exportedAt = new Date() }) {
  const normalized = normalizeExportRequest(request);
  const short = normalized.reportType === REGISTRY_REPORT_TYPE.SHORT;
  const columns = short ? SHORT_INSTRUCTION_COLUMNS : FULL_INSTRUCTION_COLUMNS;
  const { Workbook } = requireFromApp('exceljs');
  const workbook = new Workbook();
  workbook.creator = config.CREATOR;
  workbook.created = exportedAt;
  const sheet = workbook.addWorksheet(config.INSTRUCTIONS_SHEET, { views: [{ state: 'frozen', ySplit: config.HEADER_ROW }] });
  sheet.columns = columns.map(({ key, label }) => ({ header: label, key }));
  const exportedDate = normalized.today ?? localDate(exportedAt);
  for (const item of rows) {
    const row = sheet.addRow(formatRow(item, short));
    row.alignment = ALIGNMENT;
    row.font = FONT;
    if (!short && item.nextCheckpoint && item.nextCheckpoint < exportedDate) {
      row.getCell('nextCheckpoint').font = { ...FONT, color: { argb: config.OVERDUE_TEXT_COLOR } };
    }
  }
  sheet.autoFilter = { from: { row: config.HEADER_ROW, column: 1 }, to: { row: config.HEADER_ROW, column: columns.length } };
  const header = sheet.getRow(config.HEADER_ROW);
  header.alignment = ALIGNMENT;
  header.font = { ...FONT, bold: true, color: { argb: config.HEADER_TEXT_COLOR } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: config.HEADER_FILL_COLOR } };
  formatTable(sheet, columns, config.FILTER_PADDING);

  const metadata = workbook.addWorksheet(config.PARAMETERS_SHEET);
  metadata.columns = PARAMETER_COLUMNS.map(({ key, label }) => ({ header: label, key }));
  const { filters, sort } = normalized;
  const settings = [
    ['Дата выгрузки', exportedAt.toLocaleString('ru-RU')], ['Количество строк', rows.length],
    ['Вид отчёта', short ? 'Краткий отчёт' : 'Полный отчёт'],
    ['Раздел', normalized.closed ? 'Закрытый контроль' : 'Реестр указаний'],
    ['Подписной номер', filters.instructionNumber || 'Все'],
    ...(filters.documentType ? [['Вид документа', filters.documentType]] : []),
    ['Действующий срок с', filters.deadlineFrom ? formatDate(filters.deadlineFrom) : 'Все'],
    ['Действующий срок по', filters.deadlineTo ? formatDate(filters.deadlineTo) : 'Все'],
    ['Исполнитель', filters.executor || 'Все'], ['Статус', INSTRUCTION_STATUSES[filters.status] || 'Все'],
    ['Промежуточный контроль', filters.checkpoint ? `${CHECKPOINT_FILTER_LABELS[filters.checkpoint]} (${formatDate(exportedDate)})` : 'Все'],
    ['Текст отметки', filters.executionMark || 'Все'],
    ['Сортировка', `${INSTRUCTION_COLUMNS.find(column => column.key === sort.field)?.label ?? 'Статус'}: ${sort.direction === 'asc' ? 'по возрастанию' : 'по убыванию'}`],
  ];
  for (const [name, value] of settings) metadata.addRow({ name, value });
  metadata.eachRow((row) => {
    row.alignment = ALIGNMENT;
    row.font = FONT;
  });
  metadata.getRow(config.HEADER_ROW).font = { ...FONT, bold: true };
  formatTable(metadata, PARAMETER_COLUMNS);
  return workbook;
}
