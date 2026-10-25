import { computed, reactive, shallowRef } from 'vue';
import { validateTask } from '../../../shared/registry.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';

export function useTaskEditor({ task, date, generation, saveTask, removeTask }) {
  const draft = reactive({
    title: task?.title ?? '', date: task?.date ?? date, description: task?.description ?? '',
    priority: task?.priority ?? 'normal', completed: task?.completed ?? false,
  });
  const original = JSON.stringify(draft);
  const dirty = computed(() => JSON.stringify(draft) !== original);
  const busy = shallowRef(false);
  const error = shallowRef('');

  async function perform(operation) {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    try { await operation(); return true; }
    catch (cause) { error.value = errorMessage(cause, 'Не удалось сохранить задачу.'); return false; }
    finally { busy.value = false; }
  }

  function save() { return perform(() => saveTask(task?.id ?? null, validateTask(draft), generation)); }
  function remove() { return task ? perform(() => removeTask(task.id, generation)) : Promise.resolve(false); }

  return { draft, dirty, busy, error, save, remove };
}
