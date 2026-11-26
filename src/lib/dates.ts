// Date utilities. All work in local time. Weeks are Mon–Sun.

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

export function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)); // Mon..Sat
}

const MONTHS_SHORT = [
  'янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июня',
  'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
];

const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export function formatRange(weekStart: Date): string {
  const end = addDays(weekStart, 5); // Sat
  const startStr = `${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]}`;
  const endStr = `${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
  return `${startStr} – ${endStr}`;
}

export function weekdayShort(d: Date): string {
  return WEEKDAYS_SHORT[(d.getDay() + 6) % 7];
}

// "Пт, 20 нояб."
export function formatDayHeader(d: Date): string {
  const wd = WEEKDAYS_SHORT[(d.getDay() + 6) % 7];
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

// Next/previous day in the Mon..Sat schedule cycle, wrapping across weeks.
export function shiftScheduleDay(
  dateKey: string,
  direction: 1 | -1
): { dateKey: string; newWeek: boolean } {
  const current = fromDateKey(dateKey);
  let target = addDays(current, direction);
  if (target.getDay() === 0) target = addDays(target, direction); // skip Sunday
  return {
    dateKey: toDateKey(target),
    newWeek: startOfWeek(target).getTime() !== startOfWeek(current).getTime(),
  };
}
