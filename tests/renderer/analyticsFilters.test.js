import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as helpers from '../../src/renderer/domain/analytics.js';

const filters = () => ({ from: '2026-01-01', to: '2026-10-26', entityType: '', status: 'pending', priority: '', executor: '' });

test('analytics changes keep task and instruction filters compatible without mutating the draft', () => {
  const draft = { ...filters(), executor: 'Иванов' };
  assert.deepEqual(helpers.changeAnalyticsFilter(draft, 'priority', 'urgent'), {
    from: '2026-01-01', to: '2026-10-26', entityType: 'tasks', status: '', priority: 'urgent', executor: '',
  });
  assert.equal(draft.executor, 'Иванов');
  assert.equal(draft.priority, '');
  assert.deepEqual(helpers.changeAnalyticsFilter({ ...filters(), entityType: 'tasks', priority: 'urgent' }, 'executor', 'Петров'), {
    from: '2026-01-01', to: '2026-10-26', entityType: 'instructions', status: 'pending', priority: '', executor: 'Петров',
  });
});

test('switching the analytics entity clears only incompatible filters and statuses', () => {
  for (const status of ['pending', 'in_progress']) {
    const next = helpers.changeAnalyticsFilter({ ...filters(), status, priority: 'important', executor: 'Иванов' }, 'entityType', 'tasks');
    assert.equal(next.status, '');
    assert.equal(next.priority, '');
    assert.equal(next.executor, '');
  }
  for (const status of ['active', 'completed', '']) {
    assert.equal(helpers.changeAnalyticsFilter({ ...filters(), status }, 'entityType', 'tasks').status, status);
  }
  assert.equal(helpers.changeAnalyticsFilter(filters(), 'priority', '').entityType, '');
  assert.equal(helpers.changeAnalyticsFilter(filters(), 'from', '2025-01-01').status, 'pending');
});

test('analytics presets use the supplied local day and preserve non-date filters', () => {
  const draft = { ...filters(), priority: 'important', entityType: 'tasks' };
  assert.deepEqual(helpers.applyAnalyticsPeriod(draft, 'month', '0001-02-03'), { ...draft, from: '0001-02-01', to: '0001-02-03' });
  assert.deepEqual(helpers.applyAnalyticsPeriod(draft, 'year', '2026-10-26'), { ...draft, from: '2026-01-01', to: '2026-10-26' });
  assert.deepEqual(helpers.applyAnalyticsPeriod(draft, 'all', '2026-10-26'), { ...draft, from: '', to: '' });
});

test('task analytics exclude instruction-only status options and executor filtering', () => {
  assert.equal(helpers.isAnalyticsStatusAvailable('tasks', 'pending'), false);
  assert.equal(helpers.isAnalyticsStatusAvailable('tasks', 'in_progress'), false);
  assert.equal(helpers.isAnalyticsStatusAvailable('tasks', 'completed'), true);
  assert.equal(helpers.isAnalyticsStatusAvailable('instructions', 'pending'), true);
  assert.equal(helpers.supportsInstructionFilters('tasks'), false);
  assert.equal(helpers.supportsTaskFilters('instructions'), false);
  assert.equal(helpers.supportsTaskFilters(''), true);
  assert.equal(helpers.supportsInstructionFilters(''), true);
});

test('task priority charts appear only when the analytics selection can contain tasks', () => {
  assert.equal(helpers.showTaskPriorityBreakdown({ entityType: '', executor: '' }), true);
  assert.equal(helpers.showTaskPriorityBreakdown({ entityType: 'tasks', executor: '' }), true);
  assert.equal(helpers.showTaskPriorityBreakdown({ entityType: 'instructions', executor: '' }), false);
  assert.equal(helpers.showTaskPriorityBreakdown({ entityType: '', executor: 'Иванов' }), false);
});
