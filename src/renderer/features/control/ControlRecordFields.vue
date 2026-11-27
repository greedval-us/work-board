<script setup>
import { useTemplateRef } from 'vue';
import { effectiveDeadline } from '../../../shared/controlRecord.js';
import { INSTRUCTION_OPTION_LABELS } from '../../../shared/constants/settings.js';
import { useAppStore } from '../../app/appStore.js';
import ControlScheduleEditor from './schedule/ControlScheduleEditor.vue';

const form = defineModel({ type: Object, required: true });
const props = defineProps({
  titleLabel: { type: String, required: true },
  record: { type: Object, required: true },
  showDocumentDetails: { type: Boolean, default: true },
  selectedCheckpoint: { type: String, default: '' },
  errorId: { type: String, default: undefined },
  disabled: Boolean,
  closed: Boolean,
});
const limits = { incomingNumber: 200, instructionNumber: 200, title: 500, summary: 20_000, executionMark: 10_000 };
const app = useAppStore();
const scheduleEditor = useTemplateRef('scheduleEditor');

function optionsFor(field) {
  const options = app.registryOptions[field];
  const saved = props.record[field];
  return saved && !options.includes(saved) ? [saved, ...options] : options;
}

defineExpose({ focusSelectedDate: () => scheduleEditor.value?.focusSelectedDate() });
</script>

<template>
  <div class="registry-instruction-columns">
    <div class="registry-instruction-document">
      <fieldset class="registry-form-grid" :disabled="props.disabled" :aria-describedby="props.errorId">
        <legend>Документ</legend>
        <template v-if="props.showDocumentDetails">
          <label class="registry-field registry-field-wide"><span>{{ props.titleLabel }} *</span><input v-model="form.title" name="title" type="text" required :maxlength="limits.title" /></label>
          <label class="registry-field"><span>Входящий номер</span><input v-model="form.incomingNumber" name="incomingNumber" type="text" :maxlength="limits.incomingNumber" placeholder="Например, 001/в" /></label>
          <label class="registry-field"><span>Подписной номер *</span><input v-model="form.instructionNumber" name="instructionNumber" type="text" required :maxlength="limits.instructionNumber" /></label>
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
          <label class="registry-field registry-field-wide"><span>Резолюция</span><textarea v-model="form.summary" name="summary" rows="2" :maxlength="limits.summary" /></label>
        </template>
        <slot name="before-execution-mark" />
        <label class="registry-field registry-field-wide"><span>Отметка об исполнении</span><textarea v-model="form.executionMark" name="executionMark" rows="2" :maxlength="limits.executionMark" placeholder="Комментарий к исполнению" /></label>
      </fieldset>
    </div>
    <div class="registry-instruction-control">
      <fieldset class="registry-form-grid" :disabled="props.disabled">
        <legend>Исполнение</legend>
        <slot name="execution-start" />
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
      <ControlScheduleEditor ref="scheduleEditor" v-model="form.controlSchedule" :control-date="form.controlDate"
        :deadline="effectiveDeadline(form)" :selected-date="props.selectedCheckpoint" :closed="props.closed" :disabled="props.disabled" />
    </div>
  </div>
</template>
