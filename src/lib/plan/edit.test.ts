import { describe, expect, it } from "vitest";
import {
  applyChanges,
  buildChanges,
  generatePlan,
  PlanEditError,
  staleReason,
  validatePlan,
  type EditOp,
  type Plan,
  type PlanInput,
} from "./index";

const input: PlanInput = {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 15,
  recentRace: { distanceM: 5000, timeSec: 27 * 60 + 41 },
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" },
  intensity: "balanced",
};

const plan: Plan = generatePlan(input);
const ctx = { today: "2026-10-28", lockedIds: new Set<string>() };
const all = plan.weeks.flatMap((w) => w.workouts);
const find = (date: string, kind: "run" | "strength") =>
  all.find((w) => w.date === date && w.kind === kind)!;

function edit(ops: EditOp[], context = ctx) {
  const changes = buildChanges(plan, ops, context);
  return { changes, next: applyChanges(plan, changes) };
}

describe("buildChanges", () => {
  it("moves a workout and keeps its id", () => {
    const hills = find("2026-10-28", "run");
    const { changes, next } = edit([{ op: "move", workoutId: hills.id, toDate: "2026-10-29" }]);
    expect(changes).toHaveLength(1);
    expect(changes[0].after?.date).toBe("2026-10-29");
    expect(next.weeks[0].workouts.find((w) => w.id === hills.id)?.date).toBe("2026-10-29");
    expect(next.source).toBe("coach");
  });

  it("puts a workout moved into another week in that week", () => {
    const easy = find("2026-10-30", "run");
    const { next } = edit([{ op: "move", workoutId: easy.id, toDate: "2026-11-04" }]);
    expect(next.weeks[0].workouts.some((w) => w.id === easy.id)).toBe(false);
    expect(next.weeks[1].workouts.some((w) => w.id === easy.id)).toBe(true);
    // Week totals follow the workouts
    expect(next.weeks[0].targetKm).toBeLessThan(plan.weeks[0].targetKm);
    expect(next.weeks[1].targetKm).toBeGreaterThan(plan.weeks[1].targetKm);
  });

  it("swaps two workouts", () => {
    const a = find("2026-10-28", "run");
    const b = find("2026-10-30", "run");
    const { next } = edit([{ op: "swap", workoutId: a.id, withWorkoutId: b.id }]);
    const flat = next.weeks.flatMap((w) => w.workouts);
    expect(flat.find((w) => w.id === a.id)?.date).toBe("2026-10-30");
    expect(flat.find((w) => w.id === b.id)?.date).toBe("2026-10-28");
  });

  it("removes a workout", () => {
    const easy = find("2026-10-30", "run");
    const { next } = edit([{ op: "remove", workoutId: easy.id }]);
    expect(next.weeks.flatMap((w) => w.workouts).some((w) => w.id === easy.id)).toBe(false);
  });

  it("turns a run into a shorter easy run using the plan's paces", () => {
    const long = find("2026-11-01", "run");
    const { next } = edit([{ op: "replace_run", workoutId: long.id, as: "easy", distanceKm: 4 }]);
    const w = next.weeks.flatMap((x) => x.workouts).find((x) => x.id === long.id)!;
    expect(w).toMatchObject({ kind: "run", type: "easy", distanceKm: 4 });
    expect(w.kind === "run" && w.steps[0]).toMatchObject({
      target: { zone: "E", pace: plan.paces.E },
    });
  });

  it("builds a tempo or interval session at a chosen level", () => {
    const run = find("2026-10-30", "run");
    const { next } = edit([{ op: "replace_run", workoutId: run.id, as: "intervals", level: 2 }]);
    const w = next.weeks.flatMap((x) => x.workouts).find((x) => x.id === run.id)!;
    // Half marathon progression: 5×1000, 6×1000, 4×1200 …, so level 2 is 4 × 1200m
    expect(w).toMatchObject({ type: "intervals", title: "4 × 1200m Intervals" });
  });

  it("adds an easy run and a strength session with fresh ids", () => {
    const { next } = edit([
      { op: "add_run", date: "2026-11-03", distanceKm: 5 },
      { op: "add_strength", date: "2026-11-06", focus: "full" },
    ]);
    const flat = next.weeks.flatMap((w) => w.workouts);
    expect(flat.find((w) => w.id === "coach-2026-11-03-easy-1")).toMatchObject({
      kind: "run",
      distanceKm: 5,
    });
    expect(flat.find((w) => w.id === "coach-2026-11-06-str-full-1")).toMatchObject({
      kind: "strength",
      focus: "full",
    });
  });

  it("produces plans the validator accepts for ordinary edits", () => {
    const { next } = edit([
      { op: "move", workoutId: find("2026-10-30", "run").id, toDate: "2026-10-31" },
    ]);
    expect(validatePlan(next).errors).toEqual([]);
  });

  it("lets the validator catch an edit that creates back-to-back hard days", () => {
    // Long run is Sunday Nov 1; hills on Wednesday. Moving hills to Saturday puts hard days side by side.
    const { next } = edit([
      { op: "move", workoutId: find("2026-10-28", "run").id, toDate: "2026-10-31" },
    ]);
    expect(validatePlan(next).errors.map((e) => e.code)).toContain("BACK_TO_BACK_HARD");
  });
});

describe("edits that are refused", () => {
  const refused = (ops: EditOp[], context = ctx) => expect(() => buildChanges(plan, ops, context));

  it("unknown ids", () => refused([{ op: "remove", workoutId: "nope" }]).toThrow(PlanEditError));
  it("past dates", () =>
    refused([
      { op: "move", workoutId: find("2026-10-30", "run").id, toDate: "2026-10-20" },
    ]).toThrow(/past/));
  it("dates after race day", () =>
    refused([
      { op: "move", workoutId: find("2026-10-30", "run").id, toDate: "2027-02-01" },
    ]).toThrow(/after race day/));
  it("completed workouts", () => {
    const done = find("2026-10-28", "run");
    refused([{ op: "remove", workoutId: done.id }], {
      ...ctx,
      lockedIds: new Set([done.id]),
    }).toThrow(/already done/);
  });
  it("race day", () => {
    const race = all.find((w) => w.kind === "run" && w.type === "race")!;
    refused([{ op: "move", workoutId: race.id, toDate: "2027-01-16" }]).toThrow(/Race day/);
  });
  it("a distance on a structured session", () => {
    refused([
      { op: "replace_run", workoutId: find("2026-10-30", "run").id, as: "tempo", distanceKm: 8 },
    ]).toThrow(/structure/);
  });
  it("a level the plan doesn't have", () => {
    refused([
      { op: "replace_run", workoutId: find("2026-10-30", "run").id, as: "hills", level: 9 },
    ]).toThrow(/levels/);
  });
  it("replacing a strength session with a run", () => {
    refused([
      { op: "replace_run", workoutId: find("2026-10-29", "strength").id, as: "easy" },
    ]).toThrow(/strength session/);
  });
  it("swapping a workout with itself", () => {
    const w = find("2026-10-30", "run");
    refused([{ op: "swap", workoutId: w.id, withWorkoutId: w.id }]).toThrow(/different/);
  });
  it("no changes at all", () => refused([]).toThrow(/No changes/));
});

describe("staleReason", () => {
  it("is null while the plan still matches, and explains when it doesn't", () => {
    const run = find("2026-10-30", "run");
    const { changes } = edit([{ op: "move", workoutId: run.id, toDate: "2026-10-31" }]);
    expect(staleReason(plan, changes)).toBeNull();
    const moved = applyChanges(plan, changes);
    expect(staleReason(moved, changes)).toMatch(/has changed/);
  });
});
