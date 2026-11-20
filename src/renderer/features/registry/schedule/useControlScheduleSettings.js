import { computed, shallowRef, watchEffect } from 'vue';
import {
  controlDatesRequiringBounds, controlPeriodForDate, getControlWeekday, isScheduledDate, isValidControlDayOfMonth, isValidControlDayOfWeek,
  isValidControlMonthOfYear, supportsControlDayOfMonth,
} from '../../../../shared/controlSchedule.js';
import { isDate } from '../../../../shared/dates.js';
import { effectiveCustomDates, firstScheduledMonth, inControlPeriod, startingMonth } from './controlScheduleView.js';

function retainManualMoves(schedule) {
  if (!schedule.moves?.length) return;
  const manualDates = new Set(schedule.customDates);
  const moves = new Map(schedule.moves.filter(move => manualDates.has(move.from)).map(move => [move.from, move]));
  const predecessors = new Map([...moves.values()].map(({ from, to }) => [to, from]));
  for (const { from, to } of moves.values()) {
    if (moves.has(to) || !isScheduledDate(schedule, to)) continue;
    // Restoring an original date can also block a move into that date.
    let blocked = from;
    while (moves.delete(blocked)) blocked = predecessors.get(blocked);
  }
  if (moves.size) schedule.moves = [...moves.values()];
  else delete schedule.moves;
}

function datesForFrequency(previous, frequency) {
  const explicit = new Set([...effectiveCustomDates(previous), ...Object.values(previous.periodDates ?? {}).filter(Boolean)]);
  const dates = [...explicit].sort();
  if (frequency === 'custom') return { customDates: dates };
  if (!frequency) return { customDates: [] };

  const byPeriod = new Map();
  for (const date of dates) {
    const { start } = controlPeriodForDate(frequency, date);
    const assigned = byPeriod.get(start) ?? [];
    assigned.push(date);
    byPeriod.set(start, assigned);
  }
  const periodDates = {};
  const customDates = [];
  for (const [start, assigned] of byPeriod) {
    if (assigned.length === 1) periodDates[start] = assigned[0];
    else customDates.push(...assigned);
  }
  return { customDates, periodDates };
}

export function useControlScheduleSettings(schedule, props, { customDateInput, showMonth, onRemoveDate }) {
  const customDate = shallowRef('');
  const savedRule = shallowRef(Boolean(schedule.value.firstDate || !schedule.value.periodDates));
  const recurring = computed(() => schedule.value.frequency && schedule.value.frequency !== 'custom');
  const legacyRecurrence = computed(() => recurring.value && savedRule.value);
  const invalidFirstDate = computed(() => legacyRecurrence.value && !inControlPeriod(schedule.value.firstDate, props));
  const weekly = computed(() => schedule.value.frequency === 'weekly');
  const yearly = computed(() => schedule.value.frequency === 'yearly');
  const dayOfMonthSupported = computed(() => supportsControlDayOfMonth(schedule.value.frequency));
  const custom = computed(() => schedule.value.frequency === 'custom');
  const configuredDates = computed(() => new Set(effectiveCustomDates(schedule.value)));
  const invalidCheckpointDate = computed(() => {
    const assigned = new Set(Object.values(schedule.value.periodDates ?? {}).filter(Boolean));
    return controlDatesRequiringBounds(schedule.value).find(date => !assigned.has(date) && !inControlPeriod(date, props));
  });
  const duplicateDate = computed(() => isDate(customDate.value) && (isScheduledDate(schedule.value, customDate.value)
    || (schedule.value.moves ?? []).some(move => move.to === customDate.value)));
  const canAddDate = computed(() => Boolean(schedule.value.frequency) && !props.disabled
    && inControlPeriod(customDate.value, props) && !duplicateDate.value);

  function showFirstScheduledMonth(value) {
    if (isDate(value.firstDate)) showMonth(firstScheduledMonth(value, props.deadline));
  }

  function selectFrequency(frequency) {
    if (props.disabled || frequency === schedule.value.frequency) return;
    const updated = { frequency, firstDate: '', ...datesForFrequency(schedule.value, frequency), marks: schedule.value.marks };
    savedRule.value = false;
    schedule.value = updated;
    customDate.value = '';
    showMonth(startingMonth(updated, props));
  }

  function selectFirstDate(date) {
    if (props.disabled || date === schedule.value.firstDate) return;
    const updated = { ...schedule.value, firstDate: date };
    retainManualMoves(updated);
    schedule.value = updated;
    showFirstScheduledMonth(updated);
  }

  function selectDayOfMonth(input) {
    if (props.disabled || !dayOfMonthSupported.value || input.validity?.badInput) return;
    const day = input.value === '' ? undefined : Number(input.value);
    if (day !== undefined && !isValidControlDayOfMonth(day)) return;
    setRecurrenceOverride('dayOfMonth', day, Number(schedule.value.firstDate.slice(-2)));
  }

  function selectMonthOfYear(value) {
    if (props.disabled || !yearly.value) return;
    const monthNumber = value === '' ? undefined : Number(value);
    if (monthNumber !== undefined && !isValidControlMonthOfYear(monthNumber)) return;
    setRecurrenceOverride('monthOfYear', monthNumber, Number(schedule.value.firstDate.slice(5, 7)));
  }

  function selectDayOfWeek(value) {
    if (props.disabled || !weekly.value) return;
    const day = value === '' ? undefined : Number(value);
    if (day !== undefined && !isValidControlDayOfWeek(day)) return;
    setRecurrenceOverride('dayOfWeek', day, getControlWeekday(schedule.value.firstDate));
  }

  function setRecurrenceOverride(field, value, automaticValue) {
    const previous = schedule.value;
    if (value === previous[field]) return;
    const anchorChanged = (value ?? automaticValue) !== (previous[field] ?? automaticValue);
    const updated = { ...previous };
    if (value === undefined) delete updated[field];
    else updated[field] = value;
    if (anchorChanged) retainManualMoves(updated);
    schedule.value = updated;
    if (anchorChanged) showFirstScheduledMonth(updated);
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
    if (updated.moves && !isScheduledDate(updated, originalDate)) {
      updated.moves = updated.moves.filter(move => move.from !== originalDate);
      if (!updated.moves.length) delete updated.moves;
    }
    schedule.value = updated;
    onRemoveDate(date);
    customDateInput.value?.focus();
  }

  watchEffect(() => {
    let message = '';
    if (custom.value && !configuredDates.value.size) message = 'Добавьте хотя бы одну дату промежуточного контроля.';
    if (invalidCheckpointDate.value) message = custom.value ? 'Удалите даты вне периода контроля.' : 'Исправьте даты вне периода контроля.';
    customDateInput.value?.setCustomValidity(message);
  });

  return {
    customDate, recurring, legacyRecurrence, invalidFirstDate, weekly, yearly, dayOfMonthSupported, custom, configuredDates,
    invalidCheckpointDate, duplicateDate, canAddDate, selectFrequency, selectFirstDate, selectDayOfMonth,
    selectMonthOfYear, selectDayOfWeek, addCustomDate, removeCustomDate,
  };
}
