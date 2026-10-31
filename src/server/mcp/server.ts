import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  changeLineText,
  dayLabel,
  describeChanges,
  describeExercises,
  describeRunSteps,
  EditOpSchema,
  formatDuration,
  formatPace,
  workoutOneLine,
  type Plan,
} from "@/lib/plan";
import { actualKm, weekFor, weekStats, type Progress } from "@/lib/plan-view";
import type { DB } from "../db/client";
import { getIntervalsStatus, listActivitiesBetween, listWellnessBetween } from "../intervals/sync";
import { getWorkoutActuals } from "../intervals/workout-activities";
import { listPendingChanges, proposeChanges, resolveChange, setCoachNotes } from "../plans/changes";
import { getActivePlan } from "../plans/service";
import { getTimezone, todayIn } from "../profile/service";
import { getCoachingProfile } from "../profile/coaching";
import { STRENGTH_FOCUS_LABELS } from "@/lib/plan/strength-focus";
import { registerCoachingTools } from "./coaching-tools";
import { registerHabitTools } from "./habit-tools";
import { registerStrengthTools } from "./strength-tools";
import { mcpText as text, mcpFail as fail, mcpGuard as guard } from "./result";

/*
 * Grind's MCP server: what Claude can read and change. One server is built per request for the signed-in
 * athlete, and only with the tools their token's scopes allow:
 *   plan:read  → look at the plan, workouts, runs and recovery
 *   plan:write → suggest changes (applied only after the athlete accepts) and write coach notes
 */

export interface McpContext {
  db: DB;
  userId: string;
  scopes: ReadonlySet<string>;
}

const INSTRUCTIONS = `Grind is a training app that combines running and strength in one plan. You are the athlete's coach.

How to work:
- Start with get_plan to see today's date, the race, the current week and any waiting suggestions. Use get_week for workout ids.
- Read get_athlete_context for structured coaching preferences, mandatory constraints and supported strength focuses. Preferences can be negotiated; constraints must not be weakened without explicit athlete approval.
- Look at the data before advising: get_recent_activities for what they actually ran, get_recovery for resting heart rate and training load.
- get_weekly_review summarizes one week with fixed rules (completion, missed key sessions, load change, hard days, recovery, extra activities) and suggests adjustments. The suggestions are rule-based hints, not decisions: explain them, and only if the athlete wants one, pass its changes to propose_plan_changes. Skip blocked ones.
- get_habits shows the small habits the athlete tracks (stretching, sleep, water) and how consistent they are. Take it into account when recovery is poor, but don't nag: habits are theirs to tick off, you can only read them.
- get_strength_log shows the sets the athlete logged in strength workouts (kg, reps, volume, estimated one-rep max). Logging is optional, so an empty log doesn't mean a missed session. Use it to judge progress and whether the planned load fits what they lift; you can only read it.
- Use the athlete's plan pace zones. Propose changes with propose_plan_changes, update_workout or bulk_update_workouts. Granular custom steps must contain distance or duration and valid pace/effort targets. Grind recalculates derived totals and validates the entire result.
- get_plan, get_week and get_workout expose planRevision. Use expectedRevision on edits. validate_plan previews without saving; get_plan_diff inspects a stored suggestion. Read the diff and structured warnings before asking for approval.
- A suggestion changes nothing by itself. Tell the athlete what you suggested and why. They accept it in the Grind app, or if they agree in this chat, call apply_plan_changes.
- Never call apply_plan_changes unless the athlete has clearly said yes in this conversation.
- Use write_coach_notes to explain why a session is in the plan or how to run it. Keep notes to a few sentences.
- Completed workouts can't be changed. Race day can't be moved.
- Speak plainly, like a coach at the track: short sentences, give the reason with the instruction.`;

const paceRange = (p: { minSecPerKm: number; maxSecPerKm: number }) =>
  `${formatPace(p.minSecPerKm)}-${formatPace(p.maxSecPerKm)} /km`;
const round1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

export function buildMcpServer({ db, userId, scopes }: McpContext) {
  const server = new McpServer({ name: "grind", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  registerCoachingTools(server, { db, userId, scopes });
  registerHabitTools(server, { db, userId, scopes });
  registerStrengthTools(server, { db, userId, scopes });

  const load = async () => {
    const [saved, tz] = await Promise.all([getActivePlan(db, userId), getTimezone(db, userId)]);
    return { saved, today: todayIn(tz) };
  };

  /** The synced activity behind each completed workout, for "what they actually did". */
  const actualsFor = async (): Promise<Awaited<ReturnType<typeof getWorkoutActuals>>> => {
    const saved = await getActivePlan(db, userId);
    return saved ? getWorkoutActuals(db, userId, saved.id) : {};
  };
  const actualText = (a: Awaited<ReturnType<typeof actualsFor>>[string] | undefined) =>
    a
      ? {
          km: a.distanceM ? round1(a.distanceM / 1000) : null,
          minutes: a.movingTimeSec ? Math.round(a.movingTimeSec / 60) : null,
          paceMinPerKm:
            a.distanceM && a.movingTimeSec
              ? formatPace(a.movingTimeSec / (a.distanceM / 1000))
              : null,
          avgHr: a.avgHr ? Math.round(a.avgHr) : null,
        }
      : undefined;

  const workoutRow = (
    plan: Plan,
    w: Plan["weeks"][number]["workouts"][number],
    progress: Progress,
    actuals: Awaited<ReturnType<typeof actualsFor>>,
  ) => ({
    id: w.id,
    date: w.date,
    day: dayLabel(w.date),
    type: w.type,
    title: w.title,
    summary: workoutOneLine(w),
    status: progress[w.id]?.status ?? "planned",
    actual: actualText(actuals[w.id]),
    coachNote: w.coachNote,
  });

  // ---------------- read tools (plan:read) ----------------
  if (scopes.has("plan:read")) {
    server.registerTool(
      "get_plan",
      {
        title: "Get training plan",
        description:
          "Overview of the athlete's active plan: today's date, goal race, estimated finish, training paces, every week with its phase, planned and completed km, and any coach suggestions waiting for an answer. Start here.",
        annotations: { readOnlyHint: true },
      },
      async () =>
        guard(async () => {
          const { saved, today } = await load();
          if (!saved)
            return fail(
              "The athlete has no active plan yet. They need to build one in the Grind app first.",
            );
          const { plan, progress } = saved;
          const actuals = await actualsFor();
          const real = actualKm(
            Object.fromEntries(
              Object.entries(actuals).map(([k, a]) => [
                k,
                {
                  activityId: a.id,
                  name: a.name,
                  distanceM: a.distanceM,
                  movingTimeSec: a.movingTimeSec,
                  avgHr: a.avgHr,
                  maxHr: a.maxHr,
                  trainingLoad: a.trainingLoad,
                  elevationGainM: a.elevationGainM,
                },
              ]),
            ),
          );
          const current = weekFor(plan, today);
          const pending = await listPendingChanges(db, userId);
          const intervals = await getIntervalsStatus(db, userId);
          const coaching = await getCoachingProfile(db, userId);
          return text({
            today,
            planRevision: saved.revision,
            coachingRevision: coaching.revision,
            coaching: coaching.profile,
            supportedStrengthFocuses: STRENGTH_FOCUS_LABELS,
            title: plan.title,
            goal: plan.goal,
            raceDate: plan.raceDate,
            daysToRace: Math.round((Date.parse(plan.raceDate) - Date.parse(today)) / 86_400_000),
            estimatedFinish: `${formatDuration(plan.estimatedRaceTimeSec.low)} to ${formatDuration(plan.estimatedRaceTimeSec.high)}`,
            fitnessScore: plan.fitnessScore,
            paces: Object.fromEntries(
              Object.entries(plan.paces).map(([zone, p]) => [zone, paceRange(p)]),
            ),
            paceZones:
              "E easy, M marathon, T threshold, I interval, R repetition, race = goal race pace",
            athleteSettings: {
              runDays: plan.input.runDays,
              longRunDay: plan.input.longRunDay,
              strengthSessionsPerWeek: plan.input.strength.sessionsPerWeek,
              intensity: plan.input.intensity,
            },
            currentWeek: current.index,
            weeks: plan.weeks.map((w) => {
              const s = weekStats(w, progress, real);
              return {
                week: w.index,
                starts: w.startDate,
                phase: w.phase,
                plannedKm: w.targetKm,
                doneKm: s.kmDone,
                workoutsDone: `${s.done}/${s.total}`,
              };
            }),
            intervalsConnected: intervals.connected,
            pendingSuggestions: pending.map((c) => ({ changeId: c.id, summary: c.summary })),
          });
        }),
    );

    server.registerTool(
      "get_week",
      {
        title: "Get a week of workouts",
        description:
          "The workouts in one plan week, with their ids, dates, status and what the athlete actually did. Defaults to the current week. Use the ids in propose_plan_changes.",
        inputSchema: z.object({
          week: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Plan week number; omit for the current week"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ week }) =>
        guard(async () => {
          const { saved, today } = await load();
          if (!saved) return fail("The athlete has no active plan yet.");
          const { plan, progress } = saved;
          const w = week ? plan.weeks[week - 1] : weekFor(plan, today);
          if (!w) return fail(`The plan has weeks 1 to ${plan.weeks.length}.`);
          const actuals = await actualsFor();
          return text({
            today,
            planRevision: saved.revision,
            week: w.index,
            starts: w.startDate,
            phase: w.phase,
            focus: w.focus,
            plannedKm: w.targetKm,
            workouts: w.workouts.map((x) => workoutRow(plan, x, progress, actuals)),
          });
        }),
    );

    server.registerTool(
      "get_workout",
      {
        title: "Get one workout in full",
        description:
          "Everything about one workout: description, the steps of a run (with target paces) or the exercises of a strength session, its status and what the athlete actually did.",
        inputSchema: z.object({ workoutId: z.string().describe("Workout id from get_week") }),
        annotations: { readOnlyHint: true },
      },
      async ({ workoutId }) =>
        guard(async () => {
          const { saved } = await load();
          if (!saved) return fail("The athlete has no active plan yet.");
          const w = saved.plan.weeks.flatMap((x) => x.workouts).find((x) => x.id === workoutId);
          if (!w) return fail(`No workout with id "${workoutId}". Use get_week to see the ids.`);
          const actuals = await actualsFor();
          return text({
            ...workoutRow(saved.plan, w, saved.progress, actuals),
            planRevision: saved.revision,
            workout: w,
            units: {
              distanceKm: "km",
              stepDistance: "m",
              stepDuration: "seconds",
              pace: "seconds/km",
              rest: "seconds",
            },
            description: w.description,
            steps: w.kind === "run" ? describeRunSteps(w) : undefined,
            exercises: w.kind === "strength" ? describeExercises(w) : undefined,
          });
        }),
    );

    server.registerTool(
      "get_recent_activities",
      {
        title: "Get recent activities",
        description:
          "What the athlete actually did recently, from their watch via intervals.icu: runs, walks and gym sessions with distance, time, pace and heart rate.",
        inputSchema: z.object({
          days: z
            .number()
            .int()
            .min(1)
            .max(60)
            .default(14)
            .describe("How many days back, up to 60"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ days }) =>
        guard(async () => {
          const { today } = await load();
          const from = new Date(Date.parse(today) - (days - 1) * 86_400_000)
            .toISOString()
            .slice(0, 10);
          const rows = await listActivitiesBetween(db, userId, from, today);
          if (!rows.length) {
            const status = await getIntervalsStatus(db, userId);
            return text(
              status.connected
                ? `No activities in the last ${days} days.`
                : "intervals.icu isn't connected, so there's no activity data. The athlete can connect it in Grind → Settings.",
            );
          }
          return text({
            from,
            to: today,
            activities: rows.map((a) => ({
              date: a.date,
              type: a.type,
              name: a.name,
              km: a.distanceM ? round1(a.distanceM / 1000) : null,
              minutes: a.movingTimeSec ? Math.round(a.movingTimeSec / 60) : null,
              paceMinPerKm:
                a.distanceM && a.movingTimeSec
                  ? formatPace(a.movingTimeSec / (a.distanceM / 1000))
                  : null,
              avgHr: a.avgHr ? Math.round(a.avgHr) : null,
              maxHr: a.maxHr ? Math.round(a.maxHr) : null,
              climbMeters: a.elevationGainM ? Math.round(a.elevationGainM) : null,
            })),
          });
        }),
    );

    server.registerTool(
      "get_recovery",
      {
        title: "Get recovery data",
        description:
          "Daily recovery numbers from the athlete's watch via intervals.icu: resting heart rate, HRV and sleep when available, plus fitness (CTL), fatigue (ATL) and form (CTL minus ATL). Not every watch records every field; missing fields are left out.",
        inputSchema: z.object({
          days: z
            .number()
            .int()
            .min(1)
            .max(60)
            .default(14)
            .describe("How many days back, up to 60"),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ days }) =>
        guard(async () => {
          const { today } = await load();
          const from = new Date(Date.parse(today) - (days - 1) * 86_400_000)
            .toISOString()
            .slice(0, 10);
          const rows = await listWellnessBetween(db, userId, from, today);
          if (!rows.length)
            return text(
              "No recovery data. intervals.icu may not be connected, or the watch hasn't sent any.",
            );
          const loadLooksWrong = rows.some((r) => (r.ctl ?? 0) > 250);
          return text({
            from,
            to: today,
            note: loadLooksWrong
              ? "Fitness, fatigue and form are not trustworthy: intervals.icu reports a fitness above 250, which usually means the threshold pace in the athlete's intervals.icu settings is wrong. Ignore those three numbers."
              : undefined,
            days: rows.map((r) => ({
              date: r.date,
              restingHr: r.restingHr,
              hrv: r.hrv,
              sleepHours: r.sleepSecs ? round1(r.sleepSecs / 3600) : null,
              sleepScore: r.sleepScore,
              ...(loadLooksWrong
                ? {}
                : {
                    fitness: round1(r.ctl),
                    fatigue: round1(r.atl),
                    form: r.ctl != null && r.atl != null ? round1(r.ctl - r.atl) : null,
                  }),
            })),
          });
        }),
    );
  }

  // ---------------- write tools (plan:write) ----------------
  if (scopes.has("plan:write")) {
    server.registerTool(
      "propose_plan_changes",
      {
        title: "Suggest changes to the plan",
        description:
          "Suggest edits to the plan: move or swap workouts, remove one, turn a run into an easier or different run, or add a run or strength session. Grind builds the sessions at the athlete's own paces and checks the result against its safety rules; if a rule is broken you get the reason back so you can adjust. Nothing changes yet: the athlete accepts the suggestion in the Grind app, or you call apply_plan_changes after they agree in chat. A new suggestion replaces any older one still waiting.",
        inputSchema: z.object({
          summary: z
            .string()
            .min(5)
            .max(280)
            .describe(
              "One or two plain sentences for the athlete: what changes and why. It is shown on their Today screen.",
            ),
          changes: z.array(EditOpSchema).min(1).max(200),
          expectedRevision: z.number().int().min(1).optional(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async ({ summary, changes, expectedRevision }) =>
        guard(async () => {
          const { today } = await load();
          const result = await proposeChanges(
            db,
            userId,
            changes,
            summary,
            today,
            "coach",
            expectedRevision,
          );
          return text({
            changeId: result.id,
            status: "proposed",
            summary,
            changes: describeChanges(result.changes).map(changeLineText),
            warnings: result.warnings.map((w) => w.message),
            validation: result.validation,
            diff: result.diff,
            planRevision: result.planRevision,
            coachingRevision: result.coachingRevision,
            next: "Tell the athlete what you suggested and why. They can accept it on the Today screen in Grind. If they agree in this chat, call apply_plan_changes with this changeId. Do not apply it before they say yes.",
          });
        }),
    );

    server.registerTool(
      "apply_plan_changes",
      {
        title: "Apply an accepted suggestion",
        description:
          "Apply a suggestion made with propose_plan_changes. Only call this after the athlete clearly agreed in this conversation. The plan is checked again first; if it changed since the suggestion, you'll be told to make a new one.",
        inputSchema: z.object({
          changeId: z.string().describe("The changeId from propose_plan_changes"),
        }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      },
      async ({ changeId }) =>
        guard(async () => {
          const result = await resolveChange(db, userId, changeId, "accept");
          return text({
            ...result,
            warnings: result.warnings?.map((w) => w.message) ?? [],
            next: "The plan is updated. Tell the athlete it's done.",
          });
        }),
    );

    server.registerTool(
      "discard_plan_changes",
      {
        title: "Discard a suggestion",
        description:
          "Withdraw a suggestion made with propose_plan_changes, for example when the athlete says no.",
        inputSchema: z.object({
          changeId: z.string().describe("The changeId from propose_plan_changes"),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ changeId }) =>
        guard(async () => text(await resolveChange(db, userId, changeId, "reject"))),
    );

    server.registerTool(
      "write_coach_notes",
      {
        title: "Write coach notes on workouts",
        description:
          "Add a short note to workouts, shown to the athlete on the workout page: why the session is in the plan, how to run it, what to watch for. Replaces the existing note. Notes change text only, so they apply immediately.",
        inputSchema: z.object({
          notes: z
            .array(
              z.object({
                workoutId: z.string().describe("Workout id from get_week"),
                note: z.string().min(3).max(600).describe("Two or three plain sentences"),
              }),
            )
            .min(1)
            .max(20),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      },
      async ({ notes }) =>
        guard(async () => {
          const count = await setCoachNotes(db, userId, notes);
          return text(`Saved ${count} note${count === 1 ? "" : "s"}.`);
        }),
    );
  }

  server.registerPrompt(
    "weekly_check_in",
    {
      title: "Weekly check-in",
      description:
        "Review the last week of training and the week ahead, then suggest any adjustments.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "Do my weekly check-in. Look at my plan, what I actually ran this past week and my recovery numbers. Tell me how it went in a few sentences, then look at the week ahead. If anything should change, suggest it with propose_plan_changes and explain why; don't apply anything until I say yes.",
          },
        },
      ],
    }),
  );

  return server;
}
