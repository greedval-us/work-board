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
    const executorOptions = shallowRef([]);
    const ready = computed(() => Boolean(app.database?.ready));
    const filtersChanged = computed(() => JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters.value));
    const scope = createRequestScope(); const flight = createSingleFlight();
    let loadedKey; let currentTicket; let consumers = 0;
    let page = 1;
    const keyFor = () => JSON.stringify([app.database?.generation, app.revision, appliedFilters.value, page]);
    async function refresh({ force = false, keepData = false } = {}) {
      if (!ready.value) { scope.invalidate(); data.value = null; loading.value = false; return Promise.resolve(false); }
      const key = keyFor();
      const ticket = scope.issue(key); currentTicket = ticket;
      error.value = '';
      if (!force && loadedKey === key && data.value) { loading.value = false; return true; }
      const request = { filters: { ...appliedFilters.value }, generation: app.database.generation, page };
      const current = () => ticket.isCurrent() && ready.value && keyFor() === key;
      const accepts = () => currentTicket?.key === key && currentTicket.isCurrent() && ready.value && keyFor() === key;
      loading.value = true;
      if (!keepData) data.value = null;
      try {
        const result = await flight.run(key, () => accepts() ? service.summary(request) : null);
        if (!result || !current()) return false;
        if (result.instructions) page = result.instructions.page;
        loadedKey = keyFor();
        executorOptions.value = result.executorOptions ?? executorOptions.value;
        data.value = result;
        return true;
      } catch (cause) { if (current()) error.value = errorMessage(cause, 'Не удалось загрузить аналитику.'); return false; }
      finally {
        // The accepted response can clamp the requested page and change the key.
        if (ticket.isCurrent()) loading.value = false;
      }
    }
    function applyFilters() {
      try {
        const filters = normalizeAnalyticsFilters(draftFilters); filterError.value = '';
        Object.assign(draftFilters, filters); appliedFilters.value = filters;
        page = 1;
        return refresh();
      } catch (cause) { filterError.value = errorMessage(cause); return Promise.resolve(false); }
    }
    function resetFilters() { Object.assign(draftFilters, emptyAnalyticsFilters()); return applyFilters(); }
    function selectExecutor(key) {
      if (typeof key !== 'string') return Promise.resolve(false);
      draftFilters.executor = key;
      appliedFilters.value = { ...appliedFilters.value, executor: key };
      page = 1;
      return refresh();
    }
    function setPage(value) {
      if (!appliedFilters.value.executor || !Number.isSafeInteger(value) || value < 1) return Promise.resolve(false);
      page = value;
      return refresh({ keepData: true });
    }
    function acquire() { consumers++; void refresh(); let released = false; return () => { if (!released) { consumers--; released = true; } }; }
    watch([() => app.database?.generation, () => app.database?.ready, () => app.revision], ([generation, databaseReady], [previousGeneration, previousReady]) => {
      scope.invalidate(); flight.clear(); loadedKey = undefined; data.value = null; error.value = ''; loading.value = false;
      if (generation !== previousGeneration || databaseReady !== previousReady) {
        draftFilters.executor = '';
        appliedFilters.value = { ...appliedFilters.value, executor: '' };
        page = 1;
        executorOptions.value = [];
      }
      if (consumers > 0) void refresh();
    }, { flush: 'sync' });
    onScopeDispose(() => { scope.dispose(); flight.clear(); });
    return {
      draftFilters, appliedFilters, data, executorOptions, loading, error, filterError, ready, filtersChanged,
      refresh, applyFilters, resetFilters, selectExecutor, setPage, acquire,
    };
  });
}
export const useAnalyticsStore = createAnalyticsStore();
