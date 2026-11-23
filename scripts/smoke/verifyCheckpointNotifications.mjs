import assert from 'node:assert/strict';
import { addCalendarDays, formatDate } from '../../src/shared/registry.js';

export async function verifyCheckpointNotifications(driver, fixture, { reopened, created }) {
  const { window, js, api, wait, click, navigate, fill, pressKey, resize, resizeDefault, screenshot } = driver;
  const { today } = fixture;

  // Move one weekly occurrence and record its actual execution retrospectively.
  const checkpointFrom = addCalendarDays(today, -7);
  const checkpointTo = addCalendarDays(today, -5);
  const actualDate = addCalendarDays(today, -6);
  const movable = await api('instructions', 'create', {
    generation: reopened.generation,
    data: { ...created, instructionNumber: 'ПЕРЕНОС-1', title: 'Перенос отдельной контрольной даты',
      controlDate: addCalendarDays(today, -14), deadline: addCalendarDays(today, 14), extendedUntil: '', status: 'pending',
      controlSchedule: { frequency: 'weekly', firstDate: checkpointFrom, customDates: [], marks: [] },
    },
  });
  const movedEditor = `.registry-instruction-dialog [data-checkpoint-date="${checkpointTo}"]`;
  await js(`location.hash = ${JSON.stringify(`#/?instruction=${movable.id}&checkpoint=${checkpointFrom}`)}`);
  await wait(`document.activeElement === document.querySelector('[data-checkpoint-date="${checkpointFrom}"] textarea')`);
  await fill('[name=control-planned-date]', { 0: checkpointTo });
  await click('Перенести', '.control-schedule-move');
  await wait(`document.activeElement === document.querySelector('${movedEditor} textarea')`);
  await fill('[name=control-actual-date]', { 0: actualDate });
  await fill(`${movedEditor} textarea`, { 0: 'Исполнено в другой день' });
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  const savedMove = await api('instructions', 'get', { id: movable.id, generation: reopened.generation });
  assert.deepEqual(savedMove.controlSchedule, {
    frequency: 'weekly', firstDate: checkpointFrom, customDates: [],
    moves: [{ from: checkpointFrom, to: checkpointTo }],
    marks: [{ date: checkpointTo, text: 'Исполнено в другой день', actualDate }],
  });
  const movedQuery = { generation: reopened.generation, filters: { instructionNumber: 'ПЕРЕНОС-1' } };
  assert.equal((await api('instructions', 'list', movedQuery)).items[0].nextCheckpoint, today);
  assert.equal((await api('calendar', 'day', { date: checkpointFrom, generation: reopened.generation })).checkpoints.some(row => row.instructionId === movable.id), false);
  const movedCalendar = (await api('calendar', 'day', { date: checkpointTo, generation: reopened.generation })).checkpoints.find(row => row.instructionId === movable.id);
  assert.equal(movedCalendar.actualDate, actualDate);
  await navigate('/calendar', 'Календарь и задачи');
  await js(`location.hash = ${JSON.stringify(`#/?instruction=${movable.id}&checkpoint=${checkpointTo}`)}`);
  await wait(`document.activeElement === document.querySelector('${movedEditor} textarea')`);
  assert.equal(await js("document.querySelector('[name=control-actual-date]').value"), actualDate);
  await screenshot('checkpoint-dates.png');
  await click('Отменить перенос', '.control-schedule-cancel-move');
  await wait(`document.activeElement === document.querySelector('[data-checkpoint-date="${checkpointFrom}"] textarea')`);
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  const restoredCheckpoint = (await api('instructions', 'get', { id: movable.id, generation: reopened.generation })).controlSchedule;
  assert.equal(restoredCheckpoint.moves, undefined);
  assert.deepEqual(restoredCheckpoint.marks, [{ date: checkpointFrom, text: 'Исполнено в другой день', actualDate }]);
  await api('instructions', 'remove', { id: movable.id, generation: reopened.generation });
  await navigate('/calendar', 'Календарь и задачи');
  console.log('Individual checkpoint move and retrospective execution date passed.');
  // Reminder popups, persistent read receipts and repeatable deep links.
  const reminderTask = await api('tasks', 'create', { generation: reopened.generation,
    data: { title: 'Напоминание: проверить отчёт', date: addCalendarDays(today, -1) } });
  const reminderDate = addCalendarDays(today, 1);
  const reminderInstruction = await api('instructions', 'create', { generation: reopened.generation,
    data: { ...created, instructionNumber: 'УВЕДОМЛЕНИЕ-1', title: 'Напоминание: промежуточный доклад',
      controlDate: addCalendarDays(today, -1), deadline: addCalendarDays(today, 3), extendedUntil: '', status: 'pending',
      controlSchedule: { frequency: 'custom', customDates: [today], marks: [], moves: [{ from: today, to: reminderDate }] },
    } });
  await js("window.dispatchEvent(new Event('focus'))");
  await wait("Boolean(document.querySelector('.notification-popup'))");
  await js("document.querySelector('[data-notification-action=show-list]').click()");
  await wait("document.querySelector('.notification-panel')?.textContent.includes('Напоминание: проверить отчёт')");
  assert.ok(await js(`document.querySelector('.notification-panel')?.textContent.includes(${JSON.stringify(formatDate(reminderDate))})`));
  await screenshot('deadline-notifications.png');
  await resize(720, 640);
  assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
  assert.equal(await js("(() => { const r = document.querySelector('.notification-panel').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()"), true);
  await screenshot('deadline-notifications-compact.png');
  await resizeDefault();
  await click('Прочитать все', '.notification-panel button');
  await wait("!document.querySelector('.notification-count')");
  const reminderState = await api('notifications', 'list', { generation: reopened.generation });
  assert.ok(reminderState.items.every(item => !item.unread));
  const openReminderTask = async () => {
    await js("[...document.querySelectorAll('.notification-record')].find(node => node.textContent.includes('Напоминание: проверить отчёт')).click()");
    await wait("document.querySelector('.calendar-task-dialog[open] [name=task-title]')?.value === 'Напоминание: проверить отчёт'");
    await js("document.querySelector('[aria-label=\"Закрыть карточку задачи\"]').click()");
    await wait("!document.querySelector('.calendar-task-dialog[open]')");
  };
  await openReminderTask();
  await js("document.querySelector('.notification-bell').click()");
  await openReminderTask();
  await js("document.querySelector('.notification-bell').click()");
  await js("[...document.querySelectorAll('.notification-record')].find(node => node.textContent.includes('УВЕДОМЛЕНИЕ-1') && node.textContent.includes('Промежуточный контроль')).click()");
  await wait(`document.activeElement === document.querySelector('[data-checkpoint-date="${reminderDate}"] textarea')`);
  await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  await api('tasks', 'update', { generation: reopened.generation, id: reminderTask.id, data: { completed: true } });
  await api('instructions', 'remove', { generation: reopened.generation, id: reminderInstruction.id });
  await js("window.dispatchEvent(new Event('focus'))");
  await js("document.querySelector('.notification-bell').click()");
  await wait("!document.querySelector('.notification-panel')?.textContent.includes('Напоминание:')");
  await pressKey('Escape');
  await wait("!document.querySelector('.notification-panel')");
  assert.equal(await js("document.activeElement === document.querySelector('.notification-bell')"), true);
  await api('tasks', 'remove', { generation: reopened.generation, id: reminderTask.id });
  await navigate('/calendar', 'Календарь и задачи');
  console.log('Deadline notification popup, bell receipts, task reopen and moved-checkpoint navigation passed.');
}
