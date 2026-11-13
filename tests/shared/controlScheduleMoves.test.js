import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as control from '../../src/shared/controlSchedule.js';
import { ValidationError } from '../../src/shared/errors.js';

const bounds = { controlDate: '2026-01-01', deadline: '2026-04-30' };
const monthly = { frequency: 'monthly', firstDate: '2026-01-31', customDates: [], marks: [] };

test('one moved monthly checkpoint appears in its destination month without shifting later anchors', () => {
  const schedule = { ...monthly, moves: [{ from: '2026-02-28', to: '2026-03-02' }] };
  assert.deepEqual(control.listControlCheckpoints(schedule, { from: '2026-02-01', to: '2026-02-28', deadline: bounds.deadline }), []);
  assert.deepEqual(control.listControlCheckpoints(schedule, { from: '2026-03-01', to: '2026-03-31', deadline: bounds.deadline }), [
    { date: '2026-03-02', originalDate: '2026-02-28', mark: '', scheduled: true },
    { date: '2026-03-31', mark: '', scheduled: true },
  ]);
});

test('next checkpoint compares moved dates with untouched recurrence dates', () => {
  const schedule = { frequency: 'weekly', firstDate: '2026-01-01', moves: [{ from: '2026-01-01', to: '2026-01-20' }] };
  assert.equal(control.getNextControlCheckpoint(schedule, '2026-01-31'), '2026-01-08');
  assert.equal(control.getNextControlCheckpoint({ ...schedule, marks: [
    { date: '2026-01-08', text: 'Готово' }, { date: '2026-01-15', text: 'Готово' },
  ] }, '2026-01-31'), '2026-01-20');
  assert.equal(control.getNextControlCheckpoint({ ...monthly, moves: [{ from: '2026-04-30', to: '2026-01-02' }] }, bounds.deadline), '2026-01-02');
});

test('moving an effective date twice retains one original anchor and can restore that anchor', () => {
  assert.equal(typeof control.moveControlCheckpoint, 'function');
  const moved = control.moveControlCheckpoint(monthly, '2026-02-28', '2026-03-02', bounds);
  const again = control.moveControlCheckpoint(moved, '2026-03-02', '2026-03-03', bounds);
  assert.deepEqual(again, { ...monthly, moves: [{ from: '2026-02-28', to: '2026-03-03' }] });
  assert.deepEqual(control.moveControlCheckpoint(again, '2026-03-03', '2026-02-28', bounds), monthly);
  assert.deepEqual(control.moveControlCheckpoint(again, '2026-03-03', '2026-03-03', bounds), again);
  assert.deepEqual(monthly, { frequency: 'monthly', firstDate: '2026-01-31', customDates: [], marks: [] });
});

test('moving a marked checkpoint preserves its factual date including legacy fallback dates', () => {
  assert.equal(typeof control.moveControlCheckpoint, 'function');
  const schedule = { ...monthly, marks: [{ date: '2026-02-28', text: 'Отчёт получен' }] };
  const moved = control.moveControlCheckpoint(schedule, '2026-02-28', '2026-03-02', bounds);
  assert.deepEqual(moved.marks, [{ date: '2026-03-02', text: 'Отчёт получен', actualDate: '2026-02-28' }]);
  const again = control.moveControlCheckpoint(moved, '2026-03-02', '2026-03-03', bounds);
  assert.deepEqual(again.marks, [{ date: '2026-03-03', text: 'Отчёт получен', actualDate: '2026-02-28' }]);
  assert.deepEqual(schedule.marks, [{ date: '2026-02-28', text: 'Отчёт получен' }]);
});

test('retrospective actual dates survive normalization and listing independently of the planned period', () => {
  const schedule = control.validateControlSchedule({ ...monthly, marks: [
    { date: '2026-01-31', text: 'Исполнено ранее', actualDate: '2025-12-25' },
    { date: '2026-02-28', text: 'Историческая отметка' },
  ] }, bounds);
  assert.deepEqual(schedule.marks, [
    { date: '2026-01-31', text: 'Исполнено ранее', actualDate: '2025-12-25' },
    { date: '2026-02-28', text: 'Историческая отметка' },
  ]);
  assert.deepEqual(control.listControlCheckpoints(schedule, { from: '2026-01-31', to: '2026-01-31', deadline: bounds.deadline }), [
    { date: '2026-01-31', mark: 'Исполнено ранее', actualDate: '2025-12-25', scheduled: true },
  ]);
});

test('invalid factual dates and malformed or colliding move schedules are rejected', () => {
  for (const invalid of [
    { marks: [{ date: '2026-01-31', text: 'Готово', actualDate: '2026-02-30' }] },
    { marks: [{ date: '2026-01-31', text: 'Готово', actualDate: null }] },
    { marks: [{ date: '2026-01-31', text: 'Готово', actualDate: '' }] },
    { moves: null }, { moves: [{}] },
    { moves: [{ from: '2026-01-30', to: '2026-02-01' }] },
    { moves: [{ from: '2026-01-31', to: '2026-02-28' }] },
    { moves: [{ from: '2026-01-31', to: '2026-02-01' }, { from: '2026-01-31', to: '2026-02-02' }] },
    { moves: [{ from: '2026-01-31', to: '2026-02-01' }, { from: '2026-02-28', to: '2026-02-01' }] },
    { moves: [{ from: '2026-01-31', to: '2025-12-31' }] },
    { moves: [{ from: '2026-01-31', to: '2026-05-01' }] },
  ]) assert.throws(() => control.validateControlSchedule({ ...monthly, ...invalid }, bounds), ValidationError);
});

test('moving rejects missing sources, destination collisions and dates outside the control period', () => {
  assert.equal(typeof control.moveControlCheckpoint, 'function');
  const schedule = { ...monthly, marks: [{ date: '2026-02-02', text: 'История' }] };
  for (const [from, to] of [
    ['2026-01-30', '2026-02-01'], ['2026-01-31', '2026-02-28'], ['2026-01-31', '2026-02-02'],
    ['2026-01-31', '2025-12-31'], ['2026-01-31', '2026-05-01'],
  ]) assert.throws(() => control.moveControlCheckpoint(schedule, from, to, bounds), ValidationError);
});

test('shortening a deadline retains moved marked history but cannot revive an inactive original date', () => {
  const schedule = { ...monthly, moves: [{ from: '2026-03-31', to: '2026-02-02' }], marks: [
    { date: '2026-02-02', text: 'Получено', actualDate: '2026-02-03' },
  ] };
  const shortened = control.validateControlSchedule(schedule, { ...bounds, deadline: '2026-02-28' });
  assert.deepEqual(control.listControlCheckpoints(shortened, { from: '2026-02-02', to: '2026-02-02', deadline: '2026-02-28' }), [
    { date: '2026-02-02', mark: 'Получено', actualDate: '2026-02-03', scheduled: false },
  ]);
  assert.equal(control.getNextControlCheckpoint({ ...shortened, marks: [] }, '2026-02-28'), '2026-01-31');
  assert.deepEqual(control.listControlCheckpoints({ ...shortened, marks: [] }, {
    from: '2026-02-02', to: '2026-02-02', deadline: '2026-02-28',
  }), []);
  const movedPastDeadline = { ...monthly, moves: [{ from: '2026-02-28', to: '2026-03-02' }], marks: [
    { date: '2026-03-02', text: 'Получено', actualDate: '2026-03-03' },
  ] };
  assert.doesNotThrow(() => control.validateControlSchedule(movedPastDeadline, { ...bounds, deadline: '2026-02-28' }));
});

test('custom moves preserve the configured source and use the effective date for completion', () => {
  assert.equal(typeof control.moveControlCheckpoint, 'function');
  const moved = control.moveControlCheckpoint({ frequency: 'custom', customDates: ['2026-02-01', '2026-02-02'] }, '2026-02-01', '2026-01-31', bounds);
  assert.deepEqual(moved.customDates, ['2026-02-01', '2026-02-02']);
  assert.equal(control.getNextControlCheckpoint(moved, bounds.deadline), '2026-01-31');
  assert.equal(control.getNextControlCheckpoint({ ...moved, marks: [{ date: '2026-01-31', text: 'Готово', actualDate: '2026-02-03' }] }, bounds.deadline), '2026-02-02');
});

test('saved moves may swap two scheduled dates while completion stays attached to the effective date', () => {
  const schedule = control.validateControlSchedule({
    frequency: 'custom', customDates: ['2026-02-01', '2026-02-02'],
    moves: [
      { from: '2026-02-02', to: '2026-02-01' },
      { from: '2026-02-01', to: '2026-02-02' },
    ],
    marks: [{ date: '2026-02-01', text: 'Получено', actualDate: '2026-01-31' }],
  }, bounds);
  assert.deepEqual(schedule.moves, [
    { from: '2026-02-01', to: '2026-02-02' },
    { from: '2026-02-02', to: '2026-02-01' },
  ]);
  assert.deepEqual(control.listControlCheckpoints(schedule, { from: '2026-02-01', to: '2026-02-02', deadline: bounds.deadline }), [
    { date: '2026-02-01', originalDate: '2026-02-02', mark: 'Получено', actualDate: '2026-01-31', scheduled: true },
    { date: '2026-02-02', originalDate: '2026-02-01', mark: '', scheduled: true },
  ]);
  assert.equal(control.getNextControlCheckpoint(schedule, bounds.deadline), '2026-02-02');
});

test('a moved checkpoint outside a shortened deadline can be corrected without losing other draft moves', () => {
  const schedule = { ...monthly, moves: [
    { from: '2026-01-31', to: '2026-03-03' },
    { from: '2026-02-28', to: '2026-03-02' },
  ] };
  const shortened = { ...bounds, deadline: '2026-02-28' };
  assert.throws(() => control.validateControlSchedule(schedule, shortened), ValidationError);
  const corrected = control.moveControlCheckpoint(schedule, '2026-03-02', '2026-02-27', shortened);
  assert.deepEqual(corrected.moves, [
    { from: '2026-01-31', to: '2026-03-03' },
    { from: '2026-02-28', to: '2026-02-27' },
  ]);
  assert.throws(() => control.validateControlSchedule(corrected, shortened), ValidationError);
  const complete = control.moveControlCheckpoint(corrected, '2026-03-03', '2026-01-31', shortened);
  assert.doesNotThrow(() => control.validateControlSchedule(complete, shortened));
  assert.deepEqual(control.listControlCheckpoints(complete, { from: '2026-02-27', to: '2026-02-27', deadline: shortened.deadline }), [
    { date: '2026-02-27', originalDate: '2026-02-28', mark: '', scheduled: true },
  ]);
  assert.throws(() => control.moveControlCheckpoint(schedule, '2026-03-02', '2026-03-01', shortened), ValidationError);
});

test('custom move bounds follow the effective planned date after the control period changes', () => {
  const schedule = {
    frequency: 'custom', customDates: ['2026-02-01'],
    moves: [{ from: '2026-02-01', to: '2026-03-01' }],
  };
  const changed = { controlDate: '2026-02-15', deadline: '2026-04-30' };
  const normalized = control.validateControlSchedule(schedule, changed);
  assert.deepEqual(normalized.customDates, ['2026-02-01']);
  assert.deepEqual(normalized.moves, [{ from: '2026-02-01', to: '2026-03-01' }]);
  assert.throws(() => control.validateControlSchedule({ ...schedule, customDates: ['2026-02-01', '2026-02-02'] }, changed), ValidationError);
  assert.throws(() => control.validateControlSchedule({ ...schedule, moves: [{ from: '2026-02-01', to: '2026-02-10' }] }, changed), ValidationError);
});
