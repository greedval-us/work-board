<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { FileText, Trash2, X } from 'lucide-vue-next';
import { instructionDeadline, INSTRUCTION_STATUSES } from '../../../shared/registry.js';
import { ENTITY_TYPES } from '../../../shared/constants/entities.js';
import { REGISTRY_OPTION_LABELS } from '../../../shared/constants/settings.js';
import { createDialogMotion } from '../../infrastructure/dialogMotion.js';
import ConfirmDialog from './ConfirmDialog.vue';
import ControlCardDialog from './ControlCardDialog.vue';
import InstructionControlSchedule from './InstructionControlSchedule.vue';
import AttachmentPanel from '../attachments/AttachmentPanel.vue';
import { useAppStore } from '../../stores/appStore.js';
import { createInstructionDraft, snapshotInstruction } from '../../domain/instructions.js';
import { INSTRUCTION_FORM_LIMITS } from '../../constants/inputLimits.js';

const props = defineProps({ record: { type: Object, required: true }, saving: Boolean, deleting: Boolean,
  error: { type: String, default: '' }, canEdit: { type: Boolean, default: true }, closing: Boolean,
  selectedCheckpoint: { type: String, default: '' },
  saveRecord: { type: Function, required: true }, deleteRecord: { type: Function, required: true } });
const emit = defineEmits(['close']);
const dialog = useTemplateRef('dialog');
const formElement = useTemplateRef('formElement');
const instructionNumber = useTemplateRef('instructionNumber');
const reportButton = useTemplateRef('reportButton');
const scheduleEditor = useTemplateRef('scheduleEditor');
const confirmation = useTemplateRef('confirmation');
const errorElement = useTemplateRef('errorElement');
const titleId = useId();
const helpId = useId();
const errorId = useId();
const form = reactive(createInstructionDraft(props.record));
const app = useAppStore();
const generation = app.database?.generation;
const optionsMissing = computed(() => Object.keys(REGISTRY_OPTION_LABELS).some(field => !app.registryOptions[field].length));
const attachmentBusy = shallowRef(false);
const initialValue = JSON.stringify(form);
const initialSchedule = JSON.stringify(form.controlSchedule);
const dirty = computed(() => JSON.stringify(form) !== initialValue);
const leaving = shallowRef(false);
const closeRequested = shallowRef(false);
const requestingClose = shallowRef(false);
const reportOpen = shallowRef(false);
const busy = computed(() => attachmentBusy.value || props.saving || props.deleting || props.closing || leaving.value || closeRequested.value || reportOpen.value);
const motion = createDialogMotion(() => dialog.value);
let previousFocus;
let disposed = false;

function optionsFor(field) {
  const options = app.registryOptions[field];
  const saved = props.record[field];
  return saved && !options.includes(saved) ? [saved, ...options] : options;
}

async function enterSurface() {
  if (disposed) return false;
  leaving.value = false;
  closeRequested.value = false;
  const opened = motion.open();
  await nextTick();
  if (!disposed && !leaving.value && dialog.value?.open) {
    const focusedCheckpoint = props.selectedCheckpoint && await scheduleEditor.value?.focusSelectedDate();
    if (!focusedCheckpoint && !disposed && !leaving.value) instructionNumber.value?.focus();
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
  const data = snapshotInstruction(form);
  if (JSON.stringify(data.controlSchedule) === initialSchedule) delete data.controlSchedule;
  return props.saveRecord(data);
}

function openReport() {
  if (props.record.id && props.canEdit && !busy.value && !dirty.value) reportOpen.value = true;
}

async function closeReport() {
  reportOpen.value = false;
  await nextTick();
  reportButton.value?.focus();
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
    message: `Указание с подписным номером ${props.record.instructionNumber} будет удалено из реестра и календаря.`, primaryLabel: 'Удалить', danger: true });
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
      <div class="registry-dialog-header"><div><p class="registry-eyebrow">Реестр указаний<span v-if="props.record.id" class="registry-card-id"> · ID {{ props.record.id }}</span></p><h2 :id="titleId">{{ props.record.id ? 'Карточка указания' : 'Новое указание' }}</h2><p :id="helpId" class="registry-help">Обязательные поля отмечены звёздочкой.</p></div><button type="button" class="registry-button registry-close-button" aria-label="Закрыть карточку" :disabled="busy" @click="requestClose"><X :size="20" aria-hidden="true" /></button></div>
      <form ref="formElement" class="registry-instruction-form" @submit.prevent="save">
        <div class="registry-dialog-body">
          <p v-if="props.error" :id="errorId" ref="errorElement" class="registry-form-error" role="alert" tabindex="-1">{{ props.error }}</p>
          <p v-if="optionsMissing" class="registry-help registry-options-hint">
            Добавьте значения в раздел «Списки для реестра» в <RouterLink to="/settings">настройках</RouterLink>.
          </p>
          <fieldset class="registry-form-grid" :disabled="busy || !props.canEdit" :aria-describedby="props.error ? errorId : undefined">
            <label class="registry-field"><span>Дата постановки на контроль *</span><input v-model="form.controlDate" name="controlDate" type="date" required /></label>
            <label class="registry-field"><span>Входящий номер</span><input v-model="form.incomingNumber" name="incomingNumber" type="text" :maxlength="INSTRUCTION_FORM_LIMITS.incomingNumber" placeholder="Например, 001/в" /></label>
            <label class="registry-field"><span>Подписной номер *</span><input ref="instructionNumber" v-model="form.instructionNumber" name="instructionNumber" type="text" required :maxlength="INSTRUCTION_FORM_LIMITS.instructionNumber" /></label>
            <label class="registry-field">
              <span>{{ REGISTRY_OPTION_LABELS.source }}</span>
              <select v-model="form.source" name="source">
                <option value="">Не указано</option>
                <option v-for="value in optionsFor('source')" :key="value" :value="value">{{ value }}</option>
              </select>
            </label>
            <label class="registry-field registry-field-wide"><span>Название указания *</span><input v-model="form.title" name="title" type="text" required :maxlength="INSTRUCTION_FORM_LIMITS.title" /></label>
            <label class="registry-field registry-field-wide"><span>Резолюция</span><textarea v-model="form.summary" name="summary" rows="4" :maxlength="INSTRUCTION_FORM_LIMITS.summary" /></label>
            <label class="registry-field"><span>Срок исполнения *</span><input v-model="form.deadline" name="deadline" type="date" required /></label>
            <label class="registry-field"><span>Продлён до</span><input v-model="form.extendedUntil" name="extendedUntil" type="date" :min="form.deadline || undefined" /></label>
            <label class="registry-field">
              <span>{{ REGISTRY_OPTION_LABELS.executor }} *</span>
              <select v-model="form.executor" name="executor" required>
                <option value="" disabled>Выберите исполнителя</option>
                <option v-for="value in optionsFor('executor')" :key="value" :value="value">{{ value }}</option>
              </select>
            </label>
            <label class="registry-field">
              <span>{{ REGISTRY_OPTION_LABELS.controlType }}</span>
              <select v-model="form.controlType" name="controlType">
                <option value="">Не указано</option>
                <option v-for="value in optionsFor('controlType')" :key="value" :value="value">{{ value }}</option>
              </select>
            </label>
            <label class="registry-field registry-field-wide"><span>Статус исполнения *</span><select v-model="form.status" name="status" required><option v-for="(label, value) in INSTRUCTION_STATUSES" :key="value" :value="value">{{ label }}</option></select></label>
            <label class="registry-field registry-field-wide"><span>Отметка об исполнении</span><textarea v-model="form.executionMark" name="executionMark" rows="3" :maxlength="INSTRUCTION_FORM_LIMITS.executionMark" placeholder="Комментарий к исполнению" /></label>
          </fieldset>
          <InstructionControlSchedule ref="scheduleEditor" v-model="form.controlSchedule" :control-date="form.controlDate"
            :deadline="instructionDeadline(form)" :selected-date="props.selectedCheckpoint" :disabled="busy || !props.canEdit" />
          <AttachmentPanel v-model="form.attachments" :entity-type="ENTITY_TYPES.INSTRUCTIONS" :entity-id="props.record.id" :generation="generation" :disabled="busy || !props.canEdit" @busy="attachmentBusy = $event" />
        </div>
        <div class="registry-dialog-actions"><button v-if="props.record.id" type="button" class="registry-button registry-delete-button" :disabled="busy || !props.canEdit" @click="remove"><Trash2 :size="16" aria-hidden="true" />{{ props.deleting ? 'Удаление…' : 'Удалить' }}</button><span v-if="dirty" class="registry-unsaved-label">Не сохранено</span><div class="registry-actions">
          <span v-if="props.record.id" :title="dirty ? 'Сохраните изменения и снова откройте карточку.' : undefined">
            <button ref="reportButton" type="button" class="registry-button registry-control-card-open" :disabled="busy || dirty || !props.canEdit" @click="openReport"><FileText :size="16" aria-hidden="true" />Ф‑21 в Word</button>
          </span>
          <button type="button" class="registry-button" :disabled="busy" @click="requestClose">Отмена</button><button type="submit" class="registry-button registry-button-primary" :disabled="busy || !props.canEdit">{{ props.saving ? 'Сохранение…' : 'Сохранить' }}</button></div></div>
      </form>
    </dialog>
    <ConfirmDialog ref="confirmation" />
    <ControlCardDialog v-if="reportOpen" :record="props.record" :generation="generation" @close="closeReport" />
  </Teleport>
</template>
