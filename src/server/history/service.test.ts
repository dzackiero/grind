import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DB } from "../db/client";
import { activity, historicalWorkout, plannedWorkout, user, workoutActivity } from "../db/schema";
import { generatePlan, type PlanInput } from "@/lib/plan";
import { savePlan } from "../plans/service";
import { getHistoricalWorkout, listHistoricalWorkouts, recordHistoricalWorkout } from "./service";

let db: DB;
const today = "2026-10-28";
const base = { date: "2026-10-20", kind: "run" as const, title: "Two runs", requestKey: "first" };
const planInput: PlanInput = { goal: "5k", startDate: "2026-10-19", experience: "intermediate", currentWeeklyKm: 15, runDays: ["mon", "wed", "sun"], longRunDay: "sun", strength: { sessionsPerWeek: 0, days: [], equipment: "gym" }, intensity: "balanced" };

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([{ id: "history-one", name: "One", email: "history-one@example.com" }, { id: "history-two", name: "Two", email: "history-two@example.com" }]);
  await db.insert(activity).values([
    ...["a", "b", "linked", "legacy", "free"].map((id) => ({ userId: "history-one", id, date: "2026-10-20", startLocal: "2026-10-20T08:00:00", type: "Run", raw: {} })),
    { userId: "history-one", id: "wrong-date", date: "2026-10-21", startLocal: "2026-10-21T08:00:00", type: "Run", raw: {} },
    { userId: "history-one", id: "strength", date: "2026-10-20", startLocal: "2026-10-20T08:00:00", type: "WeightTraining", raw: {} },
    { userId: "history-two", id: "private", date: "2026-10-20", startLocal: "2026-10-20T08:00:00", type: "Run", raw: {} },
    { userId: "history-two", id: "ride", date: "2026-10-20", startLocal: "2026-10-20T08:00:00", type: "Ride", raw: {} },
  ]);
});

describe("historical workout service", () => {
  it("records two activities on their actual date and returns the same result on retry", async () => {
    const input = { ...base, activityIds: ["b", "a"] };
    const result = await recordHistoricalWorkout(db, "history-one", input, today);
    expect(result).toMatchObject({ date: "2026-10-20", kind: "run", title: "Two runs", focus: null, notes: null, activityIds: ["a", "b"] });
    expect(await recordHistoricalWorkout(db, "history-one", { ...input, activityIds: ["a", "b"] }, today)).toEqual(result);
    await expect(recordHistoricalWorkout(db, "history-one", { ...input, title: "Changed" }, today)).rejects.toThrow();
    expect(await getHistoricalWorkout(db, "history-two", result.id)).toBeNull();
    expect(await listHistoricalWorkouts(db, "history-two", "2026-10-01", today)).toEqual([]);
  });

  it("rejects foreign, wrong-date, wrong-kind, duplicate and future activities atomically", async () => {
    for (const ids of [["private"], ["wrong-date"], ["strength"], ["free", "private"], ["free", "free"]]) {
      await expect(recordHistoricalWorkout(db, "history-one", { ...base, requestKey: `bad-${ids.join("-")}`, activityIds: ids }, today)).rejects.toThrow();
    }
    await expect(recordHistoricalWorkout(db, "history-one", { ...base, requestKey: "future", date: "2026-10-29" }, today)).rejects.toThrow();
    await expect(recordHistoricalWorkout(db, "history-one", { ...base, requestKey: "invalid", date: "2026-02-30" }, today)).rejects.toThrow();
    const free = await recordHistoricalWorkout(db, "history-one", { ...base, requestKey: "free", activityIds: ["free"] }, today);
    expect(free.activityIds).toEqual(["free"]);
  });

  it("records strength and other workouts, and rejects miscategorized activities", async () => {
    const strength = await recordHistoricalWorkout(db, "history-two", { date: "2026-10-20", kind: "strength", title: "Upper body", focus: "upper", notes: "Steady", requestKey: "strength" }, today);
    expect(strength).toMatchObject({ kind: "strength", focus: "upper", notes: "Steady", activityIds: [] });
    await expect(recordHistoricalWorkout(db, "history-two", { date: "2026-10-20", kind: "other", title: "Training", requestKey: "wrong-kind", activityIds: ["private"] }, today)).rejects.toThrow();
    const other = await recordHistoricalWorkout(db, "history-two", { date: "2026-10-20", kind: "other", title: "Cycling", requestKey: "other", activityIds: ["ride"] }, today);
    expect(other.activityIds).toEqual(["ride"]);
    expect(await listHistoricalWorkouts(db, "history-two", "2026-10-20", "2026-10-20")).toHaveLength(2);
  });

  it("rejects activities already linked through either representation", async () => {
    const saved = await savePlan(db, "history-one", generatePlan(planInput));
    const [planned] = await db.select().from(plannedWorkout).where(eq(plannedWorkout.planId, saved.id));
    await db.insert(workoutActivity).values({ userId: "history-one", activityId: "linked", plannedWorkoutId: planned.id });
    await db.update(plannedWorkout).set({ activityId: "legacy" }).where(eq(plannedWorkout.id, planned.id));
    for (const id of ["a", "linked", "legacy"]) {
      await expect(recordHistoricalWorkout(db, "history-one", { ...base, requestKey: `used-${id}`, activityIds: [id] }, today)).rejects.toThrow();
    }
    expect((await db.select().from(historicalWorkout).where(eq(historicalWorkout.userId, "history-one"))).length).toBe(2);
  });
});
