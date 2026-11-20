import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { nativeTheme } from 'electron';
import { APP_FONT_SIZE_LIMITS, DEFAULT_SETTINGS } from '../../src/shared/constants/settings.js';
import { createSmokeForms } from './forms.mjs';

export async function verifyDatabaseSettings(driver, fixture, { generation, created }) {
  const { js, api, wait, click, navigate, fill, openFilters, geometry, resize, resizeDefault, screenshot } = driver;
  const { userData, firstFile, today, controlFrequencyCell, customControl, registrySelections, reportSelections, settingsSelections, renamedSelections, controlCardOffice, alternateOffice, dialogs } = fixture;
  const { instructionField, optionRow, selectRegistryDirectory, addRegistryOption, controlCardDialog, reportField } = createSmokeForms(driver);
  const defaultTypography = DEFAULT_SETTINGS.typography;
  const largeTypography = { fontFamily: 'system', fontSize: APP_FONT_SIZE_LIMITS.max };
  const applyTypography = async ({ fontFamily, fontSize }) => {
    for (const [selector, value] of [
      ['select[name=appearance-font-family]', fontFamily],
      ['select[name=appearance-font-size]', String(fontSize)],
    ]) {
      await wait(`document.querySelector('${selector}')?.matches(':enabled')`);
      await fill(selector, { 0: value });
      await wait(`document.querySelector('${selector}')?.matches(':enabled') &&
        document.querySelector('${selector}').value === ${JSON.stringify(value)}`);
    }
  };
  const waitForTypography = ({ fontFamily, fontSize }) => wait(
    `document.documentElement.dataset.fontFamily === '${fontFamily}' && getComputedStyle(document.body).fontSize === '${fontSize}px'`,
  );
  const captionSize = () => js("parseFloat(getComputedStyle(document.querySelector('.theme-option-caption')).fontSize)");

  await navigate('/settings', 'Настройки');
  await waitForTypography(defaultTypography);
  assert.equal(await js(`(async () => {
    const faces = await document.fonts.load('14px Inter', 'Указание Work Board');
    return faces.length > 0 && faces.every(face => face.status === 'loaded');
  })()`), true);
  const defaultCaptionSize = await captionSize();
  await applyTypography(largeTypography);
  await waitForTypography(largeTypography);
  assert.match(await js('getComputedStyle(document.body).fontFamily'), /^system-ui/);
  assert.equal(await captionSize(), defaultCaptionSize + largeTypography.fontSize - defaultTypography.fontSize);
  assert.deepEqual((await api('settings', 'get', generation)).typography, largeTypography);
  await resize(720, 540);
  await js("document.querySelector('#appearance-title').scrollIntoView({ block: 'start' })");
  assert.equal(await js(`['.main-content', '.settings-page'].some(selector => {
    const element = document.querySelector(selector);
    return element.scrollWidth > element.clientWidth;
  })`), false);
  await screenshot('settings-typography-compact.png');
  await resizeDefault();

  const originalThemeSource = nativeTheme.themeSource;
  const systemPrefersDark = "matchMedia('(prefers-color-scheme: dark)').matches";
  const appearance = 'document.documentElement.dataset.appearance';
  const setSystemAppearance = async theme => {
    nativeTheme.themeSource = theme;
    await wait(`${systemPrefersDark} === ${theme === 'dark'}`);
  };
  try {
    await setSystemAppearance('dark');
    await click('Системная', '.theme-option');
    await wait(`document.querySelector('.theme-option[value=system]')?.matches(':enabled[aria-pressed=true]') && ${appearance} === 'dark'`);

    await setSystemAppearance('light');
    await wait(`${appearance} === 'light'`);
    await setSystemAppearance('dark');
    await wait(`${appearance} === 'dark'`);
    assert.equal((await api('settings', 'get', generation)).theme, 'system');

    await click('Тёмная', '.theme-option');
    await wait("document.querySelector('.theme-option[value=dark]')?.matches(':enabled[aria-pressed=true]')");
    await setSystemAppearance('light');
    await driver.animationFrames();
    assert.equal(await js(appearance), 'dark', 'The fixed dark theme must ignore system appearance changes');
    assert.equal((await api('settings', 'get', generation)).theme, 'dark');
  } finally {
    nativeTheme.themeSource = originalThemeSource;
  }

  await navigate('/analytics', 'Аналитика');
  await wait("Boolean(document.querySelector('.analytics-results .analytics-timeline'))");
  await screenshot('analytics-dark.png');
  await navigate('/calendar', 'Календарь и задачи');
  await wait("Boolean(document.querySelector('.calendar-task-open'))");
  await screenshot('calendar-dark.png');
  assert.equal(await js('getComputedStyle(document.querySelector(".brand-title")).color === getComputedStyle(document.body).color'), true,
    'Brand text must follow the dark palette');
  await resize(720, 540);
  await geometry('calendar', 'calendar maximum typography');
  const badges = await js(`(() => {
    const cell = document.querySelector('.calendar-date[aria-current=date]');
    const bounds = cell.getBoundingClientRect();
    return [...cell.querySelectorAll('.calendar-date-count')].map(badge => {
      const rect = badge.getBoundingClientRect();
      return { bottom: rect.bottom - bounds.bottom, right: rect.right - bounds.right };
    });
  })()`);
  assert.equal(badges.length, 4);
  assert.ok(badges.every(badge => badge.bottom <= 0 && badge.right <= 0),
    `Calendar badges at the maximum font size exceed available space: ${JSON.stringify(badges)}`);
  await navigate('/', 'Реестр указаний');
  await wait("document.querySelector('.registry-table tbody tr') && !document.querySelector('.workspace-enter-active')");
  await geometry('registry', 'registry maximum typography');
  await js("document.querySelector('.registry-record-link').click()");
  await wait("Boolean(document.querySelector('.registry-instruction-dialog[open]:not([data-motion-state])'))");
  assert.ok(await js(`(() => {
    const dialog = document.querySelector('.registry-instruction-dialog');
    const body = dialog.querySelector('.registry-dialog-body');
    body.scrollTop = body.scrollHeight;
    const actions = dialog.querySelector('.registry-dialog-actions').getBoundingClientRect();
    const bounds = dialog.getBoundingClientRect();
    return bounds.bottom <= innerHeight && bounds.top >= 0 && body.scrollTop > 0 &&
      actions.top >= body.getBoundingClientRect().bottom - 1 && actions.bottom <= bounds.bottom + 1;
  })()`), 'Card actions must stay visible while the form scrolls at the minimum window size');
  await js("document.querySelector('.registry-instruction-dialog .registry-close-button').click()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  await resizeDefault();
  await screenshot('registry-dark.png');

  await openFilters();
  await fill('[data-filter=executor]', { 0: '' });
  await click('Применить', '.registry-filters button');
  await wait("document.querySelector('.registry-count')?.textContent === '1' && !document.querySelector('.registry-table-scroll[aria-busy=true]')");

  const archived = await api('instructions', 'create', { generation, data: {
    ...registrySelections, instructionNumber: 'ПЕРЕИМЕНОВАНИЕ-1', title: 'Закрытое указание для проверки справочников',
    controlDate: today, deadline: today,
  } });
  await api('instructions', 'closeControl', { generation, id: archived.id });
  const { closedAt } = await api('instructions', 'get', { id: archived.id, generation });
  assert.ok(closedAt);

  const renamedInstructionFields = Object.keys(registrySelections).map(field => [field, renamedSelections[field]]);
  const waitForRenamedRow = id => wait(`(() => {
    const row = document.querySelector('.registry-row:has(td[data-column=id] [title="${id}"])');
    return ${JSON.stringify(renamedInstructionFields)}.every(([field, value]) =>
      row?.querySelector('td[data-column=' + field + ']')?.textContent.trim() === value);
  })()`);

  await navigate('/settings', 'Настройки');
  for (const [field, savedValue] of Object.entries(settingsSelections)) {
    await selectRegistryDirectory(field);
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
      for (const id of [created.id, archived.id]) {
        assert.equal((await api('instructions', 'get', { id, generation }))[field], renamedValue);
      }
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
      assert.equal((await api('instructions', 'get', { id: created.id, generation }))[field], renamedValue);
    }
  }
  const updatedOptions = Object.fromEntries(Object.entries(renamedSelections).map(([field, value]) => [field, [value]]));
  updatedOptions.office = [controlCardOffice, alternateOffice];
  const updatedContact = { executor: renamedSelections.executor, department: renamedSelections.department, executorPhone: renamedSelections.executorPhone };
  assert.deepEqual((await api('settings', 'get', generation)).executorContacts, [updatedContact]);

  await navigate('/', 'Реестр указаний');
  await waitForRenamedRow(created.id);
  await navigate('/closed-control', 'Закрытый контроль');
  await waitForRenamedRow(archived.id);
  await navigate('/settings', 'Настройки');
  await click('Создать другую базу', '.storage-button');
  await wait("document.querySelector('.file-path')?.textContent.includes('another.sqlite')");
  const next = await api('database', 'getStatus');
  assert.notEqual(next.generation, generation);
  const nextSettings = await api('settings', 'get', next.generation);
  assert.deepEqual(nextSettings.typography, defaultTypography);
  await waitForTypography(defaultTypography);
  assert.deepEqual(nextSettings.registryOptions, { documentType: [], source: [], executor: [], department: [], executorPhone: [], office: [] });
  assert.deepEqual(nextSettings.executorContacts, []);
  assert.equal(nextSettings.office, '');
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
  assert.deepEqual(reopenedSettings.typography, largeTypography);
  await waitForTypography(largeTypography);
  await applyTypography(defaultTypography);
  await waitForTypography(defaultTypography);
  assert.deepEqual(reopenedSettings.registryOptions, updatedOptions);
  assert.deepEqual(reopenedSettings.executorContacts, [updatedContact]);
  assert.equal(reopenedSettings.office, controlCardOffice);
  const reopenedArchived = await api('instructions', 'get', { id: archived.id, generation: reopened.generation });
  assert.equal(reopenedArchived.closedAt, closedAt);
  for (const [field, option] of renamedInstructionFields) assert.equal(reopenedArchived[field], option);
  await api('instructions', 'remove', { id: archived.id, generation: reopened.generation });
  assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).checkpoints[0].mark,
    'Промежуточный отчёт проверен');
  assert.equal((await api('instructions', 'list', { generation: reopened.generation })).total, 27);
  assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 1);
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
  for (const [field, option] of renamedInstructionFields) {
    assert.equal(await js(`document.querySelector(${JSON.stringify(instructionField(field))}).value`), option);
  }
  await click('Ф‑21 в Word', '.registry-instruction-dialog .registry-control-card-open');
  await wait(`Boolean(document.querySelector('${controlCardDialog}'))`);
  for (const field of Object.keys(reportSelections)) {
    const selector = reportField(field);
    assert.deepEqual(await js(`[...document.querySelector(${JSON.stringify(selector)}).options].map(option => option.value)`),
      ['', renamedSelections[field]]);
    assert.equal(await js(`document.querySelector(${JSON.stringify(selector)}).value`), renamedSelections[field]);
  }
  await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
  await wait(`!document.querySelector('${controlCardDialog}')`);
  await click('Удалить', '.registry-instruction-dialog button');
  await wait("Boolean(document.querySelector('.registry-confirm-dialog[open]'))");
  await click('Удалить', '.registry-confirm-dialog button');
  await wait("!document.querySelector('.registry-instruction-dialog[open]') && document.querySelector('.registry-count')?.textContent === '0'");
  assert.equal(await api('instructions', 'get', { id: created.id, generation: reopened.generation }), null);
  await navigate('/calendar', 'Календарь и задачи');
  await wait("Boolean(document.querySelector('.calendar-task-open'))");
  await js("document.querySelector('.calendar-task-open').click()");
  await wait("Boolean(document.querySelector('.calendar-task-dialog[open]'))");
  await click('Удалить', '.calendar-task-dialog button');
  await wait("Boolean(document.querySelector('.calendar-confirm-dialog[open]'))");
  await click('Удалить', '.calendar-confirm-dialog button');
  await wait("!document.querySelector('.calendar-task-dialog[open]') && !document.querySelector('.calendar-task-open')");
  assert.equal((await api('calendar', 'day', { date: today, generation: reopened.generation })).tasks.length, 0);
  return { reopened };
}
