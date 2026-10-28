import { beforeAll, describe, expect, it } from "vitest";
import type { PlanInput } from "@/lib/plan";
import { createDb, type DB } from "../db/client";
import { activity, activityEffort, user } from "../db/schema";
import { createPlanFromInput, getActivePlan, setWorkoutStatus } from "../plans/service";
import { getPoints, getRecords, getWeeklyTotals } from "./service";

const input: PlanInput = {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 15,
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" },
  intensity: "balanced",
};

let db: DB;

const act = (id: string, date: string, type: string, distanceM: number | null, movingTimeSec: number | null, name: string | null = null) => ({
  userId: "u1",
  id,
  date,
  startLocal: `${date}T07:00:00`,
  type,
  name,
  distanceM,
  movingTimeSec,
  raw: {},
});

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "u1", name: "One", email: "one@example.com" },
    { id: "u2", name: "Two", email: "two@example.com" },
  ]);
  await db.insert(activity).values([
    act("r1", "2026-10-12", "Run", 5000, 1700, "Parkrun"),
    act("r2", "2026-10-18", "Run", 5200, 1620, "Tempo"),
    act("r3", "2026-10-26", "Run", 3000, 1100),
    act("r4", "2026-10-28", "VirtualRun", 2000, 700),
    act("w1", "2026-10-27", "Walk", 4000, 2400),
    act("s1", "2026-10-29", "WeightTraining", null, 2700),
    act("old", "2025-01-05", "Run", 5000, 1500),
  ]);
  await db.insert(activityEffort).values([
    { userId: "u1", activityId: "r1", key: "1k", seconds: 320 },
    { userId: "u1", activityId: "r1", key: "5k", seconds: 1700 },
    { userId: "u1", activityId: "r2", key: "1k", seconds: 300 },
    { userId: "u1", activityId: "r2", key: "5k", seconds: 1620 },
    { userId: "u1", activityId: "r2", key: "mystery", seconds: 1 },
    { userId: "u1", activityId: "r3", key: "1k", seconds: 300 },
  ]);
});

describe("getRecords", () => {
  it("picks the fastest time per distance with the run's date", async () => {
    const records = await getRecords(db, "u1");
    expect(records["5k"]).toMatchObject({ seconds: 1620, date: "2026-10-18", activityId: "r2", name: "Tempo" });
    // 1K was run in 300 s twice: the earlier run keeps the record
    expect(records["1k"]).toMatchObject({ seconds: 300, date: "2026-10-18", activityId: "r2" });
  });
  it("leaves out distances never run and unknown keys", async () => {
    const records = await getRecords(db, "u1");
    expect(Object.keys(records).sort()).toEqual(["1k", "5k"]);
  });
  it("keeps athletes apart", async () => {
    expect(await getRecords(db, "u2")).toEqual({});
  });
});

describe("getWeeklyTotals", () => {
  it("groups runs and strength by week, oldest first, and ignores walks", async () => {
    // Today is Thursday Oct 29: the current week starts Monday Oct 26
    const weeks = await getWeeklyTotals(db, "u1", "2026-10-29", 4);
    expect(weeks.map((w) => w.start)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    // Oct 12 (Monday) and Oct 18 (Sunday) fall in the same Monday-to-Sunday week
    expect(weeks[1]).toMatchObject({ km: 10.2, runs: 2, strength: 0, minutes: Math.round((1700 + 1620) / 60) });
    expect(weeks[2]).toMatchObject({ km: 0, runs: 0 });
    // Current week: outdoor 3 km + treadmill 2 km, one strength session; the walk is not counted
    expect(weeks[3]).toMatchObject({ km: 5, runs: 2, strength: 1, minutes: Math.round((1100 + 700 + 2700) / 60) });
  });
  it("includes empty weeks and leaves out runs older than the range", async () => {
    const weeks = await getWeeklyTotals(db, "u1", "2026-10-29", 4);
    expect(weeks[0]).toMatchObject({ km: 0, runs: 0, strength: 0, minutes: 0 });
    expect(weeks.reduce((s, w) => s + w.km, 0)).toBeCloseTo(15.2, 5);
  });
});

describe("getPoints", () => {
  it("is zero and Bronze before anything is done", async () => {
    await createPlanFromInput(db, "u1", input);
    expect(await getPoints(db, "u1", "2026-10-29")).toMatchObject({ points: 0, completedWorkouts: 0, streak: 0, tier: { tier: { key: "bronze" } } });
  });

  it("adds up completed workouts and the weekly bonus", async () => {
    const saved = (await getActivePlan(db, "u1"))!;
    const week1 = saved.plan.weeks[0].workouts;
    for (const w of week1) await setWorkoutStatus(db, "u1", w.id, "completed");
    const p = await getPoints(db, "u1", "2026-10-29");
    expect(p.completedWorkouts).toBe(week1.length);
    expect(p.weeksHit).toBe(1);
    expect(p.bonusPoints).toBe(200);
    expect(p.points).toBe(p.workoutPoints + 200);
    expect(p.tier.next?.key).toBe("silver");
    expect(p.tier.remaining).toBe(2000 - p.points);
  });

  it("counts a finished week toward the streak", async () => {
    // Week 1 ended on Sunday Nov 1
    expect((await getPoints(db, "u1", "2026-11-03")).streak).toBe(1);
  });

  it("keeps athletes apart", async () => {
    expect(await getPoints(db, "u2", "2026-11-03")).toMatchObject({ points: 0, streak: 0 });
  });
});
