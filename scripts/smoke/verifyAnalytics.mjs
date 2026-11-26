import assert from 'node:assert/strict';
import { addCalendarDays, formatDate } from '../../src/shared/dates.js';

export async function verifyAnalytics(driver, fixture, { generation }) {
  const { js, api, wait, click, navigate, fill, resize, resizeDefault, screenshot } = driver;
  const { registrySelections, today, originalDeadline } = fixture;

  const { items: allInstructions } = await api('instructions', 'list', { generation, limit: 50 });
  const primaryExecutor = registrySelections.executor;
  const similarExecutor = 'Иванов А.А.';
  const primaryExecutorKey = 'иванов и.и.';
  const similarExecutorKey = 'иванов а.а.';
  const primaryInstructionIds = allInstructions.filter(row => row.executor === primaryExecutor).map(row => row.id);
  const primaryCheckpointsThisMonth = originalDeadline.slice(0, 7) === today.slice(0, 7) ? 2 : 1;
  const primaryMonthTotal = primaryInstructionIds.length + primaryCheckpointsThisMonth;
  const monthTotal = allInstructions.length + primaryCheckpointsThisMonth + 1;
  const similarInstruction = allInstructions.find(row => row.executor === similarExecutor);
  assert.ok(similarInstruction);
  const executorSelect = 'select[name=analytics-executor]';
  const executorOptions = () => js(`[...document.querySelector('${executorSelect}').options].map(option => [option.value, option.textContent.trim()])`);
  const instructionRows = '.analytics-instructions tr[data-instruction-id]';
  const analyticsInstructionIds = () => js(`[...document.querySelectorAll('${instructionRows}')].map(row => Number(row.dataset.instructionId))`);
  const finalControlIds = () => js(`[...document.querySelectorAll('${instructionRows}:not([data-checkpoint-date])')].map(row => Number(row.dataset.instructionId))`);
  const checkpointDates = () => js(`[...document.querySelectorAll('${instructionRows}[data-checkpoint-date]')].map(row => row.dataset.checkpointDate)`);
  const totals = (...values) => ['total', 'closed', 'active', 'overdue'].slice(0, values.length).map((key, index) =>
    `document.querySelector('[data-metric=${key}]')?.textContent.trim() === '${values[index]}'`).join(' && ');

  await navigate('/analytics', 'Аналитика контроля');
  await wait(totals(monthTotal, primaryCheckpointsThisMonth, 28, 0));
  assert.equal(await js("[...document.querySelectorAll('.analytics-page h2')].some(heading => heading.textContent.trim() === 'Статусы исполнения')"), false);
  const executorMetric = (label, metric) => js(`document.querySelector(${JSON.stringify(`[data-executor=${JSON.stringify(label)}] [data-executor-metric=${metric}]`)})?.textContent.trim()`);
  assert.equal(await executorMetric(primaryExecutor, 'total'), String(primaryMonthTotal));
  assert.equal(await executorMetric(primaryExecutor, 'active'), '26');
  assert.equal(await executorMetric(primaryExecutor, 'closed'), String(primaryCheckpointsThisMonth));
  assert.equal(await executorMetric(similarExecutor, 'active'), '2');
  assert.equal(await js("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded')"), 'false');
  assert.ok(await js(`document.querySelector('${executorSelect}').getClientRects().length`));
  const options = await executorOptions();
  assert.equal(options.length, 3);
  assert.equal(options[0][0], '');
  assert.deepEqual(new Map(options.slice(1)), new Map([[primaryExecutorKey, primaryExecutor], [similarExecutorKey, similarExecutor]]));
  await screenshot('analytics-light.png');

  await fill(executorSelect, { 0: primaryExecutorKey });
  await wait(totals(primaryMonthTotal, primaryCheckpointsThisMonth, 26, 0));
  assert.equal(await js("[...document.querySelectorAll('.analytics-instructions thead th')].some(heading => heading.textContent.trim() === 'Статус')"), false);
  assert.equal(await js("document.querySelectorAll('[data-executor]').length"), 1);
  assert.equal(await executorMetric(primaryExecutor, 'overdue'), '0');
  assert.deepEqual(await executorOptions(), options);
  await wait("document.querySelector('button[data-instructions-page=next]')?.matches(':enabled')");
  assert.equal((await analyticsInstructionIds()).length, 25);
  const firstPageIds = await finalControlIds();
  const firstPageDates = await checkpointDates();
  await js("document.querySelector('button[data-instructions-page=next]').click()");
  await wait(`document.querySelectorAll('${instructionRows}').length === ${primaryMonthTotal - 25} && document.querySelector('button[data-instructions-page=previous]')?.matches(':enabled')`);
  const secondPageIds = await analyticsInstructionIds();
  const byId = (left, right) => left - right;
  assert.deepEqual([...firstPageIds, ...await finalControlIds()].sort(byId), primaryInstructionIds.sort(byId));
  assert.deepEqual([...firstPageDates, ...await checkpointDates()].sort(), primaryCheckpointsThisMonth === 2 ? [originalDeadline, today] : [today]);

  const openedInstruction = allInstructions.find(row => row.id === secondPageIds[0]);
  const instructionLink = `${instructionRows}[data-instruction-id="${openedInstruction.id}"] a`;
  assert.equal(await js(`document.querySelector('${instructionLink}').textContent.trim()`), openedInstruction.title);
  await js(`document.querySelector('${instructionLink}').click()`);
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
  assert.match(await js("document.querySelector('.registry-card-id').textContent"), new RegExp(`ID ${openedInstruction.id}$`));
  assert.equal(await js("document.querySelector('.registry-instruction-dialog input[name=title]').value"), openedInstruction.title);
  await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");

  await navigate('/analytics', 'Аналитика контроля');
  await wait(`Boolean(document.querySelector('${instructionLink}'))`);
  assert.deepEqual(await analyticsInstructionIds(), secondPageIds);
  assert.equal(await js(`document.querySelector('${executorSelect}').value`), primaryExecutorKey);
  await fill(executorSelect, { 0: similarExecutorKey });
  await wait(totals(2, 0, 2, 0));
  assert.deepEqual(await finalControlIds(), [similarInstruction.id]);
  assert.deepEqual(await checkpointDates(), [today]);
  assert.deepEqual(await executorOptions(), options);

  const weekStart = addCalendarDays(today, -7);
  const period = `${formatDate(weekStart)} — ${formatDate(today)}`;
  const outsideDate = addCalendarDays(weekStart, -1);
  const movedDate = addCalendarDays(today, -1);
  const weekFixtures = [];
  try {
    for (const [label, deadline] of [
      ['Начало недели', weekStart],
      ['До начала недели', outsideDate],
      ['После конца недели', addCalendarDays(today, 1)],
    ]) {
      const withCheckpoints = deadline > today;
      weekFixtures.push(await api('instructions', 'create', { generation, data: {
        controlDate: withCheckpoints ? outsideDate : deadline, deadline, instructionNumber: label, title: label, executor: similarExecutor,
        ...(withCheckpoints && { controlSchedule: {
          frequency: 'custom', customDates: [outsideDate, today], moves: [{ from: outsideDate, to: movedDate }],
          marks: [{ date: today, text: 'Доклад получен' }],
        } }),
      } }));
    }
    const [{ id: closedId }, , { id: futureId }] = weekFixtures;
    await api('instructions', 'closeControl', { generation, id: closedId });
    await click('Эта неделя', '.analytics-presets button');
    await wait(`document.querySelector('.analytics-period span')?.textContent === ${JSON.stringify(period)} && document.querySelector('.analytics-page-heading button')?.matches(':enabled')`);
    await click('Обновить', '.analytics-page-heading button');
    await wait(totals(5, 2, 3, 1));
    assert.deepEqual(await finalControlIds(), [closedId, similarInstruction.id]);
    assert.deepEqual((await checkpointDates()).sort(), [movedDate, today, today]);
    assert.equal(await executorMetric(similarExecutor, 'active'), '3');
    assert.equal(await executorMetric(similarExecutor, 'closed'), '2');
    assert.equal(await executorMetric(similarExecutor, 'overdue'), '1');
    const monthCounts = new Map();
    for (const [date, closed, total] of [[weekStart, 1, 1], [movedDate, 0, 1], [today, 1, 3]]) {
      const label = `${date.slice(5, 7)}.${date.slice(0, 4)}`;
      const [closedInMonth, totalInMonth] = monthCounts.get(label) ?? [0, 0];
      monthCounts.set(label, [closedInMonth + closed, totalInMonth + total]);
    }
    const months = await js("[...document.querySelectorAll('.analytics-months li')].map(month => [month.querySelector('.analytics-month-label').textContent.trim(), month.querySelector('.analytics-month-value').textContent.trim()])");
    assert.deepEqual(months.map(([label, value]) => [label, value.match(/^\d+ \/ \d+/)?.[0]]),
      [...monthCounts].map(([label, [closed, total]]) => [label, `${closed} / ${total}`]));
    assert.equal(await js(`document.querySelector('${instructionRows}[data-instruction-id="${closedId}"] .analytics-control-closed')?.textContent.trim()`), 'Контроль закрыт');
    const checkpointLink = `${instructionRows}[data-instruction-id="${futureId}"][data-checkpoint-date="${movedDate}"] a`;
    await js(`document.querySelector('${checkpointLink}').click()`);
    await wait(`Boolean(document.querySelector('.registry-instruction-dialog[open] [data-checkpoint-date="${movedDate}"] textarea'))`);
    await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
    await wait("!document.querySelector('.registry-instruction-dialog[open]')");
    await navigate('/analytics', 'Аналитика контроля');
  } finally {
    for (const { id } of weekFixtures) await api('instructions', 'remove', { generation, id });
  }
  await click('Этот месяц', '.analytics-presets button');
  await fill(executorSelect, { 0: '' });
  await wait(totals(monthTotal, primaryCheckpointsThisMonth, 28, 0));
  assert.deepEqual(await analyticsInstructionIds(), []);

  await fill(executorSelect, { 0: primaryExecutorKey });
  await wait(totals(primaryMonthTotal, primaryCheckpointsThisMonth, 26, 0));
  await js("document.querySelector('.analytics-filter-toggle').click()");
  await wait("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded') === 'true'");
  assert.equal(await js("document.querySelector('[name=analytics-type], [name=analytics-priority], [name=analytics-status]') === null"), true);
  await fill('[name=analytics-from]', { 0: '2000-01-01' }); await fill('[name=analytics-to]', { 0: '2000-01-31' });
  await click('Применить', '.analytics-filters button');
  await wait(`Boolean(document.querySelector('.analytics-empty h2')) && ${totals(0, 0, 0, 0)}`);
  assert.deepEqual(await analyticsInstructionIds(), []);
  assert.equal(await js(`document.querySelector('${executorSelect}').value`), primaryExecutorKey);
  assert.deepEqual(await executorOptions(), options);
  await click('Сбросить', '.analytics-filters button');
  await wait(totals(30, 2, 28, 0));
  assert.equal(await js(`document.querySelector('${executorSelect}').value`), '');
  await resize(720, 540);
  await js("document.querySelector('.analytics-filter-toggle').click()");
  await wait("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded') === 'false'");
  assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
  assert.equal(await js("document.querySelector('.main-content').scrollWidth > document.querySelector('.main-content').clientWidth"), false);
  await screenshot('analytics-compact.png');
  await resizeDefault();
}
