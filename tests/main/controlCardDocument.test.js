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
  assert.match(xml, /№ 0005\/к от 03\.11\.2026/);
  assert.match(xml, /\. № 001\/в от 04\.11\.2026/);
  assert.match(xml, /Управление/);
  assert.match(xml, /Делопроизводство[\s\S]*?Канцелярия[\s\S]*?123-45/);
  assert.match(xml, /Срок исполнения:[\s\S]*?20\.11\.2026[\s\S]*?Продлен до:[\s\S]*?30\.11\.2026/);
  assert.match(card, /Вид и краткое содержание СДМ:[\s\S]*?Письмо &amp; приложение/);
  assert.match(card, /Содержание поручения \(резолюции\):[\s\S]*?Проверить &lt;данные&gt;<\/w:t><w:br\/><w:t xml:space="preserve">Передать \{\{summary\}\}/);
  assert.match(card, /Отметка об исполнении:[\s\S]*?Снято[\s\S]*?Исполнено[\s\S]*?25\.11\.2026[\s\S]*?\(подпись\)/);
  assert.match(xml, /<w:br w:type="page"\/>[\s\S]*?Отдел № 5, Иванов И\. И\., тел\. 678-90/);
  assert.match(history, /Дата проверки[\s\S]*?Ход исполнения[\s\S]*?15\.11\.2026[\s\S]*?Первый этап<\/w:t><w:br\/><w:t xml:space="preserve">Результат &amp; сверка/);
  assert.equal(archive.file('docProps/core.xml'), null);
  assert.equal(archive.file('customXml/item1.xml'), null);
});

test('Ф‑21 leaves optional fields empty and preserves the blank verification lines', async () => {
  const { xml, history } = await report();
  assert.match(xml, /№ _+ от _+/);
  assert.match(xml, /\. № _+ от _+/);
  assert.match(xml, /\(дата\)/);
  assert.doesNotMatch(xml, /\{\{|undefined/);
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
