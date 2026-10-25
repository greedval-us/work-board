import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ValidationError, emptyFilters, formatDate, getUrgency, localDate,
  normalizeFilters, normalizeListRequest, validateInstruction, validateTask,
} from '../../src/shared/registry.js';

const instruction = (changes = {}) => ({
  controlDate: '2026-10-23', incomingNumber: '001/А', instructionNumber: '007/Б',
  title: 'Проверить отчёт', summary: '  Первая строка\nВторая строка  ',
  deadline: '2026-10-26', executor: 'Иванов И. И.', status: 'pending', executionMark: '',
  ...changes,
});

test('instruction validation preserves identifiers and optional multiline text', () => {
  const data = validateInstruction(instruction());
  assert.equal(data.incomingNumber, '001/А');
  assert.equal(data.instructionNumber, '007/Б');
  assert.equal(data.summary, '  Первая строка\nВторая строка  ');
  const { incomingNumber, summary, executionMark, status, ...required } = instruction();
  assert.deepEqual(validateInstruction(required), instruction({ incomingNumber: '', summary: '', executionMark: '', status: 'pending' }));
});

test('required instruction fields and strict Gregorian dates reject invalid input safely', () => {
  const invalid = [
    ...['controlDate', 'instructionNumber', 'title', 'deadline', 'executor'].map(key => instruction({ [key]: ' ' })),
    ...['2026-02-29', '2024-02-30', '2026-13-01', '2026-00-01', '2026-10-00', '2026-1-03', '0000-01-01', '2026-10-23T00:00:00Z'].map(deadline => instruction({ deadline })),
    instruction({ status: 'done' }), instruction({ status: null }), instruction({ incomingNumber: 123 }), null,
  ];
  for (const data of invalid) {
    assert.throws(() => validateInstruction(data), error => error instanceof ValidationError && Boolean(error.publicMessage));
  }
  assert.equal(validateInstruction(instruction({ deadline: '2024-02-29' })).deadline, '2024-02-29');
  assert.equal(validateInstruction(instruction({ deadline: '2000-02-29' })).deadline, '2000-02-29');
  assert.throws(() => validateInstruction(instruction({ deadline: '1900-02-29' })), ValidationError);
});

test('task validation defaults optional values and rejects malformed booleans and priorities', () => {
  assert.deepEqual(validateTask({ title: 'Отчёт', date: '2026-11-01' }), {
    title: 'Отчёт', date: '2026-11-01', description: '', priority: 'normal', completed: false,
  });
  for (const change of [{ title: '' }, { date: '2026-02-29' }, { priority: 'high' }, { priority: null }, { completed: 'false' }, { completed: null }, { description: {} }]) {
    assert.throws(() => validateTask({ title: 'Отчёт', date: '2026-11-01', ...change }), ValidationError);
  }
});

test('filters validate ranges and support an empty status', () => {
  assert.deepEqual(normalizeFilters(), emptyFilters());
  assert.notEqual(emptyFilters(), emptyFilters());
  assert.equal(normalizeFilters({ executor: ' ИВАНОВ ', status: '' }).executor, 'ИВАНОВ');
  for (const filters of [{ deadlineFrom: '2026-02-29' }, { deadlineFrom: '2026-11-02', deadlineTo: '2026-11-01' }, { status: 'all' }, { instructionNumber: 7 }]) {
    assert.throws(() => normalizeFilters(filters), ValidationError);
  }
});

test('list requests constrain sort fields and pagination', () => {
  assert.deepEqual(normalizeListRequest(), {
    filters: emptyFilters(), sort: { field: 'controlDate', direction: 'desc' }, offset: 0, limit: 25,
  });
  assert.equal(normalizeListRequest({ offset: 50, limit: 50, sort: { field: 'executor', direction: 'asc' } }).offset, 50);
  for (const request of [{ offset: -1 }, { offset: null }, { offset: 0.5 }, { limit: 0 }, { limit: null }, { limit: 101 }, { limit: '25' }, { sort: { field: null } }, { sort: { direction: null } }, { sort: { field: 'id; DROP TABLE instructions', direction: 'asc' } }, { sort: { field: 'deadline', direction: 'DROP' } }]) {
    assert.throws(() => normalizeListRequest(request), ValidationError);
  }
});

test('local dates and formatting keep calendar values without UTC conversion', () => {
  assert.equal(localDate(new Date(2026, 9, 23, 23, 59)), '2026-10-23');
  assert.equal(formatDate('2026-10-03'), '03.10.2026');
  assert.equal(formatDate(''), '');
});

test('urgency distinguishes overdue, next three days, later dates and completed instructions', () => {
  assert.deepEqual(getUrgency({ deadline: '2026-10-22', status: 'pending' }, '2026-10-23'), { tone: 'danger', label: 'Просрочено' });
  for (const deadline of ['2026-10-23', '2026-10-26']) {
    assert.equal(getUrgency({ deadline, status: 'in_progress' }, '2026-10-23').tone, 'warning');
  }
  assert.equal(getUrgency({ deadline: '2026-10-27', status: 'pending' }, '2026-10-23').tone, 'info');
  assert.deepEqual(getUrgency({ deadline: '2026-10-22', status: 'completed' }, '2026-10-23'), { tone: 'success', label: 'Исполнено' });
  assert.equal(getUrgency({ deadline: '2027-01-02', status: 'pending' }, '2026-12-30').tone, 'warning');
});

test('task urgency uses explicit priority and recalculates overdue and completed states', () => {
  assert.deepEqual(getUrgency({ date: '2026-10-24', priority: 'normal', completed: false }, '2026-10-23'), { tone: 'info', label: 'Обычная' });
  assert.deepEqual(getUrgency({ date: '2026-10-24', priority: 'important', completed: false }, '2026-10-23'), { tone: 'warning', label: 'Важная' });
  assert.deepEqual(getUrgency({ date: '2026-10-24', priority: 'urgent', completed: false }, '2026-10-23'), { tone: 'danger', label: 'Срочная' });
  assert.equal(getUrgency({ date: '2026-10-22', priority: 'normal', completed: false }, '2026-10-23').label, 'Просрочено');
  assert.deepEqual(getUrgency({ date: '2026-10-22', priority: 'urgent', completed: true }, '2026-10-23'), { tone: 'success', label: 'Выполнено' });
});
