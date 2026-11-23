import { storeToRefs } from 'pinia';
import { computed, onScopeDispose, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { localDate } from '../../../shared/dates.js';
import { useAppStore } from '../../app/appStore.js';
import { createDesktopService } from '../../infrastructure/desktopApi.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';
import { createRequestChannel } from '../../infrastructure/requestScope.js';
import { millisecondsUntilTomorrow } from '../../ui/calendarDates.js';
import { useCalendarStore } from '../calendar/calendarStore.js';

const taskService = createDesktopService({ listTasks: ['tasks', 'list'] });

export function useTaskWorkspace({
  app = useAppStore(), calendar = useCalendarStore(), service = taskService,
  now = () => new Date(), trackDate = true, registerRouteLeave = onBeforeRouteLeave,
} = {}) {
  const { taskError, busyTaskId } = storeToRefs(calendar);
  const ready = computed(() => Boolean(app.database?.ready));
  const generation = computed(() => app.database?.generation);
  const today = shallowRef(localDate(now()));
  const month = shallowRef('');
  const query = computed(() => month.value ? { month: month.value } : { agendaDate: today.value });
  const tasks = shallowRef([]);
  const loading = shallowRef(false);
  const error = shallowRef('');
  const editing = shallowRef(null);
  const editor = shallowRef(null);
  const requests = createRequestChannel();

  function canUseDatabase() { return ready.value && !app.databaseSwitching; }
  function requestKey() { return JSON.stringify([generation.value, app.revision, query.value]); }

  async function refresh() {
    if (!canUseDatabase()) return;
    const payload = { generation: generation.value, ...query.value };
    const key = requestKey();
    const ticket = requests.issue(key);
    const matches = () => canUseDatabase() && key === requestKey();
    const current = () => ticket.isCurrent() && matches();
    loading.value = true;
    error.value = '';
    try {
      return await requests.run(key, async accepts => {
        const rows = await service.listTasks(payload);
        if (accepts() && matches()) tasks.value = rows;
        return rows;
      });
    } catch (cause) {
      if (current()) error.value = errorMessage(cause, 'Не удалось загрузить задачи.');
    } finally {
      if (current()) loading.value = false;
    }
  }

  function resetList() {
    requests.invalidate();
    tasks.value = [];
    loading.value = false;
    error.value = '';
  }

  watch([ready, generation, () => app.databaseSwitching, query, () => app.revision], (state, previous) => {
    const [available, source, switching, selection] = state;
    const [wasAvailable, previousSource, wasSwitching, previousSelection] = previous;
    if (available !== wasAvailable || source !== previousSource || switching !== wasSwitching || selection !== previousSelection) resetList();
    if (!available || source !== previousSource) editing.value = null;
    if (available && !switching) void refresh();
  }, { immediate: true, flush: 'sync' });

  function newTask() {
    if (!canUseDatabase()) return;
    const date = month.value && month.value !== today.value.slice(0, 7) ? `${month.value}-01` : today.value;
    editing.value = { task: null, date, generation: generation.value };
  }

  function editTask(task) {
    if (!canUseDatabase()) return;
    editing.value = { task, date: task.date, generation: generation.value };
  }

  function closeTask(nextDate) {
    editing.value = null;
    if (nextDate && month.value) month.value = nextDate.slice(0, 7);
  }

  function canLeave() { return editor.value?.requestClose() ?? true; }
  registerRouteLeave(canLeave);
  const unregister = app.registerUnsavedGuard(canLeave);

  let timer;
  const focusTarget = globalThis.window;
  function scheduleDate() {
    clearTimeout(timer);
    const date = now();
    today.value = localDate(date);
    timer = setTimeout(scheduleDate, millisecondsUntilTomorrow(date));
  }
  if (trackDate) {
    scheduleDate();
    focusTarget?.addEventListener?.('focus', scheduleDate);
  }
  onScopeDispose(() => {
    requests.dispose();
    unregister();
    clearTimeout(timer);
    focusTarget?.removeEventListener?.('focus', scheduleDate);
  });

  return {
    ready, generation, tasks, loading, error, taskError, busyTaskId, today, month, editing, editor,
    refresh, newTask, editTask, closeTask, saveTask: calendar.saveTask, removeTask: calendar.removeTask,
    moveTaskOccurrence: calendar.moveTaskOccurrence, toggleTask: calendar.toggleTask,
  };
}
