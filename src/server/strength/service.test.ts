import { beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { createPlanFromInput, getActivePlan } from "../plans/service";
import { lastPerformance, listStrengthSessions, listWorkoutSets, saveExerciseSets, StrengthLogError } from "./service";

let db: DB;
const LATER = "2027-06-30"; // after every workout in the plan, so nothing counts as "not yet happened"
const set = (reps: number | null, weightKg: number | null, done = true) => ({ reps, weightKg, seconds: null, done });

let strength: { id: string; date: string; exercises: { id: string; name: string }[] }[] = [];
let runKey = "";

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "lifter", name: "Lifter", email: "lifter@example.com" },
    { id: "other", name: "Other", email: "other@example.com" },
  ]);
  await createPlanFromInput(db, "lifter", {
    goal: "half", raceDate: "2027-01-17", startDate: "2026-10-27", experience: "intermediate", currentWeeklyKm: 15,
    runDays: ["wed", "fri", "sun"], longRunDay: "sun", strength: { sessionsPerWeek: 3, days: ["mon", "tue", "thu"], equipment: "gym" }, intensity: "balanced",
  });
  const all = (await getActivePlan(db, "lifter"))!.plan.weeks.flatMap((w) => w.workouts);
  strength = all.flatMap((w) => (w.kind === "strength" ? [{ id: w.id, date: w.date, exercises: w.exercises.map((e) => ({ id: e.id, name: e.name })) }] : []));
  runKey = all.find((w) => w.kind === "run")!.id;
});

describe("saving sets", () => {
  it("saves the sets of a planned exercise and lists them, replacing on the next save", async () => {
    const w = strength[0];
    const ex = w.exercises[0];
    await saveExerciseSets(db, "lifter", w.id, { exerciseId: ex.id, exerciseName: "ignored", sets: [set(8, 50), set(8, 50, false)] }, LATER);
    let logged = await listWorkoutSets(db, "lifter", w.id);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ exerciseId: ex.id, exerciseName: ex.name });
    expect(logged[0].sets.map((s) => [s.position, s.reps, s.weightKg, s.done])).toEqual([[1, 8, 50, true], [2, 8, 50, false]]);

    await saveExerciseSets(db, "lifter", w.id, { exerciseId: ex.id, exerciseName: ex.name, sets: [set(10, 52.5)] }, LATER);
    logged = await listWorkoutSets(db, "lifter", w.id);
    expect(logged[0].sets).toEqual([{ position: 1, reps: 10, weightKg: 52.5, seconds: null, done: true }]);
  });

  it("keeps each exercise's sets apart", async () => {
    const w = strength[0];
    await saveExerciseSets(db, "lifter", w.id, { exerciseId: w.exercises[1].id, exerciseName: "x", sets: [set(5, 60)] }, LATER);
    const logged = await listWorkoutSets(db, "lifter", w.id);
    expect(logged.map((l) => l.exerciseId).sort()).toEqual([w.exercises[0].id, w.exercises[1].id].sort());
  });

  it("clears an exercise when saved with no sets", async () => {
    const w = strength[0];
    await saveExerciseSets(db, "lifter", w.id, { exerciseId: w.exercises[1].id, exerciseName: "x", sets: [] }, LATER);
    expect((await listWorkoutSets(db, "lifter", w.id)).map((l) => l.exerciseId)).toEqual([w.exercises[0].id]);
  });

  it("accepts empty weights and reps, since only the tick matters to some", async () => {
    const w = strength[1];
    await saveExerciseSets(db, "lifter", w.id, { exerciseId: w.exercises[0].id, exerciseName: "x", sets: [set(null, null, true)] }, LATER);
    expect((await listWorkoutSets(db, "lifter", w.id))[0].sets[0]).toMatchObject({ reps: null, weightKg: null, done: true });
  });

  it("refuses bad input, unknown exercises, run workouts and workouts that haven't happened", async () => {
    const w = strength[0];
    await expect(saveExerciseSets(db, "lifter", w.id, { exerciseId: w.exercises[0].id, exerciseName: "x", sets: [set(8, -5)] }, LATER)).rejects.toBeInstanceOf(ZodError);
    await expect(saveExerciseSets(db, "lifter", w.id, { exerciseId: "not-here", exerciseName: "Mystery", sets: [set(8, 50)] }, LATER)).rejects.toThrow(/isn't part of this workout/);
    await expect(saveExerciseSets(db, "lifter", runKey, { exerciseId: "x", exerciseName: "x", sets: [] }, LATER)).rejects.toThrow(/Only strength/);
    await expect(saveExerciseSets(db, "lifter", w.id, { exerciseId: w.exercises[0].id, exerciseName: "x", sets: [set(8, 50)] }, "2020-01-01")).rejects.toThrow(/hasn't happened/);
    await expect(saveExerciseSets(db, "lifter", "no-such-workout", { exerciseId: "x", exerciseName: "x", sets: [] }, LATER)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps logs private to their owner", async () => {
    const w = strength[0];
    await expect(saveExerciseSets(db, "other", w.id, { exerciseId: w.exercises[0].id, exerciseName: "x", sets: [set(8, 50)] }, LATER)).rejects.toMatchObject({ status: 404 });
    expect(await listWorkoutSets(db, "other", w.id)).toEqual([]);
  });
});

describe("exercises the athlete adds", () => {
  const id = "custom-abcd1234";

  it("saves an extra exercise under the name given and lists it after the planned ones", async () => {
    const w = strength[2];
    await saveExerciseSets(db, "lifter", w.id, { exerciseId: w.exercises[0].id, exerciseName: "x", sets: [set(8, 40)] }, LATER);
    await saveExerciseSets(db, "lifter", w.id, { exerciseId: id, exerciseName: "Pull-up", sets: [set(6, null)] }, LATER);
    const logged = await listWorkoutSets(db, "lifter", w.id);
    expect(logged.map((l) => l.exerciseName)).toEqual([w.exercises[0].name, "Pull-up"]);
  });

  it("removes it again with an empty list", async () => {
    const w = strength[2];
    await saveExerciseSets(db, "lifter", w.id, { exerciseId: id, exerciseName: "Pull-up", sets: [] }, LATER);
    expect((await listWorkoutSets(db, "lifter", w.id)).map((l) => l.exerciseId)).not.toContain(id);
  });

  it("limits how many extra exercises a workout can hold", async () => {
    const w = strength[3];
    for (let i = 0; i < 20; i++) await saveExerciseSets(db, "lifter", w.id, { exerciseId: `custom-extra${String(i).padStart(2, "0")}`, exerciseName: `Extra ${i}`, sets: [set(5, 10)] }, LATER);
    await expect(saveExerciseSets(db, "lifter", w.id, { exerciseId: "custom-onetoomany", exerciseName: "Too many", sets: [set(5, 10)] }, LATER)).rejects.toThrow(/up to 20 extra/);
    // changing one that is already there still works
    await expect(saveExerciseSets(db, "lifter", w.id, { exerciseId: "custom-extra00", exerciseName: "Extra 0", sets: [set(6, 12)] }, LATER)).resolves.toBeTruthy();
  });
});

describe("lastPerformance", () => {
  it("returns the ticked sets of the latest earlier day for each exercise name, and nothing for unticked or later ones", async () => {
    const earlier = strength[4];
    const later = strength[5];
    const name = earlier.exercises[0].name;
    await saveExerciseSets(db, "lifter", earlier.id, { exerciseId: earlier.exercises[0].id, exerciseName: name, sets: [set(8, 40), set(8, 45), set(6, 50, false)] }, LATER);

    const found = await lastPerformance(db, "lifter", [name, "Nothing logged"], later.date);
    expect(found[name]).toEqual({ date: earlier.date, sets: [{ reps: 8, weightKg: 40, seconds: null }, { reps: 8, weightKg: 45, seconds: null }] });
    expect(found["Nothing logged"]).toBeUndefined();
    // not before the day itself
    expect((await lastPerformance(db, "lifter", [name], earlier.date))[name]).toBeUndefined();
    // and not for someone else
    expect(await lastPerformance(db, "other", [name], later.date)).toEqual({});
    expect(await lastPerformance(db, "lifter", [], later.date)).toEqual({});
  });
});

describe("listStrengthSessions", () => {
  it("groups the logged sets by workout, oldest first, within the dates asked for", async () => {
    const all = await listStrengthSessions(db, "lifter", { from: "2026-01-01", to: LATER });
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all.map((s) => s.date)).toEqual([...all.map((s) => s.date)].sort());
    const first = all.find((s) => s.workoutId === strength[0].id)!;
    expect(first.exercises[0].sets).toHaveLength(1);
    const narrow = await listStrengthSessions(db, "lifter", { from: strength[4].date, to: strength[4].date });
    expect(narrow.map((s) => s.workoutId)).toEqual([strength[4].id]);
    expect(await listStrengthSessions(db, "other", { from: "2026-01-01", to: LATER })).toEqual([]);
  });
});

describe("StrengthLogError", () => {
  it("carries the status to answer with", () => {
    expect(new StrengthLogError("x").status).toBe(409);
    expect(new StrengthLogError("x", 404).status).toBe(404);
  });
});
