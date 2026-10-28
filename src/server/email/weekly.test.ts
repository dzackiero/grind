import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DB } from "../db/client";
import { activity, athleteProfile, emailDelivery, habit as habitTable, user } from "../db/schema";
import { createHabit, setHabitDone } from "../habits/service";
import { createPlanFromInput, listWorkouts, setWorkoutStatus } from "../plans/service";
import { setEmailPreferences } from "./preferences";
import { deliverPendingEmails } from "./outbox";
import { queueWeeklyEmails, weeklyWindow } from "./weekly";

let db: DB;
beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "jakarta", name: "Jakarta", email: "jakarta@example.com", emailVerified: true },
    { id: "la", name: "LA", email: "la@example.com", emailVerified: true },
    { id: "unverified", name: "Unverified", email: "unverified@example.com" },
    { id: "off", name: "Off", email: "off@example.com", emailVerified: true },
  ]);
  await db.insert(athleteProfile).values([{ userId: "jakarta", timezone: "Asia/Jakarta" }, { userId: "la", timezone: "America/Los_Angeles" }]);
  for (const id of ["jakarta", "la", "unverified"]) await setEmailPreferences(db, id, { weeklyRecap: true, weeklyPreview: true });
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["Asia/Jakarta", "2026-11-02T00:00:00Z", "weekly-recap", "2026-10-26", "2026-11-01"],
  ["America/Los_Angeles", "2026-11-02T00:00:00Z", null, null, null],
  ["America/Los_Angeles", "2026-11-02T15:00:00Z", "weekly-recap", "2026-10-26", "2026-11-01"],
  ["Asia/Kathmandu", "2026-11-01T11:15:00Z", "weekly-preview", "2026-11-02", "2026-11-08"],
  ["Asia/Jakarta", "2026-11-01T09:45:00Z", null, null, null],
])("uses the athlete's timezone, including DST and fractional offsets: %s %s", (tz, date, kind, from, to) => {
  const window = weeklyWindow(tz as string, new Date(date as string));
  expect(window?.kind ?? null).toBe(kind);
  expect(window?.from ?? null).toBe(from);
  expect(window?.to ?? null).toBe(to);
});

it("queues each eligible local week once, using recorded metrics and habit logs", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-signing-secret-long-enough-123456");
  vi.stubEnv("BETTER_AUTH_URL", "https://grind.test");
  await db.insert(activity).values({ userId: "jakarta", id: "run1", date: "2026-10-28", startLocal: "2026-10-28T07:00:00", type: "Run", distanceM: 5200, raw: {} });
  const habit = await createHabit(db, "jakarta", { name: "Stretch", icon: "check", days: ["wed"] });
  await db.update(habitTable).set({ createdAt: new Date("2026-10-26T00:00:00Z") }).where(eq(habitTable.id, habit.id));
  await setHabitDone(db, "jakarta", habit.id, "2026-10-28", true, "2026-10-28");
  await queueWeeklyEmails(db, new Date("2026-11-02T00:00:00Z"));
  await queueWeeklyEmails(db, new Date("2026-11-02T00:15:00Z"));
  const rows = await db.select().from(emailDelivery);
  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBe("jakarta");
  expect(rows[0].message.text).toContain("5.2 km");
  expect(rows[0].message.text).toContain("Stretch: 1/1");
  expect(rows[0].message.text).toContain("2026-10-26");
  expect(rows[0].message.text).toContain("2026-11-01");
  expect(rows[0].message.unsubscribeUrl).toContain("https://grind.test/api/email/unsubscribe?token=");
  await setEmailPreferences(db, "jakarta", { weeklyRecap: false });
  let calls = 0;
  await deliverPendingEmails(db, { now: new Date("2026-11-02T00:30:00Z"), send: async () => { calls++; return "id"; } });
  expect(calls).toBe(0);
  expect((await db.select().from(emailDelivery))[0].cancelledAt).toBeInstanceOf(Date);
});

it("previews only the upcoming active plan with its week focus and saved workouts", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-signing-secret-long-enough-123456");
  vi.stubEnv("BETTER_AUTH_URL", "https://grind.test");
  const saved = await createPlanFromInput(db, "jakarta", {
    goal: "10k", startDate: "2026-10-26", experience: "intermediate", currentWeeklyKm: 15,
    recentRace: { distanceM: 5000, timeSec: 1661 }, runDays: ["wed", "fri", "sun"], longRunDay: "sun",
    strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" }, intensity: "balanced",
  });
  const workouts = await listWorkouts(db, "jakarta", "2026-11-02", "2026-11-08");
  await setWorkoutStatus(db, "jakarta", workouts[0].key, "skipped");
  await queueWeeklyEmails(db, new Date("2026-11-01T10:00:00Z"));
  const [preview] = (await db.select().from(emailDelivery).where(eq(emailDelivery.kind, "weekly-preview")));
  expect(preview.message.text).toContain(saved.plan.weeks[1].focus);
  expect(preview.message.text).toContain("2026-11-02");
  expect(preview.message.text).toContain(workouts[1].workout.title);
  expect(preview.message.text).not.toContain(`2026-11-02: ${workouts[0].workout.title}`);
});

it("keeps completed training in the recap after its plan is archived", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-signing-secret-long-enough-123456");
  await db.insert(user).values({ id: "archived-athlete", name: "Runner", email: "archive@example.com", emailVerified: true });
  await db.insert(athleteProfile).values({ userId: "archived-athlete", timezone: "Asia/Jakarta" });
  await setEmailPreferences(db, "archived-athlete", { weeklyRecap: true });
  const input = {
    goal: "10k", startDate: "2026-10-26", experience: "intermediate", currentWeeklyKm: 15,
    recentRace: { distanceM: 5000, timeSec: 1661 }, runDays: ["wed", "fri", "sun"], longRunDay: "sun",
    strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" }, intensity: "balanced",
  };
  await createPlanFromInput(db, "archived-athlete", input);
  const [workout] = await listWorkouts(db, "archived-athlete", "2026-10-26", "2026-11-01");
  await setWorkoutStatus(db, "archived-athlete", workout.key, "completed");
  await createPlanFromInput(db, "archived-athlete", { ...input, startDate: "2026-11-02" });
  await queueWeeklyEmails(db, new Date("2026-11-02T00:00:00Z"));
  const [row] = await db.select().from(emailDelivery).where(eq(emailDelivery.userId, "archived-athlete"));
  expect(row.message.text).toContain("Completed plan workouts: 1.");
});
