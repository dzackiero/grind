import type { Plan, Week, Workout } from "@/lib/plan";

/** Progress as returned by the plans service, keyed by workout id. */
export type Progress = Record<
  string,
  {
    status: "planned" | "completed" | "skipped";
    completedAt: string | null;
    activityId: string | null;
  }
>;

/** What the watch recorded for a completed workout (from intervals.icu). */
export interface ActualSummary {
  activityId: string;
  name: string | null;
  distanceM: number | null;
  movingTimeSec: number | null;
  avgHr: number | null;
  maxHr: number | null;
  trainingLoad: number | null;
  elevationGainM: number | null;
}

export type Actuals = Record<string, ActualSummary>;

/** Real km per workout id, for weekStats. */
export function actualKm(actuals: Actuals): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, a] of Object.entries(actuals))
    if (a.distanceM) out[key] = Math.round(a.distanceM / 100) / 10;
  return out;
}

/** How close a run came to its planned distance, 0–100. */
export function distanceScore(plannedKm: number, actualM: number | null) {
  if (!actualM || plannedKm <= 0) return null;
  const ratio = actualM / 1000 / plannedKm;
  return Math.max(0, Math.round(100 - Math.abs(1 - ratio) * 100));
}

export function statusOf(progress: Progress, w: Workout) {
  return progress[w.id]?.status ?? "planned";
}

/** The plan week containing a date, clamped to the first/last week. */
export function weekFor(plan: Plan, date: string): Week {
  return [...plan.weeks].reverse().find((w) => w.startDate <= date) ?? plan.weeks[0];
}

export function workoutsOn(plan: Plan, date: string): Workout[] {
  return plan.weeks.flatMap((w) => w.workouts).filter((w) => w.date === date);
}

export function findWorkout(plan: Plan, key: string): { workout: Workout; week: Week } | null {
  for (const week of plan.weeks) {
    const workout = week.workouts.find((w) => w.id === key);
    if (workout) return { workout, week };
  }
  return null;
}

/** First workout after a date that is still planned. */
export function nextWorkout(plan: Plan, progress: Progress, afterDate: string): Workout | null {
  return (
    plan.weeks
      .flatMap((w) => w.workouts)
      .find((w) => w.date > afterDate && statusOf(progress, w) === "planned") ?? null
  );
}

/**
 * Week totals. Completed runs count their real distance when a synced activity is linked
 * (`actualKm`, keyed by workout id), otherwise their planned distance.
 */
export function weekStats(week: Week, progress: Progress, actualKm: Record<string, number> = {}) {
  const done = week.workouts.filter((w) => statusOf(progress, w) === "completed");
  const kmDone = done.reduce(
    (s, w) => s + (w.kind === "run" ? (actualKm[w.id] ?? w.distanceKm) : 0),
    0,
  );
  return {
    done: done.length,
    total: week.workouts.length,
    kmDone: Math.round(kmDone * 10) / 10,
    kmTarget: week.targetKm,
  };
}
