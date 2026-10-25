import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMonthGrid, moveMonth, millisecondsUntilTomorrow } from '../../src/renderer/components/calendar/calendarDates.js';

test('March grid starts on Monday and contains the adjacent month days', () => {
  const days = buildMonthGrid('2026-03');
  assert.equal(days.length, 42);
  assert.equal(days[0].date, '2026-02-23');
  assert.equal(days[6].date, '2026-03-01');
  assert.equal(days[41].date, '2026-04-05');
  assert.equal(days.filter((day) => day.inMonth).length, 31);
});

test('leap February keeps its final day and has no UTC date conversion', () => {
  const days = buildMonthGrid('2024-02');
  assert.equal(days[0].date, '2024-01-29');
  assert.equal(days.find((day) => day.date === '2024-02-29').inMonth, true);
  assert.equal(days[41].date, '2024-03-10');
  assert.equal(days.filter((day) => day.inMonth).length, 29);
});

test('month navigation crosses year boundaries without retaining the day', () => {
  assert.equal(moveMonth('2026-12', 1), '2027-01');
  assert.equal(moveMonth('2026-01', -1), '2025-12');
});

test('dates in the supported early years keep four-digit ISO years', () => {
  const days = buildMonthGrid('0001-01');
  assert.equal(days[0].date, '0001-01-01');
  assert.equal(days[41].date, '0001-02-11');
  assert.equal(moveMonth('0099-12', 1), '0100-01');
});

test('midnight refresh uses the next local day and a small scheduling margin', () => {
  assert.equal(millisecondsUntilTomorrow(new Date(2026, 9, 23, 23, 59, 59, 900)), 150);
  assert.equal(millisecondsUntilTomorrow(new Date(2026, 9, 23, 12)), 43_200_050);
});
