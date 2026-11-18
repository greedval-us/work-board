<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import { TASK_PRIORITIES } from '../../../shared/registry.js';
import { CONTROL_WEEKDAY_LABELS, supportsControlDayOfMonth } from '../../../shared/controlSchedule.js';
import { TASK_RECURRENCE_FREQUENCIES } from '../../../shared/taskRecurrence.js';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { formatDate } from '../../../shared/dates.js';
import { CALENDAR_MONTHS } from '../../constants/calendar.js';
import { useTaskEditor } from './useTaskEditor.js';
import { createDialogMotion } from '../../infrastructure/dialogMotion.js';

const props = defineProps({
  task: { type: Object, default: null }, date: { type: String, required: true },
  generation: { required: true }, saveTask: { type: Function, required: true }, removeTask: { type: Function, required: true },
  moveTaskOccurrence: { type: Function, required: true },
});
const emit = defineEmits(['close']);
const { draft, recurring, occurrenceDate, occurrenceCompleted, occurrenceAvailable, firstOccurrence,
  movableOccurrence, dirty, busy, error, save, remove, moveOccurrence } = useTaskEditor(props);
const customDate = shallowRef('');
const moveDate = shallowRef(occurrenceDate);
const canAddCustomDate = computed(() => Boolean(draft.date && customDate.value > draft.date
  && !draft.recurrence.customDates.includes(customDate.value)));
const dialog = shallowRef(null);
const confirmation = shallowRef(null);
const form = shallowRef(null);
const errorRegion = shallowRef(null);
const confirmationMode = shallowRef('unsaved');
const closing = shallowRef(false);
const confirmationClosing = shallowRef(false);
const actionPending = shallowRef(false);
const fieldsDisabled = computed(() => busy.value || closing.value || confirmationClosing.value);
const interactionBusy = computed(() => fieldsDisabled.value || actionPending.value);
const moveDisabled = computed(() => interactionBusy.value || dirty.value);
const canMove = computed(() => !moveDisabled.value && moveDate.value && moveDate.value !== occurrenceDate);
const dialogMotion = createDialogMotion(() => dialog.value);
const confirmationMotion = createDialogMotion(() => confirmation.value);
let pendingClose;
let resolveClose;
let finishingClose;
let confirmationIntent = 0;
let disposed = false;

function addCustomDate() {
  if (!canAddCustomDate.value || fieldsDisabled.value) return;
  draft.recurrence.customDates = [...draft.recurrence.customDates, customDate.value].sort();
  customDate.value = '';
}

function removeCustomDate(date) {
  draft.recurrence.customDates = draft.recurrence.customDates.filter(candidate => candidate !== date);
}

function settleClose(value) {
  resolveClose?.(value);
  resolveClose = undefined;
  pendingClose = undefined;
}

async function openConfirmation(mode) {
  const intent = ++confirmationIntent;
  confirmationMode.value = mode;
  await nextTick();
  if (disposed || closing.value || intent !== confirmationIntent) return false;
  return confirmationMotion.open();
}

async function closeConfirmation() {
  confirmationIntent += 1;
  if (!confirmation.value?.open) return true;
  confirmationClosing.value = true;
  try { return await confirmationMotion.close(); }
  finally { confirmationClosing.value = false; }
}

function finishClose(operationFinished = false, nextDate) {
  if (finishingClose) return finishingClose;
  if (disposed || busy.value || confirmationClosing.value || (actionPending.value && operationFinished !== true)) return Promise.resolve(false);
  closing.value = true;
  finishingClose = (async () => {
    const results = await Promise.all([closeConfirmation(), dialogMotion.close()]);
    if (disposed || results.some((closed) => !closed)) {
      settleClose(false);
      return false;
    }
    settleClose(true);
    emit('close', nextDate);
    return true;
  })().finally(() => { closing.value = false; finishingClose = undefined; });
  return finishingClose;
}

async function cancelConfirmation() {
  if (interactionBusy.value) return false;
  const closed = await closeConfirmation();
  if (!disposed) settleClose(false);
  return closed;
}

function requestClose() {
  if (finishingClose) return finishingClose;
  if (pendingClose) return pendingClose;
  if (interactionBusy.value || disposed) return Promise.resolve(false);
  if (!dirty.value) return finishClose();
  pendingClose = new Promise((resolve) => { resolveClose = resolve; });
  void openConfirmation('unsaved');
  return pendingClose;
}

async function saveAndClose() {
  if (interactionBusy.value || disposed) return false;
  actionPending.value = true;
  try {
    if (!await closeConfirmation() || disposed) {
      settleClose(false);
      return false;
    }
    await nextTick();
    if (disposed) return false;
    if (!form.value.reportValidity()) {
      settleClose(false);
      return false;
    }
    if (await save()) return await finishClose(true);
    if (!disposed) {
      settleClose(false);
      await nextTick();
      errorRegion.value?.focus();
    }
    return false;
  } finally { actionPending.value = false; }
}

async function moveAndClose() {
  if (!canMove.value || disposed) return false;
  const destination = moveDate.value;
  actionPending.value = true;
  try {
    if (await moveOccurrence(destination)) return await finishClose(true, destination);
    if (!disposed) {
      await nextTick();
      errorRegion.value?.focus();
    }
    return false;
  } finally { actionPending.value = false; }
}

function confirmDelete() {
  if (interactionBusy.value || disposed) return;
  void openConfirmation('delete');
}

async function deleteAndClose() {
  if (interactionBusy.value || disposed) return false;
  actionPending.value = true;
  try {
    if (await remove()) return await finishClose(true);
    if (disposed || !await closeConfirmation()) return false;
    await nextTick();
    errorRegion.value?.focus();
    return false;
  } finally { actionPending.value = false; }
}

function beforeUnload(event) {
  if (dirty.value) { event.preventDefault(); event.returnValue = ''; }
}

onMounted(() => {
  void dialogMotion.open();
  globalThis.window?.addEventListener('beforeunload', beforeUnload);
});
onBeforeUnmount(() => {
  disposed = true;
  confirmationIntent += 1;
  confirmationMotion.dispose();
  dialogMotion.dispose();
  settleClose(false);
  globalThis.window?.removeEventListener('beforeunload', beforeUnload);
});
defineExpose({ requestClose });
</script>

<template>
  <dialog ref="dialog" class="calendar-task-dialog" aria-labelledby="calendar-task-title" aria-describedby="calendar-task-help" @cancel.prevent="requestClose">
    <header class="calendar-dialog-header">
      <div><h2 id="calendar-task-title">{{ task ? 'Карточка задачи' : 'Новая задача' }}</h2>
        <p id="calendar-task-help">{{ task?.recurrence?.frequency ? 'Изменения расписания применяются ко всей серии.' : 'Задача на одну дату или с повторением.' }}</p>
      </div>
      <button class="calendar-icon-button" :disabled="interactionBusy" aria-label="Закрыть карточку задачи" @click="requestClose"><X :size="19" aria-hidden="true" /></button>
    </header>
    <form ref="form" class="calendar-task-form" @submit.prevent="saveAndClose">
      <fieldset :disabled="fieldsDisabled">
        <label class="calendar-field">Название задачи <span aria-hidden="true">*</span><input v-model="draft.title" name="task-title" required autofocus autocomplete="off" placeholder="Что нужно сделать" /></label>
        <div class="calendar-form-row">
          <label class="calendar-field">{{ recurring ? 'Начало графика' : 'Дата' }} <span aria-hidden="true">*</span><input v-model="draft.date" name="task-date" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX" required /></label>
          <label class="calendar-field">Срочность<select v-model="draft.priority" name="task-priority"><option v-for="(label, value) in TASK_PRIORITIES" :key="value" :value="value">{{ label }}</option></select></label>
        </div>
        <label class="calendar-field">Описание<textarea v-model="draft.description" name="task-description" rows="5" placeholder="Подробности и заметки" /></label>
        <div class="calendar-task-recurrence">
          <div class="calendar-recurrence-fields">
            <label class="calendar-field">Повторение
              <select v-model="draft.recurrence.frequency" name="task-recurrence">
                <option v-for="(label, value) in TASK_RECURRENCE_FREQUENCIES" :key="value" :value="value">{{ label }}</option>
              </select>
            </label>
            <label v-if="draft.recurrence.frequency === 'weekly'" class="calendar-field">День недели
              <select v-model.number="draft.recurrence.dayOfWeek" name="task-day-of-week">
                <option value="">Как в дате начала</option>
                <option v-for="(label, day) in CONTROL_WEEKDAY_LABELS" :key="day" :value="day">{{ label }}</option>
              </select>
            </label>
            <label v-if="supportsControlDayOfMonth(draft.recurrence.frequency)" class="calendar-field">День месяца
              <input v-model.number="draft.recurrence.dayOfMonth" name="task-day-of-month" type="number"
                min="1" max="31" step="1" inputmode="numeric" placeholder="Как в дате начала" />
            </label>
            <label v-if="draft.recurrence.frequency === 'yearly'" class="calendar-field">Месяц
              <select v-model.number="draft.recurrence.monthOfYear" name="task-month-of-year">
                <option value="">Как в дате начала</option>
                <option v-for="(label, index) in CALENDAR_MONTHS" :key="label" :value="index + 1">{{ label }}</option>
              </select>
            </label>
          </div>
          <p v-if="firstOccurrence && firstOccurrence !== draft.date" class="calendar-recurrence-help">
            Первая задача по графику — {{ formatDate(firstOccurrence) }}.
          </p>
          <div v-if="draft.recurrence.frequency === 'custom'" class="calendar-recurrence-custom">
            <p class="calendar-recurrence-help">Дата начала уже входит в график. Можно добавить следующие даты.</p>
            <div class="calendar-custom-date">
              <label class="calendar-field">Дополнительная дата
                <input v-model="customDate" name="task-custom-date" type="date" :min="draft.date || DATE_LIMITS.MIN"
                  :max="DATE_LIMITS.MAX" @keydown.enter.prevent="addCustomDate" />
              </label>
              <button type="button" class="calendar-button" :disabled="!canAddCustomDate" @click="addCustomDate">Добавить дату</button>
            </div>
            <ul v-if="draft.recurrence.customDates.length" class="calendar-recurrence-dates">
              <li v-for="date in draft.recurrence.customDates" :key="date">
                <time :datetime="date">{{ formatDate(date) }}</time>
                <button type="button" class="calendar-remove-recurrence-date" :aria-label="`Убрать дату ${formatDate(date)}`" @click="removeCustomDate(date)">
                  <X :size="13" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </div>
        </div>
        <label v-if="!recurring" class="calendar-completion-field"><input v-model="draft.completed" name="task-completed" type="checkbox" />Задача выполнена</label>
        <label v-else-if="occurrenceAvailable" class="calendar-completion-field">
          <input v-model="occurrenceCompleted" name="task-completed" type="checkbox" />Выполнено за {{ formatDate(occurrenceDate) }}
        </label>
        <section v-if="movableOccurrence" class="calendar-occurrence-move" aria-labelledby="calendar-occurrence-move-title">
          <h3 id="calendar-occurrence-move-title">Перенос одного повторения</h3>
          <p class="calendar-recurrence-help">
            Текущая дата — <time :datetime="occurrenceDate">{{ formatDate(occurrenceDate) }}</time>.
            <template v-if="task.originalDate"> По графику — <time :datetime="task.originalDate">{{ formatDate(task.originalDate) }}</time>.</template>
          </p>
          <div class="calendar-custom-date">
            <label class="calendar-field">Новая дата повторения
              <input v-model="moveDate" name="task-move-date" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX"
                :disabled="moveDisabled" :aria-describedby="dirty ? 'calendar-move-dirty-help' : undefined" @keydown.enter.prevent="moveAndClose" />
            </label>
            <button type="button" class="calendar-button calendar-move-occurrence-button" :disabled="!canMove" @click="moveAndClose">Перенести</button>
          </div>
          <p v-if="dirty" id="calendar-move-dirty-help" class="calendar-recurrence-help">Сохраните изменения карточки, чтобы перенести повторение.</p>
        </section>
      </fieldset>
      <p v-if="error" ref="errorRegion" class="calendar-task-error" role="alert" tabindex="-1">{{ error }}</p>
      <div class="calendar-dialog-footer">
        <button v-if="task" type="button" class="calendar-button calendar-delete-button" :disabled="interactionBusy" @click="confirmDelete"><Trash2 :size="15" aria-hidden="true" />Удалить</button>
        <span v-if="busy" class="calendar-save-status" role="status">Сохранение…</span>
        <div class="calendar-dialog-actions"><button type="button" class="calendar-button" :disabled="interactionBusy" @click="requestClose">Отмена</button><button type="submit" class="calendar-button calendar-button-primary" :disabled="interactionBusy">{{ busy ? 'Сохранение…' : 'Сохранить' }}</button></div>
      </div>
    </form>
  </dialog>
  <dialog ref="confirmation" class="calendar-confirm-dialog" aria-labelledby="calendar-confirm-title" aria-describedby="calendar-confirm-description" @cancel.prevent="cancelConfirmation">
    <template v-if="confirmationMode === 'delete'">
      <h2 id="calendar-confirm-title">{{ task?.recurrence?.frequency ? 'Удалить всю серию?' : 'Удалить задачу?' }}</h2>
      <p id="calendar-confirm-description">{{ task?.recurrence?.frequency ? `Все повторы задачи «${draft.title}» будут удалены.` : `«${draft.title}» будет удалена из базы данных.` }}</p>
      <div class="calendar-confirm-actions"><button class="calendar-button" :disabled="interactionBusy" autofocus @click="cancelConfirmation">Отмена</button><button class="calendar-button calendar-button-danger" :disabled="interactionBusy" @click="deleteAndClose">{{ busy ? 'Удаление…' : 'Удалить' }}</button></div>
    </template>
    <template v-else>
      <h2 id="calendar-confirm-title">Сохранить изменения?</h2><p id="calendar-confirm-description">В задаче есть несохранённые изменения. Выберите, как продолжить.</p>
      <div class="calendar-confirm-actions"><button class="calendar-button" :disabled="interactionBusy" autofocus @click="cancelConfirmation">Продолжить редактирование</button><button class="calendar-button" :disabled="interactionBusy" @click="finishClose">Не сохранять</button><button class="calendar-button calendar-button-primary" :disabled="interactionBusy" @click="saveAndClose">{{ busy ? 'Сохранение…' : 'Сохранить' }}</button></div>
    </template>
  </dialog>
</template>
