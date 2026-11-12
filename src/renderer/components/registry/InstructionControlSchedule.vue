<script setup>
import { computed, nextTick, shallowRef, useId, useTemplateRef, watch, watchEffect } from 'vue';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import { CONTROL_FREQUENCIES, CONTROL_MARK_LIMIT, listControlCheckpoints, moveControlCheckpoint } from '../../../shared/controlSchedule.js';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { daysInMonth, formatDate, localDate, validateDate } from '../../../shared/dates.js';
import { getUrgency, INSTRUCTION_STATUS } from '../../../shared/registry.js';
import { moveMonth } from '../../domain/calendarDates.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';

const props = defineProps({
  controlDate: { type: String, default: '' },
  deadline: { type: String, default: '' },
  selectedDate: { type: String, default: '' },
  disabled: Boolean,
});
const schedule = defineModel({ type: Object, required: true });
const section = useTemplateRef('section');
const customDateInput = useTemplateRef('customDateInput');
const sectionId = useId();
const customDate = shallowRef('');
const openDate = shallowRef(isDate(props.selectedDate) ? props.selectedDate : '');
const plannedDate = shallowRef(openDate.value);
const moveError = shallowRef('');
const actualDateDrafts = shallowRef({});
const editedHistoryDate = shallowRef('');
const month = shallowRef(openDate.value ? openDate.value.slice(0, 7) : startingMonth(schedule.value));
const recurring = computed(() => schedule.value.frequency && schedule.value.frequency !== 'custom');
const custom = computed(() => schedule.value.frequency === 'custom');
const configuredDates = computed(() => new Set(custom.value ? effectiveCustomDates(schedule.value) : []));
const invalidCustomDate = computed(() => [...configuredDates.value].find(date => !inControlPeriod(date)));
const invalidCheckpointDate = computed(() => invalidCustomDate.value || schedule.value.moves?.find(move => !inControlPeriod(move.to))?.to);
const duplicateDate = computed(() => configuredDates.value.has(customDate.value) || schedule.value.customDates.includes(customDate.value));
const canAddDate = computed(() => !props.disabled && inControlPeriod(customDate.value) && !duplicateDate.value);
const showPreview = computed(() => Boolean(recurring.value || configuredDates.value.size || schedule.value.marks.length || editedHistoryDate.value));
const marksByDate = computed(() => new Map(schedule.value.marks.map(mark => [mark.date, mark])));

const rows = computed(() => {
  const [year, monthNumber] = month.value.split('-').map(Number);
  const from = `${month.value}-01`;
  const to = `${month.value}-${daysInMonth(year, monthNumber)}`;
  const moves = new Map((schedule.value.moves ?? []).map(move => [move.from, move.to]));
  const validSchedule = {
    ...schedule.value,
    firstDate: inControlPeriod(schedule.value.firstDate) ? schedule.value.firstDate : '',
    customDates: schedule.value.customDates.filter(date => inControlPeriod(moves.get(date) ?? date)),
  };
  const checkpoints = listControlCheckpoints(validSchedule, { from, to, deadline: props.deadline });
  const byDate = new Map(checkpoints.map(row => [row.date, row]));
  // Keep invalid custom dates removable and keep an open history editor mounted while its text is being replaced.
  for (const date of [...configuredDates.value, editedHistoryDate.value]) {
    if (date >= from && date <= to && !byDate.has(date)) byDate.set(date, { date, mark: '', scheduled: false });
  }
  // A changed control period must not hide a move that the user needs to repair or cancel.
  for (const [originalDate, date] of moves) {
    if (date < from || date > to) continue;
    const row = byDate.get(date) ?? { date, mark: marksByDate.value.get(date)?.text ?? '', scheduled: false };
    byDate.set(date, { ...row, originalDate, scheduled: row.scheduled && inControlPeriod(date) });
  }
  const today = localDate();
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).map(row => {
    const configured = configuredDates.value.has(row.date);
    return {
      ...row,
      configured,
      movable: Boolean(row.scheduled || row.originalDate),
      canOpen: Boolean(row.scheduled || row.originalDate || row.mark || editedHistoryDate.value === row.date),
      status: checkpointStatus(row, today, configured),
    };
  });
});

function isDate(date) {
  try { return Boolean(validateDate(date)); }
  catch { return false; }
}

function inControlPeriod(date) {
  return isDate(date) && (!props.controlDate || date >= props.controlDate) && (!props.deadline || date <= props.deadline);
}

function effectiveCustomDates(value) {
  const moves = new Map((value.moves ?? []).map(move => [move.from, move.to]));
  return value.customDates.map(date => moves.get(date) ?? date).sort();
}

function startingMonth(value) {
  const today = localDate();
  const recentMark = value.marks.at(-1)?.date;
  if (value.frequency === 'custom' && value.customDates.length) {
    const dates = effectiveCustomDates(value);
    const upcoming = dates.find(date => date >= today);
    return (upcoming || dates.at(-1)).slice(0, 7);
  }
  if (value.frequency && isDate(value.firstDate)) {
    if (value.firstDate > today) return value.firstDate.slice(0, 7);
    if (!props.deadline || props.deadline >= today) return today.slice(0, 7);
    return (recentMark > props.deadline ? recentMark : props.deadline).slice(0, 7);
  }
  return (recentMark || (isDate(props.controlDate) ? props.controlDate : today)).slice(0, 7);
}

function selectFrequency(frequency) {
  if (props.disabled || frequency === schedule.value.frequency) return;
  const fixed = frequency && frequency !== 'custom';
  const firstDate = fixed ? schedule.value.firstDate || (inControlPeriod(props.controlDate) ? props.controlDate : '') : '';
  const updated = { ...schedule.value, frequency, firstDate, customDates: [] };
  delete updated.moves;
  schedule.value = updated;
  customDate.value = '';
  showMonth(startingMonth(updated));
}

function selectFirstDate(date) {
  if (props.disabled || date === schedule.value.firstDate) return;
  const updated = { ...schedule.value, firstDate: date };
  delete updated.moves;
  schedule.value = updated;
  if (isDate(date)) showMonth(date.slice(0, 7));
}

function addCustomDate() {
  if (!canAddDate.value) return;
  const date = customDate.value;
  schedule.value = { ...schedule.value, customDates: [...schedule.value.customDates, date].sort() };
  customDate.value = '';
  showMonth(date.slice(0, 7));
  customDateInput.value?.focus();
}

function removeCustomDate(date) {
  if (props.disabled) return;
  const originalDate = schedule.value.moves?.find(move => move.to === date)?.from ?? date;
  const updated = { ...schedule.value, customDates: schedule.value.customDates.filter(value => value !== originalDate) };
  if (updated.moves) {
    updated.moves = updated.moves.filter(move => move.from !== originalDate);
    if (!updated.moves.length) delete updated.moves;
  }
  schedule.value = updated;
  if (openDate.value === date && !marksByDate.value.get(date)?.text.trim()) toggleMark(date);
  customDateInput.value?.focus();
}

function showMonth(value) {
  if (!isDate(`${value}-01`)) return;
  month.value = value;
  openDate.value = '';
  plannedDate.value = '';
  moveError.value = '';
  editedHistoryDate.value = '';
}

function selectMonth(event) {
  showMonth(event.target.value);
  event.target.value = month.value;
}

function toggleMark(date) {
  openDate.value = openDate.value === date ? '' : date;
  plannedDate.value = openDate.value;
  moveError.value = '';
  editedHistoryDate.value = '';
}

function actualDateDraft(row) {
  const mark = marksByDate.value.get(row.date);
  return actualDateDrafts.value[row.date] ?? {
    date: mark?.actualDate ?? (mark ? row.date : localDate()),
    explicit: Boolean(mark?.actualDate || !mark),
  };
}

function updateActualDate(row, date) {
  if (props.disabled) return;
  actualDateDrafts.value = { ...actualDateDrafts.value, [row.date]: { date, explicit: true } };
  const mark = marksByDate.value.get(row.date);
  if (mark?.text) updateMark(row, mark.text);
}

function updateMark(row, text) {
  if (props.disabled) return;
  if (!row.scheduled) editedHistoryDate.value = row.date;
  const draft = actualDateDraft(row);
  actualDateDrafts.value = { ...actualDateDrafts.value, [row.date]: draft };
  const marks = schedule.value.marks.filter(mark => mark.date !== row.date);
  if (text) marks.push({ date: row.date, text, ...(draft.explicit ? { actualDate: draft.date } : {}) });
  schedule.value = { ...schedule.value, marks: marks.sort((left, right) => left.date.localeCompare(right.date)) };
}

function updatePlannedDate(date) {
  if (props.disabled) return;
  plannedDate.value = date;
  moveError.value = '';
}

async function moveCheckpoint(row, date = plannedDate.value) {
  if (props.disabled || !row.movable || date === row.date) return;
  try {
    const updated = moveControlCheckpoint(schedule.value, row.date, date, { controlDate: props.controlDate, deadline: props.deadline });
    const drafts = { ...actualDateDrafts.value };
    if (drafts[row.date]) {
      const actualDate = updated.marks.find(mark => mark.date === date)?.actualDate;
      drafts[date] = actualDate ? { date: actualDate, explicit: true } : drafts[row.date];
      delete drafts[row.date];
    }
    actualDateDrafts.value = drafts;
    schedule.value = updated;
    showMonth(date.slice(0, 7));
    openDate.value = date;
    plannedDate.value = date;
    await focusMark(date);
  } catch (error) {
    moveError.value = errorMessage(error, 'Не удалось перенести дату контроля.');
  }
}

async function cancelMove(row) {
  if (props.disabled || !row.originalDate) return;
  if (inControlPeriod(row.originalDate)) return moveCheckpoint(row, row.originalDate);
  const updated = { ...schedule.value, moves: schedule.value.moves.filter(move => move.from !== row.originalDate) };
  if (!updated.moves.length) delete updated.moves;
  schedule.value = updated;
  moveError.value = '';
  if (marksByDate.value.get(row.date)?.text.trim()) await focusMark(row.date);
  else {
    openDate.value = '';
    plannedDate.value = '';
    editedHistoryDate.value = '';
  }
}

function checkpointStatus(row, today, configured) {
  if (row.mark) return { label: 'Есть отметка', tone: 'success' };
  if (!row.scheduled) return { label: configured ? 'Вне периода контроля' : 'Вне текущего графика', tone: 'warning' };
  const urgency = getUrgency({ deadline: row.date, status: INSTRUCTION_STATUS.PENDING }, today);
  return urgency.tone === 'info' ? { ...urgency, label: 'По графику' } : urgency;
}

async function focusMark(date) {
  await nextTick();
  if (openDate.value !== date) return false;
  const input = section.value?.querySelector(`[data-checkpoint-date="${date}"] textarea`);
  input?.focus();
  return Boolean(input && input.ownerDocument.activeElement === input);
}

async function focusSelectedDate() {
  const date = props.selectedDate;
  if (!isDate(date)) return false;
  showMonth(date.slice(0, 7));
  openDate.value = date;
  plannedDate.value = date;
  return focusMark(date);
}

watch(() => props.selectedDate, focusSelectedDate);
watchEffect(() => {
  let message = '';
  if (custom.value && !configuredDates.value.size) message = 'Добавьте хотя бы одну дату промежуточного контроля.';
  if (invalidCustomDate.value) message = 'Удалите даты вне периода контроля.';
  customDateInput.value?.setCustomValidity(message);
});
defineExpose({ focusSelectedDate });
</script>

<template>
  <section ref="section" class="control-schedule" :aria-labelledby="sectionId">
    <h3 :id="sectionId">Промежуточный контроль</h3>
    <fieldset class="control-schedule-fields" :disabled="props.disabled">
      <label class="registry-field">
        <span>Периодичность</span>
        <select name="control-frequency" :value="schedule.frequency" @change="selectFrequency($event.target.value)">
          <option v-for="(label, value) in CONTROL_FREQUENCIES" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label v-if="recurring" class="registry-field">
        <span>Первая дата контроля *</span>
        <input name="control-first-date" type="date" required :value="schedule.firstDate"
          :min="props.controlDate || DATE_LIMITS.MIN" :max="props.deadline || DATE_LIMITS.MAX" @input="selectFirstDate($event.target.value)" />
      </label>
      <div v-if="custom" class="control-schedule-custom">
        <label class="registry-field">
          <span>Дата контроля</span>
          <input ref="customDateInput" name="control-custom-date" type="date" :value="customDate"
            :min="props.controlDate || DATE_LIMITS.MIN" :max="props.deadline || DATE_LIMITS.MAX"
            @input="customDate = $event.target.value" @keydown.enter.prevent="addCustomDate" />
        </label>
        <button type="button" class="registry-button" :disabled="!canAddDate" @click="addCustomDate">Добавить дату</button>
      </div>
    </fieldset>
    <p v-if="duplicateDate" class="registry-help" role="status">Эта дата уже в графике.</p>
    <p v-else-if="custom && !configuredDates.size" class="registry-help">Добавьте даты промежуточного контроля.</p>
    <p v-if="invalidCheckpointDate" class="control-schedule-warning">
      Дата {{ formatDate(invalidCheckpointDate) }} вне периода контроля.
      <button type="button" class="registry-inline-action" @click="showMonth(invalidCheckpointDate.slice(0, 7))">Показать дату</button>
    </p>

    <div v-if="showPreview" class="control-schedule-preview">
      <div class="control-schedule-month">
        <h4>Контрольные даты</h4>
        <div class="control-schedule-navigation">
          <button type="button" class="registry-button" aria-label="Предыдущий месяц"
            :disabled="month === DATE_LIMITS.MIN.slice(0, 7)" @click="showMonth(moveMonth(month, -1))"><ChevronLeft :size="16" aria-hidden="true" /></button>
          <label class="registry-field">
            <span class="registry-visually-hidden">Месяц контрольных дат</span>
            <input type="month" :value="month" :min="DATE_LIMITS.MIN.slice(0, 7)" :max="DATE_LIMITS.MAX.slice(0, 7)" @change="selectMonth" @keydown.enter.prevent />
          </label>
          <button type="button" class="registry-button" aria-label="Следующий месяц"
            :disabled="month === DATE_LIMITS.MAX.slice(0, 7)" @click="showMonth(moveMonth(month, 1))"><ChevronRight :size="16" aria-hidden="true" /></button>
        </div>
      </div>
      <p v-if="!rows.length" class="registry-help control-schedule-empty">В этом месяце нет контрольных дат.</p>
      <ul v-else class="control-schedule-list" aria-label="Контрольные даты выбранного месяца">
        <li v-for="row in rows" :key="row.date" :data-checkpoint-date="row.date">
          <div class="control-schedule-row">
            <component :is="row.canOpen ? 'button' : 'div'" class="control-schedule-row-details"
              :type="row.canOpen ? 'button' : undefined" :aria-expanded="row.canOpen ? openDate === row.date : undefined"
              @click="row.canOpen && toggleMark(row.date)">
              <time :datetime="row.date">{{ formatDate(row.date) }}</time>
              <span class="registry-status" :class="row.status.tone && `registry-tone-${row.status.tone}`">{{ row.status.label }}</span>
              <span v-if="row.mark && !row.scheduled" class="registry-help">Вне текущего графика</span>
              <span v-if="row.originalDate" class="registry-help">Перенесено с {{ formatDate(row.originalDate) }}</span>
              <ChevronDown v-if="row.canOpen" class="control-schedule-chevron" :size="15" aria-hidden="true" />
            </component>
            <button v-if="row.configured" type="button" class="registry-button control-schedule-remove"
              :aria-label="`Убрать дату ${formatDate(row.date)} из графика`" :disabled="props.disabled" @click="removeCustomDate(row.date)"><X :size="15" aria-hidden="true" /></button>
          </div>
          <div v-if="row.canOpen && openDate === row.date" class="control-schedule-editor">
            <template v-if="row.movable">
              <div class="control-schedule-reschedule">
                <label class="registry-field">
                  <span>Плановая дата контроля</span>
                  <input name="control-planned-date" type="date" :value="plannedDate" :readonly="props.disabled"
                    :min="props.controlDate || DATE_LIMITS.MIN" :max="props.deadline || DATE_LIMITS.MAX"
                    @input="updatePlannedDate($event.target.value)" @keydown.enter.prevent="moveCheckpoint(row)" />
                </label>
                <button type="button" class="registry-button control-schedule-move" :disabled="props.disabled || !plannedDate || plannedDate === row.date"
                  @click="moveCheckpoint(row)">Перенести</button>
                <button v-if="row.originalDate" type="button" class="registry-button control-schedule-cancel-move" :disabled="props.disabled"
                  @click="cancelMove(row)">Отменить перенос</button>
              </div>
              <p class="registry-help">Изменится только эта дата. Остальной график сохранится.</p>
              <p v-if="row.originalDate && !inControlPeriod(row.originalDate)" class="registry-help">
                Исходная дата вне периода контроля. При отмене переноса отметка сохранится в истории.
              </p>
              <p v-if="moveError" class="control-schedule-error" role="alert">{{ moveError }}</p>
            </template>
            <label class="registry-field control-schedule-actual-date">
              <span>Фактическая дата исполнения</span>
              <input name="control-actual-date" type="date" :readonly="props.disabled" :required="Boolean(marksByDate.get(row.date)?.text.trim())"
                :value="actualDateDraft(row).date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX"
                @input="updateActualDate(row, $event.target.value)" />
            </label>
            <label class="registry-field control-schedule-mark">
              <span>Отметка об исполнении</span>
              <textarea rows="2" :readonly="props.disabled" :maxlength="CONTROL_MARK_LIMIT" :value="marksByDate.get(row.date)?.text ?? ''"
                :aria-label="`Отметка об исполнении за ${formatDate(row.date)}`" @input="updateMark(row, $event.target.value)" />
            </label>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.control-schedule { display: grid; gap: 12px; margin-block: 22px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--grouped); }
.control-schedule h3 { font-size: 14px; font-weight: 600; }
.control-schedule h4 { font-size: 12px; font-weight: 600; }
.control-schedule-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 215px), 1fr)); gap: 12px; min-width: 0; border: 0; margin: 0; padding: 0; }
.control-schedule-custom, .control-schedule-month, .control-schedule-navigation, .control-schedule-row, .control-schedule-row-details { display: flex; align-items: center; gap: 8px; min-width: 0; }
.control-schedule-custom { align-items: end; flex-wrap: wrap; }
.control-schedule-custom label { flex: 1 1 130px; }
.control-schedule-custom .registry-button { min-height: 40px; }
.control-schedule-preview { min-width: 0; }
.control-schedule-month { justify-content: space-between; flex-wrap: wrap; margin-bottom: 8px; }
.control-schedule-navigation { gap: 5px; }
.control-schedule-navigation .registry-button, .control-schedule-navigation input { min-height: 34px; padding: 5px 8px; }
.control-schedule-empty { padding-block: 8px; }
.control-schedule-warning { color: var(--registry-warning); font-size: 12px; }
.control-schedule-list { margin: 0; padding: 0; overflow: hidden; list-style: none; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.control-schedule-list li + li { border-top: 1px solid var(--border); }
.control-schedule-row { gap: 0; }
.control-schedule-row-details { flex: 1; flex-wrap: wrap; padding: 9px 10px; min-height: 36px; border: 0; color: var(--text); background: transparent; text-align: left; font-size: 12px; }
.control-schedule-row-details time { font-variant-numeric: tabular-nums; }
button.control-schedule-row-details:hover, button.control-schedule-row-details[aria-expanded='true'] { background: var(--raised); }
button.control-schedule-row-details:focus-visible { outline-offset: -3px; }
.control-schedule-chevron { margin-left: auto; color: var(--muted); }
[aria-expanded='true'] .control-schedule-chevron { transform: rotate(180deg); }
.control-schedule-row .control-schedule-remove { min-height: 32px; padding: 5px 7px; margin-right: 4px; border-color: transparent; color: var(--muted); }
.control-schedule-editor { display: grid; gap: 10px; padding: 10px 12px 12px; }
.control-schedule-reschedule { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
.control-schedule-reschedule .registry-field { flex: 1 1 190px; }
.control-schedule-reschedule .registry-button { min-height: 40px; }
.control-schedule-actual-date { max-width: 280px; }
.control-schedule-error { color: var(--error); font-size: 12px; }
.control-schedule-mark textarea { min-height: 65px; }
</style>
