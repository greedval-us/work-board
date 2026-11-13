import { validateDate } from '../dates.js';
import { ValidationError } from '../errors.js';
import { listControlCheckpoints } from './checkpoints.js';
import { checkScheduleBounds, validateControlSchedule } from './validation.js';

export function moveControlCheckpoint(value, from, to, bounds = {}) {
  // Existing overrides may need correction after the control period changes.
  // Validate the selected destination now; validate every draft date on save.
  const schedule = validateControlSchedule(value);
  validateDate(from, 'Исходная дата промежуточного контроля');
  validateDate(to, 'Новая дата промежуточного контроля');
  checkScheduleBounds(to, bounds.controlDate, bounds.deadline);
  const checkpoint = listControlCheckpoints(schedule, { from, to: from })
    .find(row => row.scheduled);
  if (!checkpoint) throw new ValidationError('Исходная дата отсутствует в действующем графике промежуточного контроля.');
  if (from === to) return schedule;
  if (listControlCheckpoints(schedule, { from: to, to }).length) {
    throw new ValidationError('На выбранную дату уже назначен промежуточный контроль или сохранена отметка.');
  }
  const originalDate = checkpoint.originalDate ?? from;
  const moves = (schedule.moves ?? []).filter(move => move.from !== originalDate);
  if (originalDate !== to) moves.push({ from: originalDate, to });
  const marks = schedule.marks.map(mark => mark.date === from
    ? { ...mark, date: to, actualDate: mark.actualDate ?? from } : mark);
  return validateControlSchedule({ ...schedule, moves, marks });
}
