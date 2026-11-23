import assert from 'node:assert/strict';
import { addCalendarDays } from '../../src/shared/dates.js';

export async function verifyTasksPage(driver, { today }, generation) {
  const { api, click, fill, js, navigate, screenshot, wait } = driver;
  const card = '.calendar-task-dialog[open]';
  const confirmation = '.calendar-confirm-dialog[open]';
  const list = '.tasks-list';
  const filters = '.tasks-filters button';
  const title = 'Задача из отдельного раздела';
  const updatedTitle = 'Задача изменена из календаря';
  const currentMonth = today.slice(0, 7);
  const previousMonth = addCalendarDays(`${currentMonth}-01`, -1).slice(0, 7);
  const find = selector => `document.querySelector(${JSON.stringify(selector)})`;
  const tasksOn = async date => (await api('calendar', 'day', { date, generation })).tasks;
  const row = (id, date) => `${list} [data-task-id="${id}"][data-task-date="${date}"]`;
  const toggle = selector => js(`${find(`${selector} input[type=checkbox]`)}.click()`);
  const filter = name => click(name, filters);
  const setMonth = month => js(`(() => {
    const input = document.querySelector('[name="task-list-month"]');
    input.value = ${JSON.stringify(month)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const submit = async () => {
    await js(`${find(`${card} form`)}.requestSubmit()`);
    await wait(`!${find(card)}`);
  };

  await navigate('/tasks', 'Задачи');
  await filter('Все');
  await setMonth(currentMonth);
  await click('Новая задача', '.tasks-toolbar button');
  await wait(`Boolean(${find(card)})`);
  await fill('[name=task-title], [name=task-date]', { 0: title, 1: today });
  await submit();
  const task = (await tasksOn(today)).find(item => item.title === title);
  assert.ok(task, 'a task added in the list also exists in the calendar');
  const taskRow = row(task.id, today);
  const taskButton = find(`${taskRow} .task-row-title`);
  await wait(`${taskButton}?.textContent.trim() === ${JSON.stringify(title)}`);

  await setMonth(previousMonth);
  await wait(`!${find(taskRow)}`);
  await click('Все даты', '.tasks-month-filter button');
  await wait(`Boolean(${taskButton})`);

  await navigate('/calendar', 'Календарь и задачи');
  await click('Сегодня', '.calendar-month-navigation button');
  const calendarButton = find(`.calendar-task-card:has(strong[title="${title}"]) .calendar-task-open`);
  await wait(`Boolean(${calendarButton})`);
  await js(`${calendarButton}.click()`);
  await wait(`Boolean(${find(card)})`);
  await fill('[name=task-title]', { 0: updatedTitle });
  await submit();

  const series = await api('tasks', 'create', { generation, data: {
    title: 'Еженедельная проверка', date: today, recurrence: { frequency: 'weekly' },
  } });

  await navigate('/tasks', 'Задачи');
  await filter('В работе');
  await wait(`${taskButton}?.textContent.trim() === ${JSON.stringify(updatedTitle)}`);
  await screenshot('tasks-page.png');
  await js(`${taskButton}.click()`);
  await wait(`Boolean(${find(card)})`);
  await fill('[name=task-title]', { 0: 'Несохранённое имя задачи' });
  await js(`${find('nav a[href="#/calendar"]')}.click()`);
  await wait(`Boolean(${find(confirmation)})`);
  await click('Продолжить редактирование', `${confirmation} button`);
  await wait(`!${find(confirmation)}`);
  assert.equal(await js("document.querySelector('h1').textContent"), 'Задачи');
  assert.equal(await js("document.querySelector('[name=task-title]').value"), 'Несохранённое имя задачи');
  await js(`${find(`${card} [aria-label="Закрыть карточку задачи"]`)}.click()`);
  await wait(`Boolean(${find(confirmation)})`);
  await click('Не сохранять', `${confirmation} button`);
  await wait(`!${find(card)}`);

  await toggle(taskRow);
  await wait(`!${find(taskRow)}`);
  assert.equal((await tasksOn(today)).find(item => item.id === task.id).completed, true);
  await filter('Выполненные');
  await wait(`${find(`${taskRow} input[type=checkbox]`)}?.checked === true`);
  await js(`${taskButton}.click()`);
  await wait(`Boolean(${find(card)})`);
  await click('Удалить', `${card} button`);
  await wait(`Boolean(${find(confirmation)})`);
  await click('Удалить', `${confirmation} button`);
  await wait(`!${find(card)} && !${find(taskRow)}`);
  assert.equal(await api('tasks', 'get', { id: task.id, generation }), null);

  await filter('В работе');
  const seriesRow = row(series.id, today);
  await wait(`${find(`${seriesRow} input[type=checkbox]`)}?.matches(':enabled')`);
  await toggle(seriesRow);
  await wait(`!${find(seriesRow)}`);
  assert.equal((await tasksOn(today)).find(item => item.id === series.id).completed, true);
  assert.equal((await tasksOn(addCalendarDays(today, 7))).find(item => item.id === series.id).completed, false);
  await api('tasks', 'remove', { id: series.id, generation });

  console.log('Tasks tab passed: calendar synchronization, month and status filters, editing, draft guard, completion, recurrence and deletion.');
}
