import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { addCalendarDays, formatDate } from '../../src/shared/dates.js';
import { chooseExcelReport } from './forms.mjs';

const sections = [
  { entity: 'instructions', sheet: 'Указания', path: '/', title: 'Реестр контроля', prefix: 'Р' },
  { entity: 'plans', sheet: 'Планы', path: '/planning-control', title: 'Контроль планирования', prefix: 'П' },
];

async function seedSection(api, section, today, generation, created) {
  const day = delta => addCalendarDays(today, delta);
  const checkpoints = (...offsets) => ({ frequency: 'custom', customDates: offsets.map(day) });
  const examples = [
    { title: 'Срок продлён', deadline: day(-140), extendedUntil: day(-90) },
    { title: 'Промежуточные проверки', deadline: day(-2), extendedUntil: day(8),
      controlSchedule: {
        ...checkpoints(-400, -14, -9, -7, 0), marks: [{ date: day(-9), text: 'Выполнено' }],
        moves: [{ from: day(-14), to: day(-12) }, { from: day(-7), to: day(1) }],
      } },
    { title: 'Оба вида контроля', deadline: day(-1), controlSchedule: checkpoints(-5) },
    { title: 'Сегодня', deadline: today, controlSchedule: checkpoints(0) },
    { title: 'В будущем', deadline: day(8), controlSchedule: checkpoints(3) },
    { title: 'Исполнено', status: 'completed', deadline: day(-3), controlSchedule: checkpoints(-8) },
    { title: 'Закрыто', deadline: day(-3), controlSchedule: checkpoints(-8) },
  ];
  const rows = examples.map((example, i) => ({
    ...example, instructionNumber: `${section.prefix}-${i + 1}`, executor: `Исполнитель ${section.prefix}`,
    controlDate: day(-450),
    ...(section.entity === 'plans' ? { planItem: `п. 2.${i + 1}`, activity: `Мероприятие по пункту 2.${i + 1}` } : {}),
  }));
  const remember = row => { created.push({ entity: section.entity, id: row.id }); return row; };
  const saved = [];
  if (section.entity === 'plans') {
    saved.push(...(await api('plans', 'create', { generation, rows })).map(remember));
  } else {
    for (const data of rows) saved.push(remember(await api('instructions', 'create', { generation, data })));
  }
  await api(section.entity, 'closeControl', { generation, id: saved.at(-1).id });
  const expected = (index, kind, offset) => {
    const row = rows[index];
    return [row.instructionNumber, row.title, ...(row.planItem ? [row.planItem, row.activity] : []), row.executor, kind, formatDate(day(offset))];
  };
  return [
    expected(0, 'Итоговый срок', -90),
    expected(1, 'Промежуточная проверка', -400), expected(1, 'Промежуточная проверка', -12),
    expected(2, 'Промежуточная проверка', -5), expected(2, 'Итоговый срок', -1),
  ];
}

async function verifyWorkbook(driver, { today, overdueExportFile, openRequests }, section, expected) {
  const { navigate, openFilters, js, click, fill, wait } = driver;
  await navigate(section.path, section.title);
  await openFilters();
  const fields = ['instructionNumber', 'deadlineFrom', 'deadlineTo'];
  const previous = await js(`${JSON.stringify(fields)}.map(key => document.querySelector('[data-filter=' + key + ']').value)`);
  const apply = async values => {
    for (const [index, field] of fields.entries()) await fill(`[data-filter=${field}]`, { 0: values[index] });
    await click('Применить', '.registry-filters button');
  };
  try {
    // The current page is deliberately empty, and its date range excludes every overdue fixture.
    const tomorrow = addCalendarDays(today, 1);
    await apply(['НЕСУЩЕСТВУЮЩИЙ НОМЕР', tomorrow, tomorrow]);
    await wait("document.querySelector('.registry-count')?.textContent === '0' && !document.querySelector('.registry-row')");
    const before = openRequests.length;
    await chooseExcelReport(driver, 'Просроченные контроли');
    await wait(`document.querySelector('.registry-notice')?.textContent === 'Выгружено записей: ${expected.length}.'`);
    assert.deepEqual(openRequests.slice(before), [realpathSync(overdueExportFile)]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(overdueExportFile);
    const sheet = workbook.getWorksheet(section.sheet);
    assert.ok(sheet, section.sheet);
    assert.deepEqual(sheet.getRow(1).values.slice(1), [
      'Подписной №', 'Название', ...(section.entity === 'plans' ? ['Пункт плана', 'Мероприятие'] : []), 'Исполнитель', 'Вид контроля', 'Срок',
    ]);
    const actual = sheet.getSheetValues().slice(2).map(values => values.slice(1));
    const byContent = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'ru');
    assert.deepEqual(actual.sort(byContent), expected.sort(byContent));
  } finally {
    await openFilters();
    await apply(previous);
  }
}

export async function verifyOverdueReports(driver, fixture, generation) {
  // Both sources coexist in the same otherwise empty database.
  const created = [];
  const expected = [];
  try {
    for (const section of sections) expected.push(await seedSection(driver.api, section, fixture.today, generation, created));
    for (const [index, section] of sections.entries()) await verifyWorkbook(driver, fixture, section, expected[index]);
  } finally {
    for (const { entity, id } of created) await driver.api(entity, 'remove', { generation, id });
    await driver.navigate('/settings', 'Настройки');
  }
}
