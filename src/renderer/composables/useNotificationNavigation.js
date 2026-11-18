import { onScopeDispose, shallowRef, watch } from 'vue';
import { validateDate } from '../../shared/dates.js';
import { DesktopError } from '../../shared/errors.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { calendarService } from '../services/CalendarService.js';

function queryId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function queryDate(value) {
  if (value === undefined) return '';
  try { return validateDate(value); } catch { return null; }
}

function routeGuard(fields, matchesSelected, requestClose) {
  return (to, from) => {
    if (fields.every((field) => to.query[field] === from.query[field])) return true;
    const id = queryId(to.query[fields[0]]);
    // The selected card can differ from the URL after opening a table/list item.
    if (id !== null && matchesSelected(id, to.query)) return true;
    return requestClose();
  };
}

export function useRegistryRoute({ app, route, selected, selectedCheckpoint, openRecord, requestClose, routeName = 'Registry' }) {
  let active = true;
  let version = 0;
  const fields = ['instruction', 'checkpoint', 'notification'];
  watch([() => route.name, ...fields.map((field) => () => route.query[field]),
    () => app.database?.ready, () => app.database?.generation, () => app.databaseSwitching], () => {
    const requestVersion = ++version;
    if (route.name !== routeName || !app.database?.ready || app.databaseSwitching) return;
    const id = queryId(route.query.instruction);
    const checkpoint = queryDate(route.query.checkpoint);
    if (id === null || checkpoint === null) return;
    if (selected.value?.id === id) { selectedCheckpoint.value = checkpoint; return; }
    const query = fields.map((field) => route.query[field]);
    const name = route.name;
    const generation = app.database.generation;
    void openRecord(id, checkpoint, () => active && version === requestVersion
      && app.database?.ready && app.database.generation === generation && !app.databaseSwitching
      && route.name === name && fields.every((field, index) => route.query[field] === query[index]));
  }, { immediate: true });
  onScopeDispose(() => { active = false; version++; });
  return { guardRouteUpdate: routeGuard(fields, id => id === selected.value?.id, requestClose) };
}

export function useCalendarTaskRoute({ app, route, calendar, editing, requestClose, service = calendarService }) {
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
