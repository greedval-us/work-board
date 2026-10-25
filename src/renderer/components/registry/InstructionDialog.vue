<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { Trash2, X } from 'lucide-vue-next';
import { INSTRUCTION_STATUSES } from '../../../shared/registry.js';
import { createDialogMotion } from '../../infrastructure/dialogMotion.js';
import ConfirmDialog from './ConfirmDialog.vue';

const props = defineProps({ record: { type: Object, required: true }, saving: Boolean, deleting: Boolean,
  error: { type: String, default: '' }, canEdit: { type: Boolean, default: true }, closing: Boolean,
  saveRecord: { type: Function, required: true }, deleteRecord: { type: Function, required: true } });
const emit = defineEmits(['close']);
const dialog = useTemplateRef('dialog');
const formElement = useTemplateRef('formElement');
const instructionNumber = useTemplateRef('instructionNumber');
const confirmation = useTemplateRef('confirmation');
const errorElement = useTemplateRef('errorElement');
const titleId = useId();
const helpId = useId();
const errorId = useId();
const form = reactive(Object.fromEntries(['controlDate', 'incomingNumber', 'instructionNumber', 'title', 'summary', 'deadline', 'executor', 'status', 'executionMark'].map((key) => [key, props.record[key] ?? ''])));
const initialValue = JSON.stringify(form);
const dirty = computed(() => JSON.stringify(form) !== initialValue);
const leaving = shallowRef(false);
const closeRequested = shallowRef(false);
const requestingClose = shallowRef(false);
const busy = computed(() => props.saving || props.deleting || props.closing || leaving.value || closeRequested.value);
const motion = createDialogMotion(() => dialog.value);
let previousFocus;
let disposed = false;

async function enterSurface() {
  if (disposed) return false;
  leaving.value = false;
  closeRequested.value = false;
  const opened = motion.open();
  await nextTick();
  if (!disposed && !leaving.value && dialog.value?.open) instructionNumber.value?.focus();
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
  return props.saveRecord({ ...form });
}

async function requestClose() {
  if (props.closing || leaving.value || closeRequested.value) return true;
  if (busy.value || requestingClose.value) return false;
  requestingClose.value = true;
  try {
    if (!dirty.value) { closeRequested.value = true; emit('close'); return true; }
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
  const choice = await confirmation.value.ask({ title: 'Удалить указание?',
    message: `Указание № ${props.record.instructionNumber} будет удалено из реестра и календаря.`, primaryLabel: 'Удалить', danger: true });
  if (choice === 'primary') await props.deleteRecord();
}

function backdropClick(event) {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose();
}

watch(() => props.error, async (error) => { if (error) { await nextTick(); if (!disposed && !leaving.value) errorElement.value?.focus(); } });
onMounted(() => { previousFocus = document.activeElement; enterSurface(); });
onBeforeUnmount(() => { disposed = true; motion.dispose(); if (previousFocus?.isConnected) previousFocus.focus(); });
defineExpose({ requestClose, dirty, enterSurface, leaveSurface });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="registry-dialog registry-instruction-dialog" :aria-labelledby="titleId" :aria-describedby="helpId" @cancel.prevent="requestClose" @click="backdropClick">
      <div class="registry-dialog-header"><div><p class="registry-eyebrow">Реестр указаний</p><h2 :id="titleId">{{ props.record.id ? 'Карточка указания' : 'Новое указание' }}</h2><p :id="helpId" class="registry-help">Обязательные поля отмечены звёздочкой.</p></div><button type="button" class="registry-button registry-close-button" aria-label="Закрыть карточку" :disabled="busy" @click="requestClose"><X :size="20" aria-hidden="true" /></button></div>
      <form ref="formElement" class="registry-instruction-form" @submit.prevent="save">
        <div class="registry-dialog-body">
          <p v-if="props.error" :id="errorId" ref="errorElement" class="registry-form-error" role="alert" tabindex="-1">{{ props.error }}</p>
          <fieldset class="registry-form-grid" :disabled="busy || !props.canEdit" :aria-describedby="props.error ? errorId : undefined">
            <label class="registry-field"><span>Дата постановки на контроль *</span><input v-model="form.controlDate" type="date" required /></label>
            <label class="registry-field"><span>Входящий номер</span><input v-model="form.incomingNumber" type="text" maxlength="200" placeholder="Например, 001/в" /></label>
            <label class="registry-field"><span>Номер указания *</span><input ref="instructionNumber" v-model="form.instructionNumber" type="text" required maxlength="200" /></label>
            <label class="registry-field"><span>Срок исполнения *</span><input v-model="form.deadline" type="date" required /></label>
            <label class="registry-field registry-field-wide"><span>Название указания *</span><input v-model="form.title" type="text" required maxlength="500" /></label>
            <label class="registry-field registry-field-wide"><span>Краткое содержание указания</span><textarea v-model="form.summary" rows="4" maxlength="20000" /></label>
            <label class="registry-field"><span>Исполнитель *</span><input v-model="form.executor" type="text" required maxlength="300" /></label>
            <label class="registry-field"><span>Статус исполнения *</span><select v-model="form.status" required><option v-for="(label, value) in INSTRUCTION_STATUSES" :key="value" :value="value">{{ label }}</option></select></label>
            <label class="registry-field registry-field-wide"><span>Отметка об исполнении</span><textarea v-model="form.executionMark" rows="3" maxlength="10000" placeholder="Комментарий к исполнению" /></label>
          </fieldset>
        </div>
        <div class="registry-dialog-actions"><button v-if="props.record.id" type="button" class="registry-button registry-delete-button" :disabled="busy || !props.canEdit" @click="remove"><Trash2 :size="16" aria-hidden="true" />{{ props.deleting ? 'Удаление…' : 'Удалить' }}</button><span v-if="dirty" class="registry-unsaved-label">Не сохранено</span><div class="registry-actions"><button type="button" class="registry-button" :disabled="busy" @click="requestClose">Отмена</button><button type="submit" class="registry-button registry-button-primary" :disabled="busy || !props.canEdit">{{ props.saving ? 'Сохранение…' : 'Сохранить' }}</button></div></div>
      </form>
    </dialog>
    <ConfirmDialog ref="confirmation" />
  </Teleport>
</template>
