import assert from 'node:assert/strict';
import { addCalendarDays } from '../../src/shared/dates.js';
import { getControlWeekday } from '../../src/shared/controlSchedule.js';

export async function verifyTaskRecurrence(driver, { today }, generation) {
  const { api, click, fill, js, navigate, wait } = driver;
  const card = '.calendar-task-dialog[open]';
  const title = 'Повторяющаяся задача';
  const changedTitle = 'Повторяющаяся задача с отметкой';
  const future = addCalendarDays(today, 7);
  const movedDate = addCalendarDays(future, 1);
  const following = addCalendarDays(future, 7);
  const extra = addCalendarDays(today, 3);
  const recurrence = '[name=task-recurrence]';
  const occurrence = async (id, date) => (await api('calendar', 'day', { date, generation })).tasks.find(task => task.id === id);
  const submit = async () => {
    await js(`document.querySelector('${card} form').requestSubmit()`);
    await wait(`!document.querySelector('${card}')`);
  };
  const openDayTask = async (id, date) => {
    await js(`location.hash = ${JSON.stringify(`#/calendar?task=${id}&date=${date}`)}`);
    await wait(`Boolean(document.querySelector('${card}'))`);
    await wait(`document.querySelector('.calendar-date-selected')?.getAttribute('aria-label').startsWith('${date},')`);
  };
  const move = async (to) => {
    await fill('[name=task-move-date]', { 0: to });
    await click('Перенести', `${card} .calendar-move-occurrence-button`);
    await wait(`!document.querySelector('${card}') &&
      document.querySelector('.calendar-date-selected')?.getAttribute('aria-label').startsWith('${to},')`);
  };

  await navigate('/calendar', 'Календарь и задачи');
  await click('Сегодня', '.calendar-month-navigation button');
  await click('Новая задача', '.calendar-page-heading button');
  await wait(`Boolean(document.querySelector('${card}'))`);
  await fill('[name=task-title]', { 0: title });
  const frequencies = await js(`[...document.querySelector('${recurrence}').options].map(option => option.value)`);
  for (const value of ['', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom']) assert.ok(frequencies.includes(value));
  await fill(recurrence, { 0: 'weekly' });
  const weekday = getControlWeekday(today);
  await fill('[name=task-day-of-week]', { 0: String(weekday) });
  await submit();

  const { id } = (await api('calendar', 'day', { date: today, generation })).tasks.find(task => task.title === title);
  try {
    const series = await api('tasks', 'get', { id, generation });
    assert.deepEqual(series.recurrence, { frequency: 'weekly', dayOfWeek: weekday });
    assert.equal((await occurrence(id, future)).completed, false);

    const checkbox = `.calendar-task-card:has(strong[title="${title}"]) .calendar-task-checkbox`;
    await wait(`document.querySelector(${JSON.stringify(checkbox)})?.matches(':enabled')`);
    await js(`document.querySelector(${JSON.stringify(checkbox)}).click()`);
    await wait(`document.querySelector(${JSON.stringify(checkbox)})?.checked === true`);
    assert.equal((await occurrence(id, today)).completed, true);
    assert.equal((await occurrence(id, future)).completed, false);

    await openDayTask(id, future);
    assert.equal(await js(`document.querySelector('${card} [name=task-date]').value`), today);
    await fill('[name=task-title]', { 0: changedTitle });
    await js(`document.querySelector('${card} [name=task-completed]').click()`);
    await submit();
    assert.equal((await occurrence(id, future)).completed, true);
    assert.equal((await occurrence(id, today)).title, changedTitle);

    await navigate('/calendar', 'Календарь и задачи');
    await openDayTask(id, future);
    await move(movedDate);
    assert.equal(await occurrence(id, future), undefined);
    assert.equal((await occurrence(id, movedDate)).originalDate, future);
    assert.equal((await occurrence(id, movedDate)).completed, true);
    assert.equal((await occurrence(id, following)).completed, false);
    assert.equal((await occurrence(id, today)).completed, true);
    assert.deepEqual((await api('tasks', 'get', { id, generation })).recurrence, series.recurrence);

    await openDayTask(id, movedDate);
    await move(future);
    assert.equal(await occurrence(id, movedDate), undefined);
    assert.equal((await occurrence(id, future)).originalDate, undefined);
    assert.equal((await occurrence(id, future)).completed, true);

    await openDayTask(id, today);
    await fill(recurrence, { 0: 'custom' });
    await fill('[name=task-custom-date]', { 0: extra });
    await click('Добавить дату', `${card} button`);
    await submit();
    assert.equal((await occurrence(id, extra)).completed, false);
    assert.equal(await occurrence(id, future), undefined);
  } finally {
    await api('tasks', 'remove', { id, generation });
    await navigate('/calendar', 'Календарь и задачи');
  }
}
