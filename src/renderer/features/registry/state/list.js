import { computed, reactive, shallowRef } from 'vue';
import { emptyFilters, INSTRUCTION_COLUMNS, localDate, REGISTRY_DEFAULT_SORT, REGISTRY_PAGINATION } from '../../../../shared/registry.js';
import { errorMessage } from '../../../infrastructure/errorMessage.js';
import { createRegistryRead } from './read.js';

export function createRegistryList({ app, service, now, closed, ready, error }) {
  const draftFilters = reactive(emptyFilters());
  const appliedFilters = shallowRef(emptyFilters());
  const today = shallowRef(localDate(now()));
  const sort = shallowRef({ ...REGISTRY_DEFAULT_SORT });
  const page = shallowRef(REGISTRY_PAGINATION.DEFAULT_PAGE);
  const pageSize = shallowRef(REGISTRY_PAGINATION.DEFAULT_SIZE);
  const items = shallowRef([]);
  const documentTypes = shallowRef([]);
  const total = shallowRef(0);
  const loading = shallowRef(false);
  const filterError = shallowRef('');
  const pageCount = computed(() => Math.max(REGISTRY_PAGINATION.DEFAULT_PAGE, Math.ceil(total.value / pageSize.value)));
  const hasAppliedFilters = computed(() => Object.values(appliedFilters.value).some(Boolean));
  const filtersChanged = computed(() => Object.keys(draftFilters).some(key => draftFilters[key] !== appliedFilters.value[key]));
  const requests = createRegistryRead(false);
  let loadedKey = null;

  function query() {
    const filters = { ...appliedFilters.value };
    const request = { filters, sort: { ...sort.value }, generation: app.database?.generation };
    if (closed) request.closed = true;
    if (filters.checkpoint) request.today = today.value;
    return request;
  }

  function snapshot() {
    const offset = (page.value - REGISTRY_PAGINATION.DEFAULT_PAGE) * pageSize.value;
    const request = { ...query(), offset, limit: pageSize.value };
    return { request, key: JSON.stringify([request, app.revision]) };
  }

  function invalidateList() {
    requests.invalidate();
    loadedKey = null;
  }

  function resetList() {
    items.value = [];
    documentTypes.value = [];
    total.value = 0;
    page.value = REGISTRY_PAGINATION.DEFAULT_PAGE;
  }

  function syncToday() {
    const date = localDate(now());
    if (date === today.value) return false;
    today.value = date;
    if (!appliedFilters.value.checkpoint) return false;
    page.value = REGISTRY_PAGINATION.DEFAULT_PAGE;
    invalidateList();
    return true;
  }

  function load() {
    if (!ready.value) {
      invalidateList();
      resetList();
      loading.value = false;
      return Promise.resolve(false);
    }
    const { request, key } = snapshot();
    return requests.run(key, async isCurrent => {
      loading.value = true;
      error.value = '';
      try {
        const result = await service.list(request);
        if (!isCurrent()) return false;
        items.value = result.items;
        documentTypes.value = result.documentTypes ?? [];
        total.value = result.total;
        loadedKey = key;
        if (page.value > pageCount.value) {
          page.value = pageCount.value;
          return refresh();
        }
        return true;
      } catch (cause) {
        if (isCurrent()) {
          loadedKey = null;
          error.value = errorMessage(cause, 'Не удалось загрузить реестр. Повторите попытку.');
        }
        return false;
      } finally {
        if (isCurrent()) loading.value = false;
      }
    });
  }

  function refresh() {
    syncToday();
    return load();
  }

  function updateToday() {
    return syncToday() ? load() : Promise.resolve(false);
  }

  function ensureLoaded() {
    syncToday();
    if (ready.value && !error.value && loadedKey === snapshot().key) return Promise.resolve(true);
    return load();
  }

  function applyFilters() {
    if (draftFilters.deadlineFrom && draftFilters.deadlineTo && draftFilters.deadlineFrom > draftFilters.deadlineTo) {
      filterError.value = 'Дата «с» не может быть позже даты «по».';
      return false;
    }
    filterError.value = '';
    appliedFilters.value = Object.fromEntries(Object.entries(draftFilters).map(([key, value]) => [key, value.trim()]));
    Object.assign(draftFilters, appliedFilters.value);
    page.value = REGISTRY_PAGINATION.DEFAULT_PAGE;
    return refresh();
  }

  function resetFilters() {
    Object.assign(draftFilters, emptyFilters());
    return applyFilters();
  }

  function changeSort(field) {
    if (!INSTRUCTION_COLUMNS.some(column => column.key === field)) return false;
    sort.value = { field, direction: sort.value.field === field && sort.value.direction === 'asc' ? 'desc' : 'asc' };
    page.value = REGISTRY_PAGINATION.DEFAULT_PAGE;
    return refresh();
  }

  function setPage(value) {
    const next = Math.max(REGISTRY_PAGINATION.DEFAULT_PAGE, Math.min(pageCount.value, Math.trunc(Number(value)) || REGISTRY_PAGINATION.DEFAULT_PAGE));
    if (page.value === next) return false;
    page.value = next;
    return refresh();
  }

  function setPageSize(value) {
    if (!REGISTRY_PAGINATION.SIZES.includes(Number(value))) return false;
    pageSize.value = Number(value);
    page.value = REGISTRY_PAGINATION.DEFAULT_PAGE;
    return refresh();
  }

  return {
    query, invalidateList, resetList,
    draftFilters, appliedFilters, today, sort, page, pageSize, pageCount, items, documentTypes, total, loading,
    filterError, hasAppliedFilters, filtersChanged, refresh, ensureLoaded, updateToday, applyFilters, resetFilters,
    changeSort, setPage, setPageSize,
  };
}
