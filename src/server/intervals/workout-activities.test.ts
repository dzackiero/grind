import { describe, expect, it } from "vitest";
import { aggregateWorkoutActivities } from "./workout-activities";

describe("activity totals", () => {
  it("sums known measurements and weights heart rate by moving time", () => {
    expect(
      aggregateWorkoutActivities([
        { distanceM: 2000, movingTimeSec: 600, avgHr: 120 },
        { distanceM: 3000, movingTimeSec: 900, avgHr: 150 },
      ]),
    ).toMatchObject({ distanceM: 5000, movingTimeSec: 1500, avgHr: 138, activityCount: 2 });
  });
});

import { beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, type DB } from "../db/client";
import { activity, athleteProfile, plannedWorkout, user, workoutActivity } from "../db/schema";
import { createPlanFromInput } from "../plans/service";
import type { PlanInput } from "@/lib/plan";
import { getWorkoutActivityRows, linkWorkoutActivities } from "./workout-activities";

const input: PlanInput = {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 15,
  recentRace: { distanceM: 5000, timeSec: 1661 },
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 3, days: ["mon", "tue", "thu"], equipment: "gym" },
  intensity: "balanced",
};
let db: DB;
let target: typeof plannedWorkout.$inferSelect;
let other: typeof plannedWorkout.$inferSelect;
let planId: string;

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "link-u1", name: "One", email: "link-one@example.com" },
    { id: "link-u2", name: "Two", email: "link-two@example.com" },
  ]);
  await db.insert(athleteProfile).values({ userId: "link-u1" });
  const saved = await createPlanFromInput(db, "link-u1", input);
  planId = saved.id;
  const workouts = await db.select().from(plannedWorkout).where(eq(plannedWorkout.planId, planId));
  target = workouts.find((w) => w.kind === "run")!;
  other = workouts.find((w) => w.kind === "run" && w.id !== target.id)!;
  await db.insert(activity).values([
    {
      userId: "link-u1",
      id: "a",
      date: target.date,
      startLocal: `${target.date}T10:00:00`,
      type: "Run",
      distanceM: 2000,
      movingTimeSec: 600,
      avgHr: 120,
      raw: { start_date: "2026-10-28T03:00:00Z" },
    },
    {
      userId: "link-u1",
      id: "b",
      date: target.date,
      startLocal: `${target.date}T11:00:00`,
      type: "Run",
      distanceM: 3000,
      movingTimeSec: 900,
      avgHr: 150,
      raw: {},
    },
    {
      userId: "link-u1",
      id: "bad-date",
      date: "2026-01-01",
      startLocal: "2026-01-01",
      type: "Run",
      raw: {},
    },
    {
      userId: "link-u1",
      id: "bad-kind",
      date: target.date,
      startLocal: target.date,
      type: "Ride",
      raw: {},
    },
    {
      userId: "link-u1",
      id: "claimed",
      date: target.date,
      startLocal: target.date,
      type: "Run",
      raw: {},
    },
    {
      userId: "link-u2",
      id: "foreign",
      date: target.date,
      startLocal: target.date,
      type: "Run",
      raw: {},
    },
  ]);
});

describe("workout activity linking", () => {
  it("appends multiple activities, aggregates them and is idempotent", async () => {
    const linked = await linkWorkoutActivities(
      db,
      "link-u1",
      { workoutId: target.workoutKey, activityIds: ["a", "b"] },
      "2027-01-01",
    );
    expect(linked.activityIds.sort()).toEqual(["a", "b"]);
    expect(linked.actuals).toMatchObject({ distanceM: 5000, movingTimeSec: 1500, avgHr: 138 });
    const retried = await linkWorkoutActivities(
      db,
      "link-u1",
      { workoutId: target.workoutKey, activityIds: ["a", "b"] },
      "2027-01-01",
    );
    expect(retried.actuals.activityCount).toBe(2);
    const [row] = await db.select().from(plannedWorkout).where(eq(plannedWorkout.id, target.id));
    expect(row.status).toBe("completed");
    expect(row.completedAt?.toISOString()).toBe("2026-10-28T03:00:00.000Z");
  });

  it("rejects invalid batches atomically and prevents cross-user access", async () => {
    await db
      .update(plannedWorkout)
      .set({ activityId: "claimed" })
      .where(eq(plannedWorkout.id, other.id));
    for (const ids of [
      ["bad-date"],
      ["bad-kind"],
      ["foreign"],
      ["claimed"],
      ["a", "a"],
      ["a", "bad-date"],
    ]) {
      await expect(
        linkWorkoutActivities(
          db,
          "link-u1",
          { workoutId: target.workoutKey, activityIds: ids },
          "2027-01-01",
        ),
      ).rejects.toThrow();
    }
    await expect(
      linkWorkoutActivities(
        db,
        "link-u2",
        { workoutId: target.workoutKey, activityIds: ["foreign"] },
        "2027-01-01",
      ),
    ).rejects.toThrow();
    expect(
      await db.select().from(workoutActivity).where(eq(workoutActivity.userId, "link-u1")),
    ).toHaveLength(2);
  });

  it("includes a legacy link once and preserves a manual completion timestamp", async () => {
    const when = new Date("2026-01-01T00:00:00Z");
    await db
      .update(plannedWorkout)
      .set({ status: "completed", completedAt: when })
      .where(eq(plannedWorkout.id, target.id));
    await db
      .delete(workoutActivity)
      .where(and(eq(workoutActivity.userId, "link-u1"), eq(workoutActivity.activityId, "a")));
    const before = await getWorkoutActivityRows(db, "link-u1", { planId });
    expect(
      before
        .get(target.workoutKey)
        ?.map((a) => a.id)
        .sort(),
    ).toEqual(["a", "b"]);
    await linkWorkoutActivities(
      db,
      "link-u1",
      { workoutId: target.workoutKey, activityIds: ["a"] },
      "2027-01-01",
    );
    const [row] = await db.select().from(plannedWorkout).where(eq(plannedWorkout.id, target.id));
    expect(row.completedAt).toEqual(when);
    expect((await getWorkoutActivityRows(db, "link-u2", { planId })).size).toBe(0);
  });

  it("rejects skipped and future workouts", async () => {
    await db
      .update(plannedWorkout)
      .set({ status: "skipped" })
      .where(eq(plannedWorkout.id, target.id));
    await expect(
      linkWorkoutActivities(
        db,
        "link-u1",
        { workoutId: target.workoutKey, activityIds: ["a"] },
        "2027-01-01",
      ),
    ).rejects.toThrow();
    await db
      .update(plannedWorkout)
      .set({ status: "completed" })
      .where(eq(plannedWorkout.id, target.id));
    await expect(
      linkWorkoutActivities(
        db,
        "link-u1",
        { workoutId: target.workoutKey, activityIds: ["a"] },
        "2020-01-01",
      ),
    ).rejects.toThrow();
  });
});
