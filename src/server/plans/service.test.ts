import { beforeAll, describe, expect, it } from "vitest";
import { generatePlan, type PlanInput } from "@/lib/plan";
import { createAuth } from "../auth/create-auth";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { createPlanFromInput, getActivePlan, listWorkouts, PlanValidationError, savePlan, setWorkoutStatus } from "./service";

const input: PlanInput = {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 15,
  recentRace: { distanceM: 5000, timeSec: 27 * 60 + 41 },
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 3, days: ["mon", "tue", "thu"], equipment: "gym" },
  intensity: "balanced",
};

let db: DB;

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "u1", name: "Runner One", email: "one@example.com" },
    { id: "u2", name: "Runner Two", email: "two@example.com" },
  ]);
});

describe("plans service", () => {
  it("saves a generated plan and loads it back unchanged", async () => {
    const saved = await createPlanFromInput(db, "u1", input);
    const loaded = await getActivePlan(db, "u1");
    expect(loaded?.id).toBe(saved.id);
    expect(loaded?.plan).toEqual(generatePlan(input));
    expect(Object.values(loaded!.progress).every((p) => p.status === "planned")).toBe(true);
  });

  it("archives the previous plan when a new one is saved", async () => {
    const first = await getActivePlan(db, "u1");
    const second = await createPlanFromInput(db, "u1", { ...input, goal: "10k", raceDate: undefined });
    const active = await getActivePlan(db, "u1");
    expect(active?.id).toBe(second.id);
    expect(active?.id).not.toBe(first?.id);
    expect(active?.plan.goal).toBe("10k");
  });

  it("rejects a plan that fails validation and keeps the old one", async () => {
    const before = await getActivePlan(db, "u1");
    const bad = generatePlan(input);
    bad.weeks[3].workouts = bad.weeks[3].workouts.map((w) => ({ ...w, date: "2030-01-01" }));
    await expect(savePlan(db, "u1", bad)).rejects.toBeInstanceOf(PlanValidationError);
    expect((await getActivePlan(db, "u1"))?.id).toBe(before?.id);
  });

  it("lists workouts by date and updates their status", async () => {
    await createPlanFromInput(db, "u1", input);
    const week2 = await listWorkouts(db, "u1", "2026-11-02", "2026-11-08");
    expect(week2.length).toBeGreaterThan(3);
    expect(week2.map((w) => w.date)).toEqual([...week2.map((w) => w.date)].sort());

    const key = week2[0].key;
    expect(await setWorkoutStatus(db, "u1", key, "completed")).toBe(true);
    const after = await getActivePlan(db, "u1");
    expect(after?.progress[key].status).toBe("completed");
    expect(after?.progress[key].completedAt).not.toBeNull();
  });

  it("keeps users' plans separate", async () => {
    expect(await getActivePlan(db, "u2")).toBeNull();
    const [someWorkout] = await listWorkouts(db, "u1", "2026-11-02", "2026-11-08");
    expect(await setWorkoutStatus(db, "u2", someWorkout.key, "skipped")).toBe(false);
    expect(await listWorkouts(db, "u2", "2026-11-02", "2026-11-08")).toEqual([]);
  });
});

describe("auth", () => {
  it("signs up and signs in with email and password", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    const auth = createAuth(db);

    const signUp = await auth.api.signUpEmail({ body: { name: "Dzaky", email: "runner@example.com", password: "long-enough-pw" } });
    expect(signUp.user.email).toBe("runner@example.com");

    const res = await auth.api.signInEmail({ body: { email: "runner@example.com", password: "long-enough-pw" }, asResponse: true });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(signUp.user.id);

    // The new user can own a plan
    const saved = await createPlanFromInput(db, signUp.user.id, input);
    expect(saved.plan.weeks).toHaveLength(12);
  });

  it("rejects a wrong password", async () => {
    const auth = createAuth(db);
    const res = await auth.api.signInEmail({ body: { email: "runner@example.com", password: "wrong-password" }, asResponse: true });
    expect(res.status).toBe(401);
  });
});
