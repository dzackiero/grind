import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { PlanInput } from "@/lib/plan";
import { createDb, type DB } from "../db/client";
import { activity, plannedWorkout, user } from "../db/schema";
import { createPlanFromInput } from "../plans/service";
import { getTrainingSummary, getWorkoutCompliance } from "./coaching-summary";

let db: DB;
const input: PlanInput = { goal: "5k", startDate: "2026-10-05", experience: "intermediate", currentWeeklyKm: 20, runDays: ["tue", "thu", "sun"], longRunDay: "sun", intensity: "balanced", strength: { sessionsPerWeek: 0, days: [], equipment: "gym" } };

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values(["one", "two", "empty", "nulls", "archived"].map((id) => ({ id, name: id, email: `${id}@example.com` })));
  const rows = [
    { userId: "one", id: "old", date: "2026-09-30", type: "Run", distanceM: 99000, movingTimeSec: 9999 },
    { userId: "one", id: "start", date: "2026-10-01", type: "Run", distanceM: 5000, movingTimeSec: 1500 },
    { userId: "one", id: "edge", date: "2026-10-21", type: "Run", distanceM: 3000, movingTimeSec: 900 },
    { userId: "one", id: "run", date: "2026-10-22", type: "VirtualRun", distanceM: 10000, movingTimeSec: 3000 },
    { userId: "one", id: "strength", date: "2026-10-27", type: "WeightTraining", distanceM: null, movingTimeSec: 1200 },
    { userId: "one", id: "rest-day-run", date: "2026-10-28", type: "Run", distanceM: 2000, movingTimeSec: null },
    { userId: "one", id: "future", date: "2026-10-29", type: "Run", distanceM: 30000, movingTimeSec: 9000 },
    { userId: "two", id: "run", date: "2026-10-22", type: "Run", distanceM: 100000, movingTimeSec: 30000 },
    { userId: "two", id: "foreign-only", date: "2026-10-25", type: "Run", distanceM: 25000, movingTimeSec: 5000 },
    { userId: "nulls", id: "unknown", date: "2026-10-28", type: "Run", distanceM: null, movingTimeSec: null },
  ];
  await db.insert(activity).values(rows.map((row) => ({ ...row, startLocal: `${row.date}T08:00:00`, raw: {} })));
  await createPlanFromInput(db, "one", input);
  await createPlanFromInput(db, "two", input);
  await db.update(plannedWorkout).set({ status: "completed", activityId: "run" }).where(and(eq(plannedWorkout.userId, "one"), eq(plannedWorkout.date, "2026-10-20")));
  await db.update(plannedWorkout).set({ status: "skipped" }).where(and(eq(plannedWorkout.userId, "one"), eq(plannedWorkout.date, "2026-10-22")));
  await db.update(plannedWorkout).set({ status: "completed", activityId: "foreign-only" }).where(and(eq(plannedWorkout.userId, "one"), eq(plannedWorkout.date, "2026-10-25")));
});

describe("coaching training evidence", () => {
  it("counts all run types in inclusive athlete-local rolling windows", async () => {
    const result = await getTrainingSummary(db, "one", "2026-10-28");
    expect(result.rolling7).toMatchObject({ from: "2026-10-22", to: "2026-10-28", km: 12, movingTimeSec: 4200, runSessions: 2, strengthSessions: 1, longestRunKm: 10 });
    expect(result.rolling28).toMatchObject({ from: "2026-10-01", km: 20, movingTimeSec: 6600, runSessions: 4 });
    expect(result.availableDateRange).toEqual({ from: "2026-09-30", to: "2026-10-29" });
    expect(result.weeks.find((week) => week.from === "2026-10-26")).toMatchObject({ to: "2026-10-28", runSessions: 1, strengthSessions: 1 });
  });

  it("distinguishes absent activities from missing metrics", async () => {
    const empty = await getTrainingSummary(db, "empty", "2026-10-28");
    expect(empty.rolling7).toMatchObject({ km: 0, movingTimeSec: 0, runSessions: 0, longestRunKm: 0 });
    expect(empty.availableDateRange).toEqual({ from: null, to: null });
    expect((await getTrainingSummary(db, "nulls", "2026-10-28")).rolling7).toMatchObject({ km: null, movingTimeSec: null, runSessions: 1, longestRunKm: null });
  });

  it("compares the linked activity on its actual date and includes unmatched rest-day runs", async () => {
    const result = await getWorkoutCompliance(db, "one", "2026-10-19", "2026-10-28");
    const completed = result.workouts.find((workout) => workout.workoutDate === "2026-10-20")!;
    expect(completed).toMatchObject({ status: "completed", actualDate: "2026-10-22", actualKm: 10 });
    expect(completed.distanceCompletionRatio).toBeCloseTo(10 / completed.plannedKm!);
    expect(result.totals).toMatchObject({ completed: 2, skipped: 1, unlinkedRuns: 2 });
    expect(result.unmatchedActualActivities.map((row) => row.id)).toContain("rest-day-run");
    expect(result.unmatchedActualActivities.map((row) => row.id)).not.toContain("run");
    expect(result.unmatchedActualActivities.find((row) => row.id === "rest-day-run")).toMatchObject({ actualKm: 2, movingTimeSec: null });
  });

  it("never joins another user's activity with the same id", async () => {
    expect((await getWorkoutCompliance(db, "one", "2026-10-19", "2026-10-28")).workouts.find((workout) => workout.actualId === "run")?.actualKm).toBe(10);
    expect((await getWorkoutCompliance(db, "one", "2026-10-19", "2026-10-28")).workouts.find((workout) => workout.linkedActivityId === "foreign-only")).toMatchObject({ actualId: null, actualDate: null, actualKm: null, distanceCompletionRatio: null });
    expect((await getWorkoutCompliance(db, "empty", "2026-10-19", "2026-10-28")).unmatchedActualActivities).toEqual([]);
  });

  it("keeps fixed rolling windows when a shorter period is requested", async () => {
    const result = await getTrainingSummary(db, "one", "2026-10-28", 1);
    expect(result.period).toMatchObject({ from: "2026-10-28", km: 2, runSessions: 1, movingTimeSec: null });
    expect(result.rolling28).toMatchObject({ from: "2026-10-01", km: 20 });
    for (const days of [0, 366, 1.5]) await expect(getTrainingSummary(db, "one", "2026-10-28", days)).rejects.toThrow();
  });

  it("excludes archived plan workouts", async () => {
    await createPlanFromInput(db, "archived", input);
    await db.update(plannedWorkout).set({ status: "skipped" }).where(eq(plannedWorkout.userId, "archived"));
    await createPlanFromInput(db, "archived", input);
    const result = await getWorkoutCompliance(db, "archived", "2026-10-19", "2026-10-28");
    expect(result.workouts.length).toBeGreaterThan(0);
    expect(result.totals.skipped).toBe(0);
  });

  it("does not label a recording unmatched when its linked workout is outside the requested dates", async () => {
    const result = await getWorkoutCompliance(db, "one", "2026-10-22", "2026-10-28");
    expect(result.workouts.some((row) => row.actualId === "run")).toBe(false);
    expect(result.unmatchedActualActivities.map((row) => row.id)).not.toContain("run");
  });
});
