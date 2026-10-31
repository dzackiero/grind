import "server-only";
import { addDays, daysBetween } from "@/lib/plan/dates";
import { PlanEditError } from "@/lib/plan/edit";
import {
  buildWeeklyReview,
  RECOVERY_BASELINE_DAYS,
  selectWeek,
  type ReviewWorkout,
} from "@/lib/weekly-review";
import type { DB } from "../db/client";
import { listWellnessBetween } from "../intervals/sync";
import { getActivePlan } from "../plans/service";
import { previewPlanChanges } from "../plans/preview";
import { getCoachingProfile } from "../profile/coaching";
import { getTrainingSummary, getWorkoutCompliance } from "./coaching-summary";

/** The training summary looks back from today, so reviews can reach back this far. */
export const MAX_REVIEW_AGE_DAYS = 300;

export class WeeklyReviewError extends Error {}

/**
 * Facts about one Monday-to-Sunday week plus rule-derived suggested adjustments.
 * Read-only: suggestions are dry-run through the plan validator and never saved.
 */
export async function getWeeklyReview(db: DB, userId: string, today: string, week?: string) {
  const [saved, coaching] = await Promise.all([
    getActivePlan(db, userId),
    getCoachingProfile(db, userId),
  ]);
  const plannedDates = saved?.plan.weeks.flatMap((w) => w.workouts.map((x) => x.date)) ?? [];
  const weekStart = selectWeek(week, today, plannedDates);
  if (weekStart > today)
    throw new WeeklyReviewError(
      "That week hasn't started yet. Pick the current or an earlier week.",
    );
  if (daysBetween(weekStart, today) > MAX_REVIEW_AGE_DAYS)
    throw new WeeklyReviewError(`Reviews reach back at most ${MAX_REVIEW_AGE_DAYS} days.`);

  const weekEnd = addDays(weekStart, 6);
  const historyFrom = addDays(weekStart, -28);
  const [compliance, summary, wellnessRows] = await Promise.all([
    getWorkoutCompliance(db, userId, addDays(weekStart, -21), addDays(weekStart, 13)),
    getTrainingSummary(db, userId, today, daysBetween(historyFrom, today) + 1),
    listWellnessBetween(db, userId, addDays(weekStart, -RECOVERY_BASELINE_DAYS), weekEnd),
  ]);

  const workouts: ReviewWorkout[] = compliance.workouts.map((w) => ({
    workoutId: w.workoutId,
    date: w.workoutDate,
    kind: w.kind,
    type: w.type,
    title: w.title,
    status: w.status,
    plannedKm: w.plannedKm,
    actualKm: w.actualKm,
    linked: w.actualId !== null,
  }));
  const review = buildWeeklyReview({
    weekStart,
    today,
    workouts,
    weeklyKm: summary.weeks.map((w) => ({ weekStart: w.from, km: w.km })),
    wellness: wellnessRows,
    coaching: coaching.profile,
  });

  // Dry-run each edit through the real validator: constraints block, preferences warn.
  const suggestedAdjustments = [];
  for (const suggestion of review.suggestedAdjustments) {
    if (!suggestion.changes.length || !saved) {
      suggestedAdjustments.push(suggestion);
      continue;
    }
    try {
      const preview = await previewPlanChanges(
        db,
        userId,
        suggestion.changes,
        today,
        saved.revision,
      );
      const { errors, warnings } = preview.validation;
      suggestedAdjustments.push({
        ...suggestion,
        status: errors.length ? ("blocked" as const) : ("ready" as const),
        warnings,
        blockedBy: errors,
      });
    } catch (error) {
      if (!(error instanceof PlanEditError)) throw error;
      suggestedAdjustments.push({
        ...suggestion,
        status: "blocked" as const,
        blockedBy: [{ code: "EDIT", message: error.message }],
      });
    }
  }

  const unmatchedInWeek = compliance.unmatchedActualActivities.filter(
    (a) => a.date >= weekStart && a.date <= weekEnd,
  );
  return {
    ...review,
    suggestedAdjustments,
    unmatchedActivities: {
      source: "synced_activities",
      units: { actualKm: "km", movingTimeSec: "seconds" },
      note: "Recorded in the window but not linked to a planned workout. Extra training never completes a different planned workout.",
      activities: unmatchedInWeek.map((a) => ({
        id: a.id,
        date: a.date,
        type: a.type,
        name: a.name,
        actualKm: a.actualKm,
        movingTimeSec: a.movingTimeSec,
      })),
    },
    coaching: {
      coachingRevision: coaching.revision,
      preferences: coaching.profile.preferences,
      constraints: coaching.profile.constraints,
      context: coaching.profile.context ?? null,
    },
    planRevision: saved?.revision ?? null,
    next: "Suggestions are not applied. To act, pass a ready suggestion's `changes` to propose_plan_changes and apply only after the athlete approves. Blocked ones break a constraint; don't propose them. Merge changes into one call: a new suggestion replaces any waiting one.",
  };
}
