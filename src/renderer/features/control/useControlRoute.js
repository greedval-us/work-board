import { onScopeDispose, watch } from 'vue';
import { queryDate, queryId, routeGuard } from '../../infrastructure/routeQuery.js';
import { isClosedControl } from './controlLocation.js';

export function useControlRoute({ app, route, selected, selectedCheckpoint, openRecord, requestClose, closed = false, routeName, idField }) {
  let active = true;
  let version = 0;
  const fields = [idField, 'checkpoint', 'notification'];
  const inScope = () => route.name === routeName && isClosedControl(route) === closed;
  watch([inScope, ...fields.map((field) => () => route.query[field]),
    () => app.database?.ready, () => app.database?.generation, () => app.databaseSwitching], () => {
    const requestVersion = ++version;
    if (!inScope() || !app.database?.ready || app.databaseSwitching) return;
    const id = queryId(route.query[idField]);
    const checkpoint = queryDate(route.query.checkpoint);
    if (id === null || checkpoint === null) return;
    if (selected.value?.id === id) { selectedCheckpoint.value = checkpoint; return; }
    const query = fields.map((field) => route.query[field]);
    const generation = app.database.generation;
    void openRecord(id, checkpoint, () => active && version === requestVersion
      && app.database?.ready && app.database.generation === generation && !app.databaseSwitching
      && inScope() && fields.every((field, index) => route.query[field] === query[index]));
  }, { immediate: true });
  onScopeDispose(() => { active = false; version++; });
  const guardCard = routeGuard(fields, id => id === selected.value?.id, requestClose);
  return { guardRouteUpdate: (to, from) => isClosedControl(to) === isClosedControl(from) ? guardCard(to, from) : requestClose() };
}
