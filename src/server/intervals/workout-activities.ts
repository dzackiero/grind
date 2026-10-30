import { and, eq, inArray } from "drizzle-orm";
import { PlanEditError } from "@/lib/plan";
import { RUN_ACTIVITY_TYPES, STRENGTH_ACTIVITY_TYPES } from "@/lib/matching";
import type { DB } from "../db/client";
import { activity, athleteProfile, plan, plannedWorkout, workoutActivity } from "../db/schema";

const activityFields = {
  id: activity.id,
  date: activity.date,
  startLocal: activity.startLocal,
  type: activity.type,
  name: activity.name,
  distanceM: activity.distanceM,
  movingTimeSec: activity.movingTimeSec,
  avgHr: activity.avgHr,
  maxHr: activity.maxHr,
  trainingLoad: activity.trainingLoad,
  elevationGainM: activity.elevationGainM,
};
type ActivityRow = Pick<typeof activity.$inferSelect, keyof typeof activityFields>;
type Metrics = Pick<ActivityRow, "distanceM" | "movingTimeSec" | "avgHr"> &
  Partial<Pick<ActivityRow, "maxHr" | "trainingLoad" | "elevationGainM">>;

/** Totals retain null when no source provides a measurement; counts expose partial data. */
export function aggregateWorkoutActivities(rows: Metrics[]) {
  const distances = rows.filter((r) => r.distanceM != null);
  const times = rows.filter((r) => r.movingTimeSec != null);
  const hr = rows.filter((r) => r.avgHr != null && r.movingTimeSec != null && r.movingTimeSec > 0);
  const maxHrs = rows.filter((r) => r.maxHr != null);
  const loads = rows.filter((r) => r.trainingLoad != null);
  const elevations = rows.filter((r) => r.elevationGainM != null);
  const weight = hr.reduce((sum, r) => sum + r.movingTimeSec!, 0);
  return {
    activityCount: rows.length,
    distanceM: distances.length ? distances.reduce((sum, r) => sum + r.distanceM!, 0) : null,
    movingTimeSec: times.length ? times.reduce((sum, r) => sum + r.movingTimeSec!, 0) : null,
    avgHr: weight ? hr.reduce((sum, r) => sum + r.avgHr! * r.movingTimeSec!, 0) / weight : null,
    distanceCount: distances.length,
    movingTimeCount: times.length,
    avgHrCount: hr.length,
    maxHr: maxHrs.length ? Math.max(...maxHrs.map((r) => r.maxHr!)) : null,
    maxHrCount: maxHrs.length,
    trainingLoad: loads.length ? loads.reduce((sum, r) => sum + r.trainingLoad!, 0) : null,
    trainingLoadCount: loads.length,
    elevationGainM: elevations.length
      ? elevations.reduce((sum, r) => sum + r.elevationGainM!, 0)
      : null,
    elevationGainCount: elevations.length,
  };
}

/** Bulk load activities for a user's plan, including links predating the junction table. */
export async function getWorkoutActivityRows(
  db: DB,
  userId: string,
  filter: { planId: string },
): Promise<Map<string, ActivityRow[]>> {
  const workouts = await db
    .select({
      id: plannedWorkout.id,
      key: plannedWorkout.workoutKey,
      legacy: plannedWorkout.activityId,
    })
    .from(plannedWorkout)
    .where(and(eq(plannedWorkout.userId, userId), eq(plannedWorkout.planId, filter.planId)));
  const result = new Map<string, ActivityRow[]>(workouts.map((w) => [w.key, []]));
  if (!workouts.length) return result;
  const links = await db
    .select({ workoutId: workoutActivity.plannedWorkoutId, row: activityFields })
    .from(workoutActivity)
    .innerJoin(
      activity,
      and(eq(activity.userId, workoutActivity.userId), eq(activity.id, workoutActivity.activityId)),
    )
    .where(
      and(
        eq(workoutActivity.userId, userId),
        inArray(
          workoutActivity.plannedWorkoutId,
          workouts.map((w) => w.id),
        ),
      ),
    );
  const byId = new Map(workouts.map((w) => [w.id, w]));
  for (const link of links) {
    const w = link.workoutId && byId.get(link.workoutId);
    if (w) result.get(w.key)!.push(link.row);
  }
  const legacyIds = [...new Set(workouts.flatMap((w) => (w.legacy ? [w.legacy] : [])))];
  if (legacyIds.length) {
    const legacy = await db
      .select(activityFields)
      .from(activity)
      .where(and(eq(activity.userId, userId), inArray(activity.id, legacyIds)));
    const claims = await db
      .select()
      .from(workoutActivity)
      .where(
        and(eq(workoutActivity.userId, userId), inArray(workoutActivity.activityId, legacyIds)),
      );
    const claimById = new Map(claims.map((c) => [c.activityId, c]));
    for (const w of workouts) {
      const row = legacy.find((a) => a.id === w.legacy);
      const claim = row && claimById.get(row.id);
      if (
        row &&
        (!claim || claim.plannedWorkoutId === w.id) &&
        !result.get(w.key)!.some((a) => a.id === row.id)
      )
        result.get(w.key)!.push(row);
    }
  }
  return result;
}

/** What the watch recorded per workout, with every linked activity added together (e.g. two runs on one day). */
export async function getWorkoutActuals(db: DB, userId: string, planId: string) {
  const all = await getWorkoutActivityRows(db, userId, { planId });
  const out: Record<string, ActivityRow & { activityCount: number }> = {};
  for (const [key, rows] of all) {
    if (!rows.length) continue;
    const sorted = [...rows].sort((a, b) => a.startLocal.localeCompare(b.startLocal));
    const total = aggregateWorkoutActivities(sorted);
    out[key] = {
      ...sorted[0],
      name: sorted.length > 1 ? `${sorted.length} activities` : sorted[0].name,
      distanceM: total.distanceM,
      movingTimeSec: total.movingTimeSec,
      avgHr: total.avgHr,
      maxHr: total.maxHr,
      trainingLoad: total.trainingLoad,
      elevationGainM: total.elevationGainM,
      activityCount: sorted.length,
    };
  }
  return out;
}

/** Explicitly append activities to a workout; never move an activity from another session. */
export async function linkWorkoutActivities(
  db: DB,
  userId: string,
  input: { workoutId: string; activityIds: string[] },
  today: string,
) {
  if (
    !input.activityIds.length ||
    input.activityIds.length > 50 ||
    new Set(input.activityIds).size !== input.activityIds.length ||
    input.activityIds.some((id) => !id)
  ) {
    throw new PlanEditError("Provide 1 to 50 distinct activity IDs.");
  }
  const ids = [...input.activityIds].sort();
  return db.transaction(async (tx) => {
    // The profile row serializes both planned and historical assignment operations for this user.
    await tx.insert(athleteProfile).values({ userId }).onConflictDoNothing();
    await tx.select().from(athleteProfile).where(eq(athleteProfile.userId, userId)).for("update");
    const [active] = await tx
      .select()
      .from(plan)
      .where(and(eq(plan.userId, userId), eq(plan.status, "active")))
      .for("update");
    if (!active) throw new PlanEditError("Active plan not found.");
    const acts = await tx
      .select()
      .from(activity)
      .where(and(eq(activity.userId, userId), inArray(activity.id, ids)))
      .orderBy(activity.id)
      .for("update");
    const [workout] = await tx
      .select()
      .from(plannedWorkout)
      .where(
        and(
          eq(plannedWorkout.userId, userId),
          eq(plannedWorkout.planId, active.id),
          eq(plannedWorkout.workoutKey, input.workoutId),
        ),
      )
      .for("update");
    if (!workout) throw new PlanEditError("Workout not found in active plan.");
    if (workout.status === "skipped")
      throw new PlanEditError("A skipped workout cannot be linked.");
    if (acts.length !== ids.length) throw new PlanEditError("Activity not found.");
    const allowed = workout.kind === "run" ? RUN_ACTIVITY_TYPES : STRENGTH_ACTIVITY_TYPES;
    if (acts.some((a) => a.date !== workout.date || a.date > today || !allowed.has(a.type)))
      throw new PlanEditError(
        "Activities must match the workout date and kind and cannot be in the future.",
      );
    const claims = await tx
      .select()
      .from(workoutActivity)
      .where(and(eq(workoutActivity.userId, userId), inArray(workoutActivity.activityId, ids)));
    if (claims.some((c) => c.plannedWorkoutId !== workout.id))
      throw new PlanEditError("Activity is already linked to another workout.");
    const legacyClaims = await tx
      .select({ id: plannedWorkout.id })
      .from(plannedWorkout)
      .where(and(eq(plannedWorkout.userId, userId), inArray(plannedWorkout.activityId, ids)));
    if (legacyClaims.some((c) => c.id !== workout.id))
      throw new PlanEditError("Activity is already linked to another workout.");
    await tx
      .insert(workoutActivity)
      .values(ids.map((activityId) => ({ userId, activityId, plannedWorkoutId: workout.id })))
      .onConflictDoNothing();
    const now = new Date();
    const starts = acts.flatMap((a) => {
      const raw = a.raw.start_date;
      if (typeof raw !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return [];
      const time = new Date(raw);
      return Number.isNaN(time.valueOf()) ? [] : [time];
    });
    await tx
      .update(plannedWorkout)
      .set({
        activityId: workout.activityId ?? ids[0],
        ...(workout.status === "planned"
          ? {
              status: "completed" as const,
              completedAt: starts.length
                ? new Date(Math.min(...starts.map((d) => d.valueOf())))
                : now,
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(plannedWorkout.id, workout.id));
    const all = await getWorkoutActivityRows(tx as unknown as DB, userId, { planId: active.id });
    const rows = all.get(workout.workoutKey) ?? [];
    return { activityIds: rows.map((a) => a.id), actuals: aggregateWorkoutActivities(rows) };
  });
}
