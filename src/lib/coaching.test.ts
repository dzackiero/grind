import { describe, expect, it } from "vitest";
import { generatePlan, type Plan, type RunWorkout, type Workout } from "./plan";
import { CoachingProfileSchema, validateCoaching } from "./coaching";

function planWith(workouts: Workout[], startDate = "2026-11-02"): Plan {
  const plan = generatePlan({ goal: "half", startDate, raceDate: "2027-01-17", experience: "intermediate", currentWeeklyKm: 15, runDays: ["wed", "fri", "sun"], longRunDay: "sun", strength: { sessionsPerWeek: 0, days: [], equipment: "gym" }, intensity: "balanced" });
  plan.weeks = [{ ...plan.weeks[0], startDate, workouts }];
  return plan;
}
function run(type: RunWorkout["type"], date = "2026-11-04"): RunWorkout {
  return { id: `${type}-${date}`, date, title: "A session", description: "", kind: "run", type, distanceKm: 5, estDurationMin: 30, steps: [{ kind: "steady", distanceM: 5000, target: { zone: "E" } }] };
}
const strength: Workout = { id: "strength", date: "2026-11-05", title: "Strength", description: "", kind: "strength", type: "strength", focus: "upper", durationMin: [20, 30], exercises: [] };

describe("coaching profile schema", () => {
  it("preserves an empty profile without invented rules", () => {
    expect(CoachingProfileSchema.parse({})).toEqual({ preferences: {}, constraints: {} });
    expect(validateCoaching(planWith([run("hills")]), CoachingProfileSchema.parse({}))).toEqual({ ok: true, errors: [], warnings: [] });
  });
  it("rejects duplicates, unsupported rules, race patterns, and out of range fields", () => {
    for (const rules of [{ runDays: ["mon", "mon"] }, { strengthDays: Array(8).fill("mon") }, { qualityOnlyLastWeeks: 0 }, { strengthSessionsPerWeek: 6 }, { runTypeByDay: { mon: "race" } }, { runTypeByDay: { monday: "easy" } }, { unknown: true }]) {
      expect(CoachingProfileSchema.safeParse({ constraints: rules }).success).toBe(false);
    }
  });
});

describe("coaching validation", () => {
  it("distinguishes hard constraints from soft preferences with workout context", () => {
    const result = validateCoaching(planWith([run("hills")]), CoachingProfileSchema.parse({ constraints: { allowHills: false }, preferences: { runDays: ["sun"] } }));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ severity: "error", code: "COACHING_CONSTRAINT", rule: "allowHills", workoutId: "hills-2026-11-04", week: 1 })]);
    expect(result.warnings).toEqual([expect.objectContaining({ severity: "warning", code: "COACHING_PREFERENCE", rule: "runDays" })]);
  });
  it("checks run patterns and strength schedule and focus", () => {
    const result = validateCoaching(planWith([run("long"), strength]), CoachingProfileSchema.parse({ constraints: { longRunDay: "sun", runTypeByDay: { wed: "easy" }, strengthDays: ["mon"], strengthFocusByDay: { thu: "legs_core" } } }));
    expect(result.errors.map((issue) => issue.rule)).toEqual(["longRunDay", "runTypeByDay", "strengthDays", "strengthFocusByDay"]);
  });
  it("exempts races from run patterns but respects explicit rest days", () => {
    const result = validateCoaching(planWith([run("race", "2027-01-17")]), CoachingProfileSchema.parse({ constraints: { runDays: ["mon"], runTypeByDay: { sun: "easy" }, restDays: ["sun"] } }));
    expect(result.errors.map((issue) => issue.rule)).toEqual(["restDays"]);
  });
  it("detects progressive long runs from work steps including repeats, never titles", () => {
    const easy = run("long"); easy.title = "Progressive long run";
    const progressive = run("long", "2026-11-08");
    progressive.steps = [{ kind: "repeat", times: 2, steps: [{ kind: "work", durationSec: 60, target: { zone: "M" } }] }];
    const result = validateCoaching(planWith([easy, progressive]), CoachingProfileSchema.parse({ constraints: { allowProgressiveLongRun: false } }));
    expect(result.errors.map((issue) => issue.workoutId)).toEqual([progressive.id]);
  });
  it("limits quality to the requested final weeks relative to race day", () => {
    const result = validateCoaching(planWith([run("tempo", "2027-01-02"), run("intervals", "2027-01-03"), run("hills", "2027-01-18")]), CoachingProfileSchema.parse({ constraints: { qualityOnlyLastWeeks: 2 } }));
    expect(result.errors.map((issue) => issue.workoutId)).toEqual(["tempo-2027-01-02", "hills-2027-01-18"]);
  });
  it("ignores elapsed workouts and partial weeks when checking weekly strength counts", () => {
    const plan = planWith([run("hills"), strength]);
    const profile = CoachingProfileSchema.parse({ constraints: { allowHills: false, strengthSessionsPerWeek: 2 } });
    expect(validateCoaching(plan, profile, "2026-11-06").errors).toEqual([]);
    expect(validateCoaching(plan, profile, "2026-11-02").errors.map((issue) => issue.rule)).toEqual(["allowHills", "strengthSessionsPerWeek"]);
    expect(validateCoaching(plan, profile, "2026-11-04").errors.map((issue) => issue.rule)).toEqual(["allowHills"]);
  });
  it("skips incomplete first and last plan weeks for strength frequency", () => {
    const plan = planWith([], "2026-11-04");
    plan.weeks[0].startDate = "2026-11-02";
    expect(validateCoaching(plan, CoachingProfileSchema.parse({ constraints: { strengthSessionsPerWeek: 2 } })).errors).toEqual([]);
  });
});
