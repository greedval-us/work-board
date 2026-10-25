function dateParts(value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) throw new Error('Некорректная календарная дата.');
  return match.slice(1).map((part) => part === undefined ? undefined : Number(part));
}

function dateOnly(value) {
  const pad = (part) => String(part).padStart(2, '0');
  return `${String(value.getFullYear()).padStart(4, '0')}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function calendarDate(value) {
  const [year, month, day = 1] = dateParts(value);
  const date = new Date(year, month - 1, day, 12);
  date.setFullYear(year);
  return date;
}

export function buildMonthGrid(month) {
  const first = calendarDate(month);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(index - offset + 1);
    const value = dateOnly(date);
    return { date: value, day: date.getDate(), inMonth: value.slice(0, 7) === month };
  });
}

export function moveMonth(month, delta) {
  const date = calendarDate(month);
  date.setMonth(date.getMonth() + delta);
  return dateOnly(date).slice(0, 7);
}

export function millisecondsUntilTomorrow(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 50);
  return tomorrow.getTime() - now.getTime();
}

export function monthLabel(month) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(calendarDate(month));
}

export function dayLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).format(calendarDate(date));
}
