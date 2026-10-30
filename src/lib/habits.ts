import { z } from "zod";
import { addDays, mondayOf, WEEKDAYS, weekdayOf, type Weekday } from "./plan/dates";

/*
 * Habits: small things the athlete ticks off on the days they plan to do them. Pure rules only; storage is in
 * server/habits. Dates are "YYYY-MM-DD" strings in the athlete's own time zone.
 */

export const HABIT_ICONS = [
  "check",
  "water",
  "sleep",
  "stretch",
  "food",
  "read",
  "meds",
  "walk",
  "heart",
] as const;
export type HabitIcon = (typeof HABIT_ICONS)[number];

export const MAX_HABITS = 12;
/** How far back a tick can be added or removed. */
export const MAX_BACKFILL_DAYS = 60;
/** How many days back the streak looks. */
export const STREAK_LOOKBACK_DAYS = 120;

const nameField = z
  .string()
  .trim()
  .min(1, "Give the habit a name.")
  .max(40, "Keep the name under 40 characters.");
const iconField = z.enum(HABIT_ICONS);
const daysField = z
  .array(z.enum(WEEKDAYS))
  .min(1, "Pick at least one day.")
  .transform((days) => WEEKDAYS.filter((d) => days.includes(d)));

/** A new habit; the icon defaults to a tick. */
export const HabitInputSchema = z.object({
  name: nameField,
  icon: iconField.default("check"),
  days: daysField,
});
export type HabitInput = z.infer<typeof HabitInputSchema>;

/** An edit: only the fields given change. No defaults here, or leaving out the icon would reset it. */
export const HabitPatchSchema = z
  .object({ name: nameField.optional(), icon: iconField.optional(), days: daysField.optional() })
  .strict();

export interface HabitSuggestion {
  name: string;
  icon: HabitIcon;
  days: Weekday[];
}

const EVERY_DAY: Weekday[] = [...WEEKDAYS];

/** Ideas shown when adding a habit, picked for runners and lifters. */
export const HABIT_SUGGESTIONS: HabitSuggestion[] = [
  { name: "Stretch for 10 minutes", icon: "stretch", days: EVERY_DAY },
  { name: "Sleep 7+ hours", icon: "sleep", days: EVERY_DAY },
  { name: "Drink 2 litres of water", icon: "water", days: EVERY_DAY },
  { name: "Foam roll or mobility", icon: "stretch", days: ["tue", "thu", "sat"] },
  { name: "Eat protein with every meal", icon: "food", days: EVERY_DAY },
  { name: "Easy walk", icon: "walk", days: ["mon", "wed", "fri"] },
  { name: "Take vitamins", icon: "meds", days: EVERY_DAY },
  { name: "Read for 15 minutes", icon: "read", days: EVERY_DAY },
];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

/** "Every day", "Weekdays", "Mon, Wed, Fri" */
export function scheduleLabel(days: readonly Weekday[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 5 && !days.includes("sat") && !days.includes("sun")) return "Weekdays";
  if (days.length === 2 && days.includes("sat") && days.includes("sun")) return "Weekends";
  return WEEKDAYS.filter((d) => days.includes(d))
    .map((d) => WEEKDAY_LABELS[d])
    .join(", ");
}

export function isScheduled(days: readonly Weekday[], date: string): boolean {
  return days.includes(weekdayOf(date));
}

export interface WeekProgress {
  /** Ticks this week, on scheduled days or not */
  done: number;
  /** How many days a week it is scheduled */
  target: number;
}

/** The week (Monday to Sunday) containing `date`. A tick on an unscheduled day still counts toward the target. */
export function weekProgress(
  days: readonly Weekday[],
  doneDates: ReadonlySet<string>,
  date: string,
): WeekProgress {
  const start = mondayOf(date);
  let done = 0;
  for (let i = 0; i < 7; i++) if (doneDates.has(addDays(start, i))) done++;
  return { done, target: days.length };
}

export type DayState = "done" | "missed" | "due" | "rest" | "future";

/** The seven days of the week containing `date`, each marked for the week row. */
export function weekDays(
  days: readonly Weekday[],
  doneDates: ReadonlySet<string>,
  date: string,
  today: string,
) {
  const start = mondayOf(date);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const scheduled = isScheduled(days, day);
    const state: DayState = doneDates.has(day)
      ? "done"
      : day > today
        ? "future"
        : !scheduled
          ? "rest"
          : day === today
            ? "due"
            : "missed";
    return { date: day, weekday: WEEKDAYS[i], scheduled, state };
  });
}

/**
 * Days in a row the habit was kept, counted back from today. A scheduled day with no tick ends the streak, except
 * today, which is still open. Days it isn't scheduled never break it, and a tick on one adds to it.
 */
export function streak(
  days: readonly Weekday[],
  doneDates: ReadonlySet<string>,
  today: string,
): number {
  let count = 0;
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const day = addDays(today, -i);
    if (doneDates.has(day)) count++;
    else if (isScheduled(days, day) && day !== today) break;
  }
  return count;
}

export interface Adherence {
  /** Scheduled days in the window, from the habit's first day */
  scheduled: number;
  /** Of those, how many were ticked */
  done: number;
}

/** How well the last `windowDays` went, counting only days since the habit existed (`createdOn`) and today excluded. */
export function adherence(
  days: readonly Weekday[],
  doneDates: ReadonlySet<string>,
  today: string,
  createdOn: string,
  windowDays: number,
): Adherence {
  let scheduled = 0;
  let done = 0;
  for (let i = 1; i <= windowDays; i++) {
    const day = addDays(today, -i);
    if (day < createdOn) break;
    if (!isScheduled(days, day)) continue;
    scheduled++;
    if (doneDates.has(day)) done++;
  }
  return { scheduled, done };
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && addDays(value, 0) === value;
}
