export function controlColumns(titleLabel, afterTitle = []) {
  return Object.freeze([
    { key: 'id', label: 'ID' },
    { key: 'controlDate', label: 'Дата постановки на контроль' },
    { key: 'incomingNumber', label: 'Входящий номер' },
    { key: 'instructionNumber', label: 'Подписной номер' },
    { key: 'documentType', label: 'Вид документа' },
    { key: 'source', label: 'Откуда' },
    { key: 'title', label: titleLabel },
    ...afterTitle,
    { key: 'summary', label: 'Резолюция' },
    { key: 'deadline', label: 'Сроки исполнения' },
    { key: 'extendedUntil', label: 'Продлён до' },
    { key: 'nextCheckpoint', label: 'Ближайший промежуточный контроль' },
    { key: 'executor', label: 'Исполнитель' },
    { key: 'controlFrequency', label: 'Промежуточный контроль' },
    { key: 'executionMark', label: 'Отметка об исполнении' },
  ].map(Object.freeze));
}

export const CONTROL_FIELDS = Object.freeze([
  'controlDate', 'incomingNumber', 'instructionNumber', 'documentType', 'source', 'title', 'summary',
  'deadline', 'extendedUntil', 'executor', 'executionMark',
]);
