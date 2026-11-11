import { INSTRUCTION_STATUS } from '../../shared/constants/registry.js';

const PERCENT_SCALE = 100;

// A value accumulator: it owns calculation state and has no database or UI access.
export class AnalyticsSummary {
  #totals = { total: 0, completed: 0, pending: 0, inProgress: 0, overdue: 0 };
  #executors = new Map();
  #timeline = new Map();

  add(group) {
    const completed = group.status === INSTRUCTION_STATUS.COMPLETED ? group.total : 0;
    this.#totals.total += group.total;
    this.#totals.completed += completed;
    this.#totals.overdue += group.overdue;
    if (group.status === INSTRUCTION_STATUS.PENDING) this.#totals.pending += group.total;
    if (group.status === INSTRUCTION_STATUS.IN_PROGRESS) this.#totals.inProgress += group.total;
    if (!this.#timeline.has(group.month)) this.#timeline.set(group.month, { month: group.month, total: 0, completed: 0, active: 0 });
    this.#addCounts(this.#timeline.get(group.month), group.total, completed);

    const { executorKey: key, executorLabel: label } = group;
    // The repository orders groups by first instruction ID, preserving the earliest matching spelling.
    if (!this.#executors.has(key)) this.#executors.set(key, { key, label, total: 0, completed: 0, active: 0, overdue: 0 });
    const executor = this.#executors.get(key);
    this.#addCounts(executor, group.total, completed);
    executor.overdue += group.overdue;
  }

  #addCounts(target, total, completed) {
    target.total += total;
    target.completed += completed;
    target.active += total - completed;
  }

  toResult() {
    const { total, completed } = this.#totals;
    return {
      totals: { ...this.#totals, active: total - completed, completionRate: total ? Math.round(completed / total * PERCENT_SCALE) : 0 },
      executors: [...this.#executors.values()]
        .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, 'ru-RU'))
        .map(row => ({ ...row })),
      timeline: [...this.#timeline.values()].sort((left, right) => left.month.localeCompare(right.month)).map(row => ({ ...row })),
    };
  }
}
