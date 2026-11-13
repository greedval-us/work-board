import assert from 'node:assert/strict';

export async function verifyAnalytics(driver, fixture, { generation }) {
  const { js, api, wait, click, navigate, fill, resize, resizeDefault, screenshot } = driver;
  const { registrySelections } = fixture;

  const { items: allInstructions } = await api('instructions', 'list', { generation, limit: 50 });
  const primaryExecutor = registrySelections.executor;
  const similarExecutor = 'Иванов А.А.';
  const primaryExecutorKey = 'иванов и.и.';
  const similarExecutorKey = 'иванов а.а.';
  const primaryInstructionIds = allInstructions.filter(row => row.executor === primaryExecutor).map(row => row.id);
  const similarInstruction = allInstructions.find(row => row.executor === similarExecutor);
  assert.ok(similarInstruction);
  const executorSelect = 'select[name=analytics-executor]';
  const executorOptions = () => js(`[...document.querySelector('${executorSelect}').options].map(option => [option.value, option.textContent.trim()])`);
  const instructionRows = '.analytics-instructions tr[data-instruction-id]';
  const analyticsInstructionIds = () => js(`[...document.querySelectorAll('${instructionRows}')].map(row => Number(row.dataset.instructionId))`);

  await navigate('/analytics', 'Аналитика');
  await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
  assert.equal(await js("document.querySelector('[data-metric=completed]').textContent"), '1');
  assert.equal(await js("document.querySelector('[data-metric=active]').textContent"), '26');
  const executorMetric = (label, metric) => js(`document.querySelector(${JSON.stringify(`[data-executor=${JSON.stringify(label)}] [data-executor-metric=${metric}]`)})?.textContent.trim()`);
  assert.equal(await executorMetric(primaryExecutor, 'total'), '26');
  assert.equal(await executorMetric(primaryExecutor, 'completed'), '1');
  assert.equal(await executorMetric(similarExecutor, 'active'), '1');
  assert.equal(await js("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded')"), 'false');
  assert.ok(await js(`document.querySelector('${executorSelect}').getClientRects().length`));
  const options = await executorOptions();
  assert.equal(options.length, 3);
  assert.equal(options[0][0], '');
  assert.deepEqual(new Map(options.slice(1)), new Map([[primaryExecutorKey, primaryExecutor], [similarExecutorKey, similarExecutor]]));
  await screenshot('analytics-light.png');

  await fill(executorSelect, { 0: primaryExecutorKey });
  await wait("document.querySelector('[data-metric=total]')?.textContent === '26'");
  assert.equal(await js("document.querySelector('[data-metric=completed]').textContent"), '1');
  assert.equal(await js("document.querySelectorAll('[data-executor]').length"), 1);
  assert.equal(await executorMetric(primaryExecutor, 'overdue'), '0');
  assert.deepEqual(await executorOptions(), options);
  await wait("document.querySelector('button[data-instructions-page=next]')?.matches(':enabled')");
  const firstPageIds = await analyticsInstructionIds();
  assert.equal(firstPageIds.length, 25);
  await js("document.querySelector('button[data-instructions-page=next]').click()");
  await wait(`document.querySelectorAll('${instructionRows}').length === 1 && document.querySelector('button[data-instructions-page=previous]')?.matches(':enabled')`);
  const secondPageIds = await analyticsInstructionIds();
  const byId = (left, right) => left - right;
  assert.deepEqual([...firstPageIds, ...secondPageIds].sort(byId), primaryInstructionIds.sort(byId));

  const openedInstruction = allInstructions.find(row => row.id === secondPageIds[0]);
  const instructionLink = `${instructionRows}[data-instruction-id="${openedInstruction.id}"] a`;
  assert.equal(await js(`document.querySelector('${instructionLink}').textContent.trim()`), openedInstruction.title);
  await js(`document.querySelector('${instructionLink}').click()`);
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
  assert.match(await js("document.querySelector('.registry-card-id').textContent"), new RegExp(`ID ${openedInstruction.id}$`));
  assert.equal(await js("document.querySelector('.registry-instruction-dialog input[name=title]').value"), openedInstruction.title);
  await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");

  await navigate('/analytics', 'Аналитика');
  await wait(`Boolean(document.querySelector('${instructionLink}'))`);
  assert.deepEqual(await analyticsInstructionIds(), secondPageIds);
  assert.equal(await js(`document.querySelector('${executorSelect}').value`), primaryExecutorKey);
  await fill(executorSelect, { 0: similarExecutorKey });
  await wait(`document.querySelector('[data-metric=total]')?.textContent === '1' && Boolean(document.querySelector('${instructionRows}[data-instruction-id="${similarInstruction.id}"]'))`);
  assert.deepEqual(await analyticsInstructionIds(), [similarInstruction.id]);
  assert.deepEqual(await executorOptions(), options);
  await fill(executorSelect, { 0: '' });
  await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
  assert.deepEqual(await analyticsInstructionIds(), []);

  await fill(executorSelect, { 0: primaryExecutorKey });
  await wait("document.querySelector('[data-metric=total]')?.textContent === '26'");
  await js("document.querySelector('.analytics-filter-toggle').click()");
  await wait("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded') === 'true'");
  assert.equal(await js("document.querySelector('[name=analytics-type], [name=analytics-priority]') === null"), true);
  await fill('[name=analytics-from]', { 0: '2000-01-01' }); await fill('[name=analytics-to]', { 0: '2000-01-31' });
  await click('Применить', '.analytics-filters button');
  await wait("document.querySelector('.analytics-empty h2')?.textContent === 'По этим фильтрам нет указаний'");
  assert.deepEqual(await analyticsInstructionIds(), []);
  assert.equal(await js(`document.querySelector('${executorSelect}').value`), primaryExecutorKey);
  assert.deepEqual(await executorOptions(), options);
  await click('Сбросить', '.analytics-filters button');
  await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
  assert.equal(await js(`document.querySelector('${executorSelect}').value`), '');
  await resize(720, 540);
  await js("document.querySelector('.analytics-filter-toggle').click()");
  await wait("document.querySelector('.analytics-filter-toggle').getAttribute('aria-expanded') === 'false'");
  assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false);
  assert.equal(await js("document.querySelector('.main-content').scrollWidth > document.querySelector('.main-content').clientWidth"), false);
  await screenshot('analytics-compact.png');
  await resizeDefault();
}
