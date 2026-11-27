import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getNextControlCheckpoint, iterateControlCheckpoints, listControlCheckpoints, validateControlSchedule,
} from '../../src/shared/controlSchedule.js';

test('each next checkpoint matches the first unmarked planned row as the schedule is completed', () => {
  const bounds = { from: '2026-01-01', to: '2026-06-30', deadline: '2026-05-31' };
  const schedule = validateControlSchedule({
    frequency: 'monthly', firstDate: '2026-01-05', customDates: ['2026-02-10'],
    periodDates: { '2026-03-01': '', '2026-04-01': '2026-04-11' },
    moves: [
      { from: '2026-01-05', to: '2026-02-10' },
      { from: '2026-02-10', to: '2026-01-05' },
      { from: '2026-05-05', to: '2026-03-10' },
      { from: '2026-06-05', to: '2026-01-02' },
    ],
    marks: [
      { date: '2026-02-05', text: '  ' },
      { date: '2026-02-10', text: 'Получено', actualDate: '2026-02-12' },
      { date: '2026-06-05', text: 'История', actualDate: '2026-06-08' },
    ],
  });
  assert.deepEqual(listControlCheckpoints(schedule, bounds), [
    { date: '2026-01-05', originalDate: '2026-02-10', mark: '', scheduled: true },
    { date: '2026-02-05', mark: '', scheduled: true },
    { date: '2026-02-10', originalDate: '2026-01-05', mark: 'Получено', actualDate: '2026-02-12', scheduled: true },
    { date: '2026-04-11', mark: '', scheduled: true },
    { date: '2026-06-05', mark: 'История', actualDate: '2026-06-08', scheduled: false },
  ]);
  for (const expected of ['2026-01-05', '2026-02-05', '2026-04-11', '']) {
    const firstOpen = listControlCheckpoints(schedule, bounds).find(row => row.scheduled && !row.mark);
    assert.equal(firstOpen?.date ?? '', expected);
    assert.equal(getNextControlCheckpoint(schedule, bounds.deadline), expected);
    if (expected) schedule.marks.push({ date: expected, text: 'Готово' });
  }
});

test('a daily schedule covering years 0001–9999 stops reading periods at the requested checkpoint', () => {
  const periodDates = new Proxy({ '0001-01-01': '' }, {
    getOwnPropertyDescriptor(target, date) {
      assert.ok(date <= '0001-01-03', `read an unnecessary period ${date}`);
      return Reflect.getOwnPropertyDescriptor(target, date);
    },
  });
  const schedule = {
    frequency: 'daily', firstDate: '0001-01-01', periodDates,
    marks: [{ date: '0001-01-02', text: 'Готово' }],
  };
  const bounds = { from: '0001-01-01', to: '9999-12-31', deadline: '9999-12-31' };
  assert.equal(getNextControlCheckpoint(schedule, bounds.deadline), '0001-01-03');
  const rows = iterateControlCheckpoints(schedule, bounds);
  assert.equal(rows.next().value.date, '0001-01-02');
  assert.equal(rows.next().value.date, '0001-01-03');
  rows.return();
});
