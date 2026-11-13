import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { addCalendarDays } from '../../src/shared/registry.js';
import { createSmokeForms } from './forms.mjs';

export async function setupRegistry(driver, fixture) {
  const { window, js, api, wait, click, navigate, fill, verifyEntrance, screenshot } = driver;
  const { firstFile, today, originalDeadline, nextCheckpointTime, nextCheckpointHeader, controlFrequencyHeader, dailyControl, registrySelections, reportSelections, settingsSelections } = fixture;
  const { fillInstruction, optionForm, optionRow, addRegistryOption } = createSmokeForms(driver);

  window.showInactive();
  await wait("document.querySelector('h1')?.textContent === 'Реестр указаний' && !document.querySelector('[aria-busy=true]')");
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  assert.equal((await api('database', 'getStatus')).ready, false);
  assert.equal(await js('typeof window.require'), 'undefined');
  assert.equal(await js('typeof window.desktopAPI.invoke'), 'undefined');
  await screenshot('registry-first-run.png');

  await navigate('/settings', 'Настройки');
  await click('Создать базу', '.storage-button');
  await wait("document.querySelector('.file-path')?.textContent.includes('selected-controls.sqlite')");
  const initial = await api('database', 'getStatus');
  const generation = initial.generation;
  assert.equal(initial.schemaVersion, 6);
  assert.equal(initial.filePath, firstFile);
  await navigate('/', 'Реестр указаний');
  await click('Добавить указание', '.registry-toolbar button');
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open] .registry-options-hint a'))");
  assert.equal(await js("document.querySelector('select[name=executor]').validity.valueMissing"), true);
  await js("document.querySelector('.registry-options-hint a').click()");
  await wait("Boolean(document.querySelector('#registry-options-title'))");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  assert.deepEqual(await js("[...document.querySelectorAll('[data-registry-option]')].map(form => form.dataset.registryOption)"),
    ['source', 'executor', 'department', 'executorPhone']);
  for (const [field, option] of Object.entries({ source: registrySelections.source, ...reportSelections })) {
    await addRegistryOption(field, option);
  }
  const executorContact = { executor: registrySelections.executor, ...reportSelections };
  await addRegistryOption('executor', executorContact.executor, reportSelections);
  const configuredOptions = Object.fromEntries(Object.entries(settingsSelections).map(([field, value]) => [field, [value]]));
  const configuredSettings = await api('settings', 'get', generation);
  assert.deepEqual(configuredSettings.registryOptions, configuredOptions);
  assert.deepEqual(configuredSettings.executorContacts, [executorContact]);
  for (const field of Object.keys(reportSelections)) {
    assert.equal(await js(`document.querySelector(${JSON.stringify(`${optionForm('executor')} select[name=${field}]`)}).value`), '');
  }

  const executorRow = optionRow('executor', executorContact.executor);
  const executorEditInput = `${executorRow} input[name=value]`;
  const executorEditPhone = `${executorRow} select[name=executorPhone]`;
  await js(`document.querySelector(${JSON.stringify(`${executorRow} button[data-option-action=edit]`)}).click()`);
  await wait(`document.querySelector(${JSON.stringify(executorEditInput)})?.value === ${JSON.stringify(executorContact.executor)}`);
  for (const [field, value] of Object.entries(reportSelections)) {
    assert.equal(await js(`document.querySelector(${JSON.stringify(`${executorRow} select[name=${field}]`)}).value`), value);
  }
  await screenshot('settings-executor-inline.png');
  await fill(executorEditPhone, { 0: '' });
  const executorEditSubmit = `${executorRow} button[type=submit]`;
  await wait(`document.querySelector(${JSON.stringify(executorEditSubmit)})?.matches(':enabled')`);
  await js(`document.querySelector(${JSON.stringify(executorEditSubmit)}).click()`);
  await wait(`!document.querySelector(${JSON.stringify(executorEditInput)})`);
  const editedSettings = await api('settings', 'get', generation);
  assert.deepEqual(editedSettings.registryOptions, configuredOptions);
  assert.deepEqual(editedSettings.executorContacts, [{ ...executorContact, executorPhone: '' }]);

  const contactsForm = 'form[data-executor-contacts]';
  await wait(`document.querySelector('${contactsForm} [name=executor]')?.matches(':enabled')`);
  for (const [field, option] of Object.entries(executorContact)) {
    await fill(`${contactsForm} [name=${field}]`, { 0: option });
  }
  await click('Сохранить', `${contactsForm} button[type=submit]`);
  await wait(`document.querySelector('${contactsForm} [role=status]')?.textContent.trim() === 'Контакты сохранены.'`);
  assert.deepEqual((await api('settings', 'get', generation)).executorContacts, [executorContact]);

  await navigate('/', 'Реестр указаний');
  await click('Добавить указание', '.registry-toolbar button');
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
  await verifyEntrance('.registry-instruction-dialog', 'instruction card');
  assert.equal(await js("document.querySelector('.registry-form-grid').disabled"), false);
  assert.equal(await js("Boolean(document.querySelector('.registry-instruction-dialog select[name=controlType]'))"), false);
  for (const [field, option] of Object.entries(registrySelections)) {
    const selector = `.registry-form-grid select[name="${field}"]`;
    await wait(`[...document.querySelector(${JSON.stringify(selector)})?.options ?? []].some(option => option.value === ${JSON.stringify(option)})`);
  }
  await fillInstruction({
    controlDate: addCalendarDays(originalDeadline, -1), incomingNumber: '0017', instructionNumber: '0001/К', deadline: originalDeadline, title: 'Проверить отчёт',
    extendedUntil: addCalendarDays(originalDeadline, -1),
    summary: 'Сверить сведения\nПодготовить итоговую справку.', status: 'pending', executionMark: 'Ожидается ответ',
    ...registrySelections,
  });
  assert.equal(await js("document.querySelector('[name=extendedUntil]').validity.rangeUnderflow"), true);
  assert.equal(await js("document.querySelector('[name=summary]').labels[0].textContent.trim()"), 'Резолюция');
  await fillInstruction({ extendedUntil: today });
  await fill('[name=control-frequency]', { 0: 'daily' });
  await fill('[name=control-first-date]', { 0: originalDeadline });
  await js("document.querySelector('.registry-instruction-dialog .attachment-add').click()");
  await wait("document.querySelectorAll('.attachment-list li').length === 1 && !document.querySelector('.attachment-add').disabled");
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '1'");
  const created = (await api('instructions', 'list', { generation })).items[0];
  assert.equal(created.incomingNumber, '0017');
  assert.equal(created.deadline, originalDeadline);
  assert.equal(created.extendedUntil, today);
  assert.equal(created.controlFrequency, 'daily');
  const savedSchedule = (await api('instructions', 'get', { id: created.id, generation })).controlSchedule;
  assert.deepEqual(savedSchedule, { frequency: 'daily', firstDate: originalDeadline, customDates: [], marks: [] });
  for (const [field, option] of Object.entries(registrySelections)) assert.equal(created[field], option);
  const headings = await js("[...document.querySelectorAll('.registry-table th')].map(cell => cell.textContent.trim())");
  assert.equal(headings[0], 'ID');
  assert.equal(headings[3], 'Подписной номер');
  assert.equal(headings[4], 'Откуда');
  assert.equal(headings[6], 'Резолюция');
  assert.equal(headings[8], 'Продлён до');
  assert.deepEqual(await js(`(() => {
    const header = document.querySelector('.registry-table th[data-column=controlFrequency]');
    return { position: header.cellIndex, title: header.title };
  })()`), { position: 11, title: controlFrequencyHeader });
  assert.deepEqual(await js(`(() => {
    const header = document.querySelector('.registry-table th[data-column=nextCheckpoint]');
    return { position: header.cellIndex, title: header.title };
  })()`), { position: 9, title: nextCheckpointHeader });
  const cells = await js("[...document.querySelectorAll('.registry-table tbody tr td')].map(cell => cell.textContent.trim())");
  assert.equal(cells[0], String(created.id));
  assert.equal(cells[4], registrySelections.source);
  assert.equal(cells[10], registrySelections.executor);
  assert.equal(cells[11], dailyControl);
  assert.equal(await js("document.querySelector('.registry-row td:nth-child(9) time').dateTime"), today);
  assert.equal(await js("document.querySelector('.registry-row td:nth-child(9) .registry-urgency').textContent"), 'Срок сегодня');
  assert.equal(await js(`document.querySelector('${nextCheckpointTime}.registry-checkpoint-overdue')?.dateTime`), originalDeadline);
  const overdueTextColor = await js(`getComputedStyle(document.querySelector('${nextCheckpointTime}')).color`);
  assert.equal(overdueTextColor, 'rgb(179, 38, 48)');
  const instructionFiles = await api('attachments', 'list', { entityType: 'instructions', entityId: created.id, generation });
  assert.equal(instructionFiles.length, 1);
  assert.equal(readFileSync(path.join(firstFile + '.files', instructionFiles[0].relativePath), 'utf8'), 'Документ для задачи и указания.');
  return { generation, created, overdueTextColor, instructionFiles, executorContact };
}
