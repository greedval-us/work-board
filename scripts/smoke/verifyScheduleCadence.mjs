import assert from 'node:assert/strict';
import { createSmokeForms } from './forms.mjs';

export async function verifyScheduleCadence(driver, { renamedSelections }, generation) {
  const { api, click, fill, js, navigate, screenshot, wait } = driver;
  const { fillInstruction } = createSmokeForms(driver);
  const card = '.registry-instruction-dialog[open]';
  const instructionNumber = 'ТЕСТ-ПЕРИОДЫ';
  const frequency = '[name=control-frequency]';
  const period = start => `[name=control-period-date][data-control-period="${start}"]`;
  const field = start => `document.querySelector(${JSON.stringify(period(start))})`;
  const chooseDate = (start, date) => fill(period(start), { 0: date });

  await navigate('/', 'Реестр контроля');
  await js("document.querySelector('.registry-filter-reset')?.click()");
  await click('Добавить указание', '.registry-toolbar button');
  await wait(`document.querySelector('${card} select[name=executor]')?.matches(':enabled')`);
  await fillInstruction({ controlDate: '2028-01-05', deadline: '2028-12-31', executor: renamedSelections.executor,
    instructionNumber, title: 'Проверить график промежуточного контроля' });
  await fill(frequency, { 0: 'monthly' });
  await wait(`${field('2028-01-01')}?.value === ''`);
  assert.equal(await js(`${field('2028-01-01')}.min`), '2028-01-05');
  assert.equal(await js(`${field('2028-02-01')}.max`), '2028-02-29');
  assert.equal(await js("Boolean(document.querySelector('[name=control-custom-date], [name=control-first-date]'))"), false);
  await chooseDate('2028-01-01', '2028-01-10');
  await chooseDate('2028-02-01', '2028-02-29');
  await chooseDate('2028-01-01', '');
  assert.equal(await js(`${field('2028-02-01')}.value`), '2028-02-29');

  await fill(frequency, { 0: 'quarterly' });
  await wait(`${field('2028-01-01')}?.value === '2028-02-29'`);
  assert.equal(await js(`${field('2028-01-01')}.max`), '2028-03-31');
  await chooseDate('2028-01-01', '2028-03-15');
  await chooseDate('2028-04-01', '2028-05-20');
  assert.equal(await js(`${field('2028-07-01')}.value`), '');
  await js("document.querySelector('[name=control-frequency]').scrollIntoView({ block: 'center' })");
  await screenshot('control-schedule-quarterly.png');
  await js(`document.querySelector('${card} form').requestSubmit()`);
  await wait(`!document.querySelector('${card}')`);

  const { items } = await api('instructions', 'list', { generation, filters: { instructionNumber } });
  assert.equal(items.length, 1);
  const [item] = items;
  assert.equal(item.controlFrequency, 'quarterly');
  assert.equal(item.nextCheckpoint, '2028-03-15');
  const saved = await api('instructions', 'get', { id: item.id, generation });
  assert.deepEqual(saved.controlSchedule, { frequency: 'quarterly', firstDate: '', customDates: [], marks: [],
    periodDates: { '2028-01-01': '2028-03-15', '2028-04-01': '2028-05-20' } });
  const row = `document.querySelector('.registry-row:has(td[data-column=id] [title="${item.id}"])')`;
  await wait(`Boolean(${row})`);
  await js(`${row}.click()`);
  await wait(`${field('2028-04-01')}?.value === '2028-05-20'`);
  await js(`document.querySelector('${card} [aria-label="Закрыть карточку"]').click()`);
  await wait(`!document.querySelector('${card}')`);
  await api('instructions', 'remove', { id: item.id, generation });
  await navigate('/calendar', 'Календарь и задачи');
}
