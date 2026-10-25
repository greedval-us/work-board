import { localDate } from '../../shared/dates.js';
import { normalizeAnalyticsFilters } from '../../shared/analytics.js';
import { AnalyticsSummary } from '../domain/AnalyticsSummary.js';

export class AnalyticsService {
  constructor({ repository, today = localDate }) {
    this.repository = repository;
    this.today = today;
  }
  summary(request = {}) {
    const filters = normalizeAnalyticsFilters(request.filters);
    const asOf = this.today();
    const summary = new AnalyticsSummary();
    for (const group of this.repository.groups(filters, asOf)) summary.add(group);
    return { filters, asOf, ...summary.toResult() };
  }
}
