import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePlanListRequest, validatePlan } from '../../src/shared/planning.js';
import { normalizeListRequest, validateInstruction } from '../../src/shared/registry.js';

test('plan items preserve their text and belong only to planning records and queries', () => {
  const row = {
    instructionNumber: '009/П', title: 'Годовой план', executor: 'Иванов', controlDate: '2026-11-26',
    deadline: '2026-12-30', planItem: '02.1 — Проверка', activity: 'Проверка\nотчётов',
  };
  assert.equal(validatePlan(row).planItem, row.planItem);
  assert.equal(validatePlan({ ...row, planItem: undefined }).planItem, '');
  assert.throws(() => validatePlan({ ...row, planItem: 2 }), /Пункт плана/);
  assert.equal(validatePlan(row).activity, row.activity);
  assert.equal(validatePlan({ ...row, activity: undefined }).activity, '');
  assert.throws(() => validatePlan({ ...row, activity: 2 }), /Мероприятие/);
  assert.throws(() => validatePlan({ ...row, activity: 'я'.repeat(20_001) }), /Мероприятие/);
  assert.throws(() => validatePlan({ ...row, title: '' }), /Название плана/);
  assert.equal(Object.hasOwn(validateInstruction(row), 'planItem'), false);
  assert.equal(Object.hasOwn(validateInstruction(row), 'activity'), false);
  for (const field of ['planItem', 'activity']) {
    const sort = { field, direction: 'asc' };
    assert.deepEqual(normalizePlanListRequest({ sort }).sort, sort);
    assert.throws(() => normalizeListRequest({ sort }), /сортировки/);
  }
});
