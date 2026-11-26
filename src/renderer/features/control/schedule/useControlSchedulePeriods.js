import { computed, shallowRef, watch } from 'vue';
import { controlPeriodForDate, listControlCheckpoints } from '../../../../shared/controlSchedule.js';
import { addCalendarDays, formatDate, isDate } from '../../../../shared/dates.js';
import { CALENDAR_MONTHS } from '../../../ui/calendarLabels.js';
import { inControlPeriod } from './controlScheduleView.js';

const PERIODS_PER_PAGE = 12;

function periodLabel(frequency, { start, end }) {
  const year = start.slice(0, 4);
  const month = Number(start.slice(5, 7));
  if (frequency === 'yearly') return `${year} год`;
  if (frequency === 'semiannual') return `${Math.ceil(month / 6)}-е полугодие ${year}`;
  if (frequency === 'quarterly') return `${Math.ceil(month / 3)}-й квартал ${year}`;
  if (frequency === 'monthly') return `${CALENDAR_MONTHS[month - 1]} ${year}`;
  if (frequency === 'weekly') return `${formatDate(start)} — ${formatDate(end)}`;
  return formatDate(start);
}

export function useControlSchedulePeriods(schedule, props, { recurring, showMonth }) {
  const pageAnchor = shallowRef('');
  const firstPeriod = computed(() => recurring.value && isDate(props.controlDate) && isDate(props.deadline)
    && props.controlDate <= props.deadline ? controlPeriodForDate(schedule.value.frequency, props.controlDate).start : '');
  const visiblePeriods = computed(() => {
    if (!firstPeriod.value) return [];
    const { frequency, periodDates } = schedule.value;
    const cursor = pageAnchor.value;
    let start = cursor > props.deadline ? controlPeriodForDate(frequency, props.deadline).start
      : cursor >= firstPeriod.value ? cursor : firstPeriod.value;
    const periods = [];
    while (start <= props.deadline && periods.length < PERIODS_PER_PAGE) {
      const period = controlPeriodForDate(frequency, start);
      periods.push({ ...period, label: periodLabel(frequency, period),
        min: period.start < props.controlDate ? props.controlDate : period.start,
        max: period.end > props.deadline ? props.deadline : period.end });
      if (period.end >= props.deadline) break;
      start = addCalendarDays(period.end, 1);
    }

    const byPeriod = new Map();
    for (const checkpoint of listControlCheckpoints(schedule.value, { from: periods[0].min, to: periods.at(-1).max, deadline: props.deadline })) {
      if (!checkpoint.scheduled) continue;
      const { start } = controlPeriodForDate(frequency, checkpoint.date);
      const dates = byPeriod.get(start) ?? [];
      dates.push(checkpoint.date);
      byPeriod.set(start, dates);
    }
    return periods.map(period => {
      const dates = byPeriod.get(period.start) ?? [];
      return { ...period, date: periodDates?.[period.start] ?? (dates.length === 1 ? dates[0] : ''), multiple: dates.length > 1 };
    });
  });
  const canShowEarlierPeriods = computed(() => visiblePeriods.value[0]?.start > firstPeriod.value);
  const canShowLaterPeriods = computed(() => visiblePeriods.value.at(-1)?.end < props.deadline);
  const outsidePeriods = computed(() => Object.entries(schedule.value.periodDates ?? {})
    .filter(([, date]) => date && !inControlPeriod(date, props)));

  function changePeriodPage(direction) {
    if (direction > 0 && canShowLaterPeriods.value) {
      pageAnchor.value = addCalendarDays(visiblePeriods.value.at(-1).end, 1);
    } else if (direction < 0 && canShowEarlierPeriods.value) {
      let start = visiblePeriods.value[0].start;
      for (let index = 0; index < PERIODS_PER_PAGE && start > firstPeriod.value; index += 1) {
        start = controlPeriodForDate(schedule.value.frequency, addCalendarDays(start, -1)).start;
      }
      pageAnchor.value = start;
    }
  }

  function changePeriodDate(period, input) {
    const date = input.value;
    if (props.disabled || input.validity?.badInput || (date && (!isDate(date) || date < period.min || date > period.max))) return;
    if (date === period.date && !period.multiple) return;
    schedule.value = { ...schedule.value, periodDates: { ...schedule.value.periodDates, [period.start]: date } };
    if (date) showMonth(date.slice(0, 7));
  }

  function clearOutsidePeriod(start) {
    if (props.disabled) return;
    schedule.value = { ...schedule.value, periodDates: { ...schedule.value.periodDates, [start]: '' } };
  }

  watch(() => schedule.value.frequency, () => { pageAnchor.value = ''; });

  return { visiblePeriods, canShowEarlierPeriods, canShowLaterPeriods, outsidePeriods, changePeriodPage, changePeriodDate, clearOutsidePeriod };
}
