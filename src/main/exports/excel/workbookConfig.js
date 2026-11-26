import { INSTRUCTION_COLUMNS } from '../../../shared/constants/registry.js';
import { normalizeExportRequest } from '../../../shared/registryRequests.js';
import { PLAN_COLUMNS, PLAN_ITEM_COLUMN, normalizePlanExportRequest } from '../../../shared/planning.js';

export const WORKBOOK_CONFIG = Object.freeze({
  CREATOR: 'Work Board', INSTRUCTIONS_SHEET: 'Указания', PARAMETERS_SHEET: 'Параметры',
  HEADER_ROW: 1, FONT_NAME: 'Calibri', FONT_SIZE: 13,
  HEADER_TEXT_COLOR: 'FFFFFFFF', HEADER_FILL_COLOR: 'FF0068D9',
  TABLE_BORDER_COLOR: 'FF808080',
  OVERDUE_TEXT_COLOR: 'FFB32630',
  MIN_COLUMN_WIDTH: 10, MAX_COLUMN_WIDTH: 64,
  CELL_PADDING: 2, FILTER_PADDING: 4,
  LINE_HEIGHT: 18, ROW_PADDING: 4, MAX_ROW_HEIGHT: 408,
});

export const FULL_INSTRUCTION_COLUMNS = Object.freeze(INSTRUCTION_COLUMNS.filter(({ key }) => key !== 'documentType'));

export const SHORT_INSTRUCTION_COLUMNS = Object.freeze([
  { key: 'id', label: 'ID' },
  { key: 'incomingNumber', label: 'Входящий №' },
  { key: 'instructionNumber', label: 'Подписной №' },
  { key: 'title', label: 'Название' },
  { key: 'summary', label: 'Резолюция' },
  { key: 'deadline', label: 'Срок' },
  { key: 'executor', label: 'Исполнитель' },
  { key: 'executionMark', label: 'Исполнение' },
].map(Object.freeze));

const shortPlanColumns = Object.freeze(SHORT_INSTRUCTION_COLUMNS.flatMap(column =>
  column.key === 'title' ? [column, PLAN_ITEM_COLUMN] : [column]));

function overdueColumns(shortColumns) {
  return Object.freeze([
    ...shortColumns.filter(column => ['instructionNumber', 'title', 'planItem', 'executor'].includes(column.key)),
    { key: 'controlKind', label: 'Вид контроля' }, { key: 'dueDate', label: 'Срок' },
  ]);
}

export const REGISTRY_REPORT = Object.freeze({
  normalize: normalizeExportRequest, sheet: WORKBOOK_CONFIG.INSTRUCTIONS_SHEET,
  section: 'Реестр контроля', closedSection: 'Закрытый контроль', dialogTitle: 'Выгрузить реестр в Excel',
  columns: INSTRUCTION_COLUMNS, full: FULL_INSTRUCTION_COLUMNS, short: SHORT_INSTRUCTION_COLUMNS, overdue: overdueColumns(SHORT_INSTRUCTION_COLUMNS),
});

export const PLANNING_REPORT = Object.freeze({
  normalize: normalizePlanExportRequest, sheet: 'Планы',
  section: 'Контроль планирования', closedSection: 'Закрытые планы', dialogTitle: 'Выгрузить планы в Excel',
  columns: PLAN_COLUMNS, full: PLAN_COLUMNS,
  short: shortPlanColumns, overdue: overdueColumns(shortPlanColumns),
});
