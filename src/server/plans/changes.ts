import { and, desc, eq, sql } from "drizzle-orm";
import {
  applyChanges,
  buildChanges,
  PlanEditError,
  staleReason,
  validatePlan,
  type EditOp,
  type Plan,
  type PlanIssue,
  type Workout,
  type WorkoutChange,
} from "@/lib/plan";
import type { DB } from "../db/client";
import { plan as planTable, planChange, plannedWorkout, planWeek } from "../db/schema";
import { getActivePlan, PlanValidationError } from "./service";

/*
 * Plan changes proposed by the coach (Claude through MCP). A proposal is stored with the before and after
 * of every workout it touches. Nothing changes in the plan until it is accepted, either in the app or by
 * Claude after the athlete agrees. Accepting re-checks that the plan hasn't moved on, and re-validates it.
 */

export interface PendingChange {
  id: string;
  summary: string;
  source: "coach" | "user";
  createdAt: string;
  changes: WorkoutChange[];
}

/** Warnings that the edit introduces, ignoring ones the plan already had. */
function newWarnings(before: Plan, after: Plan): PlanIssue[] {
  const had = new Set(validatePlan(before).warnings.map((w) => w.message));
  return validatePlan(after).warnings.filter((w) => !had.has(w.message));
}

/** Check the ops against the active plan and store them as a proposal. Throws PlanEditError / PlanValidationError. */
export async function proposeChanges(db: DB, userId: string, ops: EditOp[], summary: string, today: string, source: "coach" | "user" = "coach") {
  const saved = await getActivePlan(db, userId);
  if (!saved) throw new PlanEditError("There's no active plan yet. Build one in Kilo first.");

  const locked = new Set(Object.entries(saved.progress).filter(([, p]) => p.status !== "planned").map(([key]) => key));
  const changes = buildChanges(saved.plan, ops, { today, lockedIds: locked });
  if (!changes.length) throw new PlanEditError("Those edits leave the plan exactly as it is.");

  const next = applyChanges(saved.plan, changes);
  const result = validatePlan(next);
  if (!result.ok) throw new PlanValidationError(result);

  // A new suggestion replaces any older one still waiting
  const id = await db.transaction(async (tx) => {
    await tx
      .update(planChange)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(and(eq(planChange.planId, saved.id), eq(planChange.userId, userId), eq(planChange.status, "proposed")));
    const [row] = await tx.insert(planChange).values({ planId: saved.id, userId, source, summary: summary.trim(), changes }).returning({ id: planChange.id });
    return row.id;
  });
  return { id, changes, warnings: newWarnings(saved.plan, next) };
}

/** Suggestions waiting for an answer on the active plan, newest first. */
export async function listPendingChanges(db: DB, userId: string): Promise<PendingChange[]> {
  const rows = await db
    .select({ id: planChange.id, summary: planChange.summary, source: planChange.source, createdAt: planChange.createdAt, changes: planChange.changes })
    .from(planChange)
    .innerJoin(planTable, eq(planTable.id, planChange.planId))
    .where(and(eq(planChange.userId, userId), eq(planChange.status, "proposed"), eq(planTable.status, "active")))
    .orderBy(desc(planChange.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Accept or reject a suggestion. Accepting writes the edited plan. Throws PlanEditError when it can't. */
export async function resolveChange(db: DB, userId: string, changeId: string, action: "accept" | "reject") {
  const [row] = await db
    .select()
    .from(planChange)
    .where(and(eq(planChange.id, changeId), eq(planChange.userId, userId)));
  if (!row) throw new PlanEditError("That suggestion doesn't exist.");
  if (row.status !== "proposed") throw new PlanEditError(`That suggestion was already ${row.status}.`);

  if (action === "reject") {
    await db.update(planChange).set({ status: "rejected", resolvedAt: new Date() }).where(eq(planChange.id, row.id));
    return { status: "rejected" as const };
  }

  const saved = await getActivePlan(db, userId);
  if (!saved || saved.id !== row.planId) throw new PlanEditError("That suggestion was for a plan you no longer have.");
  const stale = staleReason(saved.plan, row.changes);
  if (stale) {
    await db.update(planChange).set({ status: "rejected", resolvedAt: new Date() }).where(eq(planChange.id, row.id));
    throw new PlanEditError(`${stale} Ask for a new suggestion.`);
  }
  const next = applyChanges(saved.plan, row.changes);
  const result = validatePlan(next);
  if (!result.ok) throw new PlanValidationError(result);

  await db.transaction(async (tx) => {
    await writePlan(tx as unknown as DB, saved.id, userId, next);
    await tx.update(planChange).set({ status: "accepted", resolvedAt: new Date() }).where(eq(planChange.id, row.id));
  });
  return { status: "accepted" as const, warnings: newWarnings(saved.plan, next) };
}

/** Write an edited plan over the stored one. Done, skipped and linked workouts keep their progress. */
async function writePlan(db: DB, planId: string, userId: string, next: Plan) {
  const existing = new Set((await db.select({ key: plannedWorkout.workoutKey }).from(plannedWorkout).where(eq(plannedWorkout.planId, planId))).map((r) => r.key));
  const keep = new Set<string>();

  for (const week of next.weeks) {
    await db.update(planWeek).set({ targetKm: week.targetKm }).where(and(eq(planWeek.planId, planId), eq(planWeek.index, week.index)));
    for (const [position, w] of week.workouts.entries()) {
      keep.add(w.id);
      const values = {
        weekIndex: week.index,
        position,
        date: w.date,
        kind: w.kind,
        type: w.type,
        title: w.title,
        distanceKm: w.kind === "run" ? w.distanceKm : null,
        data: w,
        updatedAt: new Date(),
      };
      if (existing.has(w.id)) await db.update(plannedWorkout).set(values).where(and(eq(plannedWorkout.planId, planId), eq(plannedWorkout.workoutKey, w.id)));
      else await db.insert(plannedWorkout).values({ ...values, planId, userId, workoutKey: w.id });
    }
  }
  for (const key of existing) if (!keep.has(key)) await db.delete(plannedWorkout).where(and(eq(plannedWorkout.planId, planId), eq(plannedWorkout.workoutKey, key)));

  await db
    .update(planTable)
    .set({ source: "coach", revision: sql`${planTable.revision} + 1`, updatedAt: new Date() })
    .where(eq(planTable.id, planId));
}

/**
 * Write short notes from the coach onto workouts ("why this session is here"). Notes only change text,
 * so they apply straight away. Returns the ids that don't exist in the active plan.
 */
export async function setCoachNotes(db: DB, userId: string, notes: { workoutId: string; note: string }[]) {
  const saved = await getActivePlan(db, userId);
  if (!saved) throw new PlanEditError("There's no active plan yet. Build one in Kilo first.");
  const ids = new Set(saved.plan.weeks.flatMap((w) => w.workouts).map((w) => w.id));
  const missing = notes.filter((n) => !ids.has(n.workoutId)).map((n) => n.workoutId);
  if (missing.length) throw new PlanEditError(`No workout with id: ${missing.join(", ")}. Use get_week to see the ids.`);

  await db.transaction(async (tx) => {
    for (const { workoutId, note } of notes) {
      const [row] = await tx
        .select({ data: plannedWorkout.data })
        .from(plannedWorkout)
        .where(and(eq(plannedWorkout.planId, saved.id), eq(plannedWorkout.workoutKey, workoutId)));
      const data: Workout = { ...row.data, coachNote: note.trim().slice(0, 600) };
      await tx
        .update(plannedWorkout)
        .set({ data, updatedAt: new Date() })
        .where(and(eq(plannedWorkout.planId, saved.id), eq(plannedWorkout.workoutKey, workoutId)));
    }
  });
  return notes.length;
}
