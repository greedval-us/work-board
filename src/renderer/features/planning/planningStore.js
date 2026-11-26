import { PLAN_COLUMNS } from '../../../shared/planning.js';
import { createControlStore } from '../control/state/createControlStore.js';
import { planningService } from './PlanningService.js';

function persist(service, { id, values: rows, generation }) {
  return id ? service.update({ id, data: rows[0], generation }) : service.create({ rows, generation });
}

export function createPlanningStore({ app, service = planningService, now, closed = false } = {}) {
  return createControlStore({
    storeId: closed ? 'closedPlanning' : 'planning', app, service, now, closed, columns: PLAN_COLUMNS, persist,
    enabled: app => app.planningEnabled,
    messages: {
      added: 'План сохранён.', removed: 'Строка плана удалена.',
      closed: 'Строка перенесена в закрытые планы.', loadError: 'Не удалось загрузить планы. Повторите попытку.',
    },
  });
}

export const usePlanningStore = createPlanningStore();
export const useClosedPlanningStore = createPlanningStore({ closed: true });
