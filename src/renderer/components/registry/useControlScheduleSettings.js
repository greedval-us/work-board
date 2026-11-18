import { computed, shallowRef, watchEffect } from 'vue';
import {
  controlDatesRequiringBounds, getControlWeekday, isValidControlDayOfMonth, isValidControlDayOfWeek, isValidControlMonthOfYear, supportsControlDayOfMonth,
} from '../../../shared/controlSchedule.js';
import { isDate } from '../../../shared/dates.js';
import { effectiveCustomDates, firstScheduledMonth, inControlPeriod, startingMonth } from './controlScheduleView.js';

export function useControlScheduleSettings(schedule, props, { customDateInput, showMonth, onRemoveDate }) {
  const customDate = shallowRef('');
  const recurring = computed(() => schedule.value.frequency && schedule.value.frequency !== 'custom');
  const weekly = computed(() => schedule.value.frequency === 'weekly');
  const yearly = computed(() => schedule.value.frequency === 'yearly');
  const dayOfMonthSupported = computed(() => supportsControlDayOfMonth(schedule.value.frequency));
  const custom = computed(() => schedule.value.frequency === 'custom');
  const configuredDates = computed(() => new Set(custom.value ? effectiveCustomDates(schedule.value) : []));
  const invalidCheckpointDate = computed(() => controlDatesRequiringBounds(schedule.value).find(date => !inControlPeriod(date, props)));
  const duplicateDate = computed(() => configuredDates.value.has(customDate.value) || schedule.value.customDates.includes(customDate.value));
  const canAddDate = computed(() => !props.disabled && inControlPeriod(customDate.value, props) && !duplicateDate.value);

  function showFirstScheduledMonth(value) {
    if (isDate(value.firstDate)) showMonth(firstScheduledMonth(value, props.deadline));
  }

  function selectFrequency(frequency) {
    if (props.disabled || frequency === schedule.value.frequency) return;
    const fixed = frequency && frequency !== 'custom';
    const firstDate = fixed ? schedule.value.firstDate || (inControlPeriod(props.controlDate, props) ? props.controlDate : '') : '';
    const updated = { ...schedule.value, frequency, firstDate, customDates: [] };
    delete updated.moves;
    if (!supportsControlDayOfMonth(frequency)) delete updated.dayOfMonth;
    if (frequency !== 'weekly') delete updated.dayOfWeek;
    if (frequency !== 'yearly') delete updated.monthOfYear;
    schedule.value = updated;
    customDate.value = '';
    if (updated.dayOfMonth === undefined && updated.dayOfWeek === undefined && updated.monthOfYear === undefined) showMonth(startingMonth(updated, props));
    else showFirstScheduledMonth(updated);
  }

  function selectFirstDate(date) {
    if (props.disabled || date === schedule.value.firstDate) return;
    const updated = { ...schedule.value, firstDate: date };
    delete updated.moves;
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
    if (anchorChanged) delete updated.moves;
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
    if (updated.moves) {
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
    if (custom.value && invalidCheckpointDate.value) message = 'Удалите даты вне периода контроля.';
    customDateInput.value?.setCustomValidity(message);
  });

  return {
    customDate, recurring, weekly, yearly, dayOfMonthSupported, custom, configuredDates,
    invalidCheckpointDate, duplicateDate, canAddDate, selectFrequency, selectFirstDate, selectDayOfMonth,
    selectMonthOfYear, selectDayOfWeek, addCustomDate, removeCustomDate,
  };
}
