import { onScopeDispose, shallowRef, watch } from 'vue';
import { DesktopError } from '../../../shared/errors.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';
import { queryDate, queryId, routeGuard } from '../../infrastructure/routeQuery.js';
import { taskService } from '../tasks/TaskService.js';

export function useCalendarTaskRoute({ app, route, calendar, editing, requestClose, service = taskService }) {
  const loading = shallowRef(false);
  const error = shallowRef('');
  const fields = ['task', 'date', 'notification'];
  let active = true;
  let version = 0;

  function cancelPending() { version++; loading.value = false; error.value = ''; }

  function matchesEditing(id, date) {
    const task = editing.value?.task;
    return task?.id === id && (!task.recurrence?.frequency || !date || editing.value.date === date);
  }

  watch([() => route.name, ...fields.map((field) => () => route.query[field]),
    () => app.database?.ready, () => app.database?.generation, () => app.databaseSwitching], async () => {
    cancelPending();
    if (route.name !== 'Calendar' || !app.database?.ready || app.databaseSwitching) return;
    const id = queryId(route.query.task);
    const date = queryDate(route.query.date);
    if (id === null || date === null) return;
    const generation = app.database.generation;
    if (matchesEditing(id, date) && editing.value.generation === generation) return;
    const requestVersion = version;
    const query = fields.map((field) => route.query[field]);
    const name = route.name;
    const current = () => active && requestVersion === version && app.database?.ready
      && app.database.generation === generation && !app.databaseSwitching && route.name === name
      && fields.every((field, index) => route.query[field] === query[index]);
    if (date) calendar.selectDate(date);
    loading.value = true;
    try {
      const task = await app.withOperation(() => service.getTask({ id, ...(date ? { date } : {}), generation }));
      if (!current()) return;
      if (!task) throw new DesktopError('NOT_FOUND', 'Задача не найдена. Возможно, её удалили или изменили график.');
      if (task.id !== id || queryDate(task.date) === null || !task.date) throw new Error('Invalid task response');
      calendar.selectDate(task.date);
      editing.value = { task, date: task.date, generation };
    } catch (cause) {
      if (current()) error.value = errorMessage(cause, 'Не удалось открыть задачу.');
    } finally { if (current()) loading.value = false; }
  }, { immediate: true });

  onScopeDispose(() => { active = false; cancelPending(); });
  const guardRouteUpdate = routeGuard(fields, (id, query) => {
    const date = queryDate(query.date);
    return date !== null && matchesEditing(id, date);
  }, requestClose);
  return { loading, error, cancelPending, guardRouteUpdate };
}
