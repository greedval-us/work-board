import { computed, nextTick, shallowRef, watch, watchEffect } from 'vue';
import { CONTROL_WEEKDAY_LABELS, getControlWeekday, moveControlCheckpoint,
  supportsControlDayOfMonth } from '../../../shared/controlSchedule.js';
import { localDate } from '../../../shared/dates.js';
import { errorMessage } from '../../infrastructure/errorMessage.js';
import { controlScheduleRows, effectiveCustomDates, firstScheduledMonth, inControlPeriod as isInControlPeriod, isDate, startingMonth as initialMonth } from './controlScheduleView.js';

// Own transient editor state; only accepted schedule edits update the parent model.
export function useControlScheduleEditor(schedule, props, { section, customDateInput }) {
  const customDate = shallowRef('');
  const openDate = shallowRef(isDate(props.selectedDate) ? props.selectedDate : '');
  const plannedDate = shallowRef(openDate.value);
  const moveError = shallowRef('');
  const actualDateDrafts = shallowRef({});
  const editedHistoryDate = shallowRef('');
  const month = shallowRef(openDate.value ? openDate.value.slice(0, 7) : startingMonth(schedule.value));
  const recurring = computed(() => schedule.value.frequency && schedule.value.frequency !== 'custom');
  const weekly = computed(() => schedule.value.frequency === 'weekly');
  const yearly = computed(() => schedule.value.frequency === 'yearly');
  const dayOfMonthSupported = computed(() => supportsControlDayOfMonth(schedule.value.frequency));
  const custom = computed(() => schedule.value.frequency === 'custom');
  const configuredDates = computed(() => new Set(custom.value ? effectiveCustomDates(schedule.value) : []));
  const invalidCustomDate = computed(() => [...configuredDates.value].find(date => !inControlPeriod(date)));
  const invalidCheckpointDate = computed(() => invalidCustomDate.value || schedule.value.moves?.find(move => !inControlPeriod(move.to))?.to);
  const duplicateDate = computed(() => configuredDates.value.has(customDate.value) || schedule.value.customDates.includes(customDate.value));
  const canAddDate = computed(() => !props.disabled && inControlPeriod(customDate.value) && !duplicateDate.value);
  const showPreview = computed(() => Boolean(recurring.value || configuredDates.value.size || schedule.value.marks.length || editedHistoryDate.value));
  const marksByDate = computed(() => new Map(schedule.value.marks.map(mark => [mark.date, mark])));

  const rows = computed(() => controlScheduleRows(schedule.value, {
    month: month.value, controlDate: props.controlDate, deadline: props.deadline, editedHistoryDate: editedHistoryDate.value, closed: props.closed,
  }));

  function inControlPeriod(date) {
    return isInControlPeriod(date, props);
  }

  function startingMonth(value) {
    return initialMonth(value, props);
  }

  function showFirstScheduledMonth(value) {
    if (isDate(value.firstDate)) showMonth(firstScheduledMonth(value, props.deadline));
  }

  function selectFrequency(frequency) {
    if (props.disabled || frequency === schedule.value.frequency) return;
    const fixed = frequency && frequency !== 'custom';
    const firstDate = fixed ? schedule.value.firstDate || (inControlPeriod(props.controlDate) ? props.controlDate : '') : '';
    const updated = { ...schedule.value, frequency, firstDate, customDates: [] };
    delete updated.moves;
    if (!supportsControlDayOfMonth(frequency)) delete updated.dayOfMonth;
    if (frequency !== 'weekly') delete updated.dayOfWeek;
    if (frequency !== 'yearly') delete updated.monthOfYear;
    schedule.value = updated;
    customDate.value = '';
    if (updated.dayOfMonth === undefined && updated.dayOfWeek === undefined && updated.monthOfYear === undefined) showMonth(startingMonth(updated));
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
    if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31)) return;
    setRecurrenceOverride('dayOfMonth', day, Number(schedule.value.firstDate.slice(-2)));
  }

  function selectMonthOfYear(value) {
    if (props.disabled || !yearly.value) return;
    const monthNumber = value === '' ? undefined : Number(value);
    if (monthNumber !== undefined && (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12)) return;
    setRecurrenceOverride('monthOfYear', monthNumber, Number(schedule.value.firstDate.slice(5, 7)));
  }

  function selectDayOfWeek(value) {
    if (props.disabled || !weekly.value) return;
    const day = value === '' ? undefined : Number(value);
    if (day !== undefined && !Object.hasOwn(CONTROL_WEEKDAY_LABELS, day)) return;
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

  return {
    customDate, openDate, plannedDate, moveError, month, recurring, weekly, yearly, dayOfMonthSupported, custom, configuredDates,
    invalidCheckpointDate, duplicateDate, canAddDate, showPreview, marksByDate, rows,
    inControlPeriod, selectFrequency, selectFirstDate, selectDayOfMonth, selectMonthOfYear, selectDayOfWeek, addCustomDate, removeCustomDate,
    showMonth, selectMonth, toggleMark, actualDateDraft, updateActualDate, updateMark,
    updatePlannedDate, moveCheckpoint, cancelMove, focusSelectedDate,
  };
}
