import assert from 'node:assert/strict';
import { verifyCalendarPlans } from './verifyCalendarPlans.mjs';

export async function verifyPlanning(driver, { today, renamedSelections }, generation) {
  const { navigate, click, wait, fill, js, api, screenshot, resize, resizeDefault } = driver;
  const card = '.planning-dialog[open]';
  const row = index => `${card} .planning-row:nth-child(${index + 1})`;
  const save = () => js(`document.querySelector('${card} form').requestSubmit()`);
  const field = (index, name) => `${row(index)} [name="${name}"]`;
  const numbers = ['ПЛАН-01', 'ПЛАН-02'];
  const documentFields = {
    title: 'План мероприятий', instructionNumber: numbers[0], incomingNumber: 'Вх-17',
    documentType: renamedSelections.documentType, source: renamedSelections.source,
    summary: 'Резолюция по плану', executionMark: 'Проверено',
  };
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
  await fillRow(0, { ...documentFields, ...execution, planItem: '1.1' });
  assert.equal(await js(`document.querySelector('${field(0, 'planItem')}').getBoundingClientRect().left >
    document.querySelector('${field(0, 'title')}').getBoundingClientRect().right`), true);
  await screenshot('planning-card.png');
  await click('Добавить строку', `${card} button`);
  await wait(`document.activeElement === document.querySelector('${field(1, 'planItem')}')`);
  assert.deepEqual(await js(`Object.fromEntries([...document.querySelectorAll('${row(1)} .registry-instruction-document [name]')]
    .map(input => [input.name, input.value]))`), documentFields);
  assert.deepEqual(await js(`[...document.querySelectorAll('${row(1)} .registry-instruction-control [name]')].map(input => input.value)`),
    ['', '', '', '', '', '']);
  await fillRow(1, { ...execution, planItem: '1.2', summary: 'Изменённая резолюция' });
  await click('Добавить строку', `${card} button`);
  await wait(`document.querySelector('${field(2, 'summary')}')?.value === 'Изменённая резолюция'`);
  await fillRow(2, { ...execution, instructionNumber: numbers[1], planItem: '2.1' });
  await save();
  await wait(`!document.querySelector('${card}') && document.querySelectorAll('.registry-table .registry-row').length === 3`);
  const groups = await js(`[...document.querySelectorAll('.registry-table tbody')].map(body => {
    const cell = body.querySelector('[scope=rowgroup]');
    return [cell.textContent.trim(), cell.rowSpan, [...body.querySelectorAll('[data-column=planItem]')].map(item => item.textContent.trim()).sort()];
  })`);
  assert.deepEqual(groups.sort(([a], [b]) => a.localeCompare(b)), [
    [numbers[0], 2, ['1.1', '1.2']], [numbers[1], 1, ['2.1']],
  ]);
  await screenshot('planning-groups.png');
  await resize(720, 540);
  assert.equal(await js("document.querySelector('[scope=rowgroup]').getBoundingClientRect().width > 0"), true);
  await resizeDefault();

  const itemRow = ".registry-row:has([data-column=planItem] [title='1.2'])";
  await js(`document.querySelector("${itemRow} .registry-record-link").click()`);
  await wait(`document.querySelector('${field(0, 'planItem')}')?.value === '1.2'`);
  assert.equal(await js(`document.querySelector('${card}').textContent.includes('Ф‑21')`), false);
  assert.equal(await js(`document.querySelector('${card} .registry-control-card-open')`), null);
  await fillRow(0, { planItem: '1.2а' });
  await save();
  await wait(`!document.querySelector('${card}') && document.querySelector('.registry-row [title="1.2а"]') !== null`);
  const filters = { instructionNumber: 'ПЛАН-' };
  assert.equal((await api('instructions', 'list', { filters, generation })).total, 0);
  const plans = (await api('plans', 'list', { filters, generation })).items;
  assert.equal(plans.length, 3);
  await verifyCalendarPlans(driver, today, generation, plans.find(item => item.planItem === '1.1').id);
  console.log('Planning card, batch creation, grouped rows, editing and registry isolation passed.');
}
