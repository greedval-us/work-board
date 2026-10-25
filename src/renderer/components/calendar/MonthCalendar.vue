<script setup>
import { computed, nextTick } from 'vue';
import { ChevronLeft, ChevronRight, FileText, ListTodo } from 'lucide-vue-next';
import { getUrgency, INSTRUCTION_STATUS, localDate } from '../../../shared/registry.js';
import { calendarDate, monthLabel, moveMonth } from '../../domain/calendarDates.js';
import { CALENDAR_LAYOUT, CALENDAR_WEEKDAYS } from '../../constants/calendar.js';

const props = defineProps({
  month: { type: String, required: true }, days: { type: Array, required: true },
  selectedDate: { type: String, required: true }, today: { type: String, required: true }, loading: Boolean,
});
const emit = defineEmits(['changeMonth', 'selectDate', 'today']);
const title = computed(() => monthLabel(props.month));
const buttons = new Map();
const visibleDays = computed(() => {
  const finalDay = props.days.findLastIndex((day) => day.inMonth);
  return props.days.slice(0, Math.max(CALENDAR_LAYOUT.MIN_VISIBLE_WEEKS, Math.ceil((finalDay + 1) / CALENDAR_LAYOUT.DAYS_PER_WEEK)) * CALENDAR_LAYOUT.DAYS_PER_WEEK);
});
const weekCount = computed(() => visibleDays.value.length / CALENDAR_LAYOUT.DAYS_PER_WEEK);
const days = computed(() => visibleDays.value.map((day) => ({
  ...day,
  controlTone: getUrgency({ deadline: day.date, status: INSTRUCTION_STATUS.PENDING }, props.today).tone,
  ariaLabel: `${day.date}, контролей: ${day.controls}, задач: ${day.tasks}${day.date === props.today ? ', сегодня' : ''}`,
})));

async function navigate(event, day, index) {
  const weekLength = CALENDAR_LAYOUT.DAYS_PER_WEEK;
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -weekLength, ArrowDown: weekLength, Home: -(index % weekLength), End: weekLength - 1 - (index % weekLength) }[event.key];
  let date;
  if (delta !== undefined) {
    const target = calendarDate(day.date);
    target.setDate(target.getDate() + delta);
    date = localDate(target);
  } else if (event.key === 'PageUp' || event.key === 'PageDown') {
    date = `${moveMonth(day.date.slice(0, 7), event.key === 'PageUp' ? -1 : 1)}-01`;
  } else return;
  event.preventDefault();
  emit('selectDate', date);
  await nextTick();
  buttons.get(date)?.focus();
}

function registerButton(date, element) {
  if (element) buttons.set(date, element);
  else buttons.delete(date);
}
</script>

<template>
  <section class="calendar-month-panel" aria-label="Месячный календарь" :aria-busy="loading">
    <div class="calendar-month-toolbar">
      <h2 aria-live="polite">{{ title }}</h2>
      <div class="calendar-month-navigation">
        <button class="calendar-button calendar-today-button" @click="emit('today')">Сегодня</button>
        <button class="calendar-icon-button" aria-label="Предыдущий месяц" @click="emit('changeMonth', -1)"><ChevronLeft :size="18" aria-hidden="true" /></button>
        <button class="calendar-icon-button" aria-label="Следующий месяц" @click="emit('changeMonth', 1)"><ChevronRight :size="18" aria-hidden="true" /></button>
      </div>
    </div>
    <div class="calendar-weekdays" aria-hidden="true"><span v-for="name in CALENDAR_WEEKDAYS" :key="name">{{ name }}</span></div>
    <div class="calendar-month-grid" role="group" :aria-label="title" :style="{ '--calendar-weeks': weekCount }">
      <button
        v-for="(day, index) in days" :key="day.date" :ref="(element) => registerButton(day.date, element)"
        class="calendar-date" :class="{ 'calendar-date-outside': !day.inMonth, 'calendar-date-selected': day.date === selectedDate, 'calendar-date-today': day.date === today }"
        :aria-label="day.ariaLabel" :aria-pressed="day.date === selectedDate" :aria-current="day.date === today ? 'date' : undefined"
        :tabindex="day.date === selectedDate ? 0 : -1" @click="emit('selectDate', day.date)" @keydown="navigate($event, day, index)"
      >
        <span class="calendar-date-number">{{ day.day }}</span>
        <span class="calendar-date-events">
          <span v-if="day.controls" class="calendar-date-count" :class="`calendar-tone-${day.controlTone}`" :title="`Контроли: ${day.controls}`"><FileText :size="11" aria-hidden="true" />{{ day.controls }}</span>
          <span v-if="day.tasks" class="calendar-date-count calendar-tone-info" :title="`Задачи: ${day.tasks}`"><ListTodo :size="12" aria-hidden="true" />{{ day.tasks }}</span>
        </span>
      </button>
    </div>
    <div class="calendar-month-caption">
      <div class="calendar-month-legend"><span><FileText :size="12" aria-hidden="true" />Контроли</span><span><ListTodo :size="13" aria-hidden="true" />Задачи</span></div>
      <span v-if="loading" role="status">Обновление…</span><span v-else>Активные</span>
    </div>
  </section>
</template>
