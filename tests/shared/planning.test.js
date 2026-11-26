import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePlanListRequest, validatePlan } from '../../src/shared/planning.js';
import { normalizeListRequest, validateInstruction } from '../../src/shared/registry.js';

test('plan items preserve their text and belong only to planning records and queries', () => {
  const row = {
    instructionNumber: '009/П', title: 'Годовой план', executor: 'Иванов', controlDate: '2026-11-26',
    deadline: '2026-12-30', planItem: '02.1 — Проверка',
  };
  assert.equal(validatePlan(row).planItem, row.planItem);
  assert.equal(validatePlan({ ...row, planItem: undefined }).planItem, '');
  assert.throws(() => validatePlan({ ...row, planItem: 2 }), /Пункт плана/);
  assert.throws(() => validatePlan({ ...row, title: '' }), /Название плана/);
  assert.equal(Object.hasOwn(validateInstruction(row), 'planItem'), false);
  const sort = { field: 'planItem', direction: 'asc' };
  assert.deepEqual(normalizePlanListRequest({ sort }).sort, sort);
  assert.throws(() => normalizeListRequest({ sort }), /сортировки/);
});
