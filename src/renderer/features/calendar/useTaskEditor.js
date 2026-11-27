import { computed, reactive, shallowRef, toRef, watch } from 'vue';
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
  const editingStart = !task?.seriesDate || task.seriesDate === occurrenceDate;
  const draft = reactive({
    title: task?.title ?? '', date: task?.seriesDate ?? task?.date ?? date, description: task?.description ?? '',
    priority: task?.priority ?? TASK_PRIORITY.NORMAL,
    completed: editingStart && (task?.completed ?? false),
    recurrence: {
      frequency: existingRecurrence?.frequency ?? '',
      dayOfWeek: existingRecurrence?.dayOfWeek ?? '',
      dayOfMonth: existingRecurrence?.dayOfMonth ?? '',
      monthOfYear: existingRecurrence?.monthOfYear ?? '',
      customDates: [...(existingRecurrence?.customDates ?? [])],
    },
  });
  const occurrenceCompleted = editingStart ? toRef(draft, 'completed') : shallowRef(task.completed ?? false);
  const recurring = computed(() => Boolean(draft.recurrence.frequency));
  const recurrence = computed(() => scheduleFromDraft(draft.recurrence));
  const firstOccurrence = computed(() => firstTaskOccurrence({ date: draft.date, recurrence: recurrence.value }) ?? '');
  const completionDate = computed(() => task?.date ?? firstOccurrence.value);
  if (!task) {
    watch([completionDate, recurring], ([next, repeating], [previous, wasRepeating]) => {
      if (next !== previous && (repeating || wasRepeating)) draft.completed = false;
    }, { flush: 'sync' });
  }
  const taskData = computed(() => ({
    ...draft, completed: (!task || !recurring.value) && draft.completed, recurrence: recurrence.value,
  }));
  const occurrenceAvailable = computed(() => recurring.value && (task
    ? isTaskOccurrence(taskData.value, originalOccurrenceDate) : Boolean(completionDate.value)));
  const completionChange = computed(() => {
    if (!task || !occurrenceAvailable.value) return undefined;
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

  return { draft, recurring, occurrenceDate, firstOccurrence, completionDate, occurrenceCompleted, occurrenceAvailable,
    movableOccurrence, dirty, busy, error, save, remove, moveOccurrence };
}
