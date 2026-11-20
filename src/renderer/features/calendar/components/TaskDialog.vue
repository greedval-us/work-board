<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import { TASK_PRIORITIES } from '../../../../shared/registry.js';
import { DATE_LIMITS } from '../../../../shared/constants/dates.js';
import { formatDate } from '../../../../shared/dates.js';
import TaskConfirmationDialog from './TaskConfirmationDialog.vue';
import TaskRecurrenceEditor from './TaskRecurrenceEditor.vue';
import { useTaskEditor } from '../useTaskEditor.js';
import { createDialogMotion } from '../../../ui/dialogMotion.js';

const props = defineProps({
  task: { type: Object, default: null }, date: { type: String, required: true },
  generation: { required: true }, saveTask: { type: Function, required: true }, removeTask: { type: Function, required: true },
  moveTaskOccurrence: { type: Function, required: true },
});
const emit = defineEmits(['close']);
const { draft, recurring, occurrenceDate, completionDate, occurrenceCompleted, occurrenceAvailable,
  movableOccurrence, dirty, busy, error, save, remove, moveOccurrence } = useTaskEditor(props);
const moveDate = shallowRef(occurrenceDate);
const dialog = useTemplateRef('dialog');
const confirmation = useTemplateRef('confirmation');
const form = useTemplateRef('form');
const errorRegion = useTemplateRef('errorRegion');
const closing = shallowRef(false);
const confirmationClosing = computed(() => Boolean(confirmation.value?.closing));
const actionPending = shallowRef(false);
const fieldsDisabled = computed(() => busy.value || closing.value || confirmationClosing.value);
const interactionBusy = computed(() => fieldsDisabled.value || actionPending.value);
const moveDisabled = computed(() => interactionBusy.value || dirty.value);
const canMove = computed(() => !moveDisabled.value && moveDate.value && moveDate.value !== occurrenceDate);
const dialogMotion = createDialogMotion(() => dialog.value);
let pendingClose;
let resolveClose;
let finishingClose;
let disposed = false;

function settleClose(value) {
  resolveClose?.(value);
  resolveClose = undefined;
  pendingClose = undefined;
}

function finishClose(operationFinished = false, nextDate) {
  if (finishingClose) return finishingClose;
  if (disposed || busy.value || confirmationClosing.value || (actionPending.value && operationFinished !== true)) return Promise.resolve(false);
  closing.value = true;
  finishingClose = (async () => {
    const results = await Promise.all([confirmation.value.close(), dialogMotion.close()]);
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
  const closed = await confirmation.value.close();
  if (!disposed) settleClose(false);
  return closed;
}

function requestClose() {
  if (finishingClose) return finishingClose;
  if (pendingClose) return pendingClose;
  if (interactionBusy.value || disposed) return Promise.resolve(false);
  if (!dirty.value) return finishClose();
  pendingClose = new Promise((resolve) => { resolveClose = resolve; });
  void confirmation.value.open('unsaved');
  return pendingClose;
}

async function saveAndClose() {
  if (interactionBusy.value || disposed) return false;
  actionPending.value = true;
  try {
    if (!await confirmation.value.close() || disposed) {
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
  void confirmation.value.open('delete');
}

async function deleteAndClose() {
  if (interactionBusy.value || disposed) return false;
  actionPending.value = true;
  try {
    if (await remove()) return await finishClose(true);
    if (disposed || !await confirmation.value.close()) return false;
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
  dialogMotion.dispose();
  settleClose(false);
  globalThis.window?.removeEventListener('beforeunload', beforeUnload);
});
defineExpose({ requestClose });
</script>

<template>
  <dialog ref="dialog" class="calendar-task-dialog" aria-labelledby="calendar-task-title"
    :aria-describedby="task?.recurrence?.frequency ? 'calendar-task-help' : undefined" @cancel.prevent="requestClose">
    <header class="calendar-dialog-header">
      <div><h2 id="calendar-task-title">{{ task ? 'Карточка задачи' : 'Новая задача' }}</h2>
        <p v-if="task?.recurrence?.frequency" id="calendar-task-help">Изменения расписания применяются ко всей серии.</p>
      </div>
      <button class="calendar-icon-button" :disabled="interactionBusy" aria-label="Закрыть карточку задачи" @click="requestClose"><X :size="19" aria-hidden="true" /></button>
    </header>
    <form ref="form" class="calendar-task-form" @submit.prevent="saveAndClose">
      <div class="calendar-task-body">
        <fieldset :disabled="fieldsDisabled">
          <div class="calendar-task-columns">
            <div class="calendar-task-details">
              <label class="calendar-field">Название задачи <span aria-hidden="true">*</span><input v-model="draft.title" name="task-title" required autofocus autocomplete="off" placeholder="Что нужно сделать" /></label>
              <div class="calendar-form-row">
                <label class="calendar-field">{{ recurring ? 'Начало графика' : 'Дата' }} <span aria-hidden="true">*</span><input v-model="draft.date" name="task-date" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX" required /></label>
                <label class="calendar-field">Срочность<select v-model="draft.priority" name="task-priority"><option v-for="(label, value) in TASK_PRIORITIES" :key="value" :value="value">{{ label }}</option></select></label>
              </div>
              <label class="calendar-field">Описание<textarea v-model="draft.description" name="task-description" rows="3" placeholder="Подробности и заметки" /></label>
            </div>
            <div class="calendar-task-schedule">
              <TaskRecurrenceEditor :model-value="draft.recurrence" :start-date="draft.date" :disabled="fieldsDisabled"
                @update:model-value="Object.assign(draft.recurrence, $event)" />
              <label v-if="!recurring" class="calendar-completion-field"><input v-model="draft.completed" name="task-completed" type="checkbox" />Задача выполнена</label>
              <label v-else-if="occurrenceAvailable" class="calendar-completion-field">
                <input v-model="occurrenceCompleted" name="task-completed" type="checkbox" />Выполнено за {{ formatDate(completionDate) }}
              </label>
            </div>
          </div>
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
      </div>
      <p v-if="error" ref="errorRegion" class="calendar-task-error" role="alert" tabindex="-1">{{ error }}</p>
      <div class="calendar-dialog-footer">
        <button v-if="task" type="button" class="calendar-button calendar-delete-button" :disabled="interactionBusy" @click="confirmDelete"><Trash2 :size="15" aria-hidden="true" />Удалить</button>
        <span v-if="busy" class="calendar-save-status" role="status">Сохранение…</span>
        <div class="calendar-dialog-actions"><button type="button" class="calendar-button" :disabled="interactionBusy" @click="requestClose">Отмена</button><button type="submit" class="calendar-button calendar-button-primary" :disabled="interactionBusy">{{ busy ? 'Сохранение…' : 'Сохранить' }}</button></div>
      </div>
    </form>
  </dialog>
  <TaskConfirmationDialog ref="confirmation" :title="draft.title" :series="Boolean(task?.recurrence?.frequency)"
    :busy="busy" :disabled="interactionBusy" @cancel="cancelConfirmation" @discard="finishClose()"
    @save="saveAndClose" @remove="deleteAndClose" />
</template>
