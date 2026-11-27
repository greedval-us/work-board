export function isYearEventOverdue(event, today, closed) {
  return !closed && !event.completed && !event.recordCompleted && event.date < today;
}

export function groupYearEvents(events, today, closed, onlyOverdue) {
  const groups = new Map();
  for (const event of events) {
    const overdue = isYearEventOverdue(event, today, closed);
    if (onlyOverdue && !overdue) continue;
    if (!groups.has(event.date)) groups.set(event.date, { events: [], overdue: 0 });
    const group = groups.get(event.date);
    group.events.push(event);
    if (overdue) group.overdue++;
  }
  return groups;
}
