<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { Archive, ClipboardList, FileText, Trash2, X } from 'lucide-vue-next';
import { instructionDeadline } from '../../../../shared/registry.js';
import { INSTRUCTION_OPTION_LABELS } from '../../../../shared/constants/settings.js';
import { createDialogMotion } from '../../../ui/dialogMotion.js';
import ConfirmDialog from './ConfirmDialog.vue';
import ControlCardDialog from './ControlCardDialog.vue';
import InstructionControlSchedule from '../schedule/InstructionControlSchedule.vue';
import { useAppStore } from '../../../app/appStore.js';
import { createInstructionDraft, snapshotInstruction } from '../instructionDraft.js';
import { INSTRUCTION_FORM_LIMITS } from '../inputLimits.js';

const props = defineProps({ record: { type: Object, required: true }, saving: Boolean, deleting: Boolean,
  error: { type: String, default: '' }, canEdit: { type: Boolean, default: true }, closing: Boolean, closingControl: Boolean,
  selectedCheckpoint: { type: String, default: '' },
  saveRecord: { type: Function, required: true }, deleteRecord: { type: Function, required: true },
  closeControl: { type: Function, default: null } });
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
const optionsMissing = computed(() => Object.keys(INSTRUCTION_OPTION_LABELS).some(field => !app.registryOptions[field].length));
const initialValue = JSON.stringify(form);
const initialSchedule = JSON.stringify(form.controlSchedule);
const dirty = computed(() => JSON.stringify(form) !== initialValue);
const leaving = shallowRef(false);
const closeRequested = shallowRef(false);
const requestingClose = shallowRef(false);
const confirmingControl = shallowRef(false);
const reportOpen = shallowRef(false);
const busy = computed(() => props.saving || props.deleting || props.closingControl || props.closing
  || leaving.value || closeRequested.value || reportOpen.value);
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
  if (busy.value || requestingClose.value || confirmingControl.value) return false;
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

async function closeControl() {
  if (busy.value || dirty.value || confirmingControl.value || !props.canEdit || !props.record.id || props.record.closedAt || !props.closeControl) return;
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
defineExpose({ requestClose, dirty, enterSurface, leaveSurface });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="registry-dialog registry-instruction-dialog" :aria-labelledby="titleId" :aria-describedby="helpId" @cancel.prevent="requestClose" @click="backdropClick">
      <div class="registry-dialog-header">
        <span class="registry-dialog-symbol" aria-hidden="true"><ClipboardList :size="20" /></span>
        <div class="registry-dialog-intro">
          <div class="registry-dialog-title">
            <h2 :id="titleId">{{ props.record.id ? 'Карточка указания' : 'Новое указание' }}</h2>
            <span v-if="props.record.id" class="registry-card-id">ID {{ props.record.id }}</span>
            <span v-if="props.record.closedAt" class="registry-status">Закрытый контроль</span>
          </div>
          <p :id="helpId" class="registry-help">Обязательные поля отмечены звёздочкой.</p>
        </div>
        <span v-if="props.record.id && !props.record.closedAt && props.closeControl" :title="dirty ? 'Сохраните изменения и снова откройте карточку.' : undefined">
          <button type="button" class="registry-button registry-card-close-control" :disabled="busy || dirty || !props.canEdit" @click="closeControl"><Archive :size="15" aria-hidden="true" />{{ props.closingControl ? 'Закрытие…' : 'Закрытие контроля' }}</button>
        </span>
        <button type="button" class="registry-button registry-close-button" aria-label="Закрыть карточку" :disabled="busy" @click="requestClose"><X :size="20" aria-hidden="true" /></button>
      </div>
      <form ref="formElement" class="registry-instruction-form" @submit.prevent="save">
        <div class="registry-dialog-body registry-instruction-body">
          <p v-if="props.error" :id="errorId" ref="errorElement" class="registry-form-error" role="alert" tabindex="-1">{{ props.error }}</p>
          <p v-if="optionsMissing" class="registry-help registry-options-hint">
            Добавьте варианты для карточки указания в <RouterLink to="/settings">настройках</RouterLink>.
          </p>
          <div class="registry-instruction-columns">
            <div class="registry-instruction-document">
              <fieldset class="registry-form-grid" :disabled="busy || !props.canEdit" :aria-describedby="props.error ? errorId : undefined">
                <legend>Документ</legend>
                <label class="registry-field registry-field-wide"><span>Название указания *</span><input v-model="form.title" name="title" type="text" required :maxlength="INSTRUCTION_FORM_LIMITS.title" /></label>
                <label class="registry-field"><span>Входящий номер</span><input v-model="form.incomingNumber" name="incomingNumber" type="text" :maxlength="INSTRUCTION_FORM_LIMITS.incomingNumber" placeholder="Например, 001/в" /></label>
                <label class="registry-field"><span>Подписной номер *</span><input ref="instructionNumber" v-model="form.instructionNumber" name="instructionNumber" type="text" required :maxlength="INSTRUCTION_FORM_LIMITS.instructionNumber" /></label>
                <label class="registry-field">
                  <span>{{ INSTRUCTION_OPTION_LABELS.documentType }}</span>
                  <select v-model="form.documentType" name="documentType">
                    <option value="">Не указано</option>
                    <option v-for="value in optionsFor('documentType')" :key="value" :value="value">{{ value }}</option>
                  </select>
                </label>
                <label class="registry-field">
                  <span>{{ INSTRUCTION_OPTION_LABELS.source }}</span>
                  <select v-model="form.source" name="source">
                    <option value="">Не указано</option>
                    <option v-for="value in optionsFor('source')" :key="value" :value="value">{{ value }}</option>
                  </select>
                </label>
                <label class="registry-field registry-field-wide"><span>Резолюция</span><textarea v-model="form.summary" name="summary" rows="2" :maxlength="INSTRUCTION_FORM_LIMITS.summary" /></label>
                <label class="registry-field registry-field-wide"><span>Отметка об исполнении</span><textarea v-model="form.executionMark" name="executionMark" rows="2" :maxlength="INSTRUCTION_FORM_LIMITS.executionMark" placeholder="Комментарий к исполнению" /></label>
              </fieldset>
            </div>
            <div class="registry-instruction-control">
              <fieldset class="registry-form-grid" :disabled="busy || !props.canEdit">
                <legend>Исполнение</legend>
                <label class="registry-field"><span>Дата постановки на контроль *</span><input v-model="form.controlDate" name="controlDate" type="date" required /></label>
                <label class="registry-field">
                  <span>{{ INSTRUCTION_OPTION_LABELS.executor }} *</span>
                  <select v-model="form.executor" name="executor" required>
                    <option value="" disabled>Выберите исполнителя</option>
                    <option v-for="value in optionsFor('executor')" :key="value" :value="value">{{ value }}</option>
                  </select>
                </label>
                <label class="registry-field"><span>Срок исполнения *</span><input v-model="form.deadline" name="deadline" type="date" required /></label>
                <label class="registry-field"><span>Продлён до</span><input v-model="form.extendedUntil" name="extendedUntil" type="date" :min="form.deadline || undefined" /></label>
              </fieldset>
              <InstructionControlSchedule ref="scheduleEditor" v-model="form.controlSchedule" :control-date="form.controlDate"
                :deadline="instructionDeadline(form)" :selected-date="props.selectedCheckpoint" :closed="Boolean(props.record.closedAt)" :disabled="busy || !props.canEdit" />
            </div>
          </div>
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
