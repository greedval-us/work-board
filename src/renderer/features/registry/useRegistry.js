import { useAppStore } from '../../app/appStore.js';
import { useControlWorkspace } from '../control/useControlWorkspace.js';
import { createRegistryStore, useClosedRegistryStore, useRegistryStore } from './state/registryStore.js';

export function useRegistry(suppliedApp, service, { closed = false } = {}) {
  const app = suppliedApp ?? useAppStore();
  const useStore = suppliedApp || service ? createRegistryStore({ app, service, closed }) : closed ? useClosedRegistryStore : useRegistryStore;
  return useControlWorkspace(app, useStore(), { closed });
}
