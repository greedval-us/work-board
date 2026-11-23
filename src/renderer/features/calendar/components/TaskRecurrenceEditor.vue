<script setup>
import { computed, shallowRef } from 'vue';
import { X } from 'lucide-vue-next';
import { DATE_LIMITS } from '../../../../shared/constants/dates.js';
import { CONTROL_WEEKDAY_LABELS, supportsControlDayOfMonth } from '../../../../shared/controlSchedule.js';
import { formatDate, isDate } from '../../../../shared/dates.js';
import { firstTaskOccurrence, TASK_RECURRENCE_FREQUENCIES } from '../../../../shared/taskRecurrence.js';
import { CALENDAR_MONTHS } from '../../../ui/calendarLabels.js';

const props = defineProps({
  startDate: { type: String, required: true },
  disabled: Boolean,
});
const recurrence = defineModel({ type: Object, required: true });
const customDate = shallowRef('');
const canAddCustomDate = computed(() => !props.disabled && isDate(props.startDate) && isDate(customDate.value) && customDate.value > props.startDate
  && !recurrence.value.customDates.includes(customDate.value));
const firstOccurrence = computed(() => recurrence.value.frequency
  ? firstTaskOccurrence({ date: props.startDate, recurrence: recurrence.value }) : '');

function setField(field, value) {
  if (!props.disabled) recurrence.value = { ...recurrence.value, [field]: value };
}

function setNumber(field, value) {
  setField(field, value === '' ? '' : Number(value));
}

function addCustomDate() {
  if (!canAddCustomDate.value) return;
  setField('customDates', [...recurrence.value.customDates, customDate.value].sort());
  customDate.value = '';
}

function removeCustomDate(date) {
  setField('customDates', recurrence.value.customDates.filter(candidate => candidate !== date));
}
</script>

<template>
  <div class="calendar-task-recurrence">
    <div class="calendar-recurrence-fields">
      <label class="calendar-field">Повторение
        <select :value="recurrence.frequency" :disabled="disabled" @change="setField('frequency', $event.target.value)" name="task-recurrence">
          <option v-for="(label, value) in TASK_RECURRENCE_FREQUENCIES" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label v-if="recurrence.frequency === 'weekly'" class="calendar-field">День недели
        <select :value="recurrence.dayOfWeek" :disabled="disabled" @change="setNumber('dayOfWeek', $event.target.value)" name="task-day-of-week">
          <option value="">Как в дате начала</option>
          <option v-for="(label, day) in CONTROL_WEEKDAY_LABELS" :key="day" :value="day">{{ label }}</option>
        </select>
      </label>
      <label v-if="supportsControlDayOfMonth(recurrence.frequency)" class="calendar-field">День месяца
        <input :value="recurrence.dayOfMonth" :disabled="disabled" @input="setNumber('dayOfMonth', $event.target.value)" name="task-day-of-month" type="number"
          min="1" max="31" step="1" inputmode="numeric" placeholder="Как в дате начала" />
      </label>
      <label v-if="recurrence.frequency === 'yearly'" class="calendar-field">Месяц
        <select :value="recurrence.monthOfYear" :disabled="disabled" @change="setNumber('monthOfYear', $event.target.value)" name="task-month-of-year">
          <option value="">Как в дате начала</option>
          <option v-for="(label, index) in CALENDAR_MONTHS" :key="label" :value="index + 1">{{ label }}</option>
        </select>
      </label>
    </div>
    <p v-if="firstOccurrence && firstOccurrence !== startDate" class="calendar-recurrence-help">
      Первая задача по графику — {{ formatDate(firstOccurrence) }}.
    </p>
    <div v-if="recurrence.frequency === 'custom'" class="calendar-recurrence-custom">
      <p class="calendar-recurrence-help">Дата начала уже входит в график. Можно добавить следующие даты.</p>
      <div class="calendar-custom-date">
        <label class="calendar-field">Дополнительная дата
          <input v-model="customDate" :disabled="disabled" name="task-custom-date" type="date" :min="startDate || DATE_LIMITS.MIN"
            :max="DATE_LIMITS.MAX" @keydown.enter.prevent="addCustomDate" />
        </label>
        <button type="button" class="calendar-button" :disabled="!canAddCustomDate" @click="addCustomDate">Добавить дату</button>
      </div>
      <ul v-if="recurrence.customDates.length" class="calendar-recurrence-dates">
        <li v-for="date in recurrence.customDates" :key="date">
          <time :datetime="date">{{ formatDate(date) }}</time>
          <button type="button" class="calendar-remove-recurrence-date" :disabled="disabled" :aria-label="`Убрать дату ${formatDate(date)}`" @click="removeCustomDate(date)">
            <X :size="13" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
