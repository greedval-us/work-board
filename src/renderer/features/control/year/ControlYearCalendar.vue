<script setup>
import { computed, nextTick, onBeforeUnmount, shallowRef, useId, useTemplateRef, watch } from 'vue';
import { ChevronLeft, ChevronRight, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-vue-next';
import { DATE_LIMITS } from '../../../../shared/constants/dates.js';
import { daysInMonth } from '../../../../shared/dates.js';
import { calendarDate } from '../../../ui/calendarDates.js';
import { CALENDAR_MONTHS, CALENDAR_WEEKDAYS } from '../../../ui/calendarLabels.js';
import { groupYearEvents } from './yearOverdue.js';
import YearDateTooltip from './YearDateTooltip.vue';

const props = defineProps({
  year: { type: Number, required: true }, events: { type: Array, required: true },
  today: { type: String, required: true }, planning: Boolean, closed: Boolean, loading: Boolean,
  error: { type: String, default: '' },
});
const emit = defineEmits(['change-year', 'retry', 'open-record']);
const minYear = Number(DATE_LIMITS.MIN.slice(0, 4));
const maxYear = Number(DATE_LIMITS.MAX.slice(0, 4));
const currentYear = computed(() => Number(props.today.slice(0, 4)));
const monthPanel = useTemplateRef('monthPanel');
const tooltip = useTemplateRef('tooltip');
const tooltipId = useId();
const headingId = useId();
const dateLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const selected = shallowRef(null);
const onlyOverdue = shallowRef(false);
let pinned = false;
let insideTooltip = false;
let closeTimer;

const eventsByDate = computed(() => groupYearEvents(props.events, props.today, props.closed, onlyOverdue.value));

function markedDateLabel(date) {
  const { events, overdue } = eventsByDate.value.get(date);
  const label = `${dateLabel.format(calendarDate(date))}. Событий: ${events.length}`;
  return overdue ? `${label}. Просрочено: ${overdue}` : label;
}

const months = computed(() => CALENDAR_MONTHS.map((name, index) => {
  const month = index + 1;
  const prefix = `${String(props.year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const offset = (calendarDate(`${prefix}-01`).getDay() + 6) % 7;
  const count = daysInMonth(props.year, month);
  const weeks = Array.from({ length: Math.ceil((offset + count) / 7) }, (_, week) =>
    CALENDAR_WEEKDAYS.map((_, weekday) => {
      const number = week * 7 + weekday + 1 - offset;
      if (number < 1 || number > count) return null;
      return { number, date: `${prefix}-${String(number).padStart(2, '0')}` };
    }));
  return { name, weeks };
}));

function close() {
  clearTimeout(closeTimer);
  selected.value = null;
  pinned = false;
  insideTooltip = false;
}

function show(event, date) {
  if (event.type === 'pointerenter' && tooltip.value?.contains(document.activeElement)) return;
  clearTimeout(closeTimer);
  if (selected.value?.date !== date) {
    pinned = false;
    selected.value = { date, anchor: event.currentTarget };
  }
}

function closePanel(restoreFocus = false) {
  if (restoreFocus && selected.value?.anchor.isConnected) selected.value.anchor.focus({ preventScroll: true });
  close();
}

function openRecord(id, checkpoint) {
  closePanel(true);
  emit('open-record', id, checkpoint);
}

async function toggle(event, date) {
  if (event.detail !== 0 && pinned && selected.value?.date === date) { close(); return; }
  show(event, date);
  pinned = true;
  if (event.detail === 0) { await nextTick(); tooltip.value?.focusFirst(); }
}

function triggerKeydown(event) {
  if (event.currentTarget !== selected.value?.anchor) return;
  if (event.key === 'Tab' && !event.shiftKey && tooltip.value?.focusFirst()) {
    event.preventDefault();
    return;
  }
  tooltip.value?.scrollByKey(event);
}

function deferClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (!pinned && !insideTooltip && selected.value?.anchor !== document.activeElement && !tooltip.value?.contains(document.activeElement)) close();
  }, 180);
}

function blur(event) {
  if (selected.value?.anchor !== event.currentTarget || tooltip.value?.contains(event.relatedTarget)) return;
  pinned = false;
  deferClose();
}

function hoverTooltip(entered) {
  insideTooltip = entered;
  if (entered) clearTimeout(closeTimer);
  else deferClose();
}

watch(() => [props.year, props.loading, props.error], close);
watch(() => props.closed, () => { onlyOverdue.value = false; });
watch(eventsByDate, groups => { if (selected.value && !groups.has(selected.value.date)) close(); });
onBeforeUnmount(close);
</script>

<template>
  <section class="control-year-calendar" :class="{ 'control-year-planning': planning }" :aria-labelledby="headingId" :aria-busy="loading">
    <header class="control-year-header">
      <h2 :id="headingId">{{ year }} год</h2>
      <ul class="control-year-legend" aria-label="Обозначения календаря">
        <li v-if="!onlyOverdue">Сроки и проверки</li>
        <li v-if="!closed" class="control-year-legend-overdue">Есть просрочка</li>
      </ul>
      <button v-if="!closed" type="button" class="registry-button registry-filter-toggle"
        :class="{ 'registry-filter-toggle-active': onlyOverdue }" :aria-pressed="onlyOverdue" @click="onlyOverdue = !onlyOverdue">
        <component :is="onlyOverdue ? ToggleRight : ToggleLeft" :size="19" aria-hidden="true" />Только просроченные
      </button>
      <div class="control-year-navigation" role="group" aria-label="Выбор года">
        <button type="button" class="registry-button" aria-label="Предыдущий год" title="Предыдущий год"
          :disabled="year <= minYear" @click="emit('change-year', year - 1)"><ChevronLeft :size="16" aria-hidden="true" /></button>
        <button type="button" class="registry-button" @click="emit('change-year', currentYear)">Текущий год</button>
        <button type="button" class="registry-button" aria-label="Следующий год" title="Следующий год"
          :disabled="year >= maxYear" @click="emit('change-year', year + 1)"><ChevronRight :size="16" aria-hidden="true" /></button>
      </div>
    </header>
    <p v-if="onlyOverdue && !loading && !error && !eventsByDate.size" class="control-year-message" role="status">В выбранном году просроченных контролей нет.</p>
    <p v-if="loading" class="control-year-message" role="status">Загрузка календаря…</p>
    <div v-else-if="error" class="control-year-message control-year-error" role="alert">
      <span>{{ error }}</span><button type="button" class="registry-button" @click="emit('retry')"><RefreshCw :size="14" aria-hidden="true" />Повторить</button>
    </div>
    <div v-else ref="monthPanel" class="control-year-months">
      <table v-for="month in months" :key="month.name" class="control-year-month">
        <caption>{{ month.name }}</caption>
        <thead>
          <tr><th v-for="weekday in CALENDAR_WEEKDAYS" :key="weekday" scope="col">{{ weekday }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(week, weekIndex) in month.weeks" :key="weekIndex">
            <td v-for="(day, weekday) in week" :key="weekday">
              <template v-if="day">
                <button v-if="eventsByDate.has(day.date)" type="button" class="control-year-day control-year-marked"
                  :class="{ 'control-year-overdue': eventsByDate.get(day.date).overdue > 0 }"
                  :data-control-date="day.date" :aria-label="markedDateLabel(day.date)"
                  :aria-current="day.date === today ? 'date' : undefined" aria-haspopup="dialog" :aria-expanded="selected?.date === day.date"
                  :aria-controls="selected?.date === day.date ? tooltipId : undefined"
                  @focus="show($event, day.date)" @blur="blur" @click="toggle($event, day.date)"
                  @pointerenter="$event.pointerType !== 'touch' && show($event, day.date)" @pointerleave="deferClose"
                  @keydown="triggerKeydown">{{ day.number }}</button>
                <span v-else class="control-year-day" :aria-current="day.date === today ? 'date' : undefined">{{ day.number }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <YearDateTooltip v-if="selected && monthPanel" :id="tooltipId" ref="tooltip" :date="selected.date"
      :anchor="selected.anchor" :viewport="monthPanel" :events="eventsByDate.get(selected.date)?.events ?? []" :today="today" :planning="planning" :closed="closed"
      @close="closePanel" @hover="hoverTooltip" @open-record="openRecord" />
  </section>
</template>

<style scoped>
.control-year-calendar { --year-mark: var(--accent); display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; container-type: inline-size; overflow: hidden; }
.control-year-planning { --year-mark: var(--violet); }
.control-year-header { display: flex; flex: none; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.control-year-header h2 { margin: 0; font-size: calc(17px + var(--app-font-offset)); font-weight: 620; font-variant-numeric: tabular-nums; }
.control-year-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 0 auto 0 0; padding: 0; list-style: none; color: var(--muted); font-size: calc(11px + var(--app-font-offset)); }
.control-year-legend li { display: inline-flex; align-items: center; gap: 5px; }
.control-year-legend li::before { content: ''; width: 11px; height: 7px; border-bottom: 2px solid var(--year-mark); border-radius: 2px; background: var(--grouped); }
.control-year-legend .control-year-legend-overdue::before { border: 1px solid var(--error); border-bottom-width: 2px; background: var(--error-surface); }
.control-year-navigation { display: flex; align-items: center; gap: 3px; }
.control-year-navigation .registry-button { min-height: 28px; padding: 3px 7px; }
.control-year-message { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 14px; color: var(--muted); }
.control-year-error { color: var(--error); }
.control-year-months { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 164px), 1fr)); align-content: start; align-items: start; gap: 16px 18px; min-height: 0; padding: 12px 14px 16px; overflow: auto; scrollbar-width: thin; }
@container (min-width: 575px) { .control-year-months { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (min-width: 745px) { .control-year-months { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (min-width: 1130px) { .control-year-months { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.control-year-month { width: 100%; table-layout: fixed; border-collapse: collapse; color: var(--text); font-variant-numeric: tabular-nums; text-align: center; }
.control-year-month caption { padding-bottom: 5px; font-size: calc(13px + var(--app-font-offset)); font-weight: 620; text-align: left; }
.control-year-month th { color: var(--muted); font-size: max(10px, calc(10px + var(--app-font-offset))); font-weight: 500; }
.control-year-month th, .control-year-month td { padding: 1px 0; }
.control-year-day { display: inline-grid; position: relative; width: 100%; max-width: 2.3em; min-height: max(22px, 1.65em); place-content: center; border: 1px solid transparent; border-radius: 5px; font: inherit; font-size: max(10px, calc(11px + var(--app-font-offset))); line-height: 1; }
.control-year-marked { color: var(--text); background: var(--grouped); background: color-mix(in srgb, var(--year-mark) 13%, var(--panel)); font-weight: 620; cursor: pointer; }
.control-year-marked::after { content: ''; position: absolute; inset: auto 30% 0; height: 2px; border-radius: 2px; background: var(--year-mark); }
.control-year-overdue { --year-mark: var(--error); color: var(--error); background: var(--error-surface); border-color: var(--error); }
.control-year-marked:hover, .control-year-marked:focus-visible, .control-year-day[aria-current='date'] { border-color: var(--year-mark); }
.control-year-marked:focus-visible { outline: 2px solid var(--year-mark); outline-offset: 1px; }
@media (forced-colors: active) { .control-year-marked { text-decoration: underline; } }
@media (pointer: coarse) { .control-year-day { min-height: 28px; } }
</style>
