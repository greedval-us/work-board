import { daysInMonth, localDate } from '../../shared/dates.js';
import { normalizeAnalyticsFilters } from '../../shared/analytics.js';
import { ValidationError } from '../../shared/errors.js';
import { analyticsControls } from '../domain/analyticsControls.js';
import { AnalyticsSummary } from '../domain/AnalyticsSummary.js';

const INSTRUCTION_PAGE_SIZE = 25;

function controlPageWindow(timeline, start) {
  let skipped = 0;
  let firstMonth;
  let lastMonth;
  let offset;
  for (const { month, total } of timeline) {
    const endOfMonth = skipped + total;
    if (endOfMonth > start) {
      if (!firstMonth) { firstMonth = month; offset = start - skipped; }
      lastMonth = month;
      if (endOfMonth >= start + INSTRUCTION_PAGE_SIZE) break;
    }
    skipped = endOfMonth;
  }
  const [year, month] = lastMonth.split('-').map(Number);
  return { from: `${firstMonth}-01`, to: `${lastMonth}-${daysInMonth(year, month)}`, offset };
}

export class AnalyticsService {
  constructor({ repository, today = localDate, detailKey = 'instructions' }) {
    this.repository = repository;
    this.today = today;
    this.detailKey = detailKey;
  }
  summary(request = {}) {
    const filters = normalizeAnalyticsFilters(request.filters);
    const requestedPage = request.page === undefined ? 1 : request.page;
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new ValidationError('Некорректный номер страницы.');
    const asOf = this.today();
    const summary = new AnalyticsSummary();
    for (const { date, closed, executorKey, executorLabel } of analyticsControls(this.repository.records(filters), filters)) {
      summary.add({ month: date.slice(0, 7), executorKey, executorLabel, total: 1,
        closed: Number(closed), overdue: Number(!closed && date < asOf) });
    }
    const result = summary.toResult();
    const executorOptions = this.repository.executorOptions().sort((left, right) => left.label.localeCompare(right.label, 'ru-RU'));
    let details = null;
    if (filters.executor) {
      const pageCount = Math.max(1, Math.ceil(result.totals.total / INSTRUCTION_PAGE_SIZE));
      const page = Math.min(requestedPage, pageCount);
      const items = result.totals.total ? this.#page(filters, result.timeline, page) : [];
      details = { items, page, pageCount };
    }
    return { filters, asOf, ...result, executorOptions, [this.detailKey]: details };
  }

  #page(filters, timeline, page) {
    // Use the monthly totals to skip earlier dates before recreating and sorting detail rows.
    const { from, to, offset } = controlPageWindow(timeline, (page - 1) * INSTRUCTION_PAGE_SIZE);
    const range = { ...filters,
      from: filters.from > from ? filters.from : from,
      to: filters.to && filters.to < to ? filters.to : to };
    return [...analyticsControls(this.repository.records(range), range)]
      .sort((left, right) => left.date.localeCompare(right.date) || left.item.id - right.item.id
        || Number(Boolean(left.item.checkpointDate)) - Number(Boolean(right.item.checkpointDate)))
      .slice(offset, offset + INSTRUCTION_PAGE_SIZE).map(({ item }) => item);
  }
}
