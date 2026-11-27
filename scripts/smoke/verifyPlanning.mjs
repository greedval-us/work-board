import assert from 'node:assert/strict';
import { verifyCalendarPlans } from './verifyCalendarPlans.mjs';

export async function verifyPlanning(driver, { today, renamedSelections }, generation) {
  const { navigate, click, wait, fill, js, api, screenshot, resize, resizeDefault } = driver;
  const card = '.planning-dialog[open]';
  const row = index => `${card} .planning-row:nth-child(${index + 1})`;
  const save = () => js(`document.querySelector('${card} form').requestSubmit()`);
  const field = (index, name) => `${row(index)} [name="${name}"]`;
  const documentFields = {
    title: 'План мероприятий', instructionNumber: 'ПЛАН-00', incomingNumber: 'Вх-17',
    documentType: renamedSelections.documentType, source: renamedSelections.source,
    summary: 'Резолюция по плану',
  };
  const items = [
    { planItem: '1.1', activity: 'Проверить документы', executionMark: 'Документы получены' },
    { planItem: '1.2', activity: 'Подготовить заключение', executionMark: 'Заключение согласовано' },
    { planItem: '2.1', activity: 'Передать отчёт', executionMark: '' },
  ];
  const execution = { controlDate: today, executor: renamedSelections.executor, deadline: today };
  const fillRow = async (index, values) => {
    for (const [name, value] of Object.entries(values)) await fill(field(index, name), { 0: value });
  };

  await navigate('/planning-control', 'Контроль планирования');
  await wait("document.querySelector('.registry-toolbar .registry-button-primary')?.matches(':enabled')");
  await click('Добавить план', '.registry-toolbar button');
  await wait(`document.querySelector('${card} h2')?.textContent === 'Новый план'`);
  for (const key of ['documentType', 'source', 'executor']) {
    assert.deepEqual(await js(`[...document.querySelector('${field(0, key)}').options].map(option => option.value).filter(Boolean)`),
      [renamedSelections[key]]);
  }
  await fillRow(0, { ...documentFields, ...execution, ...items[0] });
  assert.equal(await js(`document.querySelector('${field(0, 'planItem')}').getBoundingClientRect().left >
    document.querySelector('${field(0, 'title')}').getBoundingClientRect().right`), true);
  const leftFields = index => js(`[...document.querySelectorAll('${row(index)} .registry-instruction-document [name]')].map(input => input.name)`);
  assert.deepEqual((await leftFields(0)).slice(-2), ['activity', 'executionMark']);
  await screenshot('planning-card.png');
  await click('Добавить строку', `${card} button`);
  await wait(`document.activeElement === document.querySelector('${field(1, 'planItem')}')`);
  assert.deepEqual(await leftFields(1), ['activity', 'executionMark']);
  assert.deepEqual(await js(`[...document.querySelectorAll('${row(1)} .registry-instruction-document [name]')].map(input => input.value)`), ['', '']);
  assert.deepEqual(await js(`[...document.querySelectorAll('${row(1)} .registry-instruction-control [name]')].map(input => input.value)`),
    ['', '', '', '', '', '']);
  await fillRow(1, { ...execution, ...items[0] });
  await fillRow(0, { activity: 'Удаляемая строка', planItem: '0.1' });
  await js(`document.querySelector('${row(0)} [aria-label="Убрать строку 1"]').click()`);
  await wait(`document.querySelectorAll('${card} .planning-row').length === 1`);
  assert.equal(await js(`document.querySelector('${field(0, 'title')}').value`), documentFields.title);
  assert.equal(await js(`document.querySelector('${field(0, 'activity')}').value`), items[0].activity);
  await click('Добавить строку', `${card} button`);
  await fillRow(1, { ...execution, ...items[1] });
  await click('Добавить строку', `${card} button`);
  assert.deepEqual(await leftFields(2), ['activity', 'executionMark']);
  await fillRow(2, { ...execution, ...items[2] });
  const finalDocument = { ...documentFields, instructionNumber: 'ПЛАН-01', summary: 'Изменённая резолюция' };
  await fillRow(0, { instructionNumber: finalDocument.instructionNumber, summary: finalDocument.summary });
  await save();
  await wait(`!document.querySelector('${card}') && document.querySelectorAll('.registry-table .registry-row').length === 3`);
  const groups = await js(`[...document.querySelectorAll('.registry-table tbody')].map(body => {
    const cell = body.querySelector('[scope=rowgroup]');
    return [cell.textContent.trim(), cell.rowSpan, [...body.querySelectorAll('[data-column=planItem]')].map(item => item.textContent.trim()).sort()];
  })`);
  assert.deepEqual(groups, [[finalDocument.instructionNumber, 3, items.map(item => item.planItem)]]);
  const tableActivities = await js(`Object.fromEntries([...document.querySelectorAll('.registry-table .registry-row')].map(row =>
    [row.querySelector('[data-column=planItem]').textContent.trim(), row.querySelector('[data-column=activity]').textContent.trim()]))`);
  assert.deepEqual(tableActivities, Object.fromEntries(items.map(item => [item.planItem, item.activity])));
  await screenshot('planning-groups.png');
  await resize(720, 540);
  assert.equal(await js("document.querySelector('[scope=rowgroup]').getBoundingClientRect().width > 0"), true);
  await resizeDefault();

  const itemRow = ".registry-row:has([data-column=planItem] [title='1.2'])";
  await js(`document.querySelector("${itemRow} .registry-record-link").click()`);
  await wait(`document.querySelector('${field(0, 'planItem')}')?.value === '1.2'`);
  assert.equal(await js(`document.querySelector('${field(0, 'activity')}').value`), items[1].activity);
  assert.equal(await js(`document.querySelector('${field(0, 'instructionNumber')}').value`), finalDocument.instructionNumber);
  assert.equal(await js(`document.querySelector('${card}').textContent.includes('Ф‑21')`), false);
  assert.equal(await js(`document.querySelector('${card} .registry-control-card-open')`), null);
  const edited = { ...items[1], planItem: '1.2а', activity: 'Уточнить заключение' };
  await fillRow(0, { planItem: edited.planItem, activity: edited.activity });
  await save();
  await wait(`!document.querySelector('${card}') && document.querySelector('.registry-row [title="1.2а"]') !== null`);
  const filters = { instructionNumber: 'ПЛАН-' };
  assert.equal((await api('instructions', 'list', { filters, generation })).total, 0);
  const plans = (await api('plans', 'list', { filters, generation })).items;
  assert.equal(plans.length, 3);
  for (const expected of [items[0], edited, items[2]]) {
    const row = plans.find(plan => plan.planItem === expected.planItem);
    for (const [key, value] of Object.entries({ ...expected, ...finalDocument })) assert.equal(row[key], value);
  }
  await verifyCalendarPlans(driver, today, generation, plans.find(item => item.planItem === '1.1').id);
  console.log('Planning card, batch creation, grouped rows, editing and registry isolation passed.');
}
