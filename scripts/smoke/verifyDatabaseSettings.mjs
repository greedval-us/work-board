import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createSmokeForms } from './forms.mjs';

export async function verifyDatabaseSettings(driver, fixture, { generation, created, instructionFiles, taskFiles }) {
  const { js, api, wait, click, navigate, fill, openFilters, screenshot } = driver;
  const { userData, firstFile, today, controlFrequencyCell, customControl, registrySelections, reportSelections, settingsSelections, renamedSelections, dialogs } = fixture;
  const { instructionField, optionRow, addRegistryOption, controlCardDialog, reportField } = createSmokeForms(driver);

  await navigate('/settings', 'Настройки');
  await js("document.querySelector('button[value=dark]').click()");
  await wait("document.documentElement.dataset.appearance === 'dark'");
  await navigate('/analytics', 'Аналитика');
  await wait("document.querySelector('[data-metric=total]')?.textContent === '27'");
  await screenshot('analytics-dark.png');
  await navigate('/calendar', 'Календарь и задачи');
  await wait("Boolean(document.querySelector('.calendar-task-open'))");
  await screenshot('calendar-dark.png');
  assert.equal(await js('getComputedStyle(document.querySelector(".brand-title")).color === getComputedStyle(document.body).color'), true,
    'Brand text must follow the dark palette');
  await navigate('/', 'Реестр указаний');
  await wait("document.querySelectorAll('.registry-table tbody tr').length > 0");
  await screenshot('registry-dark.png');

  await navigate('/settings', 'Настройки');
  for (const [field, savedValue] of Object.entries(settingsSelections)) {
    const renamedValue = renamedSelections[field];
    const savedRow = optionRow(field, savedValue);
    const renamedRow = optionRow(field, renamedValue);
    const editButton = `${savedRow} button[data-option-action=edit]`;
    const editInput = `${savedRow} input[name=value]`;
    const saveButton = `${savedRow} button[type=submit]`;
    const removeButton = `${savedRow} button[data-option-action=remove]`;

    await wait(`document.querySelector(${JSON.stringify(editButton)})?.matches(':enabled')`);
    await js(`document.querySelector(${JSON.stringify(editButton)}).click()`);
    await wait(`document.querySelector(${JSON.stringify(editInput)})?.value === ${JSON.stringify(savedValue)}`);
    await fill(editInput, { 0: renamedValue });
    await js(`document.querySelector(${JSON.stringify(saveButton)}).click()`);
    await wait(`!document.querySelector(${JSON.stringify(savedRow)}) && Boolean(document.querySelector(${JSON.stringify(renamedRow)}))`);
    assert.deepEqual((await api('settings', 'get', generation)).registryOptions[field], [renamedValue]);
    if (Object.hasOwn(registrySelections, field)) {
      assert.equal((await api('instructions', 'get', { id: created.id, generation }))[field], savedValue);
    }

    await addRegistryOption(field, savedValue);
    await wait(`document.querySelector(${JSON.stringify(removeButton)})?.matches(':enabled')`);
    if (field === 'source') {
      await js(`document.querySelector(${JSON.stringify(editButton)}).click()`);
      await wait(`document.activeElement === document.querySelector(${JSON.stringify(editInput)})`);
      await fill(editInput, { 0: renamedValue });
      await js(`document.querySelector(${JSON.stringify(saveButton)}).click()`);
      await wait(`document.querySelector(${JSON.stringify(`${savedRow} [role=alert]`)})?.textContent.includes('уже есть')`);
      assert.equal(await js(`document.querySelector(${JSON.stringify(editInput)}).value`), renamedValue);
      await js(`document.querySelector(${JSON.stringify(`${savedRow} [data-option-action=cancel]`)}).click()`);
      await wait(`document.querySelector(${JSON.stringify(removeButton)})?.matches(':enabled')`);
    }
    await js(`document.querySelector(${JSON.stringify(removeButton)}).click()`);
    await wait(`!document.querySelector(${JSON.stringify(savedRow)})`);
    assert.deepEqual((await api('settings', 'get', generation)).registryOptions[field], [renamedValue]);
    if (Object.hasOwn(registrySelections, field)) {
      assert.equal((await api('instructions', 'get', { id: created.id, generation }))[field], savedValue);
    }
  }
  const updatedOptions = Object.fromEntries(Object.entries(renamedSelections).map(([field, value]) => [field, [value]]));
  const updatedContact = { executor: renamedSelections.executor, department: renamedSelections.department, executorPhone: renamedSelections.executorPhone };
  assert.deepEqual((await api('settings', 'get', generation)).executorContacts, [updatedContact]);

  await click('Создать другую базу', '.storage-button');
  await wait("document.querySelector('.file-path')?.textContent.includes('another.sqlite')");
  const next = await api('database', 'getStatus');
  assert.notEqual(next.generation, generation);
  const nextSettings = await api('settings', 'get', next.generation);
  assert.deepEqual(nextSettings.registryOptions, { source: [], executor: [], department: [], executorPhone: [] });
  assert.deepEqual(nextSettings.executorContacts, []);
  assert.equal((await api('instructions', 'list', { generation: next.generation })).total, 0);
  assert.equal((await api('analytics', 'summary', { generation: next.generation })).totals.total, 0);
  await assert.rejects(api('instructions', 'update', { id: created.id, data: { title: 'Wrong DB' }, generation }));
  await click('Открыть базу', '.storage-button');
  assert.equal((await api('database', 'getStatus')).generation, next.generation);
  dialogs.openDatabase(firstFile);
  await click('Открыть базу', '.storage-button');
  await wait("document.querySelector('.file-path')?.textContent.includes('selected-controls.sqlite')");
  const reopened = await api('database', 'getStatus');
  const reopenedSettings = await api('settings', 'get', reopened.generation);
  assert.deepEqual(reopenedSettings.registryOptions, updatedOptions);
  assert.deepEqual(reopenedSettings.executorContacts, [updatedContact]);
  assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).checkpoints[0].mark,
    'Промежуточный отчёт проверен');
  assert.equal((await api('instructions', 'list', { generation: reopened.generation })).total, 27);
  assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 1);
  assert.equal((await api('attachments', 'list', { entityType: 'instructions', entityId: created.id, generation: reopened.generation })).length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(userData, 'database-location.json'), 'utf8')).filePath, firstFile);

  await navigate('/', 'Реестр указаний');
  await click('Добавить указание', '.registry-toolbar button');
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
  for (const field of Object.keys(registrySelections)) {
    const actual = await js(`[...document.querySelector(${JSON.stringify(instructionField(field))}).options]
      .map(option => option.value).filter(Boolean)`);
    assert.deepEqual(actual, updatedOptions[field], `New instruction dropdown for ${field}`);
  }
  await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  await openFilters();
  await fill('.registry-filter-fields input,.registry-filter-fields select', { 0: '0001/К' });
  await click('Применить', '.registry-filters button');
  await wait("document.querySelector('.registry-count')?.textContent === '1'");
  assert.equal(await js(`document.querySelector('${controlFrequencyCell}')?.textContent.trim()`), customControl);
  await js("document.querySelector('.registry-table tbody tr').click()");
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
  for (const [field, option] of Object.entries(registrySelections)) {
    assert.equal(await js(`document.querySelector(${JSON.stringify(instructionField(field))}).value`), option);
  }
  await click('Ф‑21 в Word', '.registry-instruction-dialog .registry-control-card-open');
  await wait(`Boolean(document.querySelector('${controlCardDialog}'))`);
  for (const field of Object.keys(reportSelections)) {
    const selector = reportField(field);
    assert.deepEqual(await js(`[...document.querySelector(${JSON.stringify(selector)}).options].map(option => option.value)`),
      ['', renamedSelections[field]]);
    assert.equal(await js(`document.querySelector(${JSON.stringify(selector)}).value`), '');
  }
  await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
  await wait(`!document.querySelector('${controlCardDialog}')`);
  await click('Удалить', '.registry-instruction-dialog button');
  await wait("Boolean(document.querySelector('.registry-confirm-dialog[open]'))");
  await click('Удалить', '.registry-confirm-dialog button');
  await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '0'");
  assert.equal(await api('instructions', 'get', { id: created.id, generation: reopened.generation }), null);
  assert.equal(existsSync(path.join(firstFile + '.files', instructionFiles[0].relativePath)), false);
  await navigate('/calendar', 'Календарь и задачи');
  await wait("Boolean(document.querySelector('.calendar-task-open'))");
  await js("document.querySelector('.calendar-task-open').click()");
  await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
  await click('Удалить', '.calendar-task-dialog button');
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Удалить', '.calendar-confirm-dialog button');
  await wait("!document.querySelector('.calendar-task-dialog[open]') && !document.querySelector('.calendar-task-open')");
  assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 0);
  assert.equal(existsSync(path.join(firstFile + '.files', taskFiles[0].relativePath)), false);
  return { reopened };
}
