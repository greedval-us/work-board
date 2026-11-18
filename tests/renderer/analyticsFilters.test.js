import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANALYTICS_PERIODS, analyticsExecutorOptions, applyAnalyticsPeriod, initialAnalyticsFilters } from '../../src/renderer/domain/analytics.js';

test('analytics opens with the current month and instruction filters', () => {
  assert.deepEqual(initialAnalyticsFilters('2026-10-26'), {
    from: '2026-10-01', to: '2026-10-26', executor: '',
  });
});

test('analytics presets use the supplied local day and preserve the executor', () => {
  const draft = { from: '2026-01-01', to: '2026-10-26', executor: 'Иванов' };
  assert.deepEqual(applyAnalyticsPeriod(draft, 'month', '0001-02-03'), { ...draft, from: '0001-02-01', to: '0001-02-03' });
  assert.deepEqual(applyAnalyticsPeriod(draft, 'year', '2026-10-26'), { ...draft, from: '2026-01-01', to: '2026-10-26' });
  assert.deepEqual(applyAnalyticsPeriod(draft, 'all', '2026-10-26'), { ...draft, from: '', to: '' });
});

test('this week runs from the same weekday last week through today', () => {
  const draft = { from: '2025-12-01', to: '2025-12-31', executor: 'Иванов' };
  for (const [today, from] of [
    ['2026-01-05', '2025-12-29'],
    ['2026-11-20', '2026-11-13'],
    ['0001-01-04', '0001-01-01'],
  ]) {
    assert.deepEqual(applyAnalyticsPeriod(draft, ANALYTICS_PERIODS.WEEK, today), { ...draft, from, to: today });
  }
});

test('executor options include configured and historical names without duplicating the same key', () => {
  const recorded = [{ key: 'иванов', label: 'иванов' }, { key: 'архипов', label: 'Архипов' }];
  assert.deepEqual(analyticsExecutorOptions(recorded, ['Сидоров', 'Иванов'], 'петров'), [
    { key: 'архипов', label: 'Архипов' }, { key: 'иванов', label: 'Иванов' },
    { key: 'петров', label: 'петров' }, { key: 'сидоров', label: 'Сидоров' },
  ]);
});
