// Plan dates are plain "YYYY-MM-DD" strings. All math runs in UTC so time zones never shift a day.

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DAY_MS = 86_400_000;

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return formatDate(new Date(parseDate(iso).getTime() + days * DAY_MS));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(iso: string): number {
  return (parseDate(iso).getUTCDay() + 6) % 7;
}

export function weekdayOf(iso: string): Weekday {
  return WEEKDAYS[weekdayIndex(iso)];
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

export function dateForWeekday(weekStartIso: string, day: Weekday): string {
  return addDays(weekStartIso, WEEKDAYS.indexOf(day));
}

/** Distance between two weekdays on a circular week (Sun and Mon are 1 apart). */
export function circularDayGap(a: Weekday, b: Weekday): number {
  const d = Math.abs(WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  return Math.min(d, 7 - d);
}
