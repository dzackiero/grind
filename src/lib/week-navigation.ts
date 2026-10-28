import { addDays, formatDate, parseDate, weekdayIndex } from "./plan/dates";

export type WeekDirection = -1 | 1;

/** Anchor navigation to the displayed week, including when Today is outside the plan. */
export function adjacentWeekDate(
  week: { index: number; startDate: string },
  totalWeeks: number,
  selected: string,
  direction: WeekDirection,
): string | null {
  if (week.index + direction < 1 || week.index + direction > totalWeeks) return null;
  const date = parseDate(selected);
  const valid = Number.isFinite(date.getTime()) && formatDate(date) === selected;
  return addDays(week.startDate, direction * 7 + (valid ? weekdayIndex(selected) : 0));
}

/** Require enough horizontal travel and clear intent over vertical scrolling. */
export function swipeDirection(dx: number, dy: number): WeekDirection | null {
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 1 : -1;
}
