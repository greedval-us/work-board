const PERCENT_SCALE = 100;

// A value accumulator: it owns calculation state and has no database or UI access.
export class AnalyticsSummary {
  #totals = { total: 0, closed: 0, active: 0, overdue: 0 };
  #executors = new Map();
  #timeline = new Map();

  add(group) {
    this.#addCounts(this.#totals, group);
    this.#totals.overdue += group.overdue;
    if (!this.#timeline.has(group.month)) this.#timeline.set(group.month, { month: group.month, total: 0, closed: 0, active: 0 });
    this.#addCounts(this.#timeline.get(group.month), group);

    const { executorKey: key, executorLabel: label } = group;
    // Controls arrive in instruction ID order, preserving the earliest matching spelling.
    if (!this.#executors.has(key)) this.#executors.set(key, { key, label, total: 0, closed: 0, active: 0, overdue: 0 });
    const executor = this.#executors.get(key);
    this.#addCounts(executor, group);
    executor.overdue += group.overdue;
  }

  #addCounts(target, { total, closed }) {
    target.total += total;
    target.closed += closed;
    target.active += total - closed;
  }

  toResult() {
    const { total, closed } = this.#totals;
    return {
      totals: { ...this.#totals, closedRate: total ? Math.round(closed / total * PERCENT_SCALE) : 0 },
      executors: [...this.#executors.values()]
        .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, 'ru-RU'))
        .map(row => ({ ...row })),
      timeline: [...this.#timeline.values()].sort((left, right) => left.month.localeCompare(right.month)).map(row => ({ ...row })),
    };
  }
}
