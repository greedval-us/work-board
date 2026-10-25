<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import { TASK_PRIORITIES } from '../../../shared/registry.js';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { ENTITY_TYPES } from '../../../shared/constants/entities.js';
import { useTaskEditor } from './useTaskEditor.js';
import { createDialogMotion } from '../../infrastructure/dialogMotion.js';
import AttachmentPanel from '../attachments/AttachmentPanel.vue';

const props = defineProps({
  task: { type: Object, default: null }, date: { type: String, required: true },
  generation: { required: true }, saveTask: { type: Function, required: true }, removeTask: { type: Function, required: true },
});
const emit = defineEmits(['close']);
const { draft, dirty, busy, error, save, remove } = useTaskEditor(props);
const dialog = shallowRef(null);
const confirmation = shallowRef(null);
const form = shallowRef(null);
const errorRegion = shallowRef(null);
const confirmationMode = shallowRef('unsaved');
const closing = shallowRef(false);
const confirmationClosing = shallowRef(false);
const actionPending = shallowRef(false);
const attachmentBusy = shallowRef(false);
const fieldsDisabled = computed(() => busy.value || attachmentBusy.value || closing.value || confirmationClosing.value);
const interactionBusy = computed(() => fieldsDisabled.value || actionPending.value);
const dialogMotion = createDialogMotion(() => dialog.value);
const confirmationMotion = createDialogMotion(() => confirmation.value);
let pendingClose;
let resolveClose;
let finishingClose;
let confirmationIntent = 0;
let disposed = false;

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

function finishClose(operationFinished = false) {
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
    emit('close');
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
      <div><h2 id="calendar-task-title">{{ task ? 'Карточка задачи' : 'Новая задача' }}</h2><p id="calendar-task-help">Самостоятельная задача на выбранную дату.</p></div>
      <button class="calendar-icon-button" :disabled="interactionBusy" aria-label="Закрыть карточку задачи" @click="requestClose"><X :size="19" aria-hidden="true" /></button>
    </header>
    <form ref="form" class="calendar-task-form" @submit.prevent="saveAndClose">
      <fieldset :disabled="fieldsDisabled">
        <label class="calendar-field">Название задачи <span aria-hidden="true">*</span><input v-model="draft.title" name="task-title" required autofocus autocomplete="off" placeholder="Что нужно сделать" /></label>
        <div class="calendar-form-row">
          <label class="calendar-field">Дата <span aria-hidden="true">*</span><input v-model="draft.date" name="task-date" type="date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX" required /></label>
          <label class="calendar-field">Срочность<select v-model="draft.priority" name="task-priority"><option v-for="(label, value) in TASK_PRIORITIES" :key="value" :value="value">{{ label }}</option></select></label>
        </div>
        <label class="calendar-field">Описание<textarea v-model="draft.description" name="task-description" rows="5" placeholder="Подробности и заметки" /></label>
        <label class="calendar-completion-field"><input v-model="draft.completed" type="checkbox" />Задача выполнена</label>
      </fieldset>
      <AttachmentPanel v-model="draft.attachments" :entity-type="ENTITY_TYPES.TASKS" :entity-id="task?.id" :generation="generation" :disabled="interactionBusy" @busy="attachmentBusy = $event" />
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
      <h2 id="calendar-confirm-title">Удалить задачу?</h2><p id="calendar-confirm-description">«{{ draft.title }}» будет удалена из базы данных.</p>
      <div class="calendar-confirm-actions"><button class="calendar-button" :disabled="interactionBusy" autofocus @click="cancelConfirmation">Отмена</button><button class="calendar-button calendar-button-danger" :disabled="interactionBusy" @click="deleteAndClose">{{ busy ? 'Удаление…' : 'Удалить' }}</button></div>
    </template>
    <template v-else>
      <h2 id="calendar-confirm-title">Сохранить изменения?</h2><p id="calendar-confirm-description">В задаче есть несохранённые изменения. Выберите, как продолжить.</p>
      <div class="calendar-confirm-actions"><button class="calendar-button" :disabled="interactionBusy" autofocus @click="cancelConfirmation">Продолжить редактирование</button><button class="calendar-button" :disabled="interactionBusy" @click="finishClose">Не сохранять</button><button class="calendar-button calendar-button-primary" :disabled="interactionBusy" @click="saveAndClose">{{ busy ? 'Сохранение…' : 'Сохранить' }}</button></div>
    </template>
  </dialog>
</template>
