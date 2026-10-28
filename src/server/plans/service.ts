import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  generatePlan,
  PlanInputSchema,
  PlanSchema,
  validatePlan,
  type Plan,
  type PlanIssue,
  type ValidationResult,
} from "@/lib/plan";
import type { DB } from "../db/client";
import { plan as planTable, plannedWorkout, planWeek } from "../db/schema";
import { athleteProfile } from "../db/schema";
import { validateCoaching } from "@/lib/coaching";
import { getCoachingProfile } from "../profile/coaching";
import { personalizeGeneratedPlan } from "@/lib/plan/personalize";

/*
 * Plans service: the only way plans reach the database. The web app and the MCP server both call it,
 * so every plan, from a template or from Claude, passes validatePlan first.
 */

export class PlanValidationError extends Error {
  constructor(public readonly result: ValidationResult) {
    super(`Plan failed ${result.errors.length} check(s): ${result.errors.map((e) => e.code).join(", ")}`);
  }
}

export type WorkoutStatus = "planned" | "completed" | "skipped";

export interface WorkoutProgress {
  status: WorkoutStatus;
  completedAt: string | null;
  activityId: string | null;
}

export interface SavedPlan {
  id: string;
  revision: number;
  createdAt: string;
  plan: Plan;
  /** Progress per workout, keyed by the workout's id in the plan */
  progress: Record<string, WorkoutProgress>;
  warnings: PlanIssue[];
}

/** Build a plan from the onboarding form and make it the user's active plan. */
export async function createPlanFromInput(db: DB, userId: string, rawInput: unknown): Promise<SavedPlan> {
  const input = PlanInputSchema.parse(rawInput);
  const coaching = await getCoachingProfile(db, userId);
  return savePlan(db, userId, personalizeGeneratedPlan(generatePlan(input), coaching.profile));
}

/** Validate and save a plan as the user's active plan. The previous active plan is archived. */
export async function savePlan(db: DB, userId: string, candidate: unknown): Promise<SavedPlan> {
  const result = validatePlan(candidate);
  if (!result.ok) throw new PlanValidationError(result);
  const plan = PlanSchema.parse(candidate);
  let coachingWarnings: PlanIssue[] = [];

  const planId = await db.transaction(async (tx) => {
    await tx.insert(athleteProfile).values({ userId }).onConflictDoNothing({ target: athleteProfile.userId });
    await tx.select({ id: athleteProfile.userId }).from(athleteProfile).where(eq(athleteProfile.userId, userId)).for("update");
    const coaching = await getCoachingProfile(tx as unknown as DB, userId);
    const rules = validateCoaching(plan, coaching.profile, plan.startDate);
    if (!rules.ok) throw new PlanValidationError(rules);
    coachingWarnings = rules.warnings;
    await tx
      .update(planTable)
      .set({ status: "archived", updatedAt: new Date() })
      .where(and(eq(planTable.userId, userId), eq(planTable.status, "active")));

    const [row] = await tx
      .insert(planTable)
      .values({
        userId,
        goal: plan.goal,
        title: plan.title,
        raceDate: plan.raceDate,
        startDate: plan.startDate,
        fitnessScore: plan.fitnessScore,
        source: plan.source,
        input: plan.input,
        paces: plan.paces,
        estimatedRaceTimeSec: plan.estimatedRaceTimeSec,
      })
      .returning({ id: planTable.id });

    await tx.insert(planWeek).values(
      plan.weeks.map((w) => ({
        planId: row.id,
        index: w.index,
        startDate: w.startDate,
        phase: w.phase,
        targetKm: w.targetKm,
        focus: w.focus,
      })),
    );

    const workouts = plan.weeks.flatMap((w) =>
      w.workouts.map((wo, position) => ({
        planId: row.id,
        userId,
        workoutKey: wo.id,
        weekIndex: w.index,
        position,
        date: wo.date,
        kind: wo.kind,
        type: wo.type,
        title: wo.title,
        distanceKm: wo.kind === "run" ? wo.distanceKm : null,
        data: wo,
      })),
    );
    if (workouts.length) await tx.insert(plannedWorkout).values(workouts);
    return row.id;
  });

  const saved = await getPlan(db, userId, planId);
  return { ...saved!, warnings: [...result.warnings, ...coachingWarnings] };
}

/** The user's active plan, or null if they have none. */
export async function getActivePlan(db: DB, userId: string): Promise<SavedPlan | null> {
  const [row] = await db
    .select({ id: planTable.id })
    .from(planTable)
    .where(and(eq(planTable.userId, userId), eq(planTable.status, "active")));
  return row ? getPlan(db, userId, row.id) : null;
}

/** A plan by id, only if it belongs to the user. */
export async function getPlan(db: DB, userId: string, planId: string): Promise<SavedPlan | null> {
  const [p] = await db
    .select()
    .from(planTable)
    .where(and(eq(planTable.id, planId), eq(planTable.userId, userId)));
  if (!p) return null;

  const weeks = await db.select().from(planWeek).where(eq(planWeek.planId, p.id)).orderBy(asc(planWeek.index));
  const workouts = await db
    .select()
    .from(plannedWorkout)
    .where(eq(plannedWorkout.planId, p.id))
    .orderBy(asc(plannedWorkout.weekIndex), asc(plannedWorkout.position));

  const plan = PlanSchema.parse({
    version: 1,
    goal: p.goal,
    title: p.title,
    raceDate: p.raceDate,
    startDate: p.startDate,
    fitnessScore: p.fitnessScore,
    paces: p.paces,
    estimatedRaceTimeSec: p.estimatedRaceTimeSec,
    input: p.input,
    source: p.source,
    weeks: weeks.map((w) => ({
      index: w.index,
      startDate: w.startDate,
      phase: w.phase,
      targetKm: w.targetKm,
      focus: w.focus,
      workouts: workouts.filter((wo) => wo.weekIndex === w.index).map((wo) => wo.data),
    })),
  });

  const progress: Record<string, WorkoutProgress> = {};
  for (const wo of workouts) {
    progress[wo.workoutKey] = {
      status: wo.status,
      completedAt: wo.completedAt?.toISOString() ?? null,
      activityId: wo.activityId,
    };
  }

  return { id: p.id, revision: p.revision, createdAt: p.createdAt.toISOString(), plan, progress, warnings: [] };
}

/** Workouts of the active plan between two dates (inclusive), for Today and Calendar. */
export async function listWorkouts(db: DB, userId: string, from: string, to: string) {
  const rows = await db
    .select({
      key: plannedWorkout.workoutKey,
      date: plannedWorkout.date,
      weekIndex: plannedWorkout.weekIndex,
      status: plannedWorkout.status,
      completedAt: plannedWorkout.completedAt,
      activityId: plannedWorkout.activityId,
      workout: plannedWorkout.data,
    })
    .from(plannedWorkout)
    .innerJoin(planTable, eq(planTable.id, plannedWorkout.planId))
    .where(
      and(
        eq(plannedWorkout.userId, userId),
        eq(planTable.status, "active"),
        gte(plannedWorkout.date, from),
        lte(plannedWorkout.date, to),
      ),
    )
    .orderBy(asc(plannedWorkout.date), asc(plannedWorkout.position));
  return rows.map((r) => ({ ...r, completedAt: r.completedAt?.toISOString() ?? null }));
}

/** Mark a workout of the active plan as done, skipped, or planned again. Returns false if not found. */
export async function setWorkoutStatus(db: DB, userId: string, workoutKey: string, status: WorkoutStatus): Promise<boolean> {
  const [active] = await db
    .select({ id: planTable.id })
    .from(planTable)
    .where(and(eq(planTable.userId, userId), eq(planTable.status, "active")));
  if (!active) return false;

  const updated = await db
    .update(plannedWorkout)
    .set({ status, completedAt: status === "completed" ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(plannedWorkout.planId, active.id), eq(plannedWorkout.workoutKey, workoutKey), eq(plannedWorkout.userId, userId)))
    .returning({ id: plannedWorkout.id });
  return updated.length > 0;
}
