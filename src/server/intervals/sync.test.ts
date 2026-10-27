import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../crypto";
import { createDb, type DB } from "../db/client";
import { athleteProfile, user } from "../db/schema";
import { createPlanFromInput, getActivePlan } from "../plans/service";
import { IntervalsError, type IntervalsApi } from "./client";
import { connectIntervals, disconnectIntervals, getIntervalsStatus, getWellnessSummary, syncIntervals } from "./sync";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

let db: DB;
const USER = "runner";

// Fake intervals.icu: one easy run that matches the plan, an indoor run, a walk and a strength session.
const fakeApi = (key: string): IntervalsApi => ({
  async getAthlete() {
    if (key !== "good-key-123456") throw new IntervalsError("intervals.icu rejected the API key.", 401);
    return { id: "i664964", name: "Test Athlete" };
  },
  async listActivities() {
    return [
      { id: "a-run", start_date_local: "2026-10-30T07:00:00", type: "Run", name: "Morning Run", distance: 3100, moving_time: 1260, average_heartrate: 148, icu_training_load: 30 },
      { id: "a-indoor", start_date_local: "2026-10-30T19:00:00", type: "VirtualRun", name: "Treadmill", distance: 2000, moving_time: 1160 },
      { id: "a-walk", start_date_local: "2026-10-29T12:00:00", type: "Walk", distance: 2500, moving_time: 1800 },
      { id: "a-gym", start_date_local: "2026-10-29T18:00:00", type: "Workout", name: "Strength", moving_time: 2700, average_heartrate: 110 },
    ];
  },
  async listWellness() {
    return [
      { id: "2026-10-28", restingHR: 52, ctl: 20, atl: 25 },
      { id: "2026-10-29", restingHR: 54, ctl: 20.5, atl: 26 },
      { id: "2026-10-30", restingHR: 50, ctl: 21, atl: 24 },
    ];
  },
});

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values({ id: USER, name: "Runner", email: "runner@example.com" });
  await createPlanFromInput(db, USER, {
    goal: "half",
    raceDate: "2027-01-17",
    startDate: "2026-10-27",
    experience: "intermediate",
    currentWeeklyKm: 15,
    runDays: ["wed", "fri", "sun"],
    longRunDay: "sun",
    strength: { sessionsPerWeek: 3, days: ["mon", "tue", "thu"], equipment: "gym" },
    intensity: "balanced",
  });
});

describe("crypto", () => {
  it("round-trips and never stores the plain key", () => {
    const sealed = encryptSecret("good-key-123456");
    expect(sealed).not.toContain("good-key");
    expect(decryptSecret(sealed)).toBe("good-key-123456");
    expect(encryptSecret("x")).not.toBe(encryptSecret("x")); // random IV
  });
});

describe("intervals.icu sync", () => {
  it("rejects a bad key and stores nothing", async () => {
    await expect(connectIntervals(db, USER, "wrong-key-000000", "", fakeApi)).rejects.toBeInstanceOf(IntervalsError);
    expect((await getIntervalsStatus(db, USER)).connected).toBe(false);
  });

  it("connects with a good key and stores it encrypted", async () => {
    const athlete = await connectIntervals(db, USER, "good-key-123456", "", fakeApi);
    expect(athlete.name).toBe("Test Athlete");
    const [row] = await db.select().from(athleteProfile).where(eq(athleteProfile.userId, USER));
    expect(row.intervalsApiKeyEnc).not.toContain("good-key");
    expect(row.intervalsAthleteId).toBe("i664964");
  });

  it("syncs activities and wellness, then ticks off matching workouts", async () => {
    const result = await syncIntervals(db, USER, "2026-10-30", fakeApi);
    expect(result).toMatchObject({ activities: 4, wellnessDays: 3 });

    const saved = await getActivePlan(db, USER);
    const all = saved!.plan.weeks.flatMap((w) => w.workouts);
    const friRun = all.find((w) => w.date === "2026-10-30" && w.kind === "run")!;
    const thuStrength = all.find((w) => w.date === "2026-10-29" && w.kind === "strength")!;
    expect(saved!.progress[friRun.id]).toMatchObject({ status: "completed", activityId: "a-run" });
    expect(saved!.progress[thuStrength.id]).toMatchObject({ status: "completed", activityId: "a-gym" });
    expect(result.matched).toBe(2);

    // Syncing again is idempotent
    expect((await syncIntervals(db, USER, "2026-10-30", fakeApi)).matched).toBe(0);
    expect((await getIntervalsStatus(db, USER)).lastSyncedAt).not.toBeNull();
  });

  it("summarises wellness against the previous days", async () => {
    const w = await getWellnessSummary(db, USER, "2026-10-30");
    expect(w).toMatchObject({ date: "2026-10-30", restingHr: 50, restingHrBaseline: 53, ctl: 21, atl: 24 });
  });

  it("disconnects, deletes synced data and keeps workouts done", async () => {
    await disconnectIntervals(db, USER);
    expect((await getIntervalsStatus(db, USER)).connected).toBe(false);
    expect(await getWellnessSummary(db, USER, "2026-10-30")).toBeNull();
    const saved = await getActivePlan(db, USER);
    const friRun = saved!.plan.weeks.flatMap((w) => w.workouts).find((w) => w.date === "2026-10-30" && w.kind === "run")!;
    expect(saved!.progress[friRun.id]).toMatchObject({ status: "completed", activityId: null });
  });
});
