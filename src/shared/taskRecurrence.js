import { DATE_LIMITS } from './constants/dates.js';
import {
  isDate, isValidControlDayOfMonth, isValidControlDayOfWeek, isValidControlMonthOfYear, scheduledDates, supportsControlDayOfMonth,
} from './controlSchedule/recurrence.js';
import { validateDate } from './dates.js';
import { ValidationError } from './errors.js';
import { validateEnum, validateRecord } from './validation.js';

export const TASK_RECURRENCE_FREQUENCIES = Object.freeze({
  '': 'Не повторять',
  weekly: 'Еженедельно',
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  yearly: 'Ежегодно',
  custom: 'Даты вручную',
});

export function validateTaskRecurrence(value, firstDate) {
  if (value === undefined) return undefined;
  const { frequency = '', dayOfWeek, dayOfMonth, monthOfYear, customDates } = validateRecord(value, 'Повтор задачи');
  validateEnum(frequency, TASK_RECURRENCE_FREQUENCIES, 'Периодичность задачи');
  if (dayOfWeek !== undefined && (frequency !== 'weekly' || !isValidControlDayOfWeek(dayOfWeek))) {
    throw new ValidationError('Для еженедельной задачи выберите день недели от понедельника до воскресенья.');
  }
  if (dayOfMonth !== undefined && (!supportsControlDayOfMonth(frequency) || !isValidControlDayOfMonth(dayOfMonth))) {
    throw new ValidationError('Для ежемесячной, ежеквартальной или ежегодной задачи укажите число от 1 до 31.');
  }
  if (monthOfYear !== undefined && (frequency !== 'yearly' || !isValidControlMonthOfYear(monthOfYear))) {
    throw new ValidationError('Для ежегодной задачи выберите месяц от января до декабря.');
  }
  if (customDates !== undefined && (frequency !== 'custom' || !Array.isArray(customDates))) {
    throw new ValidationError('Дополнительные даты выбираются при ручной настройке повторения задачи.');
  }
  if (!frequency) return undefined;

  const recurrence = {
    frequency,
    ...(dayOfWeek === undefined ? {} : { dayOfWeek }),
    ...(dayOfMonth === undefined ? {} : { dayOfMonth }),
    ...(monthOfYear === undefined ? {} : { monthOfYear }),
  };
  if (frequency === 'custom') {
    const dates = (customDates ?? []).map(date => validateDate(date, 'Дата повторения задачи'));
    if (dates.some(date => date < firstDate)) {
      throw new ValidationError('Дата повторения не может быть раньше первой даты задачи.');
    }
    recurrence.customDates = [...new Set(dates.filter(date => date !== firstDate))].sort();
  }
  if (!firstTaskOccurrence({ date: firstDate, recurrence })) {
    throw new ValidationError('После даты начала нет подходящей даты повторения задачи.');
  }
  return recurrence;
}

export function* taskOccurrenceDates(task, { from, to }) {
  const firstDate = task.seriesDate ?? task.date;
  if (!isDate(firstDate) || from > to || firstDate > to) return;
  if (!task.recurrence?.frequency) {
    if (firstDate >= from) yield firstDate;
    return;
  }
  const { recurrence } = task;
  const schedule = { ...recurrence, firstDate };
  if (recurrence.frequency === 'custom') schedule.customDates = [firstDate, ...(recurrence.customDates ?? [])];
  yield* scheduledDates(schedule, from, to);
}

export function firstTaskOccurrence(task) {
  return taskOccurrenceDates(task, { from: task.seriesDate ?? task.date, to: DATE_LIMITS.MAX }).next().value;
}

export function isTaskOccurrence(task, date) {
  return isDate(date) && !taskOccurrenceDates(task, { from: date, to: date }).next().done;
}
