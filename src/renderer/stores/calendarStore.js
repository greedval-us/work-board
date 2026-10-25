import { defineStore } from 'pinia';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { DesktopError } from '../../shared/errors.js';
import { localDate } from '../../shared/registry.js';
import { moveMonth } from '../domain/calendarDates.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { createRequestScope, createSingleFlight } from '../infrastructure/requestScope.js';
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
    const monthLoading = shallowRef(false);
    const dayLoading = shallowRef(false);
    const monthError = shallowRef('');
    const dayError = shallowRef('');
    const taskError = shallowRef('');
    const busyTaskId = shallowRef(null);
    const ready = computed(() => Boolean(app.database?.ready));
    const generation = computed(() => app.database?.generation);
    const monthScope = createRequestScope();
    const dayScope = createRequestScope();
    const monthFlight = createSingleFlight();
    const dayFlight = createSingleFlight();
    let lastMonth;
    let lastDay;
    let currentMonthTicket;
    let currentDayTicket;
    let consumers = 0;

    const keyFor = (value) => JSON.stringify([generation.value, app.revision, value]);
    const isCurrentRead = (ticket, key, value) => ticket?.key === key && ticket.isCurrent() && ready.value && key === keyFor(value);

    async function fetchMonth({ force = false } = {}) {
      const requestedMonth = month.value;
      const key = keyFor(requestedMonth);
      const ticket = monthScope.issue(key);
      currentMonthTicket = ticket;
      const source = generation.value;
      monthError.value = '';
      if (!ready.value) { monthDays.value = []; monthLoading.value = false; return; }
      if (!force && lastMonth?.key === key) {
        monthDays.value = lastMonth.value.days;
        monthLoading.value = false;
        return lastMonth.value;
      }
      monthLoading.value = true;
      const current = () => isCurrentRead(ticket, key, month.value);
      const accepts = () => isCurrentRead(currentMonthTicket, key, month.value);
      try {
        // Publish the snapshot before singleFlight releases its pending entry.
        const result = await monthFlight.run(key, async () => {
          const value = await service.month({ month: requestedMonth, generation: source });
          if (accepts()) { lastMonth = { key, value }; monthDays.value = value.days; }
          return value;
        });
        return result;
      } catch (cause) {
        if (current()) monthError.value = errorMessage(cause, 'Не удалось загрузить календарь.');
      } finally { if (current()) monthLoading.value = false; }
    }

    async function fetchDay({ force = false } = {}) {
      const requestedDate = selectedDate.value;
      const key = keyFor(requestedDate);
      const ticket = dayScope.issue(key);
      currentDayTicket = ticket;
      const source = generation.value;
      dayError.value = '';
      if (!ready.value) { instructions.value = []; tasks.value = []; dayLoading.value = false; return; }
      if (!force && lastDay?.key === key) {
        instructions.value = lastDay.value.instructions;
        tasks.value = lastDay.value.tasks;
        dayLoading.value = false;
        return lastDay.value;
      }
      instructions.value = [];
      tasks.value = [];
      dayLoading.value = true;
      const current = () => isCurrentRead(ticket, key, selectedDate.value);
      const accepts = () => isCurrentRead(currentDayTicket, key, selectedDate.value);
      try {
        const result = await dayFlight.run(key, async () => {
          const value = await service.day({ date: requestedDate, generation: source });
          if (accepts()) { lastDay = { key, value }; instructions.value = value.instructions; tasks.value = value.tasks; }
          return value;
        });
        return result;
      } catch (cause) {
        if (current()) dayError.value = errorMessage(cause, 'Не удалось загрузить выбранный день.');
      } finally { if (current()) dayLoading.value = false; }
    }

    function refresh() { return Promise.all([fetchMonth(), fetchDay()]); }

    function acquire() {
      consumers += 1;
      void refresh();
      let released = false;
      return () => { if (!released) { consumers -= 1; released = true; } };
    }

    function invalidate(databaseChanged) {
      monthScope.invalidate();
      dayScope.invalidate();
      monthFlight.clear();
      dayFlight.clear();
      lastMonth = undefined;
      lastDay = undefined;
      monthDays.value = [];
      instructions.value = [];
      tasks.value = [];
      monthLoading.value = false;
      dayLoading.value = false;
      monthError.value = '';
      dayError.value = '';
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
    onScopeDispose(() => {
      monthScope.dispose();
      dayScope.dispose();
      monthFlight.clear();
      dayFlight.clear();
    });

    return {
      month, selectedDate, monthDays, instructions, tasks, ready, generation,
      monthLoading, dayLoading, monthError, dayError, taskError, busyTaskId,
      acquire, fetchMonth, fetchDay, refresh, selectDate, changeMonth, saveTask, removeTask, toggleTask,
    };
  });
}

export const useCalendarStore = createCalendarStore();
