import { defineStore } from 'pinia';
import { onScopeDispose, shallowRef, watch } from 'vue';
import { normalizeControlCardFields } from '../../shared/controlCard.js';
import { DesktopError, ERROR_CODES } from '../../shared/errors.js';
import { errorMessage } from '../infrastructure/errorMessage.js';
import { registryService } from '../services/RegistryService.js';
import { useAppStore } from './appStore.js';

export function createControlCardStore({ app: suppliedApp, service = registryService } = {}) {
  return defineStore('controlCard', () => {
    const app = suppliedApp ?? useAppStore();
    const exporting = shallowRef(false);
    const error = shallowRef('');
    const notice = shallowRef('');
    let active = true;
    let feedbackVersion = 0;

    function reset() {
      feedbackVersion++;
      error.value = '';
      notice.value = '';
    }

    async function exportCard({ id, generation, fields, defaults }) {
      if (!active || exporting.value) return false;
      const version = feedbackVersion;
      const current = () => active && version === feedbackVersion;
      exporting.value = true;
      error.value = '';
      notice.value = '';
      try {
        if (!app.database?.ready) throw new DesktopError(ERROR_CODES.DATABASE_REQUIRED);
        if (generation !== app.database.generation) throw new DesktopError(ERROR_CODES.DATABASE_CHANGED);
        const request = { id, generation, fields: normalizeControlCardFields(fields, defaults) };
        const result = await app.withOperation(() => service.exportControlCard(request));
        if (!current() || result.cancelled) return false;
        notice.value = 'Контрольная карточка сохранена.';
        return true;
      } catch (cause) {
        if (current()) error.value = errorMessage(cause, 'Не удалось сохранить контрольную карточку.');
        return false;
      } finally { exporting.value = false; }
    }

    watch(() => [app.database?.ready, app.database?.generation], reset, { flush: 'sync' });
    onScopeDispose(() => { active = false; reset(); });

    return { exporting, error, notice, exportCard, reset };
  });
}

export const useControlCardStore = createControlCardStore();
