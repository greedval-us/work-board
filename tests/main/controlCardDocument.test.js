import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { createControlCardDocument } from '../../src/main/exports/word/ControlCardDocument.js';

function elements(xml, name) {
  return xml.match(new RegExp(`<w:${name}(?=[\\s>])[^>]*>[\\s\\S]*?</w:${name}>`, 'g')) ?? [];
}

function visibleText(xml) {
  return [...xml.matchAll(/<w:t(?=[\s>])[^>]*>([\s\S]*?)<\/w:t>|<w:(br|tab)\s*\/>/g)]
    .map(([, value, separator]) => value ?? (separator === 'br' ? '\n' : '\t')).join('')
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function assertRun(xml, expected, underlined) {
  const run = elements(xml, 'r').find(fragment => visibleText(fragment).trim() === expected);
  assert.ok(run, `Missing Word run with value ${expected}`);
  const underline = run.match(/<w:u\b[^>]*\bw:val="([^"]+)"/)?.[1];
  if (underlined) assert.equal(underline, 'single', `Underline for ${expected}`);
  else assert.ok(!underline || underline === 'none', `Unexpected underline for ${expected}`);
}

async function report(fields = {}, marks = [], recordId) {
  const archive = await JSZip.loadAsync(await createControlCardDocument({ fields, marks, recordId }));
  const xml = await archive.file('word/document.xml').async('string');
  const tables = elements(xml, 'tbl');
  const history = tables.find(table => visibleText(elements(table, 'tr')[0]).trim() === 'Дата проверкиХод исполнения');
  assert.ok(history, 'Missing verification history table');
  return { archive, xml, tables, history };
}

test('Ф‑21 fills and underlines the header fields in the supplied form', async () => {
  const { archive, xml, tables } = await report({
    instructionNumber: '0005/к', documentDate: '2026-11-03',
    incomingNumber: '001/в', incomingDate: '2026-11-04', source: 'Управление',
    office: 'Канцелярия № 2', officePhone: '123-45', deadline: '2026-11-20',
    extendedUntil: '2026-11-30', executor: 'Иванов И. И.', department: 'Отдел № 5',
    executorPhone: '678-90',
  }, [], 42);

  assert.equal(tables.length, 4);
  const heading = xml.slice(0, xml.indexOf(tables[0]));
  assert.match(visibleText(heading), /КОНТРОЛЬНАЯ КАРТОЧКАучета исполнения поручения №\s*42/);
  const headerText = visibleText(heading);
  assert.match(headerText, /Срок исполнения:\s*20\.11\.2026\s*Продлен до:\s*30\.11\.2026/);
  assert.match(headerText, /Участок делопроизводства\s*Канцелярия № 2\s*Подписной №\s*0005\/к 03\.11\.2026\s*Вх\. №\s*001\/в 04\.11\.2026\s*Поступил из\s*Управление/);
  assertRun(heading, 'учета исполнения поручения №', false);
  for (const value of ['42', '20.11.2026', '30.11.2026', 'Канцелярия № 2', '0005/к 03.11.2026', '001/в 04.11.2026', 'Управление']) {
    assertRun(heading, value, true);
  }
  const afterPageBreak = xml.split(/<w:br\b[^>]*\bw:type="page"\s*\/>/)[1];
  assert.ok(afterPageBreak);
  assert.match(visibleText(afterPageBreak), /Наименование подразделения, исполнитель \(фамилия, инициалы, телефон\)/);
  assertRun(afterPageBreak, 'Отдел № 5, Иванов И. И., тел. 678-90', true);
  assert.doesNotMatch(visibleText(xml), /Молочная коровка|0988366648|78467593047|финансовый отдел ООО|01\.01\.2026|123-45/);
  assert.ok(Object.keys(archive.files).every(name => !/^(docProps|customXml)\//.test(name)));
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels']) {
    assert.doesNotMatch(await archive.file(part).async('string'), /(?:docProps|customXml)\//);
  }
});

test('Ф‑21 writes plain values into their four tables, preserving special characters and line breaks', async () => {
  const { tables } = await report({
    title: 'Письмо & приложение', summary: 'Проверить <данные>\r\nПередать\t{{summary}}',
    executionMark: 'Исполнено', removalMark: 'Снято', removalDate: '2026-11-25',
  }, [{ date: '2026-11-15', text: 'Первый этап\nРезультат & сверка' }]);
  const [contents, execution, removal, history] = tables.map(table => elements(table, 'tr'));
  const [titleLabel, title] = elements(contents[0], 'tc');
  assert.equal(visibleText(titleLabel), 'Вид и краткое содержание СДМ:');
  assertRun(title, 'Письмо & приложение', false);
  assert.equal(visibleText(contents[1]), 'Содержание поручения (резолюции):');
  assertRun(contents[2], 'Проверить <данные>\nПередать\t{{summary}}', false);
  assert.equal(visibleText(execution[0]), 'Отметка об исполнении:');
  assertRun(execution[1], 'Исполнено', false);
  assertRun(removal[0], 'Снято', false);
  assert.equal(visibleText(removal[1]), '(отметка о снятии с контроля)');
  assertRun(removal[2], '25.11.2026', false);
  assert.equal(visibleText(removal[4]).trim(), '');
  assert.equal(visibleText(removal[5]), '(подпись)');
  const [checkDate, checkText] = elements(history[1], 'tc');
  assertRun(checkDate, '15.11.2026', false);
  assertRun(checkText, 'Первый этап\nРезультат & сверка', false);
  assert.match(contents[2], /&lt;данные&gt;<\/w:t><w:br\/>/);
  assert.match(checkText, /Результат &amp; сверка/);
});

test('Ф‑21 keeps a manually entered «от» only once in each number', async () => {
  const { xml } = await report({
    instructionNumber: '674/5676/654-77 от 11.11.2026', incomingNumber: '567 от 11.11.2026',
  });
  assertRun(xml, '674/5676/654-77 от 11.11.2026', true);
  assertRun(xml, '567 от 11.11.2026', true);
});

test('Ф‑21 retains the blank lines and verification table of the supplied form', async () => {
  const { xml, tables, history } = await report();
  assert.deepEqual(tables.map(table => elements(table, 'tr').length), [3, 5, 6, 32]);
  const heading = xml.slice(0, xml.indexOf(tables[0]));
  const blankLines = elements(heading, 'r').filter(run => visibleText(run).includes('\u2007'));
  assert.ok(blankLines.length >= 6);
  for (const blankLine of blankLines) assert.match(blankLine, /<w:u\b[^>]*\bw:val="single"/);
  assert.doesNotMatch(xml, /\{\{|undefined|_{2,}/);
  const [header, ...blankRows] = elements(history, 'tr');
  assert.deepEqual(elements(header, 'tc').map(visibleText), ['Дата проверки', 'Ход исполнения']);
  assert.ok(blankRows.every(row => !visibleText(row).trim()));
});

test('Ф‑21 carries all dated marks in order beyond the number of blank rows', async () => {
  const marks = Array.from({ length: 35 }, (_, index) => {
    const day = 35 - index;
    const date = new Date(Date.UTC(2026, 10, day)).toISOString().slice(0, 10);
    return { date, text: `Запись ${day}` };
  });
  const { history } = await report({}, marks);
  const [header, ...rows] = elements(history, 'tr');
  assert.match(header, /<w:tblHeader(?:\s[^>]*)?\/>/);
  assert.equal(rows.length, 35);
  assert.deepEqual(rows.map(row => elements(row, 'tc').map(visibleText)), marks.slice().reverse().map(({ date, text }) => [
    date.split('-').reverse().join('.'), text,
  ]));
});

test('Ф‑21 dates and sorts checkpoint history by execution date with legacy and planned-date tie breakers', async () => {
  const { history } = await report({}, [
    { date: '2026-11-10', actualDate: '2026-11-05', text: 'Поздний план' },
    { date: '2026-11-20', actualDate: '2026-11-04', text: 'Раннее исполнение' },
    { date: '2026-11-01', actualDate: '2026-11-06', text: 'Позднее исполнение' },
    { date: '2026-11-05', text: 'Старая отметка' },
  ]);
  const filledRows = [...history.matchAll(/<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g)]
    .map(([row]) => row).filter(row => /\d{2}\.11\.2026/.test(row));
  assert.deepEqual(filledRows.map(row => row.match(/\d{2}\.11\.2026/)[0]), [
    '04.11.2026', '05.11.2026', '05.11.2026', '06.11.2026',
  ]);
  assert.match(filledRows[0], /Раннее исполнение/);
  assert.match(filledRows[1], /Старая отметка/);
  assert.match(filledRows[2], /Поздний план/);
  assert.match(filledRows[3], /Позднее исполнение/);
});

test('Ф‑21 sorts history without requiring toSorted or mutating the saved marks', async () => {
  const marks = [
    { date: '2026-11-20', text: 'Поздняя отметка' },
    { date: '2026-11-05', text: 'Ранняя отметка' },
  ];
  Object.defineProperty(marks, 'toSorted', { value: undefined });
  Object.freeze(marks);
  const { history } = await report({}, marks);
  assert.match(history, /05\.11\.2026[\s\S]*?Ранняя отметка[\s\S]*?20\.11\.2026[\s\S]*?Поздняя отметка/);
  assert.equal(marks[0].date, '2026-11-20');
});
