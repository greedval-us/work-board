import { defineStore } from 'pinia';
import { computed, onScopeDispose, reactive, shallowRef, watch } from 'vue';
import { localDate } from '../../shared/registry.js';
import { emptyAnalyticsFilters, normalizeAnalyticsFilters } from '../../shared/analytics.js';
import { analyticsService } from '../services/AnalyticsService.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { createRequestScope, createSingleFlight } from '../infrastructure/requestScope.js';
import { useAppStore } from './appStore.js';
import { initialAnalyticsFilters } from '../domain/analytics.js';

export function createAnalyticsStore({ getApp = useAppStore, service = analyticsService, initialDate = localDate } = {}) {
  return defineStore('analytics', () => {
    const app = getApp();
    const initial = initialAnalyticsFilters(initialDate());
    const draftFilters = reactive({ ...initial }); const appliedFilters = shallowRef({ ...initial });
    const data = shallowRef(null); const loading = shallowRef(false); const error = shallowRef(''); const filterError = shallowRef('');
    const ready = computed(() => Boolean(app.database?.ready));
    const filtersChanged = computed(() => JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters.value));
    const scope = createRequestScope(); const flight = createSingleFlight();
    let loadedKey; let currentTicket; let consumers = 0;
    const keyFor = () => JSON.stringify([app.database?.generation, app.revision, appliedFilters.value]);
    async function refresh({ force = false } = {}) {
      if (!ready.value) { scope.invalidate(); data.value = null; loading.value = false; return Promise.resolve(false); }
      const key = keyFor();
      const ticket = scope.issue(key); currentTicket = ticket;
      if (!force && loadedKey === key && data.value) { loading.value = false; return true; }
      const request = { filters: { ...appliedFilters.value }, generation: app.database.generation };
      const current = () => ticket.isCurrent() && ready.value && keyFor() === key;
      const accepts = () => currentTicket?.key === key && currentTicket.isCurrent() && ready.value && keyFor() === key;
      loading.value = true; error.value = ''; data.value = null;
      try {
        const result = await flight.run(key, async () => {
          if (!accepts()) return null;
          const result = await service.summary(request);
          if (accepts()) { data.value = result; loadedKey = key; }
          return result;
        });
        return Boolean(result && accepts());
      } catch (cause) { if (current()) error.value = errorMessage(cause, 'Не удалось загрузить аналитику.'); return false; }
      finally { if (current()) loading.value = false; }
    }
    function applyFilters() {
      try {
        const filters = normalizeAnalyticsFilters(draftFilters); filterError.value = '';
        Object.assign(draftFilters, filters); appliedFilters.value = filters;
        return refresh();
      } catch (cause) { filterError.value = errorMessage(cause); return Promise.resolve(false); }
    }
    function resetFilters() { Object.assign(draftFilters, emptyAnalyticsFilters()); return applyFilters(); }
    function acquire() { consumers++; void refresh(); let released = false; return () => { if (!released) { consumers--; released = true; } }; }
    watch([() => app.database?.generation, () => app.database?.ready, () => app.revision], () => {
      scope.invalidate(); flight.clear(); loadedKey = undefined; data.value = null; error.value = ''; loading.value = false;
      if (consumers > 0) void refresh();
    }, { flush: 'sync' });
    onScopeDispose(() => { scope.dispose(); flight.clear(); });
    return { draftFilters, appliedFilters, data, loading, error, filterError, ready, filtersChanged, refresh, applyFilters, resetFilters, acquire };
  });
}
export const useAnalyticsStore = createAnalyticsStore();
