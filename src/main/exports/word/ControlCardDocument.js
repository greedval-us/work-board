import { readFile } from 'node:fs/promises';
import { formatDate } from '../../../shared/dates.js';
import { appPath, requireFromApp } from '../../runtime/appPaths.js';

const TEMPLATE = appPath('src/main/exports/word/control-card-f21.docx');
const DOCUMENT = 'word/document.xml';
const HISTORY_SECTION = /<!--F21_CHECKS_BEGIN-->([\s\S]*?)<!--F21_CHECKS_END-->/;
const TABLE_ROW = /<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g;
const SLOT = /\{\{([A-Za-z]+)\}\}/g;
// A figure space reserves the same width as the form's underscore.
const BLANK_FIELD_SPACE = '\u2007';
const TEXT_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function wordText(value) {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/[&<>]/g, character => TEXT_ENTITIES[character])
    .replace(/\r\n?|\n/g, '</w:t><w:br/><w:t xml:space="preserve">')
    .replaceAll('\t', '</w:t><w:tab/><w:t xml:space="preserve">');
}

function fillSlots(fragment, values) {
  return fragment.replaceAll(SLOT, (_, field) => wordText(values[field] ?? ''));
}

function numberAndDate(number, date, blankWidth) {
  return [number, formatDate(date)].filter(Boolean).join(' ') || BLANK_FIELD_SPACE.repeat(blankWidth);
}

function templateValues(fields, recordId) {
  const phone = fields.executorPhone ? `тел. ${fields.executorPhone}` : '';
  const executorDetails = [fields.department, fields.executor, phone].filter(Boolean).join(', ');
  return {
    ...fields,
    cardNumber: recordId == null ? BLANK_FIELD_SPACE.repeat(8) : String(recordId),
    deadline: formatDate(fields.deadline) || BLANK_FIELD_SPACE.repeat(16),
    extendedUntil: formatDate(fields.extendedUntil) || BLANK_FIELD_SPACE.repeat(16),
    office: fields.office || BLANK_FIELD_SPACE.repeat(40),
    instructionNumber: numberAndDate(fields.instructionNumber, fields.documentDate, 32),
    incomingNumber: numberAndDate(fields.incomingNumber, fields.incomingDate, 32),
    source: fields.source || BLANK_FIELD_SPACE.repeat(40),
    executorDetails: executorDetails || BLANK_FIELD_SPACE.repeat(48),
    removalDate: formatDate(fields.removalDate),
  };
}

function fillHistory(fragment, marks) {
  const rows = fragment.match(TABLE_ROW);
  const sortedMarks = [...marks].sort((left, right) => (left.actualDate ?? left.date).localeCompare(right.actualDate ?? right.date)
    || left.date.localeCompare(right.date));
  return Array.from({ length: Math.max(rows.length, sortedMarks.length) }, (_, index) => {
    const { date = '', actualDate, text = '' } = sortedMarks[index] ?? {};
    const row = rows[Math.min(index, rows.length - 1)];
    return fillSlots(row, { checkDate: formatDate(actualDate ?? date), checkText: text });
  }).join('');
}

export async function createControlCardDocument({ fields, marks = [], recordId }) {
  const JSZip = requireFromApp('jszip');
  const archive = await JSZip.loadAsync(await readFile(TEMPLATE));
  const template = await archive.file(DOCUMENT).async('string');
  const [before, history, after] = template.split(HISTORY_SECTION);
  const values = templateValues(fields, recordId);
  archive.file(DOCUMENT, fillSlots(before, values) + fillHistory(history, marks) + fillSlots(after, values));
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
