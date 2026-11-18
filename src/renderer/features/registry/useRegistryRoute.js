import { onScopeDispose, watch } from 'vue';
import { queryDate, queryId, routeGuard } from '../../infrastructure/routeQuery.js';

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
