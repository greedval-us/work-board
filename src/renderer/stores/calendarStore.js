import { defineStore } from 'pinia';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { DesktopError } from '../../shared/errors.js';
import { localDate } from '../../shared/registry.js';
import { moveMonth } from '../domain/calendarDates.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { createRequestChannel } from '../infrastructure/requestScope.js';
import { calendarService } from '../services/CalendarService.js';
import { useAppStore } from './appStore.js';

export function createCalendarStore({ id = 'calendar', getApp = useAppStore, service = calendarService, initialDate = localDate } = {}) {
  return defineStore(id, () => {
    const app = getApp();
    const date = initialDate();
    const month = shallowRef(date.slice(0, 7));
    const selectedDate = shallowRef(date);
    const monthDays = shallowRef([]);
    const instructions = shallowRef([]);
    const tasks = shallowRef([]);
    const checkpoints = shallowRef([]);
    const taskError = shallowRef('');
    const busyTaskId = shallowRef(null);
    const ready = computed(() => Boolean(app.database?.ready));
    const generation = computed(() => app.database?.generation);
    let consumers = 0;

    const keyFor = (value) => JSON.stringify([generation.value, app.revision, value]);
    function setDay(value = {}) {
      instructions.value = value.instructions ?? [];
      tasks.value = value.tasks ?? [];
      checkpoints.value = value.checkpoints ?? [];
    }

    // Month and day share cache/request rules, but only day clears on loading.
    function createCalendarRead(selection, { read, apply, clear, clearOnLoad = false, fallback }) {
      const requests = createRequestChannel();
      const loading = shallowRef(false);
      const error = shallowRef('');
      let last;
      async function fetch({ force = false } = {}) {
        const selected = selection.value;
        const key = keyFor(selected);
        const ticket = requests.issue(key);
        const source = generation.value;
        error.value = '';
        if (!ready.value) { clear(); loading.value = false; return; }
        if (!force && last?.key === key) {
          apply(last.value);
          loading.value = false;
          return last.value;
        }
        if (clearOnLoad) clear();
        loading.value = true;
        const matchesSelection = () => ready.value && key === keyFor(selection.value);
        const current = () => ticket.isCurrent() && matchesSelection();
        try {
          return await requests.run(key, async () => {
            const value = await read(selected, source);
            // Publish before the pending entry is released, including when a
            // newer caller returned to this same still-pending selection.
            if (requests.accepts(key) && matchesSelection()) { last = { key, value }; apply(value); }
            return value;
          });
        } catch (cause) {
          if (current()) error.value = errorMessage(cause, fallback);
        } finally { if (current()) loading.value = false; }
      }
      function invalidate() {
        requests.invalidate();
        last = undefined;
        clear();
        loading.value = false;
        error.value = '';
      }
      onScopeDispose(() => requests.dispose());
      return { fetch, invalidate, loading, error };
    }

    const monthRead = createCalendarRead(month, {
      read: (value, source) => service.month({ month: value, generation: source }),
      apply: value => { monthDays.value = value.days; },
      clear: () => { monthDays.value = []; },
      fallback: 'Не удалось загрузить календарь.',
    });
    const dayRead = createCalendarRead(selectedDate, {
      read: (value, source) => service.day({ date: value, generation: source }),
      apply: setDay, clear: () => setDay(), clearOnLoad: true,
      fallback: 'Не удалось загрузить выбранный день.',
    });
    const { fetch: fetchMonth, loading: monthLoading, error: monthError } = monthRead;
    const { fetch: fetchDay, loading: dayLoading, error: dayError } = dayRead;

    function refresh() { return Promise.all([fetchMonth(), fetchDay()]); }

    function acquire() {
      consumers += 1;
      void refresh();
      let released = false;
      return () => { if (!released) { consumers -= 1; released = true; } };
    }

    function invalidate(databaseChanged) {
      monthRead.invalidate();
      dayRead.invalidate();
      if (databaseChanged) { taskError.value = ''; busyTaskId.value = null; }
      if (consumers > 0) void refresh();
    }

    function assertGeneration(source) {
      if (!ready.value || source !== generation.value) {
        throw new DesktopError('DATABASE_CHANGED', 'База данных изменилась. Откройте задачу заново.');
      }
    }

    async function mutate(source, operation) {
      assertGeneration(source);
      return app.withOperation(async () => {
        assertGeneration(source);
        const result = await operation();
        assertGeneration(source);
        app.touchData();
        return result;
      });
    }

    function saveTask(id, data, source = generation.value) {
      return mutate(source, () => id == null
        ? service.createTask({ data, generation: source })
        : service.updateTask({ id, data, generation: source }));
    }

    function removeTask(id, source = generation.value) {
      return mutate(source, () => service.removeTask({ id, generation: source }));
    }

    async function toggleTask(task) {
      if (busyTaskId.value !== null) return;
      const source = generation.value;
      busyTaskId.value = task.id;
      taskError.value = '';
      try {
        await saveTask(task.id, {
          title: task.title, date: task.date, description: task.description,
          priority: task.priority, completed: !task.completed,
        }, source);
      } catch (cause) {
        if (source === generation.value) taskError.value = errorMessage(cause, 'Не удалось изменить задачу.');
      } finally { if (source === generation.value) busyTaskId.value = null; }
    }

    function selectDate(value) { selectedDate.value = value; month.value = value.slice(0, 7); }
    function changeMonth(delta) { month.value = moveMonth(month.value, delta); selectedDate.value = `${month.value}-01`; }

    watch([() => app.database?.ready, () => app.database?.generation, () => app.revision], (value, previous) => {
      invalidate(value[0] !== previous[0] || value[1] !== previous[1]);
    }, { flush: 'sync' });
    watch(month, () => { if (consumers > 0) void fetchMonth(); });
    watch(selectedDate, () => { if (consumers > 0) void fetchDay(); });

    return {
      month, selectedDate, monthDays, instructions, tasks, checkpoints, ready, generation,
      monthLoading, dayLoading, monthError, dayError, taskError, busyTaskId,
      acquire, fetchMonth, fetchDay, refresh, selectDate, changeMonth, saveTask, removeTask, toggleTask,
    };
  });
}

export const useCalendarStore = createCalendarStore();
