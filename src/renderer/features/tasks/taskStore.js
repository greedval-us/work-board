import { defineStore, storeToRefs } from 'pinia';
import { computed, shallowRef, watch } from 'vue';
import { DesktopError, ERROR_CODES } from '../../../shared/errors.js';
import { useAppStore } from '../../app/appStore.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';
import { taskService } from './TaskService.js';

export function createTaskStore({ getApp = useAppStore, service = taskService } = {}) {
  return defineStore('tasks', () => {
    const app = getApp();
    const generation = computed(() => app.database?.generation);
    const taskError = shallowRef('');
    const busyTaskId = shallowRef(null);

    function assertGeneration(source) {
      if (!app.database?.ready || source !== generation.value) {
        throw new DesktopError(ERROR_CODES.DATABASE_CHANGED, 'База данных изменилась. Откройте задачу заново.');
      }
    }

    async function mutate(source, operation) {
      assertGeneration(source);
      return app.withOperation(async () => {
        assertGeneration(source);
        const result = await operation();
        assertGeneration(source);
        app.touchData();
        return result;
      });
    }

    function saveTask(id, data, source = generation.value, occurrence) {
      return mutate(source, () => id == null
        ? service.createTask({ data, generation: source })
        : service.updateTask({ id, data, generation: source, ...(occurrence ? { occurrence } : {}) }));
    }

    function removeTask(id, source = generation.value) {
      return mutate(source, () => service.removeTask({ id, generation: source }));
    }

    function moveTaskOccurrence(id, from, to, source = generation.value) {
      return mutate(source, () => service.moveOccurrence({ id, from, to, generation: source }));
    }

    async function toggleTask(task) {
      if (busyTaskId.value !== null) return;
      const source = generation.value;
      busyTaskId.value = task.id;
      taskError.value = '';
      try {
        const completed = !task.completed;
        if (task.recurrence?.frequency) {
          await mutate(source, () => service.setOccurrenceCompleted({ id: task.id, date: task.date, completed, generation: source }));
        } else {
          await saveTask(task.id, { completed }, source);
        }
      } catch (cause) {
        if (source === generation.value) taskError.value = errorMessage(cause, 'Не удалось изменить задачу.');
      } finally { if (source === generation.value) busyTaskId.value = null; }
    }

    watch([() => app.database?.ready, generation], () => {
      taskError.value = '';
      busyTaskId.value = null;
    }, { flush: 'sync' });

    return { taskError, busyTaskId, saveTask, removeTask, moveTaskOccurrence, toggleTask };
  });
}

export const useTaskStore = createTaskStore();

export function useTaskActions(store = useTaskStore()) {
  const { taskError, busyTaskId } = storeToRefs(store);
  const { saveTask, removeTask, moveTaskOccurrence, toggleTask } = store;
  return { taskError, busyTaskId, saveTask, removeTask, moveTaskOccurrence, toggleTask };
}
