import {
  CHECKPOINT_FILTER_LABELS, formatDate, INSTRUCTION_STATUSES, instructionDeadline,
  localDate, REGISTRY_REPORT_LABELS, REGISTRY_REPORT_TYPE,
} from '../../../shared/registry.js';
import { CONTROL_FREQUENCIES } from '../../../shared/controlSchedule.js';
import { requireFromApp } from '../../runtime/appPaths.js';
import { addTableRow, addTableSheet, fitTable } from './worksheetTable.js';
import { WORKBOOK_CONFIG as config } from './workbookConfig.js';

const PARAMETER_COLUMNS = [{ key: 'name', label: 'Параметр' }, { key: 'value', label: 'Значение' }];

function formatRow(item, reportType) {
  if (reportType === REGISTRY_REPORT_TYPE.OVERDUE) {
    return { ...item, dueDate: formatDate(item.dueDate),
      controlKind: item.controlKind === 'deadline' ? 'Итоговый срок' : 'Промежуточная проверка' };
  }
  const id = item.id == null ? '' : String(item.id);
  if (reportType === REGISTRY_REPORT_TYPE.SHORT) return { ...item, id, deadline: formatDate(instructionDeadline(item)) };
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

function reportParameters(report, { reportType, filters, sort }, exportedDate) {
  if (reportType === REGISTRY_REPORT_TYPE.OVERDUE) return [
    ['Период', 'За всё время'], ['Состояние на', formatDate(exportedDate)],
    ['Сортировка', 'Сначала самые ранние сроки'],
  ];
  return [
    ['Подписной номер', filters.instructionNumber || 'Все'],
    ...(filters.documentType ? [['Вид документа', filters.documentType]] : []),
    ['Действующий срок с', filters.deadlineFrom ? formatDate(filters.deadlineFrom) : 'Все'],
    ['Действующий срок по', filters.deadlineTo ? formatDate(filters.deadlineTo) : 'Все'],
    ['Исполнитель', filters.executor || 'Все'], ['Статус', INSTRUCTION_STATUSES[filters.status] || 'Все'],
    ['Промежуточный контроль', filters.checkpoint ? `${CHECKPOINT_FILTER_LABELS[filters.checkpoint]} (${formatDate(exportedDate)})` : 'Все'],
    ['Текст отметки', filters.executionMark || 'Все'],
    ['Сортировка', `${report.columns.find(column => column.key === sort.field)?.label ?? 'Статус'}: ${sort.direction === 'asc' ? 'по возрастанию' : 'по убыванию'}`],
  ];
}

export function createControlWorkbook({ rows, normalized, exportedAt, report }) {
  const columns = report[normalized.reportType];
  const { Workbook } = requireFromApp('exceljs');
  const workbook = new Workbook();
  workbook.creator = config.CREATOR;
  workbook.created = exportedAt;
  const sheet = addTableSheet(workbook, report.sheet, columns, { autoFilter: true });
  const exportedDate = normalized.today ?? localDate(exportedAt);
  for (const item of rows) {
    const row = addTableRow(sheet, formatRow(item, normalized.reportType));
    if (normalized.reportType === REGISTRY_REPORT_TYPE.FULL && item.nextCheckpoint && item.nextCheckpoint < exportedDate) {
      row.getCell('nextCheckpoint').font = { ...row.font, color: { argb: config.OVERDUE_TEXT_COLOR } };
    }
  }
  fitTable(sheet);

  const metadata = addTableSheet(workbook, config.PARAMETERS_SHEET, PARAMETER_COLUMNS);
  const settings = [
    ['Дата выгрузки', exportedAt.toLocaleString('ru-RU')], ['Количество строк', rows.length],
    ['Вид отчёта', REGISTRY_REPORT_LABELS[normalized.reportType]],
    ['Раздел', normalized.closed ? report.closedSection : report.section],
    ...reportParameters(report, normalized, exportedDate),
  ];
  for (const [name, value] of settings) addTableRow(metadata, { name, value });
  fitTable(metadata);
  return workbook;
}
