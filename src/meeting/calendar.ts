export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const longDayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export const formatMonth = (date: Date) => monthFormat.format(date);
export const formatDay = (ms: number) => dayFormat.format(ms);
export const formatLongDay = (date: Date) => longDayFormat.format(date);
export const formatTime = (ms: number) => timeFormat.format(ms);

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Six Monday-first weeks covering the month of `date`, padded with neighbouring days. */
export function monthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
  });
}

/** Rounds up to the next half hour, the usual default for a new event. */
export function nextHalfHour(from = new Date()): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() < 30 ? 30 : 60);
  return next;
}

const pad = (value: number) => String(value).padStart(2, '0');

export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Combines `YYYY-MM-DD` and `HH:mm` inputs into local epoch millis, or null if malformed. */
export function parseDateTime(date: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dateMatch || !timeMatch) {
    return null;
  }
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hours, minutes] = timeMatch.slice(1).map(Number);
  const result = new Date(year, month - 1, day, hours, minutes);
  const valid =
    result.getMonth() === month - 1 &&
    result.getDate() === day &&
    result.getHours() === hours &&
    result.getMinutes() === minutes;
  return valid ? result.getTime() : null;
}
