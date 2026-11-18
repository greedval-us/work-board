import { URGENCY_WINDOW_DAYS } from '../../shared/constants/registry.js';

export const NOTIFICATION_GROUP_SIZE = 20;
export const UPCOMING_DEADLINES = `В ближайшие ${URGENCY_WINDOW_DAYS} дня`;

export function groupNotifications(items, today) {
  const sections = {
    overdue: { key: 'overdue', title: 'Просрочено', items: [] },
    today: { key: 'today', title: 'Сегодня', items: [] },
    upcoming: { key: 'upcoming', title: UPCOMING_DEADLINES, items: [] },
  };
  for (const item of items) {
    const section = item.date < today ? sections.overdue : item.date === today ? sections.today : sections.upcoming;
    section.items.push(item);
  }
  return Object.values(sections).filter(section => section.items.length);
}
