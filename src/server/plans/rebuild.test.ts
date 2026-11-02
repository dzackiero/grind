import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { createPlanFromInput, getActivePlan, rebuildPlan } from "./service";

let db: DB;
let uid: string;
let sequence = 0;
const TODAY = "2026-10-28";

beforeAll(async () => {
  db = await createDb("memory://");
});
beforeEach(async () => {
  uid = `rebuild-${++sequence}`;
  await db.insert(user).values({ id: uid, name: "Runner", email: `${uid}@test.example` });
  await createPlanFromInput(db, uid, {
    goal: "10k",
    raceDate: "2027-02-14",
    startDate: TODAY,
    experience: "intermediate",
    currentWeeklyKm: 20,
    recentRace: { distanceM: 5000, timeSec: 32 * 60 + 30 },
    runDays: ["wed", "fri", "sun"],
    longRunDay: "sun",
    strength: { sessionsPerWeek: 0, days: [], equipment: "gym" },
    intensity: "balanced",
  });
});

describe("rebuildPlan", () => {
  it("previews a custom distance without saving", async () => {
    const before = await getActivePlan(db, uid);
    const result = await rebuildPlan(
      db,
      uid,
      { goalDistanceKm: 24 },
      { apply: false, today: TODAY },
    );
    expect(result.saved).toBeNull();
    expect(result.plan.title).toBe("24K Plan");
    expect(result.plan.goal).toBe("half");
    const after = await getActivePlan(db, uid);
    expect(after!.id).toBe(before!.id);
  });

  it("applies the change, archives the old plan and keeps other settings", async () => {
    const before = await getActivePlan(db, uid);
    const result = await rebuildPlan(
      db,
      uid,
      { goalDistanceKm: 24, recentRace: { distanceM: 5000, timeSec: 30 * 60 } },
      { apply: true, today: TODAY, expectedRevision: before!.revision },
    );
    const after = await getActivePlan(db, uid);
    expect(after!.id).toBe(result.saved!.id);
    expect(after!.id).not.toBe(before!.id);
    expect(after!.plan.input.goalDistanceKm).toBe(24);
    expect(after!.plan.input.runDays).toEqual(["wed", "fri", "sun"]);
    expect(after!.plan.fitnessScore).toBeGreaterThan(before!.plan.fitnessScore);
  });

  it("clears a custom distance when a standard goal is asked for", async () => {
    await rebuildPlan(db, uid, { goalDistanceKm: 24 }, { apply: true, today: TODAY });
    const result = await rebuildPlan(db, uid, { goal: "half" }, { apply: false, today: TODAY });
    expect(result.plan.input.goalDistanceKm).toBeUndefined();
    expect(result.plan.title).toBe("Half Marathon Plan");
  });

  it("refuses a stale revision", async () => {
    await expect(
      rebuildPlan(
        db,
        uid,
        { goalDistanceKm: 24 },
        { apply: true, today: TODAY, expectedRevision: 99 },
      ),
    ).rejects.toThrow(/changed/);
  });
});
