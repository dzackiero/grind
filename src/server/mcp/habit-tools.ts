import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { adherence, scheduleLabel, streak, weekProgress, STREAK_LOOKBACK_DAYS } from "@/lib/habits";
import { addDays } from "@/lib/plan/dates";
import { listHabits } from "../habits/service";
import { getTimezone, todayIn } from "../profile/service";
import { mcpGuard as guard, mcpText as text } from "./result";
import type { McpContext } from "./server";

/** What Claude can see of the athlete's habits. Read only: ticks are the athlete's own to make. */
export function registerHabitTools(server: McpServer, { db, userId, scopes }: McpContext) {
  if (!scopes.has("plan:read")) return;
  server.registerTool(
    "get_habits",
    {
      title: "Get habits",
      description:
        "The small daily habits the athlete tracks (stretching, sleep, water and so on): the days each is scheduled, how many were ticked this week, the current streak in days, and how well the last days went. Use it to see how they look after themselves between sessions, for example when recovery is poor or before adding load. You can read habits but not tick them off; the athlete does that in Kilo.",
      inputSchema: z.object({ days: z.number().int().min(7).max(60).default(28).describe("How many days back to judge adherence, up to 60") }),
      annotations: { readOnlyHint: true },
    },
    async ({ days }) =>
      guard(async () => {
        const today = todayIn(await getTimezone(db, userId));
        const habits = await listHabits(db, userId, { from: addDays(today, -STREAK_LOOKBACK_DAYS), to: today });
        if (!habits.length) return text("The athlete doesn't track any habits yet.");
        return text({
          today,
          habits: habits.map((h) => {
            const done = new Set(h.doneDates);
            const week = weekProgress(h.days, done, today);
            const window = adherence(h.days, done, today, h.createdOn, days);
            return {
              name: h.name,
              scheduledDays: h.days,
              schedule: scheduleLabel(h.days),
              doneToday: done.has(today),
              thisWeek: { done: week.done, target: week.target },
              streakDays: streak(h.days, done, today),
              lastDays: {
                days,
                scheduled: window.scheduled,
                done: window.done,
                adherencePercent: window.scheduled ? Math.round((window.done / window.scheduled) * 100) : null,
                note: "Counts scheduled days since the habit was created, today excluded.",
              },
              tickedLast14Days: h.doneDates.filter((d) => d >= addDays(today, -13)),
            };
          }),
        });
      }),
  );
}
