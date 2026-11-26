import { useControlRoute } from '../control/useControlRoute.js';

export function useRegistryRoute(options) {
  return useControlRoute({ ...options, routeName: 'Registry', idField: 'instruction' });
}
