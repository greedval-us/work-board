import assert from 'node:assert/strict';
import { createSmokeForms } from './forms.mjs';

export async function verifyScheduleCadence(driver, { renamedSelections }, generation) {
  const { api, click, fill, js, navigate, screenshot, wait } = driver;
  const { fillInstruction } = createSmokeForms(driver);
  const card = '.registry-instruction-dialog[open]';
  const instructionNumber = 'ТЕСТ-ПОЛУГОДИЕ';
  const frequency = '[name=control-frequency]';
  const choose = (selector, value) => js(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const setDay = (value) => choose('[name=control-day-of-month]', value);
  const showMonth = (value) => choose('.control-schedule input[type=month]', value);
  const showsDate = (date) => `Boolean(document.querySelector('[data-checkpoint-date="${date}"]'))`;

  await navigate('/', 'Реестр указаний');
  await click('Добавить указание', '.registry-toolbar button');
  await wait(`document.querySelector('${card} select[name=executor]')?.matches(':enabled')`);
  await fillInstruction({ controlDate: '2028-01-05', deadline: '2028-12-31', executor: renamedSelections.executor,
    instructionNumber, title: 'Проверить график промежуточного контроля' });
  await fill(frequency, { 0: 'weekly' });
  await fill('[name=control-first-date]', { 0: '2028-01-07' });
  const weekday = '[name=control-day-of-week]';
  await wait(showsDate('2028-01-07'));
  await wait(`document.querySelector('${weekday}')?.selectedOptions[0]?.textContent.trim() === 'Автоматически'`);
  await fill(weekday, { 0: '1' });
  await wait(showsDate('2028-01-10'));
  assert.equal(await js(showsDate('2028-01-07')), false);
  await fill(weekday, { 0: '' });
  await wait(showsDate('2028-01-07'));
  assert.equal(await js(showsDate('2028-01-10')), false);

  await fill(frequency, { 0: 'monthly' });
  await setDay('31');
  await showMonth('2028-02');
  await wait(showsDate('2028-02-29'));
  await setDay('');
  await showMonth('2028-02');
  await wait(showsDate('2028-02-07'));

  for (const [cadence, month, manualDate] of [
    ['quarterly', '2028-04', '2028-04-30'],
    ['semiannual', '2028-07', '2028-07-31'],
  ]) {
    await fill(frequency, { 0: cadence });
    await showMonth(month);
    await wait(showsDate(`${month}-07`));
    await setDay('31');
    await showMonth(month);
    await wait(showsDate(manualDate));
    assert.equal(await js(showsDate(`${month}-07`)), false);
    await setDay('');
    await showMonth(month);
    await wait(showsDate(`${month}-07`));
    assert.equal(await js(showsDate(manualDate)), false);
  }

  const annualMonth = '[name=control-month-of-year]';
  await fill(frequency, { 0: 'yearly' });
  await wait(showsDate('2028-01-07'));
  await fill(annualMonth, { 0: '2' });
  await wait(showsDate('2028-02-07'));
  await setDay('31');
  await wait(showsDate('2028-02-29'));
  await fill(annualMonth, { 0: '' });
  await wait(showsDate('2028-01-31'));
  await setDay('');
  await wait(showsDate('2028-01-07'));

  await fill(frequency, { 0: 'semiannual' });
  assert.equal(await js(`Boolean(document.querySelector('${annualMonth}'))`), false);
  await setDay('31');
  await showMonth('2028-07');
  await wait(showsDate('2028-07-31'));
  await js("document.querySelector('[name=control-frequency]').scrollIntoView({ block: 'center' })");
  await screenshot('control-schedule-semiannual.png');
  await js(`document.querySelector('${card} form').requestSubmit()`);
  await wait(`!document.querySelector('${card}')`);

  const { items } = await api('instructions', 'list', { generation, filters: { instructionNumber } });
  assert.equal(items.length, 1);
  const [item] = items;
  assert.equal(item.controlFrequency, 'semiannual');
  assert.equal(item.nextCheckpoint, '2028-01-31');
  const saved = await api('instructions', 'get', { id: item.id, generation });
  assert.deepEqual(saved.controlSchedule, { frequency: 'semiannual', firstDate: '2028-01-07', dayOfMonth: 31, customDates: [], marks: [] });
  await api('instructions', 'remove', { id: item.id, generation });
  await navigate('/calendar', 'Календарь и задачи');
}
