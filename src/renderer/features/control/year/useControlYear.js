import { computed, reactive, shallowRef, watch } from 'vue';
import { localDate } from '../../../../shared/dates.js';
import { ENTITY_TYPES } from '../../../../shared/constants/entities.js';
import { errorMessage } from '../../../infrastructure/errorMessage.js';
import { calendarService } from '../../calendar/CalendarService.js';

export function useControlYear({ app, section, closed, service = calendarService }) {
  const visible = shallowRef(false);
  const year = shallowRef(Number(localDate().slice(0, 4)));
  const events = shallowRef([]);
  const loading = shallowRef(false);
  const error = shallowRef('');
  const attempts = shallowRef(0);
  const planning = section === ENTITY_TYPES.PLANS;
  const request = computed(() => {
    if (!visible.value || !app.database?.ready || app.databaseSwitching || app.workspaceLocked
      || (planning && !app.planningEnabled)) return null;
    return { year: year.value, section, closed: closed.value, generation: app.database.generation };
  });

  watch([request, () => app.revision, attempts], async ([query], previous, onCleanup) => {
    let current = true;
    onCleanup(() => { current = false; });
    error.value = '';
    events.value = [];
    loading.value = Boolean(query);
    if (!query) return;
    try {
      const result = await service.year(query);
      if (current) events.value = result.events;
    } catch (cause) {
      if (current) error.value = errorMessage(cause, 'Не удалось загрузить годовой календарь.');
    } finally {
      if (current) loading.value = false;
    }
  }, { flush: 'sync' });

  return reactive({ visible, year, planning, events, error, loading,
    show(value) { visible.value = value; },
    selectYear(value) { year.value = value; },
    retry() { attempts.value++; },
  });
}
