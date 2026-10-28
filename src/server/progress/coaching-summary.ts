import { and, asc, eq, gte, lte, max, min, notExists } from "drizzle-orm";
import { RUN_ACTIVITY_TYPES, STRENGTH_ACTIVITY_TYPES } from "@/lib/matching";
import { addDays, mondayOf } from "@/lib/plan/dates";
import type { DB } from "../db/client";
import { activity, plan, plannedWorkout } from "../db/schema";

const UNITS = { km: "km", movingTimeSec: "seconds", longestRunKm: "km" } as const;
type ActivityMetrics = { date: string; type: string; distanceM: number | null; movingTimeSec: number | null };

/** A missing measurement stays unknown; an empty set of activities has a zero total. */
function total(values: (number | null)[]): number | null {
  if (!values.length) return 0;
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function summarize(rows: ActivityMetrics[], from: string, to: string) {
  const inWindow = rows.filter((row) => row.date >= from && row.date <= to);
  const runs = inWindow.filter((row) => RUN_ACTIVITY_TYPES.has(row.type));
  const strength = inWindow.filter((row) => STRENGTH_ACTIVITY_TYPES.has(row.type));
  const distances = runs.map((row) => row.distanceM === null ? null : row.distanceM / 1000);
  const knownDistances = distances.filter((value): value is number => value !== null);
  return {
    from, to,
    km: total(distances),
    movingTimeSec: total([...runs, ...strength].map((row) => row.movingTimeSec)),
    runSessions: runs.length,
    strengthSessions: strength.length,
    longestRunKm: knownDistances.length ? Math.max(...knownDistances) : runs.length ? null : 0,
    // Counts make partial metric coverage visible alongside totals of known values.
    runsWithDistance: knownDistances.length,
    sessionsWithMovingTime: [...runs, ...strength].filter((row) => row.movingTimeSec !== null).length,
  };
}

/** Includes every synced run and strength activity, independently of plan matching. */
export async function getTrainingSummary(db: DB, userId: string, today: string, days = 28) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Days must be an integer from 1 to 365.");
  const from = addDays(today, 1 - days);
  const [rows, [available]] = await Promise.all([
    db.select({ date: activity.date, type: activity.type, distanceM: activity.distanceM, movingTimeSec: activity.movingTimeSec })
      .from(activity).where(and(eq(activity.userId, userId), gte(activity.date, addDays(today, 1 - Math.max(days, 28))), lte(activity.date, today))),
    db.select({ from: min(activity.date), to: max(activity.date) }).from(activity).where(eq(activity.userId, userId)),
  ]);
  const weeks = [];
  for (let monday = mondayOf(from); monday <= today; monday = addDays(monday, 7)) {
    weeks.push(summarize(rows, monday < from ? from : monday, addDays(monday, 6) > today ? today : addDays(monday, 6)));
  }
  return {
    asOf: today,
    source: "synced_activities" as const,
    units: UNITS,
    availableDateRange: available,
    period: summarize(rows, from, today),
    rolling7: summarize(rows, addDays(today, -6), today),
    rolling28: summarize(rows, addDays(today, -27), today),
    weeks,
  };
}

/** Status is the saved plan status; a linked recording supplies actual metrics separately. */
export async function getWorkoutCompliance(db: DB, userId: string, from: string, to: string) {
  const linkedInActivePlan = db.select({ id: plannedWorkout.id }).from(plannedWorkout)
    .innerJoin(plan, and(eq(plan.id, plannedWorkout.planId), eq(plan.userId, userId), eq(plan.status, "active")))
    .where(and(eq(plannedWorkout.userId, userId), eq(plannedWorkout.activityId, activity.id)));
  const [workouts, actual] = await Promise.all([
    db.select({
      workoutId: plannedWorkout.workoutKey, workoutDate: plannedWorkout.date, kind: plannedWorkout.kind,
      type: plannedWorkout.type, title: plannedWorkout.title, status: plannedWorkout.status,
      plannedKm: plannedWorkout.distanceKm, linkedActivityId: plannedWorkout.activityId,
      actualId: activity.id, actualDate: activity.date, actualType: activity.type,
      distanceM: activity.distanceM, movingTimeSec: activity.movingTimeSec,
    }).from(plannedWorkout)
      .innerJoin(plan, and(eq(plan.id, plannedWorkout.planId), eq(plan.userId, userId), eq(plan.status, "active")))
      .leftJoin(activity, and(eq(activity.userId, userId), eq(activity.id, plannedWorkout.activityId)))
      .where(and(eq(plannedWorkout.userId, userId), gte(plannedWorkout.date, from), lte(plannedWorkout.date, to)))
      .orderBy(asc(plannedWorkout.date), asc(plannedWorkout.position)),
    db.select({ id: activity.id, date: activity.date, type: activity.type, name: activity.name, distanceM: activity.distanceM, movingTimeSec: activity.movingTimeSec })
      .from(activity).where(and(eq(activity.userId, userId), gte(activity.date, from), lte(activity.date, to), notExists(linkedInActivePlan)))
      .orderBy(asc(activity.date), asc(activity.id)),
  ]);
  const compared = workouts.map(({ distanceM, ...row }) => {
    const actualKm = distanceM === null ? null : distanceM / 1000;
    return {
      ...row, actualKm,
      distanceCompletionRatio: row.kind === "run" && row.plannedKm !== null && row.plannedKm > 0 && actualKm !== null ? actualKm / row.plannedKm : null,
    };
  });
  const unmatchedActualActivities = actual.map(({ distanceM, ...row }) => ({ ...row, actualKm: distanceM === null ? null : distanceM / 1000 }));
  return {
    from, to,
    source: { planned: "active_plan", actual: "synced_activities" } as const,
    units: { plannedKm: "km", actualKm: "km", movingTimeSec: "seconds", distanceCompletionRatio: "ratio" } as const,
    workouts: compared,
    totals: {
      planned: compared.length,
      completed: compared.filter((row) => row.status === "completed").length,
      skipped: compared.filter((row) => row.status === "skipped").length,
      linked: compared.filter((row) => row.actualId !== null).length,
      unlinkedRuns: unmatchedActualActivities.filter((row) => RUN_ACTIVITY_TYPES.has(row.type)).length,
      plannedRunKm: total(compared.filter((row) => row.kind === "run").map((row) => row.plannedKm)),
      actualRunKm: total(compared.filter((row) => row.kind === "run" && row.actualId !== null).map((row) => row.actualKm)),
    },
    unmatchedActualActivities,
  };
}
