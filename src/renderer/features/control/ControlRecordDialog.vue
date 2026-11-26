<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { Archive, ClipboardList, Trash2, X } from 'lucide-vue-next';
import { INSTRUCTION_OPTION_LABELS } from '../../../shared/constants/settings.js';
import { useAppStore } from '../../app/appStore.js';
import ConfirmDialog from '../../ui/ConfirmDialog.vue';
import { createDialogMotion } from '../../ui/dialogMotion.js';
import { recordDialogProps } from './recordDialogProps.js';

const props = defineProps({
  ...recordDialogProps,
  title: { type: String, required: true },
  deleteTitle: { type: String, required: true },
  deleteMessage: { type: String, required: true },
  dirty: Boolean,
  blocked: Boolean,
  dialogClass: { type: String, default: '' },
  bodyClass: { type: String, default: 'registry-instruction-body' },
  focusCheckpoint: { type: Function, default: null },
});
const emit = defineEmits(['close']);
const dialog = useTemplateRef('dialog');
const formElement = useTemplateRef('formElement');
const confirmation = useTemplateRef('confirmation');
const errorElement = useTemplateRef('errorElement');
const titleId = useId();
const helpId = useId();
const errorId = useId();
const app = useAppStore();
const optionsMissing = computed(() => Object.keys(INSTRUCTION_OPTION_LABELS).some(field => !app.registryOptions[field].length));
const leaving = shallowRef(false);
const closeRequested = shallowRef(false);
const requestingClose = shallowRef(false);
const confirmingControl = shallowRef(false);
const busy = computed(() => props.saving || props.deleting || props.closingControl || props.closing
  || leaving.value || closeRequested.value || props.blocked);
const motion = createDialogMotion(() => dialog.value);
let previousFocus;
let disposed = false;

async function enterSurface() {
  if (disposed) return false;
  leaving.value = false;
  closeRequested.value = false;
  const opened = motion.open();
  await nextTick();
  if (!disposed && !leaving.value && dialog.value?.open) {
    const focusedCheckpoint = props.selectedCheckpoint && await props.focusCheckpoint?.();
    if (!focusedCheckpoint && !disposed && !leaving.value) dialog.value?.querySelector('[name="instructionNumber"]')?.focus();
  }
  return opened;
}

async function leaveSurface() {
  if (disposed) return false;
  leaving.value = true;
  closeRequested.value = true;
  return motion.close();
}

async function save() {
  if (busy.value || !props.canEdit || !formElement.value.reportValidity()) return false;
  return props.saveRecord();
}

async function requestClose() {
  if (props.closing || leaving.value || closeRequested.value) return true;
  if (busy.value || requestingClose.value || confirmingControl.value) return false;
  requestingClose.value = true;
  try {
    if (!props.dirty) { closeRequested.value = true; emit('close'); return true; }
    const choice = await confirmation.value.ask({ title: 'Сохранить изменения?',
      message: 'В карточке есть несохранённые изменения.', primaryLabel: 'Сохранить', secondaryLabel: 'Не сохранять', cancelLabel: 'Продолжить редактирование' });
    if (disposed) return false;
    if (choice === 'primary') return await save();
    if (choice === 'secondary') { closeRequested.value = true; emit('close'); return true; }
    return false;
  } finally { requestingClose.value = false; }
}

async function remove() {
  if (busy.value || !props.canEdit) return;
  const choice = await confirmation.value.ask({ title: props.deleteTitle,
    message: props.deleteMessage, primaryLabel: 'Удалить', danger: true });
  if (choice === 'primary') await props.deleteRecord();
}

async function closeControl() {
  if (busy.value || props.dirty || confirmingControl.value || !props.canEdit || !props.record.id || props.record.closedAt || !props.closeControl) return;
  confirmingControl.value = true;
  try { await props.closeControl(); }
  finally { confirmingControl.value = false; }
}

function backdropClick(event) {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
}

watch(() => props.error, async (error) => { if (error) { await nextTick(); if (!disposed && !leaving.value) errorElement.value?.focus(); } });
onMounted(() => { previousFocus = document.activeElement; enterSurface(); });
onBeforeUnmount(() => { disposed = true; motion.dispose(); if (previousFocus?.isConnected) previousFocus.focus(); });
defineExpose({ requestClose, enterSurface, leaveSurface });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="registry-dialog registry-instruction-dialog" :class="props.dialogClass" :aria-labelledby="titleId" :aria-describedby="helpId" @cancel.prevent="requestClose" @click="backdropClick">
      <div class="registry-dialog-header">
        <span class="registry-dialog-symbol" aria-hidden="true"><ClipboardList :size="20" /></span>
        <div class="registry-dialog-intro">
          <div class="registry-dialog-title">
            <h2 :id="titleId">{{ props.title }}</h2>
            <span v-if="props.record.id" class="registry-card-id">ID {{ props.record.id }}</span>
            <span v-if="props.record.closedAt" class="registry-status">Закрытый контроль</span>
          </div>
          <p :id="helpId" class="registry-help">Обязательные поля отмечены звёздочкой.</p>
        </div>
        <slot name="toolbar" :disabled="busy || !props.canEdit" />
        <span v-if="props.record.id && !props.record.closedAt && props.closeControl" :title="dirty ? 'Сохраните изменения и снова откройте карточку.' : undefined">
          <button type="button" class="registry-button registry-card-close-control" :disabled="busy || dirty || !props.canEdit" @click="closeControl"><Archive :size="15" aria-hidden="true" />{{ props.closingControl ? 'Закрытие…' : 'Закрытие контроля' }}</button>
        </span>
        <button type="button" class="registry-button registry-close-button" aria-label="Закрыть карточку" :disabled="busy" @click="requestClose"><X :size="20" aria-hidden="true" /></button>
      </div>
      <form ref="formElement" class="registry-instruction-form" @submit.prevent="save">
        <div class="registry-dialog-body" :class="props.bodyClass">
          <p v-if="props.error" :id="errorId" ref="errorElement" class="registry-form-error" role="alert" tabindex="-1">{{ props.error }}</p>
          <p v-if="optionsMissing" class="registry-help registry-options-hint">
            Добавьте варианты для выпадающих списков в <RouterLink to="/settings">настройках</RouterLink>.
          </p>
          <slot :disabled="busy || !props.canEdit" :error-id="props.error ? errorId : undefined" />
        </div>
        <div class="registry-dialog-actions"><button v-if="props.record.id" type="button" class="registry-button registry-delete-button" :disabled="busy || !props.canEdit" @click="remove"><Trash2 :size="16" aria-hidden="true" />{{ props.deleting ? 'Удаление…' : 'Удалить' }}</button><span v-if="dirty" class="registry-unsaved-label">Не сохранено</span><div class="registry-actions">
          <slot name="actions" :disabled="busy || !props.canEdit" />
          <button type="button" class="registry-button" :disabled="busy" @click="requestClose">Отмена</button><button type="submit" class="registry-button registry-button-primary" :disabled="busy || !props.canEdit">{{ props.saving ? 'Сохранение…' : 'Сохранить' }}</button></div></div>
      </form>
    </dialog>
    <ConfirmDialog ref="confirmation" />
  </Teleport>
</template>
