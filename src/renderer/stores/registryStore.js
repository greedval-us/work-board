import { defineStore } from 'pinia';
import { computed, onScopeDispose, reactive, shallowRef, watch } from 'vue';
import { emptyFilters, INSTRUCTION_COLUMNS, REGISTRY_DEFAULT_SORT, REGISTRY_PAGINATION } from '../../shared/registry.js';
import { DesktopError } from '../../shared/errors.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { createRequestScope, createSingleFlight } from '../infrastructure/requestScope.js';
import { registryService } from '../services/RegistryService.js';
import { useAppStore } from './appStore.js';
import { snapshotInstruction } from '../domain/instructions.js';

// The factory supplies boundary dependencies in tests; each Pinia owns one registry.
export function createRegistryStore({ app: suppliedApp, service = registryService } = {}) {
  return defineStore('registry', () => {
    const app = suppliedApp ?? useAppStore();
    const draftFilters = reactive(emptyFilters());
    const appliedFilters = shallowRef(emptyFilters());
    const sort = shallowRef({ ...REGISTRY_DEFAULT_SORT });
    const page = shallowRef(REGISTRY_PAGINATION.DEFAULT_PAGE);
    const pageSize = shallowRef(REGISTRY_PAGINATION.DEFAULT_SIZE);
    const items = shallowRef([]);
    const total = shallowRef(0);
    const loading = shallowRef(false);
    const opening = shallowRef(false);
    const saving = shallowRef(false);
    const deleting = shallowRef(false);
    const exporting = shallowRef(false);
    const error = shallowRef('');
    const filterError = shallowRef('');
    const mutationError = shallowRef('');
    const notice = shallowRef('');
    const ready = computed(() => Boolean(app.database?.ready));
    const pageCount = computed(() => Math.max(REGISTRY_PAGINATION.DEFAULT_PAGE, Math.ceil(total.value / pageSize.value)));
    const busy = computed(() => saving.value || deleting.value);
    const canMutate = computed(() => ready.value && !app.databaseSwitching && !busy.value);
    const hasAppliedFilters = computed(() => Object.values(appliedFilters.value).some(Boolean));
    const filtersChanged = computed(() => Object.keys(draftFilters).some((key) => draftFilters[key] !== appliedFilters.value[key]));
    const listScope = createRequestScope();
    const recordScope = createRequestScope();
    const listFlights = createSingleFlight();
    const recordFlights = createSingleFlight();
    let listKey = null;
    let recordKey = null;
    let loadedKey = null;
    let refreshQueued = false;
    let active = true;

    const currentGeneration = () => app.database?.generation;
    const isCurrent = (generation) => active && ready.value && generation === currentGeneration();
    function snapshot() {
      const request = { filters: { ...appliedFilters.value }, sort: { ...sort.value }, offset: (page.value - REGISTRY_PAGINATION.DEFAULT_PAGE) * pageSize.value, limit: pageSize.value, generation: currentGeneration() };
      return { request, revision: app.revision, key: JSON.stringify([request, app.revision]) };
    }

    function refresh() {
      if (!ready.value) { listScope.invalidate(); listFlights.clear(); items.value = []; total.value = 0; loading.value = false; return Promise.resolve(false); }
      const { request, revision, key } = snapshot();
      if (listKey !== key) { listFlights.clear(); listKey = key; }
      return listFlights.run(key, async () => {
        if (listKey !== key || !isCurrent(request.generation) || app.revision !== revision) return false;
        const token = listScope.issue(key);
        const current = () => listKey === key && token.isCurrent() && isCurrent(request.generation) && app.revision === revision;
        loading.value = true;
        error.value = '';
        try {
          const result = await service.list(request);
          if (!current()) return false;
          items.value = result.items;
          total.value = result.total;
          loadedKey = key;
          if (page.value > pageCount.value) { page.value = pageCount.value; return refresh(); }
          return true;
        } catch (cause) {
          if (current()) error.value = errorMessage(cause, 'Не удалось загрузить реестр. Повторите попытку.');
          return false;
        } finally { if (current()) loading.value = false; }
      });
    }

    function ensureLoaded() {
      if (ready.value && !error.value && loadedKey === snapshot().key) return Promise.resolve(true);
      return refresh();
    }

    function queueRefresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => { refreshQueued = false; if (active) refresh(); });
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

    function resetFilters() { Object.assign(draftFilters, emptyFilters()); return applyFilters(); }
    function changeSort(field) {
      if (!INSTRUCTION_COLUMNS.some((column) => column.key === field)) return false;
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

    function cancelRecordRead() { recordScope.invalidate(); recordFlights.clear(); recordKey = null; opening.value = false; }
    function clearMutationError() { mutationError.value = ''; }
    function getRecord(id, generation = currentGeneration()) {
      if (!isCurrent(generation) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return Promise.resolve(null);
      const revision = app.revision;
      const key = JSON.stringify([Number(id), generation, revision]);
      if (recordKey !== key) { recordFlights.clear(); recordKey = key; }
      return recordFlights.run(key, async () => {
        if (recordKey !== key || !isCurrent(generation) || app.revision !== revision) return null;
        const token = recordScope.issue(key);
        const current = () => recordKey === key && token.isCurrent() && isCurrent(generation) && app.revision === revision;
        opening.value = true;
        error.value = '';
        try {
          const record = await service.get({ id: Number(id), generation });
          if (!current()) return null;
          if (!record) throw new DesktopError('NOT_FOUND', 'Указание не найдено. Возможно, оно было удалено.');
          return record;
        } catch (cause) { if (current()) error.value = errorMessage(cause, 'Не удалось открыть указание.'); return null; }
        finally { if (current()) opening.value = false; }
      });
    }

    async function saveRecord({ id = null, data: values, generation }) {
      if (!canMutate.value || !isCurrent(generation)) return false;
      const data = snapshotInstruction(values);
      saving.value = true;
      mutationError.value = '';
      try {
        await app.withOperation(() => id ? service.update({ id, data, generation }) : service.create({ data, generation }));
        if (!isCurrent(generation)) return false;
        app.touchData();
        notice.value = id ? 'Изменения сохранены.' : 'Указание добавлено.';
        return true;
      } catch (cause) { if (isCurrent(generation)) mutationError.value = errorMessage(cause, 'Не удалось сохранить указание. Введённые данные сохранены в форме.'); return false; }
      finally { saving.value = false; }
    }

    async function removeRecord({ id, generation }) {
      if (!canMutate.value || !id || !isCurrent(generation)) return false;
      deleting.value = true;
      mutationError.value = '';
      try {
        await app.withOperation(() => service.remove({ id, generation }));
        if (!isCurrent(generation)) return false;
        app.touchData();
        notice.value = 'Указание удалено.';
        return true;
      } catch (cause) { if (isCurrent(generation)) mutationError.value = errorMessage(cause, 'Не удалось удалить указание.'); return false; }
      finally { deleting.value = false; }
    }

    async function exportRecords() {
      if (!ready.value || exporting.value || app.databaseSwitching) return false;
      const request = { filters: { ...appliedFilters.value }, sort: { ...sort.value }, generation: currentGeneration() };
      exporting.value = true;
      error.value = '';
      notice.value = '';
      try {
        const result = await app.withOperation(() => service.export(request));
        if (!isCurrent(request.generation)) return false;
        notice.value = result.cancelled ? 'Выгрузка отменена.' : `Выгружено записей: ${result.count}.`;
        return !result.cancelled;
      } catch (cause) { if (isCurrent(request.generation)) error.value = errorMessage(cause, 'Не удалось выгрузить реестр.'); return false; }
      finally { exporting.value = false; }
    }

    watch([() => app.database?.generation, () => app.database?.ready, () => app.revision], (value, previous) => {
      listScope.invalidate(); listFlights.clear(); loadedKey = null; listKey = null;
      cancelRecordRead();
      const initial = !previous?.length;
      if (initial || value[0] !== previous[0] || value[1] !== previous[1]) {
        items.value = []; total.value = 0; page.value = REGISTRY_PAGINATION.DEFAULT_PAGE; notice.value = ''; error.value = ''; mutationError.value = '';
      }
      if (initial) refresh(); else queueRefresh();
    }, { immediate: true, flush: 'sync' });
    onScopeDispose(() => { active = false; listScope.dispose(); recordScope.dispose(); listFlights.clear(); recordFlights.clear(); });

    return { draftFilters, appliedFilters, sort, page, pageSize, pageCount, items, total, loading, opening, saving, deleting, exporting,
      error, filterError, mutationError, notice, ready, busy, canMutate, hasAppliedFilters, filtersChanged, refresh, ensureLoaded,
      applyFilters, resetFilters, changeSort, setPage, setPageSize, getRecord, cancelRecordRead, clearMutationError, saveRecord, removeRecord, exportRecords };
  });
}

export const useRegistryStore = createRegistryStore();
