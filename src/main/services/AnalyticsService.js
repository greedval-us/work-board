import { localDate } from '../../shared/dates.js';
import { normalizeAnalyticsFilters } from '../../shared/analytics.js';
import { ValidationError } from '../../shared/errors.js';
import { AnalyticsSummary } from '../domain/AnalyticsSummary.js';

const INSTRUCTION_PAGE_SIZE = 25;

export class AnalyticsService {
  constructor({ repository, today = localDate }) {
    this.repository = repository;
    this.today = today;
  }
  summary(request = {}) {
    const filters = normalizeAnalyticsFilters(request.filters);
    const requestedPage = request.page === undefined ? 1 : request.page;
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new ValidationError('Некорректный номер страницы.');
    const asOf = this.today();
    const summary = new AnalyticsSummary();
    for (const group of this.repository.groups(filters, asOf)) summary.add(group);
    const result = summary.toResult();
    const executorOptions = this.repository.executorOptions().sort((left, right) => left.label.localeCompare(right.label, 'ru-RU'));
    let instructions = null;
    if (filters.executor) {
      const pageCount = Math.max(1, Math.ceil(result.totals.total / INSTRUCTION_PAGE_SIZE));
      const page = Math.min(requestedPage, pageCount);
      const items = this.repository.instructions(filters, { limit: INSTRUCTION_PAGE_SIZE, offset: (page - 1) * INSTRUCTION_PAGE_SIZE });
      instructions = { items, page, pageCount };
    }
    return { filters, asOf, ...result, executorOptions, instructions };
  }
}
