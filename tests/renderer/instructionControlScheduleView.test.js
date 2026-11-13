import assert from 'node:assert/strict';
import test from 'node:test';
import { controlScheduleRows, inControlPeriod, startingMonth } from '../../src/renderer/components/registry/controlScheduleView.js';

const period = { controlDate: '2026-01-01', deadline: '2026-12-31' };
const empty = { frequency: '', firstDate: '', customDates: [], marks: [] };

test('initial months follow effective custom dates, recurring deadlines and retained history', () => {
  const today = '2026-06-15';
  const cases = [
    ['empty schedule', empty, period, '2026-01'],
    ['no control date', empty, {}, '2026-06'],
    ['history only', { ...empty, marks: [{ date: '2026-03-10', text: 'Принято' }] }, period, '2026-03'],
    ['future recurrence', { ...empty, frequency: 'monthly', firstDate: '2026-08-01' }, period, '2026-08'],
    ['active recurrence', { ...empty, frequency: 'monthly', firstDate: '2026-01-01' }, period, '2026-06'],
    ['finished recurrence', { ...empty, frequency: 'monthly', firstDate: '2026-01-01' }, { ...period, deadline: '2026-04-30' }, '2026-04'],
    ['history after deadline', { ...empty, frequency: 'monthly', firstDate: '2026-01-01', marks: [{ date: '2026-05-10', text: 'Принято' }] }, { ...period, deadline: '2026-04-30' }, '2026-05'],
    ['moved upcoming custom date', { ...empty, frequency: 'custom', customDates: ['2026-05-01', '2026-08-01'], moves: [{ from: '2026-05-01', to: '2026-07-01' }] }, period, '2026-07'],
    ['last past custom date', { ...empty, frequency: 'custom', customDates: ['2026-02-01', '2026-04-01'] }, period, '2026-04'],
  ];
  for (const [label, schedule, bounds, expected] of cases) {
    assert.equal(startingMonth(schedule, bounds, today), expected, label);
  }
});

test('the control period includes its boundaries and rejects impossible or incomplete dates', () => {
  assert.equal(inControlPeriod(period.controlDate, period), true);
  assert.equal(inControlPeriod(period.deadline, period), true);
  for (const date of ['', '2026-02', '2026-02-29', '2025-12-31', '2027-01-01']) {
    assert.equal(inControlPeriod(date, period), false, date);
  }
  assert.equal(inControlPeriod('2024-02-29', {}), true);
});

test('month rows keep invalid custom dates, moved dates and an empty history draft available for repair', () => {
  const schedule = Object.freeze({
    frequency: 'custom', firstDate: '',
    customDates: Object.freeze(['2026-02-02', '2026-02-10']),
    moves: Object.freeze([Object.freeze({ from: '2026-02-02', to: '2026-03-01' })]),
    marks: Object.freeze([Object.freeze({ date: '2026-02-20', text: 'Принято' })]),
  });
  const bounds = { controlDate: '2026-02-15', deadline: '2026-02-28' };
  const rows = controlScheduleRows(schedule, { ...bounds, month: '2026-02', editedHistoryDate: '2026-02-25' }, '2026-02-15');
  assert.deepEqual(rows.map(row => row.date), ['2026-02-10', '2026-02-20', '2026-02-25']);
  assert.equal(rows[0].configured, true);
  assert.equal(rows[0].canOpen, false);
  assert.deepEqual(rows[0].status, { label: 'Вне периода контроля', tone: 'warning' });
  assert.equal(rows[1].canOpen, true);
  assert.equal(rows[1].movable, false);
  assert.deepEqual(rows[1].status, { label: 'Есть отметка', tone: 'success' });
  assert.equal(rows[2].canOpen, true, 'a cleared historical mark remains editable');
  const [moved] = controlScheduleRows(schedule, { ...bounds, month: '2026-03' }, '2026-02-15');
  assert.equal(moved.originalDate, '2026-02-02');
  assert.equal(moved.scheduled, false);
  assert.equal(moved.movable, true);
  assert.equal(moved.configured, true);
});
