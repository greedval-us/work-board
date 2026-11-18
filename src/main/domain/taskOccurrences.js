import { validateDate } from '../../shared/dates.js';
import { ValidationError } from '../../shared/errors.js';
import { isTaskOccurrence, taskOccurrenceDates } from '../../shared/taskRecurrence.js';
import { validateRecord } from '../../shared/validation.js';

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
  } else if (updated.recurrence && !existing.recurrence && updated.completed && isTaskOccurrence(updated, existing.date)) {
    completion = { date: existing.date, completed: true };
  }
  return { removedMoves, completion };
}

export function listTaskOccurrences(tasks, moves, completions, { from, to }) {
  const movesByTask = new Map();
  for (const move of moves) {
    if (!movesByTask.has(move.taskId)) movesByTask.set(move.taskId, []);
    movesByTask.get(move.taskId).push(move);
  }
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
