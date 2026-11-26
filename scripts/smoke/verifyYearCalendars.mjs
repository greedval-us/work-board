import assert from 'node:assert/strict';
import { APP_APPEARANCE_STYLES } from '../../src/shared/constants/settings.js';
import { addCalendarDays, formatDate } from '../../src/shared/dates.js';

const calendar = '.control-year-calendar';
const tooltip = '.control-year-tooltip';
const dayButton = date => `${calendar} button[data-control-date="${date}"]`;
const sections = [
  { entity: 'instructions', path: '/', heading: 'Реестр контроля', prefix: 'УК', offset: 0, theme: 'light', closed: 'Закрытый контроль' },
  { entity: 'plans', path: '/planning-control', heading: 'Контроль планирования', prefix: 'ПЛ', offset: 1, theme: 'dark', closed: 'Закрытые планы' },
];

function fixturesFor(section, today) {
  const day = offset => addCalendarDays(today, offset);
  const dates = {
    today, shared: day(-1), movedFrom: day(-12), exclusive: day(-9 - section.offset),
    next: day(370 + section.offset), completed: day(-3), completedCheckpoint: day(-4),
    closed: day(-6), closedCheckpoint: day(-7), closedUnmarked: day(-8),
  };
  const schedule = (...customDates) => ({ frequency: 'custom', customDates });
  const records = [
    { title: 'Сводный отчёт', executor: 'Крылова', deadline: day(-2), extendedUntil: dates.shared, controlSchedule: schedule(dates.exclusive) },
    { title: 'Проверка графика', executor: 'Морозов', deadline: dates.next,
      controlSchedule: { ...schedule(dates.movedFrom), moves: [{ from: dates.movedFrom, to: dates.shared }] } },
    { title: 'Подготовка протокола', executor: 'Давыдова', deadline: today,
      controlSchedule: { ...schedule(dates.shared), marks: [{ date: dates.shared, text: 'Проверено' }] } },
    { title: 'Исполненный документ', executor: 'Кузнецов', status: 'completed', deadline: dates.completed,
      controlSchedule: schedule(dates.completedCheckpoint) },
    { title: 'Закрытый документ', executor: 'Зотов', deadline: dates.closed,
      controlSchedule: { ...schedule(dates.closedCheckpoint, dates.closedUnmarked), marks: [{ date: dates.closedCheckpoint, text: 'Проверено' }] } },
  ];
  const rows = records.map((record, index) => ({
    ...record, title: `${record.title} ${section.prefix}`, executor: `${record.executor} — ${section.prefix}`,
    controlDate: day(-30), instructionNumber: `${section.prefix}-${101 + index}`,
    ...(section.entity === 'plans' ? { planItem: `Пункт ${index + 1}.4` } : {}),
  }));
  return { dates, rows };
}

async function showYearOf(driver, date) {
  const heading = `document.querySelector('${calendar} h2')?.textContent`;
  const target = Number(date.slice(0, 4));
  let year = Number.parseInt(await driver.js(heading), 10);
  assert.ok(Number.isInteger(year), 'The calendar heading must contain a year');
  while (year !== target) {
    const label = year < target ? 'Следующий год' : 'Предыдущий год';
    year += year < target ? 1 : -1;
    await driver.js(`document.querySelector('${calendar} [aria-label="${label}"]').click()`);
    await driver.wait(`${heading} === '${year} год'`);
  }
  await driver.wait(`document.querySelectorAll('${calendar} .control-year-month').length === 12 &&
    document.querySelector('${calendar}').getAttribute('aria-busy') === 'false'`);
}

async function hoverEventDay(driver, date) {
  await showYearOf(driver, date);
  const button = JSON.stringify(dayButton(date));
  await driver.wait(`Boolean(document.querySelector(${button}))`);
  if (await driver.js(`Boolean(document.querySelector('${tooltip}'))`)) {
    await driver.js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await driver.wait(`!document.querySelector('${tooltip}')`);
  }
  const mouse = (x, y) => driver.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await mouse(0, 0);
  await driver.js(`document.querySelector(${button}).scrollIntoView({ block: 'center', inline: 'nearest' })`);
  await driver.animationFrames();
  const { x, y } = await driver.js(`(() => {
    const rect = document.querySelector(${button}).getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  await mouse(x, y);
  await driver.wait(`(() => {
    const tip = document.querySelector('${tooltip}');
    return tip?.getAttribute('role') === 'dialog' && getComputedStyle(tip).visibility === 'visible' &&
      document.querySelector(${button})?.getAttribute('aria-controls') === tip.id && tip.querySelector('time')?.dateTime === ${JSON.stringify(date)};
  })()`);
}

async function checkLayout(driver) {
  const sizes = await driver.js(`(() => {
    const panel = document.querySelector('${calendar}');
    const main = document.querySelector('.main-content');
    const tip = document.querySelector('${tooltip}').getBoundingClientRect();
    return { document: document.documentElement.scrollWidth - innerWidth, main: main.scrollWidth - main.clientWidth,
      calendar: panel.scrollWidth - panel.clientWidth, left: tip.left, top: tip.top,
      right: tip.right - innerWidth, bottom: tip.bottom - innerHeight };
  })()`);
  assert.ok(sizes.document <= 1 && sizes.main <= 1 && sizes.calendar <= 1
    && sizes.left >= -1 && sizes.top >= -1 && sizes.right <= 1 && sizes.bottom <= 1,
    `The year calendar and its tooltip must fit the viewport: ${JSON.stringify(sizes)}`);
}

async function readDay(driver, section, date, styles) {
  return driver.js(`(() => {
    const root = document.documentElement;
    const day = document.querySelector(${JSON.stringify(dayButton(date))});
    const tip = document.querySelector('${tooltip}');
    const probe = document.createElement('span');
    probe.hidden = true;
    document.body.appendChild(probe);
    const color = token => {
      probe.style.color = 'var(' + token + ')';
      return getComputedStyle(probe).color;
    };
    const previous = root.dataset.appearanceStyle;
    try {
      const palettes = ${JSON.stringify(styles)}.map(style => {
        root.dataset.appearanceStyle = style;
        const surface = getComputedStyle(tip);
        return { style, marker: getComputedStyle(day, '::after').backgroundColor,
          error: color('--error'), normal: color('${section.entity === 'plans' ? '--violet' : '--accent'}'),
          text: surface.color, background: surface.backgroundColor,
          headings: [...tip.querySelectorAll('.control-year-tip-heading')].map(el => getComputedStyle(el).color),
          statuses: [...tip.querySelectorAll('.control-year-tip-overdue-status')].map(el => getComputedStyle(el).color) };
      });
      const items = [...tip.querySelectorAll('li')].map(li => {
        const links = li.querySelectorAll('a.control-year-record-link[href]');
        const link = links[0];
        return { text: li.textContent, title: link?.textContent, href: link?.getAttribute('href'), links: links.length,
          overdue: li.classList.contains('control-year-tip-overdue'), status: li.querySelector('.control-year-tip-overdue-status')?.textContent ?? '' };
      });
      return { overdue: day.classList.contains('control-year-overdue'), current: day.getAttribute('aria-current'), items, palettes };
    } finally {
      if (previous === undefined) delete root.dataset.appearanceStyle;
      else root.dataset.appearanceStyle = previous;
      probe.remove();
    }
  })()`);
}

async function openEvent(driver, section, entry, date, keyboard = false) {
  const { row, checkpoint, movedFrom } = entry;
  const card = section.entity === 'plans' ? '.planning-dialog[open]' : '.registry-instruction-dialog:not(.planning-dialog)[open]';
  const year = date.slice(0, 4);
  const links = `${tooltip} a.control-year-record-link`;
  if (keyboard) {
    const index = await driver.js(`[...document.querySelectorAll('${links}')].findIndex(link => link.textContent === ${JSON.stringify(row.title)})`);
    assert.ok(index >= 0);
    await driver.js(`document.querySelector(${JSON.stringify(dayButton(date))}).focus()`);
    for (let i = 0; i <= index; i++) {
      await driver.pressKey('Tab');
      await driver.wait(`document.activeElement === document.querySelectorAll('${links}')[${i}]`);
    }
    const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
    await driver.window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { ...enter, type: 'keyDown', text: '\r' });
    await driver.window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { ...enter, type: 'keyUp' });
  } else {
    await driver.click(row.title, links);
  }
  await driver.wait(`document.querySelector('${card} .registry-card-id')?.textContent.trim() === 'ID ${row.id}' &&
    document.querySelector('${card} [name=instructionNumber]')?.value === ${JSON.stringify(row.instructionNumber)} &&
    document.querySelector('${card} [name=title]')?.value === ${JSON.stringify(row.title)}`);
  assert.equal(await driver.js(`document.querySelector('${calendar} h2')?.textContent`), `${year} год`);
  if (checkpoint) {
    const editor = `${card} [data-checkpoint-date="${date}"]`;
    await driver.wait(`document.activeElement.matches('${editor} textarea')`);
    if (movedFrom) assert.ok((await driver.js(`document.querySelector('${editor}').textContent`)).includes(`Перенесено с ${formatDate(movedFrom)}`));
  } else {
    await driver.wait(`document.activeElement.matches('${card} [name=instructionNumber]')`);
  }
  await driver.js(`document.querySelector('${card} [aria-label="Закрыть карточку"]').click()`);
  await driver.wait(`!document.querySelector('${card}') && document.querySelector('${calendar} h2')?.textContent === '${year} год' &&
    Boolean(document.querySelector(${JSON.stringify(dayButton(date))})) && !document.querySelector('.registry-table')`);
}

async function checkDay(driver, section, date, expected, { allStyles = false, today = false, closed = false } = {}) {
  await hoverEventDay(driver, date);
  const styles = allStyles ? Object.keys(APP_APPEARANCE_STYLES) : [await driver.js('document.documentElement.dataset.appearanceStyle')];
  const day = await readDay(driver, section, date, styles);
  const overdue = expected.some(item => item.overdue);
  assert.equal(day.overdue, overdue, `Overdue state for ${section.entity} day ${date}`);
  assert.equal(day.current, today ? 'date' : null);
  assert.equal(day.items.length, expected.length, `Individual events for ${section.entity} day ${date}`);
  for (const { row, checkpoint, overdue: late = false } of expected) {
    const item = day.items.find(item => item.title === row.title);
    assert.ok(item, `Missing event for ${row.title}`);
    assert.equal(item.links, 1);
    const fields = [row.instructionNumber, row.executor, row.planItem, checkpoint ? 'Промежуточная проверка' : 'Срок исполнения'].filter(Boolean);
    assert.ok(fields.every(value => item.text.includes(value)), `Unexpected details for ${row.title}: ${item.text}`);
    assert.equal(item.overdue, late);
    assert.equal(item.status, late ? 'Просрочено' : '');
    const link = new URL(item.href.slice(item.href.indexOf('#') + 1), 'https://smoke.invalid');
    const key = section.entity === 'plans' ? 'plan' : 'instruction';
    assert.equal(link.pathname, section.path);
    assert.deepEqual(Object.fromEntries(link.searchParams), {
      [key]: String(row.id), ...(checkpoint ? { checkpoint: date } : {}), ...(closed ? { closed: '1' } : {}),
    });
  }
  for (const palette of day.palettes) {
    assert.notEqual(palette.error, palette.normal);
    assert.equal(palette.marker, overdue ? palette.error : palette.normal, `Day marker for ${section.entity}, ${date}, ${palette.style}`);
    assert.deepEqual(palette.headings, day.items.map(item => item.overdue ? palette.error : palette.normal));
    assert.deepEqual(palette.statuses, expected.filter(event => event.overdue).map(() => palette.error));
    assert.notEqual(palette.text, palette.background);
  }
  if (allStyles) assert.equal(new Set(day.palettes.map(p => [p.error, p.normal, p.text, p.background].join('|'))).size, styles.length);
}

async function checkSection(driver, section, today, fixture) {
  const { js, click, wait, navigate, fill, openFilters, resize, resizeDefault, screenshot } = driver;
  await navigate(section.path, section.heading);
  await openFilters();
  const numberInput = '[data-filter=instructionNumber]';
  const previousNumber = await js(`document.querySelector('${numberInput}').value`);
  await fill(numberInput, { 0: 'НЕТ В ГОДОВОЙ ВЫБОРКЕ' });
  await click('Применить', '.registry-filters button');
  await wait("document.querySelector('.registry-count')?.textContent === '0'");
  const { dates, rows } = fixture;
  const [late, moved, marked, completed, archived] = rows;
  const other = fixturesFor(sections.find(item => item !== section), today);
  const missingDay = async date => {
    await showYearOf(driver, date);
    assert.equal(await js(`Boolean(document.querySelector(${JSON.stringify(dayButton(date))}))`), false, `Unexpected day ${date} in ${section.entity}`);
  };
  const inspectEvents = async (date, events, options) => {
    await checkDay(driver, section, date, events, options);
    for (const event of events) {
      await hoverEventDay(driver, date);
      await openEvent(driver, section, event, date);
    }
  };
  try {
    await click('Годовой календарь');
    await wait(`document.querySelectorAll('${calendar} .control-year-month').length === 12`);
    const year = Number(today.slice(0, 4));
    assert.equal(await js(`document.querySelector('${calendar} h2').textContent`), `${year} год`);
    const months = await js(`[...document.querySelectorAll('${calendar} .control-year-month caption')].map(node => node.textContent.trim().toLocaleLowerCase('ru'))`);
    const monthName = new Intl.DateTimeFormat('ru', { month: 'long', timeZone: 'UTC' });
    assert.deepEqual(months, Array.from({ length: 12 }, (_, index) => monthName.format(Date.UTC(year, index, 1))));
    await missingDay(other.dates.exclusive);
    await missingDay(dates.movedFrom);
    await missingDay(late.deadline);
    await missingDay(dates.closed);
    if (await js('document.documentElement.dataset.appearance') !== section.theme) {
      await js("document.querySelector('.theme-toggle').click()");
      await wait(`document.documentElement.dataset.appearance === '${section.theme}'`);
    }
    const shared = [
      { row: late, overdue: true }, { row: moved, checkpoint: true, overdue: true, movedFrom: dates.movedFrom },
      { row: marked, checkpoint: true },
    ];
    await inspectEvents(dates.shared, shared, { allStyles: true });
    // The same moved checkpoint is reachable again after the card and popup were dismissed.
    await hoverEventDay(driver, dates.shared);
    await openEvent(driver, section, shared[1], dates.shared, true);
    await hoverEventDay(driver, dates.shared);
    await checkLayout(driver);
    await screenshot(`year-${section.entity}-${section.theme}.png`);
    await inspectEvents(dates.today, [{ row: marked }], { today: true });
    await inspectEvents(dates.exclusive, [{ row: late, checkpoint: true, overdue: true }]);
    await inspectEvents(dates.completed, [{ row: completed }]);
    await inspectEvents(dates.completedCheckpoint, [{ row: completed, checkpoint: true }]);
    await missingDay(other.dates.next);
    await inspectEvents(dates.next, [{ row: moved }]);
    await resize(720, 540);
    await hoverEventDay(driver, dates.shared);
    await checkLayout(driver);
    await resizeDefault();
    await click('Таблица');
    await wait("document.querySelector('.registry-count')?.textContent === '0'");
    await openFilters();
    assert.equal(await js(`document.querySelector('${numberInput}').value`), 'НЕТ В ГОДОВОЙ ВЫБОРКЕ');
    await fill(numberInput, { 0: previousNumber });
    await click('Применить', '.registry-filters button');
    await click(section.closed, '[aria-label="Состояние контроля"] button');
    await wait(`document.querySelector('[aria-label="Состояние контроля"] button[aria-pressed=true]')?.textContent === ${JSON.stringify(section.closed)}`);
    await click('Годовой календарь');
    await wait(`document.querySelectorAll('${calendar} .control-year-month').length === 12`);
    await missingDay(dates.shared);
    await missingDay(dates.closedUnmarked);
    await inspectEvents(dates.closed, [{ row: archived }], { closed: true });
    await inspectEvents(dates.closedCheckpoint, [{ row: archived, checkpoint: true }], { closed: true });
  } finally {
    await resizeDefault();
  }
}

export async function verifyYearCalendars(driver, today, generation) {
  const created = [];
  const fixtures = [];
  const initialTheme = await driver.js('document.documentElement.dataset.appearance');
  try {
    for (const section of sections) {
      const { dates, rows } = fixturesFor(section, today);
      const saved = [];
      const remember = row => { saved.push(row); created.push([section.entity, row.id]); };
      if (section.entity === 'plans') {
        for (const row of await driver.api('plans', 'create', { generation, rows })) remember(row);
      } else {
        for (const data of rows) remember(await driver.api(section.entity, 'create', { generation, data }));
      }
      await driver.api(section.entity, 'closeControl', { generation, id: saved.at(-1).id });
      fixtures.push({ dates, rows: saved });
    }
    for (const [index, section] of sections.entries()) await checkSection(driver, section, today, fixtures[index]);
  } finally {
    for (const [entity, id] of created) await driver.api(entity, 'remove', { generation, id });
    await driver.navigate('/settings', 'Настройки');
    if (await driver.js('document.documentElement.dataset.appearance') !== initialTheme) {
      await driver.js("document.querySelector('.theme-toggle').click()");
      await driver.wait(`document.documentElement.dataset.appearance === '${initialTheme}'`);
    }
  }
}
