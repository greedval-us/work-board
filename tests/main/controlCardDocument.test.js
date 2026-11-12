import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { createControlCardDocument } from '../../src/main/services/ControlCardDocument.js';

async function report(fields = {}, marks = []) {
  const archive = await JSZip.loadAsync(await createControlCardDocument({ fields, marks }));
  const xml = await archive.file('word/document.xml').async('string');
  const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g);
  return { archive, xml, card: tables[0], history: tables[1] };
}

test('Ф‑21 fills the matching fields in the original two-part Word form', async () => {
  const { archive, xml, card, history } = await report({
    instructionNumber: '0005/к', documentDate: '2026-11-03',
    incomingNumber: '001/в', incomingDate: '2026-11-04', source: 'Управление',
    office: 'Канцелярия', officePhone: '123-45', title: 'Письмо & приложение',
    summary: 'Проверить <данные>\r\nПередать {{summary}}', deadline: '2026-11-20',
    extendedUntil: '2026-11-30', executor: 'Иванов И. И.', department: 'Отдел № 5',
    executorPhone: '678-90', executionMark: 'Исполнено', removalMark: 'Снято', removalDate: '2026-11-25',
  }, [{ date: '2026-11-15', text: 'Первый этап\nРезультат & сверка' }]);

  assert.match(xml, /КОНТРОЛЬНАЯ КАРТОЧКА/);
  assert.ok(xml.includes('№ 0005/к 03.11.2026'), 'The signed number and separate date have no automatic «от»');
  assert.ok(xml.includes('. № 001/в 04.11.2026'), 'The incoming number and separate date have no automatic «от»');
  assert.match(xml, /Управление/);
  assert.doesNotMatch(xml, /Делопроизводство|Канцелярия|123-45/);
  assert.match(xml, /Срок исполнения:[\s\S]*?20\.11\.2026[\s\S]*?Продлен до:[\s\S]*?30\.11\.2026/);
  assert.match(card, /Вид и краткое содержание СДМ:[\s\S]*?Письмо &amp; приложение/);
  assert.match(card, /Содержание поручения \(резолюции\):[\s\S]*?Проверить &lt;данные&gt;<\/w:t><w:br\/><w:t xml:space="preserve">Передать \{\{summary\}\}/);
  assert.match(card, /Отметка об исполнении:[\s\S]*?Снято[\s\S]*?Исполнено[\s\S]*?25\.11\.2026[\s\S]*?\(подпись\)/);
  assert.match(xml, /<w:br w:type="page"\/>[\s\S]*?Отдел № 5, Иванов И\. И\., тел\. 678-90/);
  assert.match(history, /Дата проверки[\s\S]*?Ход исполнения[\s\S]*?15\.11\.2026[\s\S]*?Первый этап<\/w:t><w:br\/><w:t xml:space="preserve">Результат &amp; сверка/);
  assert.equal(archive.file('docProps/core.xml'), null);
  assert.equal(archive.file('customXml/item1.xml'), null);
});

test('Ф‑21 keeps a manually entered «от» only once in each number', async () => {
  const { xml } = await report({
    instructionNumber: '674/5676/654-77 от 11.11.2026', incomingNumber: '567 от 11.11.2026',
  });
  for (const numberLine of ['№ 674/5676/654-77 от 11.11.2026', '. № 567 от 11.11.2026']) {
    assert.ok(xml.includes(numberLine));
    assert.equal(xml.includes(`${numberLine} от`), false);
  }
});

test('Ф‑21 shows three writing lines and leaves other empty fields and the verification table intact', async () => {
  const { xml, card, history } = await report();
  const removalRows = [...card.matchAll(/<w:tr(?=[\s>])[^>]*>[\s\S]*?<\/w:tr>/g)].slice(-7)
    .map(([row]) => row.match(/<w:tc>[\s\S]*?<\/w:tc>/g));
  assert.equal(removalRows.length, 7);
  for (const [left, right] of removalRows) {
    assert.match(left, /<w:right w:val="nil"/);
    assert.match(right, /<w:left w:val="nil"/);
  }
  assert.deepEqual(removalRows.map(([, cell]) => [
    cell.match(/<w:top w:val="([^"]+)"/)?.[1], cell.match(/<w:bottom w:val="([^"]+)"/)?.[1],
  ]), [
    ['nil', 'single'], ['nil', 'single'],
    ['single', 'single'], ['single', 'single'],
    ['single', 'single'], ['single', 'single'],
    ['single', 'nil'],
  ]);
  assert.ok(xml.includes(`№ ${'\u2007'.repeat(11)} ${'\u2007'.repeat(16)}`));
  assert.ok(xml.includes(`. № ${'\u2007'.repeat(14)} ${'\u2007'.repeat(11)}`));
  assert.doesNotMatch(xml, /\{\{|undefined|_{2,}/);
  assert.equal(history.match(/<w:tr(?=[\s>])/g).length, 21);
});

test('Ф‑21 carries all dated marks in order beyond the number of blank rows', async () => {
  const marks = Array.from({ length: 26 }, (_, index) => {
    const day = 26 - index;
    return { date: `2026-11-${String(day).padStart(2, '0')}`, text: `Запись ${day}` };
  });
  const { history } = await report({}, marks);
  assert.match(history, /<w:tblHeader\/>/);
  assert.equal(history.match(/<w:tr(?=[\s>])/g).length, 27);
  assert.deepEqual([...history.matchAll(/>(\d{2}\.11\.2026)</g)].map(([, date]) => date),
    marks.map(({ date }) => `${date.slice(8)}.11.2026`).reverse());
  assert.match(history, /26\.11\.2026[\s\S]*?Запись 26/);
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
