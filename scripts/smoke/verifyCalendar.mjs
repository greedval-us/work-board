import assert from 'node:assert/strict';
import { DatabaseSync } from '../../src/main/database/sqlite.js';
import { addCalendarDays } from '../../src/shared/dates.js';

export async function verifyCalendar(driver, fixture, { generation, created }) {
  const { window, js, api, wait, click, navigate, fill, verifyEntrance, geometry, resize, resizeDefault, resizeSweep, screenshot } = driver;
  const { firstFile, today, originalDeadline, firstCheckpointMark, registrySelections } = fixture;
  const dateCell = date => `.calendar-date[aria-label^="${date},"]`;
  const todayCell = '.calendar-date[aria-current=date]';
  const assertTint = async (selector, surface, hasTaskAccent) => {
    const readTint = `(() => {
      const cell = document.querySelector(${JSON.stringify(selector)});
      const probe = document.createElement('span');
      probe.style.color = ${JSON.stringify(`var(${surface})`)};
      probe.hidden = true;
      cell.append(probe);
      const style = getComputedStyle(cell);
      const colors = { background: style.backgroundColor, expected: getComputedStyle(probe).color, taskAccent: style.boxShadow !== 'none' };
      probe.remove();
      return colors;
    })()`;
    await wait(`(() => {
      const colors = ${readTint};
      return colors.background === colors.expected && colors.taskAccent === ${hasTaskAccent};
    })()`);
    const colors = await js(readTint);
    assert.equal(colors.background, colors.expected, selector);
    assert.equal(colors.taskAccent, hasTaskAccent, selector);
  };

  await navigate('/calendar', 'Календарь и задачи');
  await wait("Boolean(document.querySelector('.calendar-date[aria-current=date]')) && !document.querySelector('.calendar-day-panel[aria-busy=true]')");
  let day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
  assert.equal(day.controls, 26);
  assert.equal(day.completedControls, 1);
  assert.equal(day.checkpoints, 2);
  const previousDay = await api('calendar', 'day', { date: originalDeadline, generation });
  assert.equal(previousDay.instructions.length, 0);
  assert.equal(previousDay.checkpoints[0].instructionId, created.id);
  assert.equal(previousDay.checkpoints[0].mark, firstCheckpointMark);
  await wait("Boolean(document.querySelector('.calendar-checkpoint-card'))");
  await js("document.querySelector('.calendar-checkpoint-card').click()");
  const checkpointEditor = `[data-checkpoint-date="${today}"] textarea`;
  await wait(`document.activeElement === document.querySelector(${JSON.stringify(checkpointEditor)})`);
  await fill(checkpointEditor, { 0: 'Промежуточный отчёт проверен' });
  await fill('[name=control-frequency]', { 0: 'custom' });
  await js(`(() => {
    const month = document.querySelector('.control-schedule-preview input[type=month]');
    month.value = ${JSON.stringify(today.slice(0, 7))};
    month.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const removeToday = `[data-checkpoint-date="${today}"] .control-schedule-remove`;
  await wait(`Boolean(document.querySelector(${JSON.stringify(removeToday)}))`);
  await js(`document.querySelector(${JSON.stringify(removeToday)}).click()`);
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  const markedDay = await api('calendar', 'day', { date: today, generation });
  assert.equal(markedDay.checkpoints[0].mark, 'Промежуточный отчёт проверен');
  assert.equal(markedDay.checkpoints[0].scheduled, false);
  assert.deepEqual((await api('instructions', 'get', { id: created.id, generation })).controlSchedule, {
    frequency: 'custom', firstDate: '', customDates: [originalDeadline],
    marks: [
      { date: originalDeadline, text: firstCheckpointMark, actualDate: today },
      { date: today, text: 'Промежуточный отчёт проверен', actualDate: today },
    ],
  });
  await navigate('/calendar', 'Календарь и задачи');
  await wait("Boolean(document.querySelector('.calendar-checkpoint-card'))");
  day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
  assert.equal(day.checkpoints, 1);
  assert.equal(day.completedCheckpoints, 1);
  await click('Новая задача', '.calendar-page-heading button');
  await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
  await verifyEntrance('.calendar-task-dialog', 'task card');
  assert.equal(await js("document.querySelector('.calendar-task-form fieldset').disabled"), false);
  assert.equal(await js("document.querySelector('.calendar-task-dialog .attachment-panel, .calendar-task-dialog input[type=file]') === null"), true);
  await fill('.calendar-task-form input:not([type=checkbox]),.calendar-task-form select,.calendar-task-form textarea', { 0: 'Подготовить совещание', 1: today, 2: 'urgent', 3: 'Согласовать повестку и участников.' });
  await js("document.querySelector('.calendar-task-form').requestSubmit()");
  await wait("!document.querySelector('.calendar-task-dialog[open]') && Boolean(document.querySelector('.calendar-task-open'))");
  day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
  assert.equal(day.tasks, 1);
  const savedTask = (await api('calendar', 'day', { date: today, generation })).tasks[0];
  assert.equal(savedTask.description, 'Согласовать повестку и участников.');
  await wait(`Boolean(document.querySelector('${todayCell}.calendar-date-warning.calendar-date-has-tasks[aria-pressed=true]'))`);
  await assertTint(todayCell, '--calendar-warning-surface', true);
  assert.deepEqual(await js(`[...document.querySelectorAll('${todayCell} .calendar-date-count svg')].map(icon => icon.getBoundingClientRect().height >= 16)`),
    [true, true, true, true]);

  const priorMonth = addCalendarDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  const overdue = await api('instructions', 'create', { generation, data: {
    title: 'Просроченный контроль в календаре', instructionNumber: 'КАЛЕНДАРЬ', executor: registrySelections.executor,
    controlDate: `${priorMonth}-01`, deadline: `${priorMonth}-12`,
  } });
  let taskOnly;
  try {
    taskOnly = await api('tasks', 'create', { generation, data: {
      title: 'Выполненная задача в календаре', date: `${priorMonth}-13`, completed: true,
    } });
    await js("document.querySelector('[aria-label=\"Предыдущий месяц\"]').click()");
    const overdueCell = `${dateCell(overdue.deadline)}.calendar-date-danger`;
    const taskCell = `${dateCell(taskOnly.date)}.calendar-date-has-tasks`;
    await wait(`Boolean(document.querySelector(${JSON.stringify(overdueCell)})) && Boolean(document.querySelector(${JSON.stringify(taskCell)}))`);
    await assertTint(overdueCell, '--error-surface', false);
    await assertTint(taskCell, '--accent-surface', true);
  } finally {
    if (taskOnly) await api('tasks', 'remove', { generation, id: taskOnly.id });
    await api('instructions', 'remove', { generation, id: overdue.id });
  }
  await click('Сегодня', '.calendar-month-navigation button');
  await wait(`Boolean(document.querySelector('${todayCell}.calendar-date-has-tasks')) && Boolean(document.querySelector('.calendar-task-open'))`);
  await screenshot('calendar-light.png');
  await resizeSweep('calendar');
  for (const height of [640, 540]) {
    await resize(720, height);
    assert.deepEqual(await js("[...document.querySelectorAll('.calendar-day-section .calendar-list-body')].map(list => list.clientHeight > 0)"), [true, true, true]);
    const badgeLayout = await js(`(() => {
      const date = document.querySelector('.calendar-date[aria-current=date]');
      const bounds = date.getBoundingClientRect();
      return [...date.querySelectorAll('.calendar-date-count')].map(badge => {
        const rect = badge.getBoundingClientRect();
        const icon = badge.querySelector('svg').getBoundingClientRect();
        return { bottom: rect.bottom - bounds.bottom, right: rect.right - bounds.right, width: icon.width, height: icon.height };
      });
    })()`);
    assert.equal(badgeLayout.length, 4);
    assert.ok(badgeLayout.every(badge => badge.bottom <= 0 && badge.right <= 0 && badge.width >= 9 && badge.height >= 12),
      `Calendar badges at 720×${height} exceed available space: ${JSON.stringify(badgeLayout)}`);
  }
  await resizeDefault();
  for (let attempt = 0; attempt < 12; attempt++) {
    await js("document.querySelector('[aria-label=\"Следующий месяц\"]').click()");
    await wait("document.querySelector('.calendar-month-panel')?.getAttribute('aria-busy') === 'false'");
    if (await js("document.querySelector('.calendar-month-grid')?.style.getPropertyValue('--calendar-weeks') === '6'")) break;
  }
  assert.equal(await js("document.querySelector('.calendar-month-grid').style.getPropertyValue('--calendar-weeks')"), '6');
  await resize(720, 540);
  await geometry('calendar', 'six-week month 720×540');
  await click('Сегодня', '.calendar-month-navigation button');
  await wait("Boolean(document.querySelector('.calendar-task-open'))");
  await resizeDefault();

  // A failed native checkbox save must keep the visible control consistent with SQLite.
  const lock = new DatabaseSync(firstFile);
  lock.exec('BEGIN IMMEDIATE');
  try {
    await js("document.querySelector('.calendar-task-checkbox').click()");
    await wait("Boolean(document.querySelector('.calendar-task-error'))");
  } finally { lock.exec('ROLLBACK'); lock.close(); }
  assert.equal(await js("document.querySelector('.calendar-task-checkbox').checked"), false);
  await js("document.querySelector('.calendar-task-checkbox').click()");
  await wait("document.querySelector('.calendar-task-checkbox')?.checked && Boolean(document.querySelector('.calendar-task-completed'))");
  assert.equal((await api('calendar', 'day', { date: today, generation })).tasks[0].completed, true);

  // Dirty-task close guard stays in Electron until the user chooses an action.
  await js("document.querySelector('.calendar-task-open').click()");
  await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
  assert.equal(await js("document.querySelector('.calendar-task-dialog .attachment-panel, .calendar-task-dialog input[type=file]') === null"), true);
  await fill('[name=task-title]', { 0: 'Несохранённое изменение' });
  window.close();
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Продолжить редактирование', '.calendar-confirm-dialog button');
  await wait("!document.querySelector('.calendar-confirm-dialog[open]') && !document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').disabled");
  assert.equal(window.isDestroyed(), false);
  assert.equal(await js("document.querySelector('[name=task-title]').value"), 'Несохранённое изменение');
  await js("document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').click()");
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Не сохранять', '.calendar-confirm-dialog button');
  await wait("!document.querySelector('.calendar-task-dialog[open]')");
  assert.equal((await api('tasks', 'get', { id: savedTask.id, generation })).title, savedTask.title);
}
