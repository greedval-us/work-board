import { controlLocation } from '../control/controlLocation.js';

export function planningLocation(closed, query = {}) {
  return controlLocation('PlanningControl', closed, query);
}
