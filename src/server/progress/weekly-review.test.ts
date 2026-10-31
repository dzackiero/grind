import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/server";
import type { PlanInput } from "@/lib/plan";
import { weekdayOf } from "@/lib/plan/dates";
import { createDb, type DB } from "../db/client";
import { activity, plannedWorkout, user, wellness } from "../db/schema";
import { registerCoachingTools } from "../mcp/coaching-tools";
import { createPlanFromInput } from "../plans/service";
import { setCoachingProfile } from "../profile/coaching";
import { getWeeklyReview } from "./weekly-review";

let db: DB;
// Mon 2026-10-05 start; weeks run Mon-Sun, so 2026-10-12..18 is plan week 2.
const input: PlanInput = {
  goal: "5k",
  startDate: "2026-10-05",
  experience: "intermediate",
  currentWeeklyKm: 20,
  runDays: ["tue", "thu", "sun"],
  longRunDay: "sun",
  intensity: "balanced",
  strength: { sessionsPerWeek: 0, days: [], equipment: "gym" },
};
const WEEK = "2026-10-12";
const TODAY = "2026-10-21"; // Wednesday after the review week

const workoutsOf = (userId: string) =>
  db
    .select()
    .from(plannedWorkout)
    .where(eq(plannedWorkout.userId, userId))
    .orderBy(asc(plannedWorkout.date), asc(plannedWorkout.position));

beforeAll(async () => {
  db = await createDb("memory://");
  await db
    .insert(user)
    .values(["a", "b", "c"].map((id) => ({ id, name: id, email: `${id}@example.com` })));
  await createPlanFromInput(db, "a", input);
  await createPlanFromInput(db, "c", input);
  const week = (await workoutsOf("a")).filter((w) => w.date >= WEEK && w.date <= "2026-10-18");
  const long = week.find((w) => w.type === "long")!;
  const [first] = week.filter((w) => w.kind === "run" && w.type !== "long");
  // Complete the first non-long run with a linked activity; leave the long run missed.
  await db.insert(activity).values([
    {
      userId: "a",
      id: "ran",
      date: first.date,
      type: "Run",
      distanceM: 7000,
      movingTimeSec: 2400,
      startLocal: `${first.date}T08:00:00`,
      raw: {},
    },
    {
      userId: "a",
      id: "extra",
      date: "2026-10-14",
      type: "Run",
      distanceM: 3000,
      movingTimeSec: 1000,
      name: "Bonus",
      startLocal: "2026-10-14T08:00:00",
      raw: {},
    },
    {
      userId: "a",
      id: "elsewhere",
      date: "2026-10-30",
      type: "Run",
      distanceM: 3000,
      movingTimeSec: 1000,
      startLocal: "2026-10-30T08:00:00",
      raw: {},
    },
  ]);
  await db
    .update(plannedWorkout)
    .set({ status: "completed", activityId: "ran" })
    .where(and(eq(plannedWorkout.userId, "a"), eq(plannedWorkout.workoutKey, first.workoutKey)));
  await db.insert(wellness).values({
    userId: "a",
    date: "2026-10-13",
    restingHr: 52,
    hrv: 55,
    sleepSecs: 7 * 3600,
    raw: {},
  });
  expect(long.status).toBe("planned");
});

describe("getWeeklyReview", () => {
  it("reports completion, missed key sessions, extras, recovery and coaching", async () => {
    const r = await getWeeklyReview(db, "a", TODAY, WEEK);
    expect(r.week).toMatchObject({ start: WEEK, end: "2026-10-18", isComplete: true });
    expect(r.completion).toMatchObject({ planned: 3, completed: 1, matched: 1, missed: 2 });
    expect(r.keySessions.missed.map((s) => s.type)).toContain("long");
    expect(r.load.runKm).toBe(10);
    expect(r.recovery).toMatchObject({
      source: "intervals.icu wellness",
      units: { hrv: "ms" },
      restingHr: { current: 52, baseline: null, change: null },
    });
    expect(r.unmatchedActivities.activities.map((a) => a.id)).toEqual(["extra"]);
    expect(r.coaching).toMatchObject({ preferences: {}, constraints: {}, coachingRevision: 0 });
    expect(r.planRevision).toBe(1);
    // The week is over, so the missed long run is advice only.
    const missedLong = r.suggestedAdjustments.find((s) => s.code === "long_run_missed");
    expect(missedLong).toMatchObject({ changes: [], status: "ready" });
  });

  it("defaults to last week when it had planned workouts", async () => {
    const r = await getWeeklyReview(db, "a", TODAY);
    expect(r.week.start).toBe("2026-10-12");
  });

  it("has null recovery and no suggestions without data", async () => {
    const r = await getWeeklyReview(db, "b", TODAY, WEEK);
    expect(r.completion.planned).toBe(0);
    expect(r.recovery).toBeNull();
    expect(r.planRevision).toBeNull();
    expect(r.suggestedAdjustments).toEqual([]);
  });

  it("rejects a week that has not started", async () => {
    await expect(getWeeklyReview(db, "a", TODAY, "2026-11-02")).rejects.toThrow(/hasn't started/);
  });

  it("never writes to the plan", async () => {
    const before = JSON.stringify(await workoutsOf("c"));
    await getWeeklyReview(db, "c", "2026-10-22", "2026-10-19");
    expect(JSON.stringify(await workoutsOf("c"))).toBe(before);
  });

  it("suggests a move this week that the validator accepts, then blocks it by constraint", async () => {
    const thisWeek = "2026-10-19";
    const today = "2026-10-23"; // Fri
    const free = await getWeeklyReview(db, "c", today, thisWeek);
    const move = free.suggestedAdjustments.find(
      (s) => s.code === "long_run_missed" || s.code === "quality_missed",
    );
    if (!move) throw new Error("expected a missed key session in the current week");
    expect(move.changes).toHaveLength(1);
    expect(move.status).toBe("ready");
    const op = move.changes[0] as { op: "move"; toDate: string };
    expect(op.op).toBe("move");
    expect(op.toDate >= today).toBe(true);

    // The slot finder ignores run-type rules; the validator must still block the move.
    await setCoachingProfile(
      db,
      "c",
      { preferences: {}, constraints: { runTypeByDay: { [weekdayOf(op.toDate)]: "easy" } } },
      0,
    );
    const constrained = await getWeeklyReview(db, "c", today, thisWeek);
    const again = constrained.suggestedAdjustments.find((s) => s.code === move.code)!;
    expect(again.status).toBe("blocked");
    expect(again.blockedBy).not.toEqual([]);
    expect(constrained.coaching.constraints.runTypeByDay).toBeDefined();
  });
});

describe("get_weekly_review tool", () => {
  type ToolConfig = { annotations: object; inputSchema: { shape: object } };
  type Handler = (args: { week?: string }) => Promise<{
    isError?: boolean;
    structuredContent: {
      success: boolean;
      data: Awaited<ReturnType<typeof getWeeklyReview>>;
      planRevision?: number | null;
    };
  }>;
  const register = (userId: string, scopes: string[]) => {
    const tools = new Map<string, { config: ToolConfig; handler: Handler }>();
    registerCoachingTools(
      {
        registerTool: (name: string, config: ToolConfig, handler: Handler) =>
          void tools.set(name, { config, handler }),
      } as unknown as McpServer,
      { db, userId, scopes: new Set(scopes) },
    );
    return tools;
  };

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${TODAY}T12:00:00Z`) });
  });
  afterAll(() => vi.useRealTimers());

  it("is read-only and needs plan:read", () => {
    const read = register("a", ["plan:read"]).get("get_weekly_review")!;
    expect(read.config.annotations).toMatchObject({ readOnlyHint: true });
    expect(register("a", ["plan:write"]).has("get_weekly_review")).toBe(false);
    expect(register("a", []).has("get_weekly_review")).toBe(false);
  });

  it("takes no user id: user B cannot get user A's review", async () => {
    const schema = register("a", ["plan:read"]).get("get_weekly_review")!.config.inputSchema;
    expect(Object.keys(schema.shape)).toEqual(["week"]);

    const mine = await register("a", ["plan:read"])
      .get("get_weekly_review")!
      .handler({ week: WEEK });
    expect(mine.structuredContent.success).toBe(true);
    expect(mine.structuredContent.data.completion.planned).toBe(3);

    const theirs = await register("b", ["plan:read"])
      .get("get_weekly_review")!
      .handler({ week: WEEK });
    const data = theirs.structuredContent.data;
    expect(data.completion.planned).toBe(0);
    expect(data.load.runKm).toBe(0);
    expect(data.recovery).toBeNull();
    expect(data.unmatchedActivities.activities).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain("Bonus");
    expect(theirs.structuredContent.planRevision).toBeNull();
    // Extra args such as a user id are not part of the input contract.
    expect(Object.keys(schema.shape)).not.toContain("userId");
  });

  it("returns a normal failure for a future week", async () => {
    const r = await register("a", ["plan:read"])
      .get("get_weekly_review")!
      .handler({ week: "2026-12-01" });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.success).toBe(false);
  });
});
