import { beforeAll, expect, it } from "vitest";
import { createDb, type DB } from "../db/client";
import { activity, historicalWorkout, workoutActivity, user } from "../db/schema";
import { listWorkoutHistory } from "./history-list";

let db: DB;
beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com" },
    { id: "b", name: "B", email: "b@example.com" },
  ]);
  await db.insert(activity).values([
    {
      userId: "a",
      id: "one",
      date: "2026-10-10",
      startLocal: "2026-10-10T07:30:00",
      type: "Run",
      name: "Morning",
      distanceM: 5000,
      movingTimeSec: 1500,
      raw: {},
    },
    {
      userId: "a",
      id: "two",
      date: "2026-10-10",
      startLocal: "2026-10-10T08:30:00",
      type: "Run",
      raw: {},
    },
    {
      userId: "b",
      id: "private",
      date: "2026-10-11",
      startLocal: "2026-10-11T08:00:00",
      type: "Run",
      raw: {},
    },
  ]);
  const [linked, manual] = await db
    .insert(historicalWorkout)
    .values([
      { userId: "a", date: "2026-10-10", kind: "run", title: "Easy run", requestKey: "linked" },
      { userId: "a", date: "2025-09-01", kind: "strength", title: "Lifting", requestKey: "manual" },
    ])
    .returning();
  await db.insert(workoutActivity).values([
    { userId: "a", activityId: "one", historyId: linked.id },
    { userId: "a", activityId: "two", historyId: linked.id },
  ]);
  expect(manual).toBeDefined();
});

it("lists each linked activity once, standalone history, and only the viewer's data", async () => {
  const result = await listWorkoutHistory(db, "a", {});
  expect(result.entries.map((e) => e.id)).toEqual([
    "activity:two",
    "activity:one",
    expect.stringMatching(/^history:/),
  ]);
  expect(result.entries[1]).toMatchObject({
    startLocal: "2026-10-10T07:30:00",
    historyTitle: "Easy run",
  });
  expect(result.years).toEqual([2026, 2025]);
});

it("filters by type and date and bounds the page", async () => {
  const filtered = await listWorkoutHistory(db, "a", { type: "strength", year: 2025, month: 9 });
  expect(filtered.entries).toHaveLength(1);
  expect(filtered.entries[0].title).toBe("Lifting");
  expect((await listWorkoutHistory(db, "a", { year: 2025, month: 10 })).entries).toHaveLength(0);
});
