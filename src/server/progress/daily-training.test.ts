import { beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DB } from "../db/client";
import { activity, historicalWorkout, plan, plannedWorkout, user, workoutActivity } from "../db/schema";
import { createPlanFromInput } from "../plans/service";
import { listAdditionalTraining } from "./history-list";

let db: DB;
let currentPlanId: string;
beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "daily-a", name: "A", email: "daily-a@example.com" },
    { id: "daily-b", name: "B", email: "daily-b@example.com" },
  ]);
  const input = {
    goal: "10k", startDate: "2026-10-26", experience: "intermediate", currentWeeklyKm: 15,
    recentRace: { distanceM: 5000, timeSec: 1661 }, runDays: ["wed", "fri", "sun"], longRunDay: "sun",
    strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" }, intensity: "balanced",
  };
  const archived = await createPlanFromInput(db, "daily-a", input);
  const current = await createPlanFromInput(db, "daily-a", input);
  currentPlanId = current.id;
  const oldWorkouts = await db.select().from(plannedWorkout).where(eq(plannedWorkout.planId, archived.id));
  const newWorkouts = await db.select().from(plannedWorkout).where(eq(plannedWorkout.planId, current.id));
  const [matched, legacy, otherDate, staleLegacy] = newWorkouts;
  for (const w of [matched, legacy, staleLegacy]) await db.update(plannedWorkout).set({ date: "2026-10-28" }).where(eq(plannedWorkout.id, w.id));
  await db.update(plannedWorkout).set({ date: "2026-10-29" }).where(eq(plannedWorkout.id, otherDate.id));
  await db.update(plannedWorkout).set({ activityId: "legacy" }).where(eq(plannedWorkout.id, legacy.id));
  await db.update(plannedWorkout).set({ activityId: "history-linked" }).where(eq(plannedWorkout.id, staleLegacy.id));
  const records = [
    ["matched-1", "Run", "06:00"], ["matched-2", "Run", "07:00"], ["legacy", "Run", "08:00"],
    ["extra-run", "Run", "09:00"], ["walk", "Walk", "10:00"], ["workout", "Workout", "11:00"],
    ["archive", "Run", "12:00"], ["history-linked", "WeightTraining", "13:00"], ["other-date", "Walk", "14:00"],
  ];
  await db.insert(activity).values(records.map(([id, type, time]) => ({ userId: "daily-a", id, type, date: "2026-10-28", startLocal: `2026-10-28T${time}:00`, name: id, distanceM: id === "walk" ? 1800 : null, movingTimeSec: 1200, raw: {} })));
  await db.insert(activity).values([
    { userId: "daily-a", id: "earlier", type: "Walk", date: "2026-10-27", startLocal: "2026-10-27T23:55:00", raw: {} },
    { userId: "daily-a", id: "later", type: "Run", date: "2026-10-29", startLocal: "2026-10-29T00:05:00", raw: {} },
    { userId: "daily-b", id: "extra-run", type: "Ride", name: "Private ride", date: "2026-10-28", startLocal: "2026-10-28T09:00:00", raw: {} },
  ]);
  const [history] = await db.insert(historicalWorkout).values([
    { userId: "daily-a", date: "2026-10-28", kind: "strength", title: "Extra upper body", requestKey: "linked" },
    { userId: "daily-a", date: "2026-10-28", kind: "strength", title: "Manual mobility", requestKey: "manual" },
  ]).returning();
  await db.insert(workoutActivity).values([
    { userId: "daily-a", activityId: "matched-1", plannedWorkoutId: matched.id },
    { userId: "daily-a", activityId: "matched-2", plannedWorkoutId: matched.id },
    { userId: "daily-a", activityId: "archive", plannedWorkoutId: oldWorkouts[0].id },
    { userId: "daily-a", activityId: "other-date", plannedWorkoutId: otherDate.id },
    { userId: "daily-a", activityId: "history-linked", historyId: history.id },
  ]);
});

it("shows all additional training on its recorded local date, including walks, archived-plan activities and manual sessions", async () => {
  const rows = await listAdditionalTraining(db, "daily-a", "2026-10-28", "2026-10-28");
  expect(rows.map((row) => row.id)).toEqual([
    "activity:extra-run", "activity:walk", "activity:workout", "activity:archive", "activity:history-linked", "activity:other-date", expect.stringMatching(/^history:/),
  ]);
  expect(rows.find((row) => row.id === "activity:walk")).toMatchObject({ distanceM: 1800, movingTimeSec: 1200 });
  expect(rows.find((row) => row.id === "activity:history-linked")).toMatchObject({ historyTitle: "Extra upper body" });
  expect(rows.at(-1)?.title).toBe("Manual mobility");
});

it("orders the selected date range and keeps users separate", async () => {
  const rows = await listAdditionalTraining(db, "daily-a", "2026-10-27", "2026-10-29");
  expect(rows[0].id).toBe("activity:earlier");
  expect(rows.at(-1)?.id).toBe("activity:later");
  const other = await listAdditionalTraining(db, "daily-b", "2026-10-28", "2026-10-28");
  expect(other).toHaveLength(1);
  expect(other[0].title).toBe("Private ride");
});

it("does not lose activities after the history page limit", async () => {
  await db.insert(activity).values(Array.from({ length: 54 }, (_, index) => ({
    userId: "daily-a", id: `busy-day-${index}`, type: "Walk", date: "2026-10-30", startLocal: "2026-10-30T10:00:00", raw: {},
  })));
  expect(await listAdditionalTraining(db, "daily-a", "2026-10-30", "2026-10-30")).toHaveLength(54);
});

it("does not change plan status or mark a scheduled workout complete while reading activities", async () => {
  const before = await db.select().from(plannedWorkout).where(eq(plannedWorkout.planId, currentPlanId));
  await listAdditionalTraining(db, "daily-a", "2026-10-28", "2026-10-28");
  expect(await db.select().from(plannedWorkout).where(eq(plannedWorkout.planId, currentPlanId))).toEqual(before);
  expect((await db.select().from(plan).where(eq(plan.id, currentPlanId)))[0].status).toBe("active");
});

it("rejects invalid dates instead of shifting activities to another day", async () => {
  await expect(listAdditionalTraining(db, "daily-a", "2026-02-31", "2026-10-28")).rejects.toThrow();
  await expect(listAdditionalTraining(db, "daily-a", "2026-10-29", "2026-10-28")).rejects.toThrow();
});
