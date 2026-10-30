import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { addDays } from "@/lib/plan/dates";
import { estimatedOneRepMax, summariseExercise } from "@/lib/strength-log";
import { getTimezone, todayIn } from "../profile/service";
import { listStrengthSessions } from "../strength/service";
import { mcpGuard as guard, mcpText as text } from "./result";
import type { McpContext } from "./server";

/** What Claude can see of the strength sets the athlete logged. Read only: the log is the athlete's own. */
export function registerStrengthTools(server: McpServer, { db, userId, scopes }: McpContext) {
  if (!scopes.has("plan:read")) return;
  server.registerTool(
    "get_strength_log",
    {
      title: "Get strength log",
      description:
        "The sets the athlete logged in strength workouts: for each session and exercise the weight in kg, reps (or seconds) and whether each set was done, plus volume, the heaviest set and an estimated one-rep max, and the best of each exercise over the period. Logging is optional, so a workout marked done may have no sets here. Use it to judge how strength is progressing and whether the load in the plan fits what they actually lift. You can read the log but not change it.",
      inputSchema: z.object({
        days: z.number().int().min(7).max(90).default(28).describe("How many days back, up to 90"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ days }) =>
      guard(async () => {
        const today = todayIn(await getTimezone(db, userId));
        const from = addDays(today, -(days - 1));
        const sessions = await listStrengthSessions(db, userId, { from, to: today });
        if (!sessions.length)
          return text(
            `No strength sets logged in the last ${days} days. Logging is optional, so the athlete may still have done the workouts.`,
          );

        const best = new Map<
          string,
          {
            exercise: string;
            heaviestKg: number | null;
            repsAtHeaviest: number | null;
            estimatedOneRepMaxKg: number | null;
            date: string;
          }
        >();
        const out = sessions.map((s) => ({
          workoutId: s.workoutId,
          date: s.date,
          title: s.title,
          exercises: s.exercises.map((e) => {
            const summary = summariseExercise(e.sets);
            const top = summary.topSet;
            const oneRm = e.sets
              .filter((x) => x.done)
              .reduce<number | null>(
                (m, x) => Math.max(m ?? 0, estimatedOneRepMax(x.weightKg, x.reps) ?? 0) || m,
                null,
              );
            const previous = best.get(e.exerciseName);
            if (top && (!previous || (previous.heaviestKg ?? 0) <= top.weightKg)) {
              best.set(e.exerciseName, {
                exercise: e.exerciseName,
                heaviestKg: top.weightKg,
                repsAtHeaviest: top.reps,
                estimatedOneRepMaxKg:
                  Math.max(oneRm ?? 0, previous?.estimatedOneRepMaxKg ?? 0) || null,
                date: s.date,
              });
            }
            return {
              exercise: e.exerciseName,
              sets: e.sets.map((x) => ({
                set: x.position,
                kg: x.weightKg,
                reps: x.reps,
                seconds: x.seconds,
                done: x.done,
              })),
              setsDone: summary.setsDone,
              setsLogged: summary.setsTotal,
              volumeKg: summary.volumeKg,
              heaviestSet: top ? { kg: top.weightKg, reps: top.reps } : null,
              estimatedOneRepMaxKg: oneRm,
            };
          }),
        }));
        return text({
          from,
          to: today,
          sessions: out,
          bestOfPeriod: [...best.values()],
          units: { weight: "kg" },
        });
      }),
  );
}
