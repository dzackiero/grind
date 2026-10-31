import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CoachingProfileSchema, validateCoaching } from "@/lib/coaching";
import { EditOpSchema } from "@/lib/plan/edit";
import {
  WorkoutDateSchema,
  WorkoutFilterSchema,
  WorkoutPatchSchema,
} from "@/lib/plan/workout-patch";
import { STRENGTH_FOCUS_LABELS } from "@/lib/plan/strength-focus";
import { addDays, daysBetween } from "@/lib/plan/dates";
import { getCoachingProfile, setCoachingProfile } from "../profile/coaching";
import { getTimezone, todayIn } from "../profile/service";
import { getActivePlan } from "../plans/service";
import { proposeChanges } from "../plans/changes";
import { getPlanDiff, previewPlanChanges } from "../plans/preview";
import { getTrainingSummary, getWorkoutCompliance } from "../progress/coaching-summary";
import { getWeeklyReview, WeeklyReviewError } from "../progress/weekly-review";
import { mcpFail as fail, mcpGuard as guard, mcpText as text } from "./result";
import type { McpContext } from "./server";

export function registerCoachingTools(server: McpServer, { db, userId, scopes }: McpContext) {
  const today = async () => todayIn(await getTimezone(db, userId));
  const revision = z
    .number()
    .int()
    .min(1)
    .describe("Current planRevision from get_plan; stale revisions are rejected");
  const summary = z.string().trim().min(5).max(280);
  if (scopes.has("plan:read")) {
    server.registerTool(
      "get_athlete_context",
      {
        description:
          "Structured coaching preferences, mandatory constraints, athlete-reported limitations, timezone, race goal, plan revision and supported strength focuses. Empty rules express no preference. Read this before planning edits.",
        annotations: { readOnlyHint: true },
      },
      async () =>
        guard(async () => {
          const [saved, coaching, timezone] = await Promise.all([
            getActivePlan(db, userId),
            getCoachingProfile(db, userId),
            getTimezone(db, userId),
          ]);
          return text({
            today: todayIn(timezone),
            timezone,
            planRevision: saved?.revision ?? null,
            coachingRevision: coaching.revision,
            coaching: coaching.profile,
            goal: saved
              ? { goal: saved.plan.goal, raceDate: saved.plan.raceDate, input: saved.plan.input }
              : null,
            supportedStrengthFocuses: STRENGTH_FOCUS_LABELS,
            ruleSemantics:
              "Preferences produce warnings; constraints block writes. Reported limitations are athlete-provided context, not a diagnosis. Profile updates replace the full profile.",
          });
        }),
    );

    server.registerTool(
      "validate_plan",
      {
        description:
          "Read-only validation of the current plan or candidate edits. Returns structured training and coaching errors/warnings plus before/after diff. Does not create a proposal or apply changes.",
        inputSchema: z.object({
          changes: z.array(EditOpSchema).max(200).optional(),
          expectedRevision: revision.optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ changes, expectedRevision }) =>
        guard(async () => {
          const preview = await previewPlanChanges(
            db,
            userId,
            changes ?? [],
            await today(),
            expectedRevision,
          );
          return text({
            ...preview.validation,
            planRevision: preview.saved.revision,
            coachingRevision: preview.coachingRevision,
            diff: preview.diff,
          });
        }),
    );

    server.registerTool(
      "get_plan_diff",
      {
        description:
          "Structured before/after workout data, weekly km changes, validation, and revision freshness for an existing suggestion belonging to this athlete. A stale suggestion cannot be applied.",
        inputSchema: z.object({ changeId: z.string().uuid() }),
        annotations: { readOnlyHint: true },
      },
      async ({ changeId }) =>
        guard(async () => text(await getPlanDiff(db, userId, changeId, await today()))),
    );

    server.registerTool(
      "get_training_summary",
      {
        description:
          "Actual training over the last 7/28 days and a selected window: run km, time, sessions, longest run and weekly consistency. Includes units, dates, source, and nulls for unavailable measurements; includes unmatched activities.",
        inputSchema: z.object({ days: z.number().int().min(1).max(365).default(28) }),
        annotations: { readOnlyHint: true },
      },
      async ({ days }) =>
        guard(async () => text(await getTrainingSummary(db, userId, await today(), days))),
    );

    server.registerTool(
      "get_workout_compliance",
      {
        description:
          "Compare the active plan to actual activities: planned/completed/skipped sessions, planned and actual local dates, distance completion, and unlinked activity. Date range is inclusive, at most 365 days.",
        inputSchema: z.object({
          from: WorkoutDateSchema.optional(),
          to: WorkoutDateSchema.optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ from, to }) =>
        guard(async () => {
          const end = to ?? (await today());
          const start = from ?? addDays(end, -27);
          if (daysBetween(start, end) < 0 || daysBetween(start, end) > 364)
            return fail("Use a date range of 1 to 365 days, with from before to.");
          return text(await getWorkoutCompliance(db, userId, start, end));
        }),
    );

    server.registerTool(
      "get_weekly_review",
      {
        description:
          "Deterministic review of one Monday-to-Sunday week, computed by fixed rules (no AI): completion (planned vs completed/matched/missed), missed key sessions (long run, quality), run-km change vs the previous week, consecutive hard days and hard weeks, recovery trend (null when the watch sent nothing), unmatched extra activities, the athlete's coaching preferences and constraints, and suggestedAdjustments. Defaults to last week when it had planned workouts, otherwise the current week. Call it when the athlete asks how their week went. Suggestions are rule-based starting points, not decisions, and change nothing. Explain them in plain words; only if the athlete wants one, pass a 'ready' suggestion's `changes` to propose_plan_changes with the planRevision from this result. Never propose 'blocked' ones (they break a constraint). Mention any warnings (preferences).",
        inputSchema: z.object({
          week: WorkoutDateSchema.optional().describe(
            "Any date (YYYY-MM-DD) inside the week to review; omit for the default",
          ),
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      },
      async ({ week }) =>
        guard(async () => {
          try {
            return text(await getWeeklyReview(db, userId, await today(), week));
          } catch (error) {
            if (error instanceof WeeklyReviewError) return fail(error.message);
            throw error;
          }
        }),
    );
  }

  if (scopes.has("plan:write")) {
    server.registerTool(
      "update_workout",
      {
        description:
          "Propose granular changes to one future, uncompleted workout: date, title, description, coachNote, run type/distance/steps (with pace targets), or strength focus/exercises/duration. Returns a draft, full diff and validation. Apply only after the athlete approves. Focus-only edits rebuild the strength template; custom exercises can override it.",
        inputSchema: z.object({
          workoutId: z.string().min(1),
          patch: WorkoutPatchSchema,
          summary,
          expectedRevision: revision,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ workoutId, patch, summary, expectedRevision }) =>
        guard(async () => {
          const result = await proposeChanges(
            db,
            userId,
            [{ op: "update_workout", workoutId, patch }],
            summary,
            await today(),
            "coach",
            expectedRevision,
          );
          return text({
            ...result,
            changeId: result.id,
            status: "proposed",
            next: "Review the diff with the athlete. Apply using apply_plan_changes only after approval.",
          });
        }),
    );

    server.registerTool(
      "bulk_update_workouts",
      {
        description:
          "Propose one atomic batch of future editable workouts selected by week, date range, weekday, kind, run type or strength focus. Filters combine with AND. Completed/skipped/race/past workouts are excluded. No date patch in bulk; use individual moves. Zero matches is an error; max 200 workouts. The athlete approves the draft before applying it.",
        inputSchema: z.object({
          filter: WorkoutFilterSchema,
          patch: WorkoutPatchSchema,
          summary,
          expectedRevision: revision,
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ filter, patch, summary, expectedRevision }) =>
        guard(async () => {
          const result = await proposeChanges(
            db,
            userId,
            [{ op: "bulk_update_workouts", filter, patch }],
            summary,
            await today(),
            "coach",
            expectedRevision,
          );
          return text({
            ...result,
            changeId: result.id,
            status: "proposed",
            next: "Review every changed workout and warnings; apply only after athlete approval.",
          });
        }),
    );

    server.registerTool(
      "set_coaching_preferences",
      {
        description:
          "Replace the athlete's structured coaching profile, including preferences, mandatory constraints and reported context. Only after the athlete explicitly asks/agrees to these profile changes. Read get_athlete_context first; supply the complete profile to preserve existing rules. This does not rewrite the current plan; returns its conflicts. Never weaken constraints to make an edit pass without explicit athlete permission.",
        inputSchema: z.object({
          profile: CoachingProfileSchema,
          expectedCoachingRevision: z.number().int().min(0),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ profile, expectedCoachingRevision }) =>
        guard(async () => {
          const coaching = await setCoachingProfile(db, userId, profile, expectedCoachingRevision);
          const saved = await getActivePlan(db, userId);
          const validation = saved
            ? validateCoaching(saved.plan, coaching.profile, await today())
            : null;
          return text({
            coaching: coaching.profile,
            coachingRevision: coaching.revision,
            planRevision: saved?.revision ?? null,
            validation,
            next: "The profile is saved. Existing workouts are unchanged; use a validated proposal to resolve conflicts.",
          });
        }),
    );
  }
}
