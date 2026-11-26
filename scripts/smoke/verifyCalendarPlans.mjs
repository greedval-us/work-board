import assert from 'node:assert/strict';
import { addCalendarDays } from '../../src/shared/dates.js';

export async function verifyCalendarPlans(driver, today, generation, id) {
  const { api, click, fill, js, navigate, wait } = driver;
  const record = await api('plans', 'get', { id, generation });
  const earlier = addCalendarDays(today, -1);
  const card = '.planning-dialog[open]';
  const deadline = ".calendar-plan-card:not(.calendar-checkpoint-card)";
  const checkpoint = '.calendar-plan-card.calendar-checkpoint-card';
  const closeCard = async () => {
    await js(`document.querySelector('${card} [aria-label="Закрыть карточку"]').click()`);
    await wait(`!document.querySelector('${card}')`);
  };
  const openCalendar = async () => {
    await navigate('/calendar', 'Календарь и задачи');
    await click('Сегодня', '.calendar-month-navigation button');
  };
  await api('plans', 'update', { id, generation, data: {
    controlDate: earlier, controlSchedule: { frequency: 'custom', customDates: [earlier, today] },
  } });
  try {
    await openCalendar();
    await wait(`document.querySelectorAll('${deadline}').length === 3 && document.querySelector('${checkpoint}') &&
      document.querySelector('.calendar-date[aria-current=date] .calendar-plan-count')?.textContent.trim() === '4'`);
    if (earlier.slice(0, 7) !== today.slice(0, 7)) {
      await js("document.querySelector('.calendar-month-navigation [aria-label=\"Предыдущий месяц\"]').click()");
    }
    const lateDay = `.calendar-date[aria-label^="${earlier},"]`;
    await wait(`document.querySelector('${lateDay}')?.matches('.calendar-date-danger') &&
      document.querySelector('${lateDay} .calendar-plan-overdue')?.title.includes('просрочено:')`);
    if (earlier.slice(0, 7) !== today.slice(0, 7)) {
      await click('Сегодня', '.calendar-month-navigation button');
      await wait(`document.querySelectorAll('${deadline}').length === 3`);
    }
    const deadlineLink = `${deadline}[href*="plan=${id}"]`;
    assert.ok((await js(`document.querySelector('${deadlineLink} .calendar-plan-label').textContent`)).includes(record.planItem));
    await js(`document.querySelector('${deadlineLink}').click()`);
    await wait(`document.querySelector('${card} [name=planItem]')?.value === ${JSON.stringify(record.planItem)}`);
    await closeCard();
    await openCalendar();
    await wait(`Boolean(document.querySelector('${checkpoint}'))`);
    await js(`document.querySelector('${checkpoint}').click()`);
    await wait(`document.querySelector('${card} [name=planItem]')?.value === ${JSON.stringify(record.planItem)} &&
      document.activeElement.matches('${card} [data-checkpoint-date="${today}"] textarea')`);
    const draft = `${record.planItem} (черновик)`;
    await fill(`${card} [name=planItem]`, { 0: draft });
    await js(`location.hash = ${JSON.stringify(`#/planning-control?plan=${id}&checkpoint=${earlier}`)}`);
    await wait(`document.activeElement.matches('${card} [data-checkpoint-date="${earlier}"] textarea') &&
      document.querySelector('${card} [name=planItem]')?.value === ${JSON.stringify(draft)}`);
    await fill(`${card} [name=planItem]`, { 0: record.planItem });
    await wait(`!document.querySelector('${card} .registry-unsaved-label')`);
    await closeCard();
  } finally {
    await api('plans', 'update', { id, generation, data: { controlDate: record.controlDate, controlSchedule: record.controlSchedule } });
  }
  await navigate('/settings', 'Настройки');
  const toggle = 'input[name=planning-enabled]';
  await js(`document.querySelector('${toggle}').click()`);
  await wait(`document.querySelector('${toggle}')?.matches(':enabled:not(:checked)')`);
  await openCalendar();
  await wait("document.querySelector('.calendar-day-panel')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.calendar-plan-card, .calendar-plan-legend, .calendar-plan-count')");
  await navigate('/settings', 'Настройки');
  await js(`document.querySelector('${toggle}').click()`);
  await wait(`document.querySelector('${toggle}')?.matches(':enabled:checked')`);
  await navigate('/planning-control', 'Контроль планирования');
}
