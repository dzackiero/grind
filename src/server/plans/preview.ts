import { and, eq } from "drizzle-orm";
import { validateCoaching } from "@/lib/coaching";
import { applyChanges, buildChanges, PlanEditError, staleReason, validatePlan, type EditOp, type Plan, type WorkoutChange } from "@/lib/plan";
import type { DB } from "../db/client";
import { planChange } from "../db/schema";
import { getCoachingProfile } from "../profile/coaching";
import { getActivePlan, type SavedPlan } from "./service";

export function changeEligibilityReason(saved: SavedPlan, changes: WorkoutChange[], today: string): string | null {
  for (const change of changes) {
    const progress = saved.progress[change.workoutKey];
    if (progress && progress.status !== "planned") return "A workout is already done or skipped. Ask for a new suggestion.";
    if ((change.before && change.before.date < today) || (change.after && change.after.date < today))
      return "A workout in this suggestion is now in the past. Ask for a new suggestion.";
  }
  return null;
}

export function planDiff(before: Plan, after: Plan, changes: WorkoutChange[]) {
  return {
    changedWorkoutIds: changes.map(c => c.workoutKey),
    workouts: changes,
    weeks: after.weeks.flatMap((w, i) => {
      const previous = before.weeks[i];
      const ids = new Set([...previous.workouts, ...w.workouts].map(x => x.id));
      return changes.some(c => ids.has(c.workoutKey)) ? [{ week: w.index, beforeKm: previous.targetKm, afterKm: w.targetKm, deltaKm: Math.round((w.targetKm - previous.targetKm) * 100) / 100 }] : [];
    }),
    units: { distance: "km" },
  };
}

export function validateWithCoaching(plan: Plan, profile: Parameters<typeof validateCoaching>[1], today: string) {
  const training = validatePlan(plan);
  const coaching = validateCoaching(plan, profile, today);
  const errors = [...training.errors, ...coaching.errors];
  return { ok: errors.length === 0, errors, warnings: [...training.warnings, ...coaching.warnings] };
}

/** Read-only preview, shared by MCP validation and persisted proposals. */
export async function previewPlanChanges(db: DB, userId: string, ops: EditOp[], today: string, expectedRevision?: number) {
  const saved = await getActivePlan(db, userId);
  if (!saved) throw new PlanEditError("There's no active plan yet. Build one in Kilo first.");
  if (expectedRevision !== undefined && saved.revision !== expectedRevision)
    throw new PlanEditError(`Plan revision changed (expected ${expectedRevision}, current ${saved.revision}). Read the plan and propose again.`);
  const coaching = await getCoachingProfile(db, userId);
  const lockedIds = new Set(Object.entries(saved.progress).filter(([, p]) => p.status !== "planned").map(([key]) => key));
  const changes = ops.length ? buildChanges(saved.plan, ops, { today, lockedIds }) : [];
  const next = changes.length ? applyChanges(saved.plan, changes) : saved.plan;
  return { saved, next, changes, coachingRevision: coaching.revision,
    validation: validateWithCoaching(next, coaching.profile, today), diff: planDiff(saved.plan, next, changes) };
}

export async function getPlanDiff(db: DB, userId: string, changeId: string, today: string) {
  const [row] = await db.select().from(planChange).where(and(eq(planChange.id, changeId), eq(planChange.userId, userId)));
  if (!row) throw new PlanEditError("That suggestion doesn't exist.");
  const saved = await getActivePlan(db, userId);
  if (!saved || saved.id !== row.planId) throw new PlanEditError("That suggestion was for a plan you no longer have.");
  const coaching = await getCoachingProfile(db, userId);
  const reason = staleReason(saved.plan, row.changes) ?? changeEligibilityReason(saved, row.changes, today);
  const stale = row.status === "proposed" && (!!reason || row.baseRevision !== saved.revision || row.coachingRevision !== coaching.revision);
  const next = stale || row.status !== "proposed" ? saved.plan : applyChanges(saved.plan, row.changes);
  return { changeId, status: row.status, baseRevision: row.baseRevision, planRevision: saved.revision,
    coachingRevision: coaching.revision, stale, staleReason: reason,
    diff: row.diff ?? planDiff(saved.plan, next, row.changes), validation: validateWithCoaching(next, coaching.profile, today) };
}
