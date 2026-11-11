import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTROL_MARK_LIMIT, emptyControlSchedule, getNextControlCheckpoint, listControlCheckpoints, validateControlSchedule,
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

test('yearly schedules restore February 29 in leap years', () => {
  assert.deepEqual(checkpointDates('yearly', '2024-02-29', '2027-01-01', '2028-03-01'), [
    '2027-02-28', '2028-02-29',
  ]);
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
