import { computed, reactive, shallowRef } from 'vue';
import { TASK_PRIORITY, validateTask } from '../../../shared/registry.js';
import { supportsControlDayOfMonth } from '../../../shared/controlSchedule.js';
import { validateDate } from '../../../shared/dates.js';
import { firstTaskOccurrence, isTaskOccurrence } from '../../../shared/taskRecurrence.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';

function scheduleFromDraft({ frequency, dayOfWeek, dayOfMonth, monthOfYear, customDates }) {
  const recurrence = { frequency };
  if (frequency === 'weekly' && dayOfWeek !== '') recurrence.dayOfWeek = dayOfWeek;
  if (supportsControlDayOfMonth(frequency) && dayOfMonth !== '') recurrence.dayOfMonth = dayOfMonth;
  if (frequency === 'yearly' && monthOfYear !== '') recurrence.monthOfYear = monthOfYear;
  if (frequency === 'custom') recurrence.customDates = [...customDates];
  return recurrence;
}

export function useTaskEditor({ task, date, generation, saveTask, removeTask, moveTaskOccurrence }) {
  const existingRecurrence = task?.recurrence;
  const occurrenceDate = task?.date ?? '';
  const originalOccurrenceDate = task?.originalDate ?? occurrenceDate;
  const movableOccurrence = Boolean(existingRecurrence?.frequency && isTaskOccurrence(task, originalOccurrenceDate));
  const occurrenceCompleted = shallowRef(task?.completed ?? false);
  const draft = reactive({
    title: task?.title ?? '', date: task?.seriesDate ?? task?.date ?? date, description: task?.description ?? '',
    priority: task?.priority ?? TASK_PRIORITY.NORMAL,
    completed: (!task?.seriesDate || task.seriesDate === occurrenceDate) && occurrenceCompleted.value,
    recurrence: {
      frequency: existingRecurrence?.frequency ?? '',
      dayOfWeek: existingRecurrence?.dayOfWeek ?? '',
      dayOfMonth: existingRecurrence?.dayOfMonth ?? '',
      monthOfYear: existingRecurrence?.monthOfYear ?? '',
      customDates: [...(existingRecurrence?.customDates ?? [])],
    },
  });
  const recurring = computed(() => Boolean(draft.recurrence.frequency));
  const taskData = computed(() => ({
    ...draft, completed: !recurring.value && draft.completed, recurrence: scheduleFromDraft(draft.recurrence),
  }));
  const occurrenceAvailable = computed(() => Boolean(task && recurring.value && isTaskOccurrence(taskData.value, originalOccurrenceDate)));
  const firstOccurrence = computed(() => recurring.value ? firstTaskOccurrence(taskData.value) : '');
  const completionChange = computed(() => {
    if (!occurrenceAvailable.value) return undefined;
    const previous = existingRecurrence ? Boolean(task.completed) : false;
    if (occurrenceCompleted.value !== previous) return { date: occurrenceDate, completed: occurrenceCompleted.value };
    return undefined;
  });
  const original = JSON.stringify(taskData.value);
  const dirty = computed(() => Boolean(completionChange.value) || JSON.stringify(taskData.value) !== original);
  const busy = shallowRef(false);
  const error = shallowRef('');

  async function perform(operation, fallback) {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    try { await operation(); return true; }
    catch (cause) { error.value = errorMessage(cause, fallback); return false; }
    finally { busy.value = false; }
  }

  function save() {
    return perform(() => {
      const data = validateTask(taskData.value);
      if (existingRecurrence && !data.recurrence) data.recurrence = { frequency: '' };
      return saveTask(task?.id ?? null, data, generation, completionChange.value);
    }, 'Не удалось сохранить задачу.');
  }
  function remove() { return task ? perform(() => removeTask(task.id, generation), 'Не удалось удалить задачу.') : Promise.resolve(false); }
  function moveOccurrence(to) {
    if (!movableOccurrence || dirty.value || to === occurrenceDate) return Promise.resolve(false);
    return perform(() => moveTaskOccurrence(task.id, occurrenceDate, validateDate(to, 'Новая дата повторения'), generation),
      'Не удалось перенести повторение задачи.');
  }

  return { draft, recurring, occurrenceDate, occurrenceCompleted, occurrenceAvailable, firstOccurrence,
    movableOccurrence, dirty, busy, error, save, remove, moveOccurrence };
}
