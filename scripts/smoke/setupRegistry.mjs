import assert from 'node:assert/strict';
import { migrations } from '../../src/main/database/migrations.js';
import { addCalendarDays } from '../../src/shared/registry.js';
import { createSmokeForms } from './forms.mjs';

export async function setupRegistry(driver, fixture) {
  const { window, js, api, wait, click, navigate, fill, verifyEntrance, resize, resizeDefault, screenshot } = driver;
  const { firstFile, today, originalDeadline, nextCheckpointTime, nextCheckpointHeader, controlFrequencyHeader, dailyControl, registrySelections, reportSelections, settingsSelections, controlCardOffice, alternateOffice } = fixture;
  const { fillInstruction, optionForm, optionRow, selectRegistryDirectory, addRegistryOption } = createSmokeForms(driver);

  window.showInactive();
  await wait("document.querySelector('h1')?.textContent === 'Реестр контроля' && !document.querySelector('[aria-busy=true]')");
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  assert.equal((await api('database', 'getStatus')).ready, false);
  assert.equal(await js('typeof window.require'), 'undefined');
  assert.equal(await js('typeof window.desktopAPI.invoke'), 'undefined');
  assert.equal(await js("Object.hasOwn(window.desktopAPI, 'attachments')"), false);
  await screenshot('registry-first-run.png');

  await click('Открыть базу', '.registry-setup button');
  await wait("document.querySelector('.registry-setup button')?.matches(':enabled')");
  assert.equal((await api('database', 'getStatus')).ready, false);
  await click('Создать базу', '.registry-setup button');
  await wait("Boolean(document.querySelector('.registry-results'))");
  // Observe the incoming page before clicking, so a slow polling round trip cannot miss its fade.
  await js(`document.addEventListener('transitionend', function onSettingsFade(event) {
    if (!event.target.matches('.settings-page') || event.propertyName !== 'opacity' || event.elapsedTime <= 0) return;
    performance.mark('smoke-settings-fade-in');
    document.removeEventListener('transitionend', onSettingsFade);
  })`);
  await navigate('/settings', 'Настройки');
  await wait("performance.getEntriesByName('smoke-settings-fade-in', 'mark').length > 0");
  await wait("document.querySelector('.file-path')?.textContent.includes('selected-controls.sqlite')");
  const initial = await api('database', 'getStatus');
  const generation = initial.generation;
  assert.equal(initial.schemaVersion, migrations.at(-1).version);
  assert.equal(initial.filePath, firstFile);
  await navigate('/', 'Реестр контроля');
  await click('Добавить указание', '.registry-toolbar button');
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open] .registry-options-hint a'))");
  assert.equal(await js("document.querySelector('select[name=executor]').validity.valueMissing"), true);
  await js("document.querySelector('.registry-options-hint a').click()");
  await wait("Boolean(document.querySelector('#registry-options-title'))");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  assert.deepEqual(new Set(await js("[...document.querySelector('select[name=registry-directory]').options].map(option => option.value)")),
    new Set(['documentType', 'source', 'department', 'executorPhone', 'executor', 'office']));
  await selectRegistryDirectory('source');
  assert.equal(await js("document.querySelector('[data-registry-option=source] input').labels[0].querySelector('span').textContent.trim()"), 'Откуда поступил документ');
  assert.deepEqual(await js(`(() => {
    const group = document.querySelector('select[name=registry-directory] optgroup[label="Исполнители"]');
    return [...(group?.children ?? [])].map(option => option.value);
  })()`), ['department', 'executorPhone', 'executor']);
  const sourceInput = `${optionForm('source')} input`;
  await fill(sourceInput, { 0: 'Черновик' });
  await selectRegistryDirectory('office');
  await selectRegistryDirectory('source');
  assert.equal(await js(`document.querySelector(${JSON.stringify(sourceInput)}).value`), 'Черновик');
  await fill(sourceInput, { 0: '' });
  assert.equal(await js("Boolean(document.querySelector('form[data-executor-contacts]'))"), false);
  const officeForm = 'form[data-control-card-office]';
  const officeSelect = `${officeForm} select[name=office]`;
  const selectOffice = async (value) => {
    await wait(`document.querySelector('${officeSelect}')?.matches(':enabled')`);
    await fill(officeSelect, { 0: value });
    await click('Сохранить', `${officeForm} button[type=submit]`);
    await wait("document.querySelector('.registry-office-group [role=status]')?.textContent.trim() === 'Значение сохранено.'");
    assert.equal((await api('settings', 'get', generation)).office, value);
  };
  await addRegistryOption('office', controlCardOffice);
  await addRegistryOption('office', alternateOffice);
  assert.equal(await js(`document.querySelector('${officeSelect}').value`), '');
  await selectOffice(alternateOffice);
  await fill(officeSelect, { 0: controlCardOffice });
  const alternateRow = JSON.stringify(optionRow('office', alternateOffice));
  await js(`document.querySelector(${alternateRow}).querySelector('[data-option-action=remove]').click()`);
  await wait(`!document.querySelector(${alternateRow}) && document.querySelector('${officeSelect}')?.matches(':enabled')`);
  assert.equal((await api('settings', 'get', generation)).office, '');
  assert.equal(await js(`document.querySelector('${officeSelect}').value`), controlCardOffice, 'the pending office selection is preserved');
  await addRegistryOption('office', alternateOffice);
  await selectOffice(controlCardOffice);
  for (const [field, option] of Object.entries({ documentType: registrySelections.documentType, source: registrySelections.source, ...reportSelections })) {
    await addRegistryOption(field, option);
  }
  const executorContact = { executor: registrySelections.executor, ...reportSelections };
  await addRegistryOption('executor', executorContact.executor, reportSelections);
  const configuredOptions = Object.fromEntries(Object.entries(settingsSelections).map(([field, value]) => [field, [value]]));
  configuredOptions.office = [controlCardOffice, alternateOffice];
  const configuredSettings = await api('settings', 'get', generation);
  assert.deepEqual(configuredSettings.registryOptions, configuredOptions);
  assert.deepEqual(configuredSettings.executorContacts, [executorContact]);
  assert.equal(configuredSettings.office, controlCardOffice);
  const focusSettings = "document.querySelector('#registry-options-title').scrollIntoView({ block: 'start' })";
  await selectRegistryDirectory('office');
  await js(focusSettings);
  await screenshot('settings-control-card.png');
  await resize(720, 640);
  await js(focusSettings);
  assert.equal(await js('document.querySelector(\'.settings-page\').scrollWidth > document.querySelector(\'.settings-page\').clientWidth'), false);
  await screenshot('settings-control-card-compact.png');
  await resizeDefault();
  await selectRegistryDirectory('executor');
  for (const field of Object.keys(reportSelections)) {
    assert.equal(await js(`document.querySelector(${JSON.stringify(`${optionForm('executor')} select[name=${field}]`)}).value`), '');
  }

  const executorRow = optionRow('executor', executorContact.executor);
  const executorEditButton = `${executorRow} button[data-option-action=edit]`;
  const executorEditInput = `${executorRow} input[name=value]`;
  const executorEditPhone = `${executorRow} select[name=executorPhone]`;
  await js(`document.querySelector(${JSON.stringify(executorEditButton)}).click()`);
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

  await js(`document.querySelector(${JSON.stringify(executorEditButton)}).click()`);
  await wait(`document.querySelector(${JSON.stringify(executorEditPhone)})?.matches(':enabled')`);
  await fill(executorEditPhone, { 0: executorContact.executorPhone });
  await js(`document.querySelector(${JSON.stringify(executorEditSubmit)}).click()`);
  await wait(`!document.querySelector(${JSON.stringify(executorEditInput)})`);
  assert.deepEqual((await api('settings', 'get', generation)).executorContacts, [executorContact]);

  await navigate('/', 'Реестр контроля');
  await click('Добавить указание', '.registry-toolbar button');
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]'))");
  await verifyEntrance('.registry-instruction-dialog', 'instruction card');
  assert.equal(await js("document.querySelector('.registry-form-grid').disabled"), false);
  assert.equal(await js("Boolean(document.querySelector('.registry-instruction-dialog select[name=controlType]'))"), false);
  assert.equal(await js("Boolean(document.querySelector('.registry-instruction-dialog [name=status]'))"), false);
  assert.equal(await js("document.querySelector('.registry-instruction-dialog .attachment-panel, .registry-instruction-dialog input[type=file]') === null"), true);
  for (const [field, option] of Object.entries(registrySelections)) {
    const selector = `.registry-form-grid select[name="${field}"]`;
    await wait(`[...document.querySelector(${JSON.stringify(selector)})?.options ?? []].some(option => option.value === ${JSON.stringify(option)})`);
  }
  await fillInstruction({
    controlDate: addCalendarDays(originalDeadline, -1), incomingNumber: '0017', instructionNumber: '0001/К', deadline: originalDeadline, title: 'Проверить отчёт',
    extendedUntil: addCalendarDays(originalDeadline, -1),
    summary: 'Сверить сведения\nПодготовить итоговую справку.', executionMark: 'Ожидается ответ',
    ...registrySelections,
  });
  assert.equal(await js("document.querySelector('[name=extendedUntil]').validity.rangeUnderflow"), true);
  assert.equal(await js("document.querySelector('[name=summary]').labels[0].textContent.trim()"), 'Резолюция');
  assert.equal(await js("document.querySelector('.registry-form-grid select[name=source]').labels[0].querySelector('span').textContent.trim()"), 'Откуда поступил документ');
  await fillInstruction({ extendedUntil: today });
  await fill('[name=control-frequency]', { 0: 'daily' });
  for (const date of [originalDeadline, today]) {
    await fill(`[name=control-period-date][data-control-period="${date}"]`, { 0: date });
  }
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '1'");
  const created = (await api('instructions', 'list', { generation })).items[0];
  assert.equal(created.status, 'pending');
  assert.equal(created.incomingNumber, '0017');
  assert.equal(created.deadline, originalDeadline);
  assert.equal(created.extendedUntil, today);
  assert.equal(created.controlFrequency, 'daily');
  const savedSchedule = (await api('instructions', 'get', { id: created.id, generation })).controlSchedule;
  assert.deepEqual(savedSchedule, { frequency: 'daily', firstDate: '', customDates: [], marks: [],
    periodDates: { [originalDeadline]: originalDeadline, [today]: today } });
  for (const [field, option] of Object.entries(registrySelections)) assert.equal(created[field], option);
  const columns = await js(`Object.fromEntries([...document.querySelectorAll('.registry-table th')].map(header => [
    header.dataset.column, { index: header.cellIndex, label: header.textContent.trim(), title: header.title },
  ]))`);
  assert.equal(columns.id.label, 'ID');
  assert.equal(columns.instructionNumber.label, 'Подписной номер');
  assert.equal(columns.documentType.title, 'Вид документа');
  assert.equal(columns.source.label, 'Откуда');
  assert.equal(columns.summary.label, 'Резолюция');
  assert.equal(columns.extendedUntil.label, 'Продлён до');
  assert.equal(columns.controlFrequency.title, controlFrequencyHeader);
  assert.equal(columns.nextCheckpoint.title, nextCheckpointHeader);
  const cells = await js("[...document.querySelectorAll('.registry-table tbody tr td')].map(cell => cell.textContent.trim())");
  assert.equal(cells[columns.id.index], String(created.id));
  assert.equal(cells[columns.documentType.index], registrySelections.documentType);
  assert.equal(cells[columns.source.index], registrySelections.source);
  assert.equal(cells[columns.executor.index], registrySelections.executor);
  assert.equal(cells[columns.controlFrequency.index], dailyControl);
  assert.equal(cells[columns.executionMark.index], 'Ожидается ответ');
  const extended = `.registry-row td:nth-child(${columns.extendedUntil.index + 1})`;
  assert.equal(await js(`document.querySelector('${extended} time').dateTime`), today);
  assert.equal(await js(`document.querySelector('${extended} .registry-urgency').textContent`), 'Срок сегодня');
  assert.equal(await js(`document.querySelector('${nextCheckpointTime}.registry-checkpoint-overdue')?.dateTime`), originalDeadline);
  const overdueTextColor = await js(`getComputedStyle(document.querySelector('${nextCheckpointTime}')).color`);
  const expectedErrorColor = await js(`(() => {
    const sample = document.createElement('span');
    sample.style.color = 'var(--error)';
    document.body.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  })()`);
  assert.equal(overdueTextColor, expectedErrorColor);
  return { generation, created, overdueTextColor, executorContact };
}
