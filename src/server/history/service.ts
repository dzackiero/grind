import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { RUN_ACTIVITY_TYPES, STRENGTH_ACTIVITY_TYPES } from "@/lib/matching";
import { StrengthFocusSchema } from "@/lib/plan/schema";
import { PlanEditError } from "@/lib/plan/edit";
import type { DB } from "../db/client";
import { activity, athleteProfile, historicalWorkout, plan, plannedWorkout, workoutActivity } from "../db/schema";

export const HistoricalWorkoutInputSchema = z.object({
  requestKey: z.string().trim().min(1).max(200),
  date: z.iso.date(),
  kind: z.enum(["run", "strength", "other"]),
  title: z.string().trim().min(1).max(200),
  focus: StrengthFocusSchema.optional(),
  notes: z.string().trim().max(4000).optional(),
  activityIds: z.array(z.string().min(1).max(200)).max(50).optional(),
}).refine((value) => !value.focus || value.kind === "strength", { message: "Focus is only valid for strength workouts", path: ["focus"] })
  .refine((value) => new Set(value.activityIds ?? []).size === (value.activityIds ?? []).length, { message: "Duplicate activity IDs", path: ["activityIds"] });

export type HistoricalWorkoutInput = z.input<typeof HistoricalWorkoutInputSchema>;
export type HistoricalWorkout = { id: string; date: string; kind: "run" | "strength" | "other"; title: string; focus: string | null; notes: string | null; activityIds: string[] };

/** Record explicitly supplied past training, without changing a plan. requestKey must be stable across retries. */
export async function recordHistoricalWorkout(db: DB, userId: string, rawInput: unknown, today: string): Promise<HistoricalWorkout> {
  const input = HistoricalWorkoutInputSchema.parse(rawInput);
  const currentDate = z.iso.date().parse(today);
  if (input.date > currentDate) throw new PlanEditError("Historical workouts cannot be in the future");
  const ids = [...(input.activityIds ?? [])].sort();

  return db.transaction(async (tx) => {
    await tx.insert(athleteProfile).values({ userId }).onConflictDoNothing({ target: athleteProfile.userId });
    await tx.select({ userId: athleteProfile.userId }).from(athleteProfile).where(eq(athleteProfile.userId, userId)).for("update");
    await tx.select({ id: plan.id }).from(plan).where(and(eq(plan.userId, userId), eq(plan.status, "active"))).for("update");

    const [existing] = await tx.select().from(historicalWorkout).where(and(eq(historicalWorkout.userId, userId), eq(historicalWorkout.requestKey, input.requestKey)));
    if (existing) {
      const links = await tx.select({ id: workoutActivity.activityId }).from(workoutActivity).where(and(eq(workoutActivity.userId, userId), eq(workoutActivity.historyId, existing.id))).orderBy(asc(workoutActivity.activityId));
      const result = { id: existing.id, date: existing.date, kind: existing.kind, title: existing.title, focus: existing.focus, notes: existing.notes, activityIds: links.map((link) => link.id) };
      if (result.date !== input.date || result.kind !== input.kind || result.title !== input.title || result.focus !== (input.focus ?? null) || result.notes !== (input.notes ?? null) || JSON.stringify(result.activityIds) !== JSON.stringify(ids)) throw new PlanEditError("Request key already used for a different workout");
      return result;
    }

    if (ids.length) {
      const activities = await tx.select().from(activity).where(and(eq(activity.userId, userId), inArray(activity.id, ids))).orderBy(asc(activity.id)).for("update");
      if (activities.length !== ids.length) throw new PlanEditError("One or more activities are unavailable");
      for (const row of activities) {
        if (row.date !== input.date) throw new PlanEditError("Activity date does not match the workout date");
        if ((input.kind === "run" && !RUN_ACTIVITY_TYPES.has(row.type)) || (input.kind === "strength" && !STRENGTH_ACTIVITY_TYPES.has(row.type)) || (input.kind === "other" && (RUN_ACTIVITY_TYPES.has(row.type) || STRENGTH_ACTIVITY_TYPES.has(row.type)))) throw new PlanEditError("Activity type does not match the workout kind");
      }
      const links = await tx.select({ id: workoutActivity.activityId }).from(workoutActivity).where(and(eq(workoutActivity.userId, userId), inArray(workoutActivity.activityId, ids)));
      const legacy = await tx.select({ id: plannedWorkout.id }).from(plannedWorkout).where(and(eq(plannedWorkout.userId, userId), inArray(plannedWorkout.activityId, ids)));
      if (links.length || legacy.length) throw new PlanEditError("One or more activities are already linked");
    }
    const [row] = await tx.insert(historicalWorkout).values({ userId, requestKey: input.requestKey, date: input.date, kind: input.kind, title: input.title, focus: input.focus ?? null, notes: input.notes ?? null }).returning();
    if (ids.length) await tx.insert(workoutActivity).values(ids.map((activityId) => ({ userId, activityId, historyId: row.id })));
    return { id: row.id, date: row.date, kind: row.kind, title: row.title, focus: row.focus, notes: row.notes, activityIds: ids };
  });
}

/** Only returns records belonging to the authenticated user. */
export async function getHistoricalWorkout(db: DB, userId: string, id: string): Promise<HistoricalWorkout | null> {
  const [row] = await db.select().from(historicalWorkout).where(and(eq(historicalWorkout.userId, userId), eq(historicalWorkout.id, id)));
  if (!row) return null;
  const links = await db.select({ id: workoutActivity.activityId }).from(workoutActivity).where(and(eq(workoutActivity.userId, userId), eq(workoutActivity.historyId, id))).orderBy(asc(workoutActivity.activityId));
  return { id: row.id, date: row.date, kind: row.kind, title: row.title, focus: row.focus, notes: row.notes, activityIds: links.map((link) => link.id) };
}

export async function listHistoricalWorkouts(db: DB, userId: string, from: string, to: string): Promise<HistoricalWorkout[]> {
  z.iso.date().parse(from); z.iso.date().parse(to);
  if (from > to) throw new PlanEditError("Invalid date range");
  const rows = await db.select().from(historicalWorkout).where(and(eq(historicalWorkout.userId, userId), gte(historicalWorkout.date, from), lte(historicalWorkout.date, to))).orderBy(asc(historicalWorkout.date), asc(historicalWorkout.id)).limit(100);
  if (!rows.length) return [];
  const links = await db.select({ historyId: workoutActivity.historyId, id: workoutActivity.activityId }).from(workoutActivity).where(and(eq(workoutActivity.userId, userId), inArray(workoutActivity.historyId, rows.map((row) => row.id)))).orderBy(asc(workoutActivity.activityId));
  return rows.map((row) => ({ id: row.id, date: row.date, kind: row.kind, title: row.title, focus: row.focus, notes: row.notes, activityIds: links.filter((link) => link.historyId === row.id).map((link) => link.id) }));
}
