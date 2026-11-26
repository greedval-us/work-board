import { normalizeSearch } from '../../../shared/registry.js';

export function groupPlans(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeSearch(row.instructionNumber);
    if (!groups.has(key)) groups.set(key, { key, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}
