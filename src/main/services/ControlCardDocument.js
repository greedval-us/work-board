import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { formatDate } from '../../shared/dates.js';
import { appPath } from '../utils/appPaths.js';

const TEMPLATE = appPath('src/main/templates/control-card-f21.docx');
const DOCUMENT = 'word/document.xml';
const HISTORY_SECTION = /<!--F21_CHECKS_BEGIN-->([\s\S]*?)<!--F21_CHECKS_END-->/;
const TABLE_ROW = /<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g;
const SLOT = /\{\{([A-Za-z]+)\}\}/g;
// A figure space reserves the same width as the form's underscore.
const BLANK_FIELD_SPACE = '\u2007';
const BLANK_EXECUTOR_LINE = BLANK_FIELD_SPACE.repeat(77);
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

function templateValues(fields, recordId) {
  const phone = fields.executorPhone ? `тел. ${fields.executorPhone}` : '';
  const executorDetails = [fields.department, fields.executor, phone].filter(Boolean).join(', ');
  const removalDate = formatDate(fields.removalDate);
  return {
    ...fields,
    cardNumber: recordId == null ? '' : ` №${recordId}`,
    deadline: formatDate(fields.deadline) || BLANK_FIELD_SPACE.repeat(16),
    extendedUntil: formatDate(fields.extendedUntil) || BLANK_FIELD_SPACE.repeat(26),
    instructionNumber: fields.instructionNumber || BLANK_FIELD_SPACE.repeat(11),
    documentDate: formatDate(fields.documentDate) || BLANK_FIELD_SPACE.repeat(16),
    incomingNumber: fields.incomingNumber || BLANK_FIELD_SPACE.repeat(14),
    incomingDate: formatDate(fields.incomingDate) || BLANK_FIELD_SPACE.repeat(11),
    source: fields.source || BLANK_FIELD_SPACE.repeat(66),
    executorDetails: executorDetails || BLANK_FIELD_SPACE.repeat(263),
    executorBlankTail: executorDetails ? `\n${BLANK_EXECUTOR_LINE}`.repeat(3) : BLANK_FIELD_SPACE.repeat(45),
    removalDate: removalDate ? `\n${removalDate}` : '',
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
  const archive = await JSZip.loadAsync(await readFile(TEMPLATE));
  const template = await archive.file(DOCUMENT).async('string');
  const [before, history, after] = template.split(HISTORY_SECTION);
  const values = templateValues(fields, recordId);
  archive.file(DOCUMENT, fillSlots(before, values) + fillHistory(history, marks) + fillSlots(after, values));
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
