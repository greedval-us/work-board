import assert from 'node:assert/strict';
import { DatabaseSync } from '../../src/main/database/sqlite.js';

export async function verifyCalendar(driver, fixture, { generation, created }) {
  const { window, js, api, wait, click, navigate, fill, verifyEntrance, geometry, resize, resizeDefault, resizeSweep, screenshot } = driver;
  const { firstFile, today, originalDeadline, firstCheckpointMark } = fixture;

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
  await fill('[name=control-custom-date]', { 0: originalDeadline });
  await click('Добавить дату', '.registry-instruction-dialog button');
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
  await fill('.calendar-task-form input:not([type=checkbox]),.calendar-task-form select,.calendar-task-form textarea', { 0: 'Подготовить совещание', 1: today, 2: 'urgent', 3: 'Согласовать повестку и участников.' });
  await js("document.querySelector('.calendar-task-dialog .attachment-add').click()");
  await wait("document.querySelectorAll('.attachment-list li').length === 1 && !document.querySelector('.attachment-add').disabled");
  await js("document.querySelector('.calendar-task-form').requestSubmit()");
  await wait("!document.querySelector('.calendar-task-dialog[open]') && Boolean(document.querySelector('.calendar-task-open'))");
  day = (await api('calendar', 'month', { month: today.slice(0, 7), generation })).days.find(day => day.date === today);
  assert.equal(day.tasks, 1);
  const savedTask = (await api('calendar', 'day', { date: today, generation })).tasks[0];
  const taskFiles = await api('attachments', 'list', { entityType: 'tasks', entityId: savedTask.id, generation });
  assert.equal(taskFiles.length, 1);
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
        return rect.bottom <= bounds.bottom && rect.right <= bounds.right;
      });
    })()`);
    assert.deepEqual(badgeLayout, [true, true, true, true]);
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
  await wait("Boolean(document.querySelector('.attachment-list button.attachment-name'))");
  await js("document.querySelector('.calendar-task-dialog .attachment-add').click()");
  await wait("document.querySelectorAll('.attachment-list li').length === 2 && !document.querySelector('.attachment-add').disabled");
  await fill('[name=task-title]', { 0: 'Несохранённое изменение' });
  window.close();
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Продолжить редактирование', '.calendar-confirm-dialog button');
  await wait("!document.querySelector('.calendar-confirm-dialog[open]') && !document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').disabled");
  assert.equal(window.isDestroyed(), false);
  await js("document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').click()");
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Не сохранять', '.calendar-confirm-dialog button');
  await wait("!document.querySelector('.calendar-task-dialog[open]')");
  assert.equal((await api('attachments', 'list', { entityType: 'tasks', entityId: savedTask.id, generation })).length, 1);
  return { taskFiles };
}
