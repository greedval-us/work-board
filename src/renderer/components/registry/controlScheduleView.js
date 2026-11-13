import { listControlCheckpoints } from '../../../shared/controlSchedule.js';
import { daysInMonth, localDate, validateDate } from '../../../shared/dates.js';
import { getUrgency, INSTRUCTION_STATUS } from '../../../shared/registry.js';

export function isDate(date) {
  try { return Boolean(validateDate(date)); }
  catch { return false; }
}

export function inControlPeriod(date, { controlDate, deadline }) {
  return isDate(date) && (!controlDate || date >= controlDate) && (!deadline || date <= deadline);
}

export function effectiveCustomDates(schedule) {
  const moves = new Map((schedule.moves ?? []).map(move => [move.from, move.to]));
  return schedule.customDates.map(date => moves.get(date) ?? date).sort();
}

export function startingMonth(schedule, { controlDate, deadline }, today = localDate()) {
  const recentMark = schedule.marks.at(-1)?.date;
  if (schedule.frequency === 'custom' && schedule.customDates.length) {
    const dates = effectiveCustomDates(schedule);
    const upcoming = dates.find(date => date >= today);
    return (upcoming || dates.at(-1)).slice(0, 7);
  }
  if (schedule.frequency && isDate(schedule.firstDate)) {
    if (schedule.firstDate > today) return schedule.firstDate.slice(0, 7);
    if (!deadline || deadline >= today) return today.slice(0, 7);
    return (recentMark > deadline ? recentMark : deadline).slice(0, 7);
  }
  return (recentMark || (isDate(controlDate) ? controlDate : today)).slice(0, 7);
}

function checkpointStatus(row, today, configured) {
  if (row.mark) return { label: 'Есть отметка', tone: 'success' };
  if (!row.scheduled) return { label: configured ? 'Вне периода контроля' : 'Вне текущего графика', tone: 'warning' };
  const urgency = getUrgency({ deadline: row.date, status: INSTRUCTION_STATUS.PENDING }, today);
  return urgency.tone === 'info' ? { ...urgency, label: 'По графику' } : urgency;
}

// Include repairable dates and draft history alongside the current month's scheduled checkpoints.
export function controlScheduleRows(schedule, { month, controlDate, deadline, editedHistoryDate = '' }, today = localDate()) {
  const period = { controlDate, deadline };
  const [year, monthNumber] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = `${month}-${daysInMonth(year, monthNumber)}`;
  const moves = new Map((schedule.moves ?? []).map(move => [move.from, move.to]));
  const configuredDates = new Set(schedule.frequency === 'custom' ? effectiveCustomDates(schedule) : []);
  const marksByDate = new Map(schedule.marks.map(mark => [mark.date, mark]));
  const validSchedule = {
    ...schedule,
    firstDate: inControlPeriod(schedule.firstDate, period) ? schedule.firstDate : '',
    customDates: schedule.customDates.filter(date => inControlPeriod(moves.get(date) ?? date, period)),
  };
  const checkpoints = listControlCheckpoints(validSchedule, { from, to, deadline });
  const byDate = new Map(checkpoints.map(row => [row.date, row]));
  // Keep invalid custom dates removable and keep an open history editor mounted while its text is being replaced.
  for (const date of [...configuredDates, editedHistoryDate]) {
    if (date >= from && date <= to && !byDate.has(date)) byDate.set(date, { date, mark: '', scheduled: false });
  }
  // A changed control period must not hide a move that the user needs to repair or cancel.
  for (const [originalDate, date] of moves) {
    if (date < from || date > to) continue;
    const row = byDate.get(date) ?? { date, mark: marksByDate.get(date)?.text ?? '', scheduled: false };
    byDate.set(date, { ...row, originalDate, scheduled: row.scheduled && inControlPeriod(date, period) });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).map(row => {
    const configured = configuredDates.has(row.date);
    return {
      ...row,
      configured,
      movable: Boolean(row.scheduled || row.originalDate),
      canOpen: Boolean(row.scheduled || row.originalDate || row.mark || editedHistoryDate === row.date),
      status: checkpointStatus(row, today, configured),
    };
  });
}
