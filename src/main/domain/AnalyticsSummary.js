import { ENTITY_TYPES } from '../../shared/constants/entities.js';
import { INSTRUCTION_STATUS, TASK_PRIORITIES } from '../../shared/constants/registry.js';

const PERCENT_SCALE = 100;
const countByKey = keys => new Map(keys.map(key => [key, { key, total: 0, completed: 0 }]));

// A value accumulator: it owns calculation state and has no database or UI access.
export class AnalyticsSummary {
  #totals = { total: 0, completed: 0, pending: 0, inProgress: 0, activeTasks: 0, overdue: 0 };
  #priorities = countByKey(Object.keys(TASK_PRIORITIES));
  #types = countByKey(Object.values(ENTITY_TYPES));
  #timeline = new Map();

  add(group) {
    const completed = group.status === INSTRUCTION_STATUS.COMPLETED ? group.total : 0;
    this.#totals.total += group.total;
    this.#totals.completed += completed;
    this.#totals.overdue += group.overdue;
    if (group.status === INSTRUCTION_STATUS.PENDING) this.#totals.pending += group.total;
    if (group.status === INSTRUCTION_STATUS.IN_PROGRESS) this.#totals.inProgress += group.total;
    if (group.kind === ENTITY_TYPES.TASKS && !completed) this.#totals.activeTasks += group.total;
    this.#addCounts(this.#types.get(group.kind), group.total, completed);
    if (group.kind === ENTITY_TYPES.TASKS) this.#addCounts(this.#priorities.get(group.priority), group.total, completed);
    if (!this.#timeline.has(group.month)) this.#timeline.set(group.month, { month: group.month, total: 0, completed: 0, active: 0 });
    const month = this.#timeline.get(group.month);
    this.#addCounts(month, group.total, completed);
    month.active += group.total - completed;
  }

  #addCounts(target, total, completed) {
    target.total += total;
    target.completed += completed;
  }

  toResult() {
    const { total, completed } = this.#totals;
    return {
      totals: { ...this.#totals, active: total - completed, completionRate: total ? Math.round(completed / total * PERCENT_SCALE) : 0 },
      priorities: [...this.#priorities.values()].map(row => ({ ...row })),
      types: [...this.#types.values()].map(row => ({ ...row })),
      timeline: [...this.#timeline.values()].sort((left, right) => left.month.localeCompare(right.month)).map(row => ({ ...row })),
    };
  }
}
