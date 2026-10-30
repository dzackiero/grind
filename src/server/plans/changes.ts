import { and, desc, eq, sql } from "drizzle-orm";
import {
  applyChanges,
  PlanEditError,
  staleReason,
  type EditOp,
  type Plan,
  type PlanIssue,
  type Workout,
  type WorkoutChange,
} from "@/lib/plan";
import type { DB } from "../db/client";
import {
  athleteProfile,
  plan as planTable,
  planChange,
  plannedWorkout,
  planWeek,
} from "../db/schema";
import { getActivePlan, PlanValidationError } from "./service";
import { getCoachingProfile } from "../profile/coaching";
import { getTimezone, todayIn } from "../profile/service";
import {
  changeEligibilityReason,
  planDiff,
  previewPlanChanges,
  validateWithCoaching,
} from "./preview";

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

/** Serialize plan and preference writes in the same lock order. */
async function lockContext(db: DB, userId: string) {
  await db
    .insert(athleteProfile)
    .values({ userId })
    .onConflictDoNothing({ target: athleteProfile.userId });
  await db
    .select({ id: athleteProfile.userId })
    .from(athleteProfile)
    .where(eq(athleteProfile.userId, userId))
    .for("update");
  await db
    .select({ id: planTable.id })
    .from(planTable)
    .where(and(eq(planTable.userId, userId), eq(planTable.status, "active")))
    .for("update");
}

/** Check the ops against the active plan and store them as a proposal. Throws PlanEditError / PlanValidationError. */
export async function proposeChanges(
  db: DB,
  userId: string,
  ops: EditOp[],
  summary: string,
  today: string,
  source: "coach" | "user" = "coach",
  expectedRevision?: number,
) {
  return db.transaction(async (tx) => {
    const connection = tx as unknown as DB;
    await lockContext(connection, userId);
    const { saved, changes, validation, diff, coachingRevision } = await previewPlanChanges(
      connection,
      userId,
      ops,
      today,
      expectedRevision,
    );
    if (!changes.length) throw new PlanEditError("Those edits leave the plan exactly as it is.");
    if (!validation.ok) throw new PlanValidationError(validation);
    await tx
      .update(planChange)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(
        and(
          eq(planChange.planId, saved.id),
          eq(planChange.userId, userId),
          eq(planChange.status, "proposed"),
        ),
      );
    const [row] = await tx
      .insert(planChange)
      .values({
        planId: saved.id,
        userId,
        source,
        summary: summary.trim(),
        changes,
        baseRevision: saved.revision,
        coachingRevision,
        diff,
      })
      .returning({ id: planChange.id });
    const previous = validateWithCoaching(
      saved.plan,
      (await getCoachingProfile(connection, userId)).profile,
      today,
    );
    const had = new Set(previous.warnings.map((w) => w.message));
    const warnings: PlanIssue[] = validation.warnings.filter((w) => !had.has(w.message));
    return {
      id: row.id,
      changes,
      warnings,
      validation,
      diff,
      planRevision: saved.revision,
      coachingRevision,
    };
  });
}

/** Suggestions waiting for an answer on the active plan, newest first. */
export async function listPendingChanges(db: DB, userId: string): Promise<PendingChange[]> {
  const rows = await db
    .select({
      id: planChange.id,
      summary: planChange.summary,
      source: planChange.source,
      createdAt: planChange.createdAt,
      changes: planChange.changes,
    })
    .from(planChange)
    .innerJoin(planTable, eq(planTable.id, planChange.planId))
    .where(
      and(
        eq(planChange.userId, userId),
        eq(planChange.status, "proposed"),
        eq(planTable.status, "active"),
      ),
    )
    .orderBy(desc(planChange.createdAt));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Accept or reject a suggestion. Accepting writes the edited plan. Throws PlanEditError when it can't. */
export async function resolveChange(
  db: DB,
  userId: string,
  changeId: string,
  action: "accept" | "reject",
) {
  const resolved = await db.transaction(async (tx) => {
    const connection = tx as unknown as DB;
    await lockContext(connection, userId);
    const [row] = await tx
      .select()
      .from(planChange)
      .where(and(eq(planChange.id, changeId), eq(planChange.userId, userId)))
      .for("update");
    if (!row) throw new PlanEditError("That suggestion doesn't exist.");
    if (row.status !== "proposed")
      throw new PlanEditError(`That suggestion was already ${row.status}.`);
    const invalidate = async (conflict: string) => {
      await tx
        .update(planChange)
        .set({ status: "rejected", resolvedAt: new Date() })
        .where(eq(planChange.id, row.id));
      return { conflict };
    };

    if (action === "reject") {
      await tx
        .update(planChange)
        .set({ status: "rejected", resolvedAt: new Date() })
        .where(eq(planChange.id, row.id));
      return { status: "rejected" as const };
    }

    await tx
      .select({ id: plannedWorkout.id })
      .from(plannedWorkout)
      .where(eq(plannedWorkout.planId, row.planId))
      .for("update");
    const saved = await getActivePlan(connection, userId);
    if (!saved || saved.id !== row.planId)
      return invalidate("That suggestion was for a plan you no longer have.");
    const stale = staleReason(saved.plan, row.changes);
    if (stale) {
      return invalidate(`${stale} Ask for a new suggestion.`);
    }
    if (row.baseRevision !== saved.revision)
      return invalidate("The plan revision changed. Ask for a new suggestion.");
    const coaching = await getCoachingProfile(connection, userId);
    if (coaching.revision !== row.coachingRevision)
      return invalidate(
        "The coaching preferences or constraints changed. Ask for a new suggestion.",
      );
    const today = todayIn(await getTimezone(connection, userId));
    const ineligible = changeEligibilityReason(saved, row.changes, today);
    if (ineligible) return invalidate(ineligible);
    const next = applyChanges(saved.plan, row.changes);
    const result = validateWithCoaching(next, coaching.profile, today);
    if (!result.ok) throw new PlanValidationError(result);

    await writePlan(tx as unknown as DB, saved.id, userId, next);
    await tx
      .update(planChange)
      .set({ status: "accepted", resolvedAt: new Date() })
      .where(eq(planChange.id, row.id));
    const beforeWarnings = new Set(
      validateWithCoaching(saved.plan, coaching.profile, today).warnings.map((w) => w.message),
    );
    return {
      status: "accepted" as const,
      warnings: result.warnings.filter((w) => !beforeWarnings.has(w.message)),
      planRevision: saved.revision + 1,
      diff: planDiff(saved.plan, next, row.changes),
      validation: result,
    };
  });
  if ("conflict" in resolved) throw new PlanEditError(resolved.conflict);
  return resolved;
}

/** Write an edited plan over the stored one. Done, skipped and linked workouts keep their progress. */
async function writePlan(db: DB, planId: string, userId: string, next: Plan) {
  const existing = new Set(
    (
      await db
        .select({ key: plannedWorkout.workoutKey })
        .from(plannedWorkout)
        .where(eq(plannedWorkout.planId, planId))
    ).map((r) => r.key),
  );
  const keep = new Set<string>();

  for (const week of next.weeks) {
    await db
      .update(planWeek)
      .set({ targetKm: week.targetKm })
      .where(and(eq(planWeek.planId, planId), eq(planWeek.index, week.index)));
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
      if (existing.has(w.id))
        await db
          .update(plannedWorkout)
          .set(values)
          .where(and(eq(plannedWorkout.planId, planId), eq(plannedWorkout.workoutKey, w.id)));
      else await db.insert(plannedWorkout).values({ ...values, planId, userId, workoutKey: w.id });
    }
  }
  for (const key of existing)
    if (!keep.has(key))
      await db
        .delete(plannedWorkout)
        .where(and(eq(plannedWorkout.planId, planId), eq(plannedWorkout.workoutKey, key)));

  await db
    .update(planTable)
    .set({ source: "coach", revision: sql`${planTable.revision} + 1`, updatedAt: new Date() })
    .where(eq(planTable.id, planId));
}

/**
 * Write short notes from the coach onto workouts ("why this session is here"). Notes only change text,
 * so they apply straight away. Returns the ids that don't exist in the active plan.
 */
export async function setCoachNotes(
  db: DB,
  userId: string,
  notes: { workoutId: string; note: string }[],
) {
  return db.transaction(async (tx) => {
    await lockContext(tx as unknown as DB, userId);
    const saved = await getActivePlan(tx as unknown as DB, userId);
    if (!saved) throw new PlanEditError("There's no active plan yet. Build one in Grind first.");
    const ids = new Set(saved.plan.weeks.flatMap((w) => w.workouts).map((w) => w.id));
    const missing = notes.filter((n) => !ids.has(n.workoutId)).map((n) => n.workoutId);
    if (missing.length)
      throw new PlanEditError(
        `No workout with id: ${missing.join(", ")}. Use get_week to see the ids.`,
      );

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
    await tx
      .update(planTable)
      .set({ revision: sql`${planTable.revision} + 1`, updatedAt: new Date() })
      .where(eq(planTable.id, saved.id));
    return notes.length;
  });
}
