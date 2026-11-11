import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { formatDate } from '../../shared/dates.js';

const TEMPLATE = new URL('../templates/control-card-f21.docx', import.meta.url);
const DOCUMENT = 'word/document.xml';
const HISTORY_SECTION = /<!--F21_CHECKS_BEGIN-->([\s\S]*?)<!--F21_CHECKS_END-->/;
const TABLE_ROW = /<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g;
const SLOT = /\{\{([A-Za-z]+)\}\}/g;
const BLANK_EXECUTOR_LINE = '_'.repeat(77);
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

function templateValues(fields) {
  const phone = fields.executorPhone ? `тел. ${fields.executorPhone}` : '';
  const executorDetails = [fields.department, fields.executor, phone].filter(Boolean).join(', ');
  const removalDate = formatDate(fields.removalDate);
  return {
    ...fields,
    deadline: formatDate(fields.deadline) || '_'.repeat(16),
    extendedUntil: formatDate(fields.extendedUntil) || '_'.repeat(26),
    office: fields.office || '_'.repeat(47),
    officeAlignment: fields.office ? 'left' : 'both',
    officePhoneLabel: fields.office ? '\nтел. ' : ' тел. ',
    officePhone: fields.officePhone || '_'.repeat(15),
    instructionNumber: fields.instructionNumber || '_'.repeat(11),
    documentDate: formatDate(fields.documentDate) || '_'.repeat(16),
    incomingNumber: fields.incomingNumber || '_'.repeat(14),
    incomingDate: formatDate(fields.incomingDate) || '_'.repeat(11),
    source: fields.source || '_'.repeat(66),
    executorDetails: executorDetails || '_'.repeat(263),
    executorBlankTail: executorDetails ? `\n${BLANK_EXECUTOR_LINE}`.repeat(3) : '_'.repeat(45),
    removalDate: removalDate ? `\n${removalDate}` : '',
  };
}

function fillHistory(fragment, marks) {
  const rows = fragment.match(TABLE_ROW);
  const sortedMarks = marks.toSorted((left, right) => left.date.localeCompare(right.date));
  return Array.from({ length: Math.max(rows.length, sortedMarks.length) }, (_, index) => {
    const { date = '', text = '' } = sortedMarks[index] ?? {};
    const row = rows[Math.min(index, rows.length - 1)];
    return fillSlots(row, { checkDate: formatDate(date), checkText: text });
  }).join('');
}

export async function createControlCardDocument({ fields, marks = [] }) {
  const archive = await JSZip.loadAsync(await readFile(TEMPLATE));
  const template = await archive.file(DOCUMENT).async('string');
  const [before, history, after] = template.split(HISTORY_SECTION);
  const values = templateValues(fields);
  archive.file(DOCUMENT, fillSlots(before, values) + fillHistory(history, marks) + fillSlots(after, values));
  return archive.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
