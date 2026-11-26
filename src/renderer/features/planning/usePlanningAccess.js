import { watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../../app/appStore.js';

export function usePlanningAccess() {
  const app = useAppStore();
  const router = useRouter();
  watchEffect(() => {
    if (app.initialized && !app.databaseSwitching && !app.planningEnabled) {
      void router.replace({ name: 'Registry' });
    }
  });
  return app;
}
