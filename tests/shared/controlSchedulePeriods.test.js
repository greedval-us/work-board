import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as control from '../../src/shared/controlSchedule.js';
import { buildDeadlineNotifications } from '../../src/shared/deadlineNotifications.js';
import { ValidationError } from '../../src/shared/errors.js';

test('control periods use calendar boundaries for each frequency', () => {
  for (const [frequency, date, start, end] of [
    ['daily', '2028-02-29', '2028-02-29', '2028-02-29'],
    ['weekly', '2027-01-01', '2026-12-28', '2027-01-03'],
    ['weekly', '9999-12-31', '9999-12-27', '9999-12-31'],
    ['monthly', '2028-02-29', '2028-02-01', '2028-02-29'],
    ['quarterly', '2027-05-20', '2027-04-01', '2027-06-30'],
    ['semiannual', '2027-08-20', '2027-07-01', '2027-12-31'],
    ['yearly', '2027-10-10', '2027-01-01', '2027-12-31'],
  ]) {
    assert.deepEqual(control.controlPeriodForDate(frequency, date), { start, end });
  }
  assert.equal(control.controlPeriodForDate('custom', '2027-05-20'), undefined);
  assert.equal(control.controlPeriodForDate('monthly', '2027-02-29'), undefined);
});

test('assigning dates to periods requires neither an automatic anchor nor every period to be filled', () => {
  const bounds = { controlDate: '2026-01-15', deadline: '2026-05-20' };
  const periodDates = { '2026-01-01': '2026-01-19', '2026-04-01': '', '2026-05-01': '2026-05-15' };
  const schedule = control.validateControlSchedule({ frequency: 'monthly', periodDates }, bounds);
  assert.deepEqual(schedule, { frequency: 'monthly', firstDate: '', customDates: [], marks: [], periodDates });
  assert.equal(control.getNextControlCheckpoint(schedule, bounds.deadline), '2026-01-19');
  assert.deepEqual(control.listControlCheckpoints(schedule, { from: bounds.controlDate, to: bounds.deadline }), [
    { date: '2026-01-19', mark: '', scheduled: true }, { date: '2026-05-15', mark: '', scheduled: true },
  ]);
});

test('period assignments must use canonical keys and match the period and the control window', () => {
  const bounds = { controlDate: '2026-01-15', deadline: '2026-05-20' };
  for (const [frequency, periodDates] of [
    ['custom', { '2026-01-01': '2026-01-19' }],
    ['monthly', null],
    ['monthly', []],
    ['monthly', { '2026-01-02': '2026-01-19' }],
    ['monthly', { '2026-01-01': '2026-02-20' }],
    ['monthly', { '2026-01-01': '2026-01-10' }],
    ['monthly', { '2026-05-01': '2026-05-21' }],
  ]) {
    assert.throws(() => control.validateControlSchedule({ frequency, firstDate: '2026-01-20', periodDates }, bounds), ValidationError);
  }
});

test('assignments replace effective legacy dates in an edited period and preserve marks as history', () => {
  const value = {
    frequency: 'monthly', firstDate: '2026-01-05', customDates: ['2026-01-20', '2026-02-08'],
    moves: [{ from: '2026-01-05', to: '2026-03-11' }, { from: '2026-02-05', to: '2026-01-24' }],
    marks: [{ date: '2026-01-20', text: 'Готово' }],
    periodDates: { '2026-01-01': '2026-01-13', '2026-03-01': '' },
  };
  const schedule = control.validateControlSchedule(value);
  assert.deepEqual(control.listControlCheckpoints(schedule, { from: '2026-01-01', to: '2026-04-30' }), [
    { date: '2026-01-13', mark: '', scheduled: true },
    { date: '2026-01-20', mark: 'Готово', scheduled: false },
    { date: '2026-02-08', mark: '', scheduled: true },
    { date: '2026-04-05', mark: '', scheduled: true },
  ]);
  assert.equal(control.getNextControlCheckpoint(schedule, '2026-04-30'), '2026-01-13');
  const marks = [...schedule.marks, { date: '2026-01-13', text: 'Готово' }];
  assert.equal(control.getNextControlCheckpoint({ ...schedule, marks }, '2026-04-30'), '2026-02-08');
});

test('period assignments cannot be moved or bypassed using the legacy transfer action', () => {
  const schedule = { frequency: 'monthly', firstDate: '2026-01-05', periodDates: { '2026-01-01': '2026-01-10' } };
  assert.throws(() => control.moveControlCheckpoint(schedule, '2026-01-10', '2026-01-11'), ValidationError);
  assert.throws(() => control.moveControlCheckpoint(schedule, '2026-02-05', '2026-01-11'), ValidationError);
  assert.deepEqual(control.moveControlCheckpoint(schedule, '2026-02-05', '2026-02-25').moves, [
    { from: '2026-02-05', to: '2026-02-25' },
  ]);
});

test('an explicit choice replaces fallback dates in a period even after control bounds change', () => {
  const bounds = { controlDate: '2026-01-15', deadline: '2026-02-28' };
  const schedule = control.validateControlSchedule({
    frequency: 'monthly', customDates: ['2026-01-10', '2026-01-11', '2026-02-12', '2026-02-24'],
    periodDates: { '2026-01-01': '2026-01-18' },
  }, bounds);
  assert.deepEqual(control.listControlCheckpoints(schedule, { from: bounds.controlDate, to: bounds.deadline }).map(({ date }) => date), [
    '2026-01-18', '2026-02-12', '2026-02-24',
  ]);
});

test('reminders include explicitly selected dates before the legacy automatic anchor', () => {
  const reminders = buildDeadlineNotifications({ instructions: [], tasks: [], today: '2026-01-20', scheduledInstructions: [{
    id: 5, title: 'Контроль', instructionNumber: '5', status: 'pending', deadline: '2026-04-30',
    controlSchedule: { frequency: 'monthly', firstDate: '2026-03-11', customDates: [], marks: [],
      periodDates: { '2026-01-01': '2026-01-15' } },
  }] });
  assert.deepEqual(reminders.map(({ date }) => date), ['2026-01-15']);
});
