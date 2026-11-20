import { DATE_LIMITS } from '../../shared/constants/dates.js';
import { addCalendarDays, validateDate } from '../../shared/dates.js';
import { ValidationError } from '../../shared/errors.js';
import { isTaskOccurrence, taskOccurrenceDates } from '../../shared/taskRecurrence.js';
import { validateRecord } from '../../shared/validation.js';

// One window includes 366 calendar dates, enough for the longest repeat interval.
const TASK_LOOKBACK_OFFSET_DAYS = 365;

export function occurrenceView(task, date, completed, originalDate = date) {
  return { ...task, date, seriesDate: task.date, completed, ...(date === originalDate ? {} : { originalDate }) };
}

export function originalOccurrenceDate(task, date, moves) {
  if (!task.recurrence) return undefined;
  const movedHere = moves.find(move => move.date === date);
  if (movedHere) return movedHere.originalDate;
  if (moves.some(move => move.originalDate === date)) return undefined;
  return isTaskOccurrence(task, date) ? date : undefined;
}

function requireOccurrence(originalDate) {
  if (!originalDate) throw new ValidationError('На эту дату повторение задачи не запланировано.');
  return originalDate;
}

export function validateOccurrenceCompletion(value) {
  const { date, completed } = validateRecord(value, 'Отметка повторения задачи');
  validateDate(date, 'Дата повторения задачи');
  if (typeof completed !== 'boolean') throw new ValidationError('Выполнение задачи: укажите да или нет.');
  return { date, completed };
}

export function occurrenceCompletion(task, moves, { date, completed }, removedMoves = []) {
  // A new occurrence on a discarded move's date must not inherit its completion.
  const replaced = removedMoves.some(move => move.date === date);
  const originalDate = replaced ? undefined : originalOccurrenceDate(task, date, moves);
  return { date: requireOccurrence(originalDate), completed };
}

export function originalDateForMove(task, moves, from, to) {
  if (!task.recurrence) throw new ValidationError('Перенос доступен для повторяющейся задачи.');
  const originalDate = requireOccurrence(originalOccurrenceDate(task, from, moves));
  if (from !== to && originalOccurrenceDate(task, to, moves)) {
    throw new ValidationError('На выбранную дату уже запланировано другое повторение этой задачи.');
  }
  return originalDate;
}

export function planOccurrenceUpdate(existing, updated, moves, occurrence) {
  const keptMoves = moves.filter(move => updated.recurrence && isTaskOccurrence(updated, move.originalDate));
  const keptOriginals = new Set(keptMoves.map(move => move.originalDate));
  if (keptMoves.some(move => !keptOriginals.has(move.date) && isTaskOccurrence(updated, move.date))) {
    throw new ValidationError('Новый график добавляет повторение на дату переноса этой задачи. Сначала выберите другую дату переноса.');
  }
  const removedMoves = moves.filter(move => !keptOriginals.has(move.originalDate));
  let completion;
  if (occurrence !== undefined) {
    completion = occurrenceCompletion(updated, keptMoves, validateOccurrenceCompletion(occurrence), removedMoves);
  } else if (updated.recurrence && !existing.recurrence && isTaskOccurrence(updated, existing.date)) {
    completion = { date: existing.date, completed: updated.completed };
  }
  return { removedMoves, completion };
}

function groupOccurrenceMoves(moves) {
  const movesByTask = new Map();
  for (const move of moves) {
    if (!movesByTask.has(move.taskId)) movesByTask.set(move.taskId, []);
    movesByTask.get(move.taskId).push(move);
  }
  return movesByTask;
}

export function latestUnmovedTaskDate(task, through, movedOrigins, previousCandidate) {
  const earliest = previousCandidate > task.date ? previousCandidate : task.date;
  let to = through;
  while (to >= earliest) {
    const lookback = task.recurrence.frequency === 'custom' ? earliest : addCalendarDays(to, -TASK_LOOKBACK_OFFSET_DAYS);
    const from = lookback < earliest ? earliest : lookback;
    let latest;
    for (const date of taskOccurrenceDates(task, { from, to })) {
      if (!movedOrigins?.has(date)) latest = date;
    }
    if (latest || from === earliest) return latest;
    to = addCalendarDays(from, -1);
  }
  return undefined;
}

function agendaOccurrence(task, moves, agendaDate) {
  const movedOrigins = new Set();
  let upcomingMove;
  let previousMove;
  for (const move of moves) {
    movedOrigins.add(move.originalDate);
    if (move.date >= agendaDate) {
      if (!upcomingMove || move.date < upcomingMove.date) upcomingMove = move;
    } else if (!previousMove || move.date > previousMove.date) previousMove = move;
  }

  for (const date of taskOccurrenceDates(task, { from: agendaDate, to: upcomingMove?.date ?? DATE_LIMITS.MAX })) {
    if (!movedOrigins.has(date)) return { date, originalDate: date };
  }
  if (upcomingMove) return upcomingMove;
  if (agendaDate === DATE_LIMITS.MIN) return undefined;

  const previousDate = latestUnmovedTaskDate(task, addCalendarDays(agendaDate, -1), movedOrigins, previousMove?.date);
  return previousDate && (!previousMove || previousDate > previousMove.date)
    ? { date: previousDate, originalDate: previousDate } : previousMove;
}

export function taskAgendaOccurrences(tasks, moves, agendaDate) {
  const movesByTask = groupOccurrenceMoves(moves);
  const occurrences = [];
  for (const task of tasks) {
    if (!task.recurrence) continue;
    const occurrence = agendaOccurrence(task, movesByTask.get(task.id) ?? [], agendaDate);
    if (occurrence) occurrences.push({ task, date: occurrence.date, originalDate: occurrence.originalDate });
  }
  return occurrences;
}

export function listTaskOccurrences(tasks, moves, completions, { from, to }) {
  const movesByTask = groupOccurrenceMoves(moves);
  const completed = new Set(completions.map(({ taskId, date }) => `${taskId}:${date}`));
  const occurrences = [];
  for (const task of tasks) {
    if (!task.recurrence) {
      occurrences.push(task);
      continue;
    }
    const taskMoves = movesByTask.get(task.id) ?? [];
    const movedOriginals = new Set(taskMoves.map(move => move.originalDate));
    for (const date of taskOccurrenceDates(task, { from, to })) {
      if (!movedOriginals.has(date)) occurrences.push(occurrenceView(task, date, completed.has(`${task.id}:${date}`)));
    }
    for (const { date, originalDate } of taskMoves) {
      if (date >= from && date <= to) {
        occurrences.push(occurrenceView(task, date, completed.has(`${task.id}:${originalDate}`), originalDate));
      }
    }
  }
  return occurrences.sort((left, right) => left.date.localeCompare(right.date) || left.id - right.id);
}
