import { storeToRefs } from 'pinia';
import { computed, onScopeDispose, shallowRef } from 'vue';
import { localDate } from '../../shared/registry.js';
import { buildMonthGrid, millisecondsUntilTomorrow } from '../domain/calendarDates.js';
import { useCalendarStore } from '../stores/calendarStore.js';

export function useCalendar({ store = useCalendarStore(), now = () => new Date(), trackDate = true } = {}) {
  const state = storeToRefs(store);
  const today = shallowRef(localDate(now()));
  const grid = computed(() => {
    const counts = new Map(state.monthDays.value.map((day) => [day.date, day]));
    return buildMonthGrid(state.month.value).map((day) => ({
      controls: 0, tasks: 0, completedControls: 0, completedTasks: 0,
      ...counts.get(day.date), ...day,
    }));
  });

  function refreshToday() { today.value = localDate(now()); }
  function goToday() { refreshToday(); store.selectDate(today.value); }
  const release = store.acquire();
  let timer;
  const focusTarget = globalThis.window;
  function scheduleDate() {
    clearTimeout(timer);
    refreshToday();
    timer = setTimeout(scheduleDate, millisecondsUntilTomorrow(now()));
  }
  if (trackDate) {
    scheduleDate();
    focusTarget?.addEventListener?.('focus', scheduleDate);
  }
  onScopeDispose(() => {
    release();
    clearTimeout(timer);
    focusTarget?.removeEventListener?.('focus', scheduleDate);
  });

  return {
    ...state, today, grid, goToday, refreshToday,
    fetchMonth: store.fetchMonth, fetchDay: store.fetchDay, refresh: store.refresh,
    selectDate: store.selectDate, changeMonth: store.changeMonth,
    saveTask: store.saveTask, removeTask: store.removeTask, toggleTask: store.toggleTask,
  };
}
