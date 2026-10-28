import { describe, expect, it } from "vitest";
import { generatePlan } from "./index";
import { addDays } from "./dates";
import { applyChanges, buildChanges, EditOpSchema, weekOfDate } from "./edit";
import type { PlanInput } from "./schema";

const input: PlanInput = {
  goal: "half", raceDate: "2027-01-17", startDate: "2026-10-27", experience: "intermediate",
  currentWeeklyKm: 15, runDays: ["wed", "fri", "sun"], longRunDay: "sun",
  strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" }, intensity: "balanced",
};
const plan = generatePlan(input);
const all = plan.weeks.flatMap(w => w.workouts);
const run = all.find(w => w.kind === "run" && w.type === "easy")!;
const strength = all.find(w => w.kind === "strength")!;
const ctx = { today: "2026-10-28", lockedIds: new Set<string>() };
const changes = (ops: unknown[], context = ctx) => buildChanges(plan, ops.map(op => EditOpSchema.parse(op)), context);
const update = (workoutId: string, patch: unknown) => changes([{ op: "update_workout", workoutId, patch }]);

describe("granular workout edits", () => {
  it("changes metadata and moves a workout across weeks while keeping identity", () => {
    const result = update(run.id, { date: "2026-11-04", title: "Custom run", description: "Enjoy it", coachNote: "Stay relaxed" });
    const next = applyChanges(plan, result);
    expect(next.weeks[1].workouts.find(w => w.id === run.id)).toMatchObject({ date: "2026-11-04", title: "Custom run", coachNote: "Stay relaxed" });
    expect(run.title).not.toBe("Custom run");
  });
  it("rebuilds run distance and type with consistent derived duration", () => {
    expect(update(run.id, { type: "long", distanceKm: 8 })[0].after).toMatchObject({ type: "long", distanceKm: 8, title: "8km Long Run" });
  });
  it("preserves exact fractional distances in easy and long patches", () => {
    for (const type of ["easy", "long"]) {
      expect(update(run.id, { type, distanceKm: 6.1 })[0].after).toMatchObject({ type, distanceKm: 6.1, steps: [{ kind: "steady", distanceM: 6100 }] });
    }
  });
  it("accepts matching fractional custom step distance and rejects rounded declarations", () => {
    const steps = [{ kind: "steady", distanceM: 6100, target: { zone: "E" } }];
    expect(update(run.id, { steps, distanceKm: 6.1 })[0].after).toMatchObject({ distanceKm: 6.1, steps });
    expect(() => update(run.id, { steps, distanceKm: 6 })).toThrow(/distance/i);
  });
  it("derives custom step distance and duration and refuses mismatched distance", () => {
    const steps = [{ kind: "steady", distanceM: 6000, target: { zone: "E" } }];
    const after = update(run.id, { steps })[0].after;
    expect(after).toMatchObject({ distanceKm: 6, steps });
    expect(after?.kind === "run" && after.estDurationMin).toBe(Math.round((plan.paces.E.minSecPerKm + plan.paces.E.maxSecPerKm) / 20));
    expect(() => update(run.id, { steps, distanceKm: 8 })).toThrow(/distance/i);
  });
  it("rebuilds focus prescriptions and honors explicit overrides", () => {
    expect(update(strength.id, { focus: "upper" })[0].after).toMatchObject({ focus: "upper", title: "Upper Body" });
    expect(update(strength.id, { focus: "upper", title: "Pull day", durationMin: [20, 30] })[0].after).toMatchObject({ title: "Pull day", durationMin: [20, 30] });
    if (strength.kind !== "strength") throw new Error("strength fixture missing");
    const exercises = strength.exercises.slice(0, 2).map(exercise => ({ ...exercise, sets: 4, reps: 10, restSec: 90 }));
    expect(update(strength.id, { exercises })[0].after).toMatchObject({ exercises });
  });
  it("reconciles a custom duration step using its explicit target pace", () => {
    const steps = [{ kind: "steady", durationSec: 300, target: { zone: "E", pace: { minSecPerKm: 600, maxSecPerKm: 600 } } }];
    expect(update(run.id, { steps, distanceKm: 0.5 })[0].after).toMatchObject({ distanceKm: 0.5, estDurationMin: 5 });
  });
  it("rejects empty, unknown, irrelevant, reversed duration, and impossible date fields", () => {
    for (const patch of [{}, { wat: 1 }, { date: "2026-11-31" }, { durationMin: [60, 20] }]) {
      expect(() => update(run.id, patch)).toThrow();
    }
    expect(() => update(run.id, { focus: "upper" })).toThrow(/strength/i);
    expect(() => update(strength.id, { steps: [{ kind: "steady", distanceM: 5000 }] })).toThrow(/run/i);
  });
  it("rejects race, locked, past and out of range targets", () => {
    const race = all.find(w => w.type === "race")!;
    expect(() => update(race.id, { title: "No" })).toThrow(/Race/);
    expect(() => changes([{ op: "update_workout", workoutId: run.id, patch: { title: "No" } }], { ...ctx, lockedIds: new Set([run.id]) })).toThrow(/done/);
    expect(() => update(run.id, { date: "2026-10-20" })).toThrow(/past/);
    expect(() => update(run.id, { date: "2027-02-01" })).toThrow(/race/);
  });
  it("refuses legacy mutations of a workout in a past week", () => {
    const pastContext = { ...ctx, today: "2026-11-17" };
    for (const op of [
      { op: "remove", workoutId: run.id },
      { op: "replace_run", workoutId: run.id, as: "easy" },
      { op: "move", workoutId: run.id, toDate: "2026-11-18" },
    ]) expect(() => changes([op], pastContext)).toThrow(/past/);
  });
  it("can add a run or strength session on an earlier day of the current week, but not in a past week", () => {
    const week = weekOfDate(plan, ctx.today)!;
    const earlier = week.startDate < ctx.today ? week.startDate : null;
    // Wednesday 28 Oct, in the week that starts Monday 26 Oct: Monday and Tuesday are still open
    expect(earlier).toBe("2026-10-26");
    for (const date of ["2026-10-26", "2026-10-27"]) {
      expect(() => changes([{ op: "add_run", date, distanceKm: 5 }])).not.toThrow();
      expect(() => changes([{ op: "add_strength", date, focus: "push" }])).not.toThrow();
    }
    expect(() => changes([{ op: "add_run", date: "2026-10-25", distanceKm: 5 }])).toThrow(/past week|outside the plan/);
    expect(() => changes([{ op: "add_run", date: "2026-11-04", distanceKm: 5 }], { ...ctx, today: "2026-11-11" })).toThrow(/past week/);
  });
  it("still allows editing earlier days of the current week", () => {
    const week = weekOfDate(plan, run.date)!;
    const lastDay = addDays(week.startDate, 6);
    expect(() => changes([{ op: "update_workout", workoutId: run.id, patch: { coachNote: "Done differently" } }], { ...ctx, today: lastDay })).not.toThrow();
  });
});

describe("bulk workout edits", () => {
  it("selects by week, dates, weekday, kind and type while skipping locked workouts", () => {
    const result = changes([{ op: "bulk_update_workouts", filter: { weekFrom: 1, weekTo: 3, dateFrom: "2026-10-28", dateTo: "2026-11-15", days: ["fri"], kind: "run", types: ["easy"] }, patch: { coachNote: "Relax" } }], { ...ctx, lockedIds: new Set([run.id]) });
    expect(result).toHaveLength(2);
    expect(result.every(c => c.after?.coachNote === "Relax" && c.after.id !== run.id)).toBe(true);
  });
  it("selects strength focuses and skips race and past workouts", () => {
    const result = changes([{ op: "bulk_update_workouts", filter: { kind: "strength", focuses: ["upper"] }, patch: { focus: "full" } }]);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(c => c.before?.kind === "strength" && c.before.focus === "upper" && c.after?.kind === "strength" && c.after.focus === "full")).toBe(true);
    const runs = changes([{ op: "bulk_update_workouts", filter: { kind: "run" }, patch: { coachNote: "Hi" } }]);
    expect(runs.every(c => c.before?.date && c.before.date >= ctx.today && c.before.type !== "race")).toBe(true);
  });
  it("rejects empty and reversed filters, zero matches and bulk absolute dates", () => {
    for (const filter of [{}, { weekFrom: 5, weekTo: 2 }, { dateFrom: "2026-11-10", dateTo: "2026-11-01" }, { types: [] }, { weekFrom: 30 }]) {
      expect(() => changes([{ op: "bulk_update_workouts", filter, patch: { title: "Hi" } }])).toThrow();
    }
    expect(() => changes([{ op: "bulk_update_workouts", filter: { kind: "run" }, patch: { date: "2026-11-04" } }])).toThrow(/date/i);
  });
  it("keeps the input untouched when a later operation fails", () => {
    const snapshot = JSON.stringify(plan);
    expect(() => changes([{ op: "update_workout", workoutId: run.id, patch: { title: "Changed" } }, { op: "bulk_update_workouts", filter: { kind: "strength" }, patch: { distanceKm: 4 } }])).toThrow();
    expect(JSON.stringify(plan)).toBe(snapshot);
  });
  it("returns one original-to-final change for sequential edits", () => {
    const result = changes([
      { op: "update_workout", workoutId: run.id, patch: { title: "New title" } },
      { op: "bulk_update_workouts", filter: { kind: "run", dateFrom: run.date, dateTo: run.date }, patch: { description: "New description" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].before).toEqual(run);
    expect(result[0].after).toMatchObject({ title: "New title", description: "New description" });
  });
  it("refuses a bulk update exceeding 200 eligible workouts", () => {
    const crowded = { ...plan, weeks: [{ ...plan.weeks[0], workouts: Array.from({ length: 201 }, (_, index) => ({ ...run, id: `run-${index}` })) }] };
    const op = EditOpSchema.parse({ op: "bulk_update_workouts", filter: { kind: "run" }, patch: { title: "Too many" } });
    expect(() => buildChanges(crowded, [op], ctx)).toThrow(/200/);
  });
});
