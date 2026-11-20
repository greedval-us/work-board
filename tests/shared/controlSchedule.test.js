import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTROL_FREQUENCIES, CONTROL_MARK_LIMIT, CONTROL_WEEKDAY_LABELS, emptyControlSchedule, getControlWeekday,
  getNextControlCheckpoint, listControlCheckpoints, moveControlCheckpoint, supportsControlDayOfMonth, validateControlSchedule,
} from '../../src/shared/controlSchedule.js';
import { ValidationError } from '../../src/shared/errors.js';

function checkpointDates(frequency, firstDate, from, to, deadline = to) {
  return listControlCheckpoints({ frequency, firstDate }, { from, to, deadline }).map(row => row.date);
}

test('daily schedules jump to the requested window and stop at the inclusive deadline', () => {
  assert.deepEqual(checkpointDates('daily', '0001-01-01', '2028-02-28', '2028-03-01', '2028-02-29'), [
    '2028-02-28', '2028-02-29',
  ]);
});

test('weekly schedules keep the weekday when the window crosses a year boundary', () => {
  assert.deepEqual(checkpointDates('weekly', '2026-12-21', '2026-12-22', '2027-01-04'), [
    '2026-12-28', '2027-01-04',
  ]);
});

test('weekly override uses the first matching weekday and respects the query range and deadline', () => {
  const bounds = { controlDate: '2026-12-28', deadline: '2027-01-11' };
  const schedule = validateControlSchedule({ frequency: 'weekly', firstDate: '2026-12-30', dayOfWeek: 1 }, bounds);
  assert.equal(schedule.dayOfWeek, 1);
  assert.equal(getNextControlCheckpoint(schedule, bounds.deadline), '2027-01-04');
  assert.deepEqual(listControlCheckpoints(schedule, { from: '2026-12-28', to: '2027-01-25', deadline: bounds.deadline }).map(row => row.date), [
    '2027-01-04', '2027-01-11',
  ]);
  assert.deepEqual(listControlCheckpoints(schedule, { from: '2027-01-05', to: '2027-01-10' }), []);
  assert.equal(getNextControlCheckpoint(schedule, '2027-01-03'), '');
  assert.equal(getNextControlCheckpoint({ ...schedule, firstDate: '2027-01-04' }, bounds.deadline), '2027-01-04');
  assert.equal(getNextControlCheckpoint({ ...schedule, dayOfWeek: 7 }, bounds.deadline), '2027-01-03');
  assert.equal(getNextControlCheckpoint({ ...schedule, dayOfWeek: 7, firstDate: '2027-01-03' }, bounds.deadline), '2027-01-03');
  assert.throws(() => validateControlSchedule({ ...schedule, firstDate: '2026-12-27' }, bounds), ValidationError);
});

test('only weekly schedules accept ISO weekday numbers', () => {
  const anchor = { firstDate: '2026-12-30' };
  for (const frequency of ['', 'daily', 'monthly', 'quarterly', 'semiannual', 'yearly', 'custom']) {
    assert.throws(() => validateControlSchedule({ ...anchor, frequency, dayOfWeek: 2, customDates: [anchor.firstDate] }), ValidationError);
  }
  for (const dayOfWeek of [0, 8, 2.5, '1', '', null, true, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateControlSchedule({ ...anchor, frequency: 'weekly', dayOfWeek }), ValidationError);
  }
  const legacy = validateControlSchedule({ ...anchor, frequency: 'weekly' });
  assert.equal(Object.hasOwn(legacy, 'dayOfWeek'), false);
  for (const dayOfWeek of [null, '2', 0, 8]) {
    assert.equal(getNextControlCheckpoint({ ...legacy, dayOfWeek }, '2027-01-10'), anchor.firstDate);
  }
});

test('weekly picker labels follow the same ISO day numbers as calendar dates', () => {
  assert.deepEqual(Object.values(CONTROL_WEEKDAY_LABELS), [
    'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье',
  ]);
  assert.equal(getControlWeekday('2027-01-03'), 7);
  assert.equal(getControlWeekday('2027-01-04'), 1);
  assert.equal(getControlWeekday('2027-02-29'), null);
  assert.equal(getControlWeekday(''), null);
});

test('monthly schedules clamp in short months and restore their original day', () => {
  assert.deepEqual(checkpointDates('monthly', '2028-01-31', '2028-01-01', '2028-04-30'), [
    '2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30',
  ]);
  assert.deepEqual(checkpointDates('monthly', '2028-01-30', '2028-02-01', '2028-03-31'), [
    '2028-02-29', '2028-03-30',
  ]);
});

test('quarterly schedules use three-month intervals from the first date', () => {
  assert.deepEqual(checkpointDates('quarterly', '2026-08-31', '2026-09-01', '2027-08-31'), [
    '2026-11-30', '2027-02-28', '2027-05-31', '2027-08-31',
  ]);
});

test('semiannual schedules advance by six months and restore their original day', () => {
  assert.equal(CONTROL_FREQUENCIES.semiannual, 'Полугодие');
  assert.deepEqual(checkpointDates('semiannual', '2023-08-31', '2023-08-01', '2025-02-28'), [
    '2023-08-31', '2024-02-29', '2024-08-31', '2025-02-28',
  ]);
});

test('a configured day starts in the anchor month or skips to the next full interval', () => {
  for (const [frequency, next] of [
    ['monthly', '2027-02-15'], ['quarterly', '2027-04-15'], ['semiannual', '2027-07-15'], ['yearly', '2028-01-15'],
  ]) {
    const bounds = { controlDate: '2027-01-05', deadline: '2028-01-31' };
    const skipped = validateControlSchedule({ frequency, firstDate: '2027-01-20', dayOfMonth: 15 }, bounds);
    assert.equal(skipped.dayOfMonth, 15);
    assert.equal(getNextControlCheckpoint(skipped, bounds.deadline), next);
    assert.deepEqual(listControlCheckpoints(skipped, { from: bounds.controlDate, to: '2027-01-31' }), []);
    assert.equal(getNextControlCheckpoint({ ...skipped, firstDate: '2027-01-15' }, bounds.deadline), '2027-01-15');
  }
});

test('configured month days clamp in short months and obey the instruction deadline', () => {
  const bounds = { controlDate: '2028-01-08', deadline: '2028-04-29' };
  const schedule = validateControlSchedule({ frequency: 'monthly', firstDate: '2028-01-10', dayOfMonth: 31 }, bounds);
  assert.deepEqual(listControlCheckpoints(schedule, { from: '2028-01-01', to: '2028-04-30', deadline: bounds.deadline }).map(row => row.date), [
    '2028-01-31', '2028-02-29', '2028-03-31',
  ]);
  assert.throws(() => validateControlSchedule({ ...schedule, firstDate: '2028-01-07' }, bounds), ValidationError);
  const shorter = validateControlSchedule(schedule, { ...bounds, deadline: '2028-01-20' });
  assert.equal(getNextControlCheckpoint(shorter, '2028-01-20'), '');
});

test('only month-based schedules accept a whole-number day from 1 to 31', () => {
  const anchor = { firstDate: '2026-11-01' };
  for (const frequency of ['monthly', 'quarterly', 'semiannual', 'yearly']) {
    assert.equal(supportsControlDayOfMonth(frequency), true);
    assert.equal(validateControlSchedule({ ...anchor, frequency, dayOfMonth: 1 }).dayOfMonth, 1);
  }
  for (const frequency of ['', 'daily', 'weekly', 'custom']) {
    assert.equal(supportsControlDayOfMonth(frequency), false);
    assert.throws(() => validateControlSchedule({ ...anchor, frequency, dayOfMonth: 1, customDates: [anchor.firstDate] }), ValidationError);
  }
  assert.equal(supportsControlDayOfMonth(['monthly']), false);
  assert.equal(supportsControlDayOfMonth('constructor'), false);
  for (const dayOfMonth of [0, 32, 5.5, '15', '', null, true, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateControlSchedule({ ...anchor, frequency: 'monthly', dayOfMonth }), ValidationError);
  }
  const legacy = validateControlSchedule({ ...anchor, frequency: 'monthly' });
  assert.equal(Object.hasOwn(legacy, 'dayOfMonth'), false);
  assert.equal(getNextControlCheckpoint({ ...legacy, dayOfMonth: '31' }, '2026-11-30'), anchor.firstDate);
});

test('yearly schedules restore February 29 in leap years', () => {
  assert.deepEqual(checkpointDates('yearly', '2024-02-29', '2027-01-01', '2028-03-01'), [
    '2027-02-28', '2028-02-29',
  ]);
});

test('a yearly month override skips dates before the schedule start and uses the last day of February', () => {
  const schedule = validateControlSchedule({
    frequency: 'yearly', firstDate: '2026-03-15', monthOfYear: 2, dayOfMonth: 31,
  });
  assert.equal(getNextControlCheckpoint(schedule, '2027-02-27'), '');
  assert.equal(getNextControlCheckpoint(schedule, '2027-02-28'), '2027-02-28');
  assert.deepEqual(listControlCheckpoints(schedule, { from: '2026-01-01', to: '2028-12-31' }).map(row => row.date), [
    '2027-02-28', '2028-02-29',
  ]);
});

test('yearly month and day overrides independently default to the start date', () => {
  const anchor = { frequency: 'yearly', firstDate: '2026-03-15' };
  for (const [overrides, expected] of [
    [{ monthOfYear: 5 }, '2026-05-15'],
    [{ dayOfMonth: 20 }, '2026-03-20'],
    [{}, '2026-03-15'],
  ]) {
    assert.equal(getNextControlCheckpoint(validateControlSchedule({ ...anchor, ...overrides }), '2027-12-31'), expected);
  }
});

test('only yearly schedules accept a whole-number month from 1 to 12', () => {
  const anchor = { firstDate: '2026-03-15' };
  for (const frequency of ['', 'daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'custom']) {
    assert.throws(() => validateControlSchedule({ ...anchor, frequency, monthOfYear: 1, customDates: [anchor.firstDate] }), ValidationError);
  }
  for (const monthOfYear of [0, 13, 2.5, '1', '', null, true]) {
    assert.throws(() => validateControlSchedule({ ...anchor, frequency: 'yearly', monthOfYear }), ValidationError);
  }
  const legacy = validateControlSchedule({ ...anchor, frequency: 'yearly' });
  assert.equal(Object.hasOwn(legacy, 'monthOfYear'), false);
  assert.equal(getNextControlCheckpoint({ ...legacy, monthOfYear: '5' }, '2026-12-31'), anchor.firstDate);
});

test('custom schedules combine distinct dates with marks from the active schedule and its history', () => {
  const schedule = {
    frequency: 'custom',
    customDates: ['2026-11-15', '2026-11-10', '2026-11-09', '2026-11-10'],
    marks: [
      { date: '2026-11-18', text: 'Запрос снят' },
      { date: '2026-11-10', text: '  Проверено\nи принято ' },
      { date: '2026-11-12', text: '  ' },
      { date: '2026-10-01', text: 'За пределами запрошенного периода' },
    ],
  };
  assert.deepEqual(listControlCheckpoints(schedule, { from: '2026-11-09', to: '2026-11-19', deadline: '2026-11-14' }), [
    { date: '2026-11-09', mark: '', scheduled: true },
    { date: '2026-11-10', mark: '  Проверено\nи принято ', scheduled: true },
    { date: '2026-11-18', mark: 'Запрос снят', scheduled: false },
  ]);
});

test('every recurring schedule keeps manual dates within the control period', () => {
  const bounds = { controlDate: '2026-11-01', deadline: '2026-12-31' };
  for (const frequency of ['daily', 'weekly', 'monthly', 'quarterly', 'semiannual', 'yearly']) {
    const value = { frequency, firstDate: '2026-11-10', customDates: ['2026-11-15', '2026-11-05', '2026-11-15'] };
    const schedule = validateControlSchedule(value, bounds);
    assert.deepEqual(schedule.customDates, ['2026-11-05', '2026-11-15'], frequency);
    assert.throws(() => validateControlSchedule({ ...value, customDates: ['2026-10-31'] }, bounds), ValidationError);
    assert.throws(() => validateControlSchedule({ ...value, customDates: ['2027-01-01'] }, bounds), ValidationError);
  }
});

test('manual dates share one checkpoint per day with automatic dates', () => {
  const schedule = {
    frequency: 'monthly', firstDate: '2026-11-10', customDates: ['2026-12-10', '2026-11-12', '2026-11-05'],
    marks: [{ date: '2026-11-05', text: 'Получено' }, { date: '2026-11-10', text: 'Получено' }],
  };
  const bounds = { from: '2026-11-01', to: '2026-12-31' };
  assert.deepEqual(listControlCheckpoints(schedule, bounds).map(row => [row.date, row.scheduled]), [
    ['2026-11-05', true], ['2026-11-10', true], ['2026-11-12', true], ['2026-12-10', true],
  ]);
  assert.equal(getNextControlCheckpoint(schedule, bounds.to), '2026-11-12');
});

test('a recurring schedule can move a manual checkpoint without moving automatic dates', () => {
  const schedule = { frequency: 'monthly', firstDate: '2026-11-10', customDates: ['2026-11-12'] };
  const bounds = { controlDate: '2026-11-01', deadline: '2026-12-31' };
  assert.throws(() => moveControlCheckpoint(schedule, '2026-11-10', '2026-11-12', bounds), /уже назначен/);
  const moved = moveControlCheckpoint(schedule, '2026-11-12', '2026-11-06', bounds);
  assert.deepEqual(moved.moves, [{ from: '2026-11-12', to: '2026-11-06' }]);
  assert.equal(getNextControlCheckpoint(moved, bounds.deadline), '2026-11-06');
  assert.deepEqual(listControlCheckpoints(moved, { from: '2026-11-01', to: '2026-11-30' }).map(row => row.date), [
    '2026-11-06', '2026-11-10',
  ]);
});

test('schedule validation rejects malformed schedules, marks and active dates outside instruction bounds', () => {
  const bounds = { controlDate: '2026-11-01', deadline: '2026-11-18' };
  for (const invalid of [
    null, [], { frequency: 'constructor' }, { frequency: 'weekly' },
    { frequency: 'weekly', firstDate: '2026-10-31' }, { frequency: 'daily', firstDate: '2026-11-19' },
    { frequency: 'custom', customDates: [] }, { frequency: 'custom', customDates: ['2026-11-19'] },
    { frequency: 'custom', customDates: ['2026-11-31'] }, { customDates: '2026-11-01' },
    { marks: null }, { marks: [{ date: '2026-11-31', text: 'Готово' }] },
    { marks: [{ date: '2026-11-18', text: 10 }] }, { marks: [{ date: '2026-11-18', text: 'а'.repeat(CONTROL_MARK_LIMIT + 1) }] },
  ]) assert.throws(() => validateControlSchedule(invalid, bounds), ValidationError);
});

test('blank marks are removed and historical marks survive a schedule change', () => {
  const history = { date: '2026-11-23', text: '  Итог согласован  ' };
  const schedule = validateControlSchedule({
    frequency: '',
    firstDate: '2026-11-02',
    customDates: ['2026-11-02'],
    marks: [{ date: '2026-11-01', text: '\n' }, history],
  }, { controlDate: '2026-11-01', deadline: '2026-11-18' });
  assert.deepEqual(schedule, { ...emptyControlSchedule(), marks: [history] });
  assert.notEqual(emptyControlSchedule().marks, emptyControlSchedule().marks);
});

test('normalization keeps the last mark for each date and does not change the input history', () => {
  const value = {
    frequency: 'custom',
    customDates: ['2026-11-15', '2026-11-10', '2026-11-15'],
    marks: [
      { date: '2026-11-15', text: 'Первая запись' },
      { date: '2026-11-10', text: 'Удалённая запись' },
      { date: '2026-11-15', text: '  Уточнение  ', actualDate: '2026-11-14' },
      { date: '2026-11-10', text: ' \n' },
      { date: '2026-11-09', text: 'История' },
    ],
  };
  const original = structuredClone(value);
  const normalized = validateControlSchedule(value);
  assert.deepEqual(normalized, {
    frequency: 'custom', firstDate: '', customDates: ['2026-11-10', '2026-11-15'],
    marks: [
      { date: '2026-11-09', text: 'История' },
      { date: '2026-11-15', text: '  Уточнение  ', actualDate: '2026-11-14' },
    ],
  });
  assert.deepEqual(value, original);
});

test('the earliest unmarked daily date is found across the full supported date range', () => {
  const schedule = {
    frequency: 'daily', firstDate: '0001-01-01',
    marks: [
      { date: '0001-01-01', text: 'Проверено' },
      { date: '0001-01-02', text: ' \n' },
      { date: '9999-12-31', text: 'Проверено позднее' },
    ],
  };
  assert.equal(getNextControlCheckpoint(schedule, '9999-12-31'), '0001-01-02');
});

test('the next custom checkpoint uses the earliest unmarked scheduled date through the deadline', () => {
  const schedule = {
    frequency: 'custom',
    customDates: ['2026-11-16', '2026-11-15', '2026-11-10', '2026-11-14'],
    marks: [{ date: '2026-11-10', text: 'Доклад получен' }, { date: '2026-11-09', text: 'История' }],
  };
  assert.equal(getNextControlCheckpoint(schedule, '2026-11-15'), '2026-11-14');
  assert.equal(getNextControlCheckpoint(schedule, '2026-11-14'), '2026-11-14');
  assert.equal(getNextControlCheckpoint(schedule, '2026-11-13'), '');
  assert.equal(getNextControlCheckpoint({ ...emptyControlSchedule(), marks: schedule.marks }, '2026-11-16'), '');
});
