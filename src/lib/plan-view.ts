import type { Plan, Week, Workout } from "@/lib/plan";

/** Progress as returned by the plans service, keyed by workout id. */
export type Progress = Record<string, { status: "planned" | "completed" | "skipped"; completedAt: string | null; activityId: string | null }>;

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
  return plan.weeks.flatMap((w) => w.workouts).find((w) => w.date > afterDate && statusOf(progress, w) === "planned") ?? null;
}

export function weekStats(week: Week, progress: Progress) {
  const done = week.workouts.filter((w) => statusOf(progress, w) === "completed");
  const kmDone = done.reduce((s, w) => s + (w.kind === "run" ? w.distanceKm : 0), 0);
  return { done: done.length, total: week.workouts.length, kmDone: Math.round(kmDone * 10) / 10, kmTarget: week.targetKm };
}
