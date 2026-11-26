import { controlLocation } from '../control/controlLocation.js';
export { isClosedControl as isClosedRegistry } from '../control/controlLocation.js';

export function registryLocation(closed, query = {}) {
  return controlLocation('Registry', closed, query);
}
