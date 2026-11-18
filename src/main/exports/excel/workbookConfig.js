import { INSTRUCTION_COLUMNS } from '../../../shared/constants/registry.js';

export const WORKBOOK_CONFIG = Object.freeze({
  CREATOR: 'Work Board', INSTRUCTIONS_SHEET: 'Указания', PARAMETERS_SHEET: 'Параметры',
  HEADER_ROW: 1, FONT_NAME: 'Calibri', FONT_SIZE: 13,
  HEADER_TEXT_COLOR: 'FFFFFFFF', HEADER_FILL_COLOR: 'FF0068D9',
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
