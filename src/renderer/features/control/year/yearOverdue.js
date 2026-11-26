export function isYearEventOverdue(event, today, closed) {
  return !closed && !event.completed && !event.recordCompleted && event.date < today;
}

export function yearOverdueCounts(events, today, closed) {
  const counts = new Map();
  for (const event of events) {
    if (isYearEventOverdue(event, today, closed)) counts.set(event.date, (counts.get(event.date) ?? 0) + 1);
  }
  return counts;
}
