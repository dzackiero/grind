import { describe, expect, it } from "vitest";
import { CoachingProfileSchema, validateCoaching } from "../coaching";
import { addDays, weekdayOf } from "./dates";
import { generatePlan } from "./generate";
import { personalizeGeneratedPlan } from "./personalize";
import type { PlanInput } from "./schema";

const input: PlanInput = {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 25,
  runDays: ["tue", "thu", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 2, days: ["tue", "fri"], equipment: "gym" },
  intensity: "balanced",
};
const plan = generatePlan(input);
const flat = plan.weeks.flatMap((week) => week.workouts);

describe("personalizeGeneratedPlan", () => {
  it("honors no-hills, final-quality and easy-long preferences without changing dates, distances or plan metadata", () => {
    const profile = CoachingProfileSchema.parse({
      preferences: { allowHills: false, qualityOnlyLastWeeks: 2, allowProgressiveLongRun: false },
    });
    const before = JSON.stringify(plan);
    const next = personalizeGeneratedPlan(plan, profile);
    const workouts = next.weeks.flatMap((week) => week.workouts);
    expect(workouts.map((w) => [w.id, w.date, w.kind])).toEqual(
      flat.map((w) => [w.id, w.date, w.kind]),
    );
    expect(
      workouts.filter((w) => w.kind === "run").map((w) => w.kind === "run" && w.distanceKm),
    ).toEqual(flat.filter((w) => w.kind === "run").map((w) => w.kind === "run" && w.distanceKm));
    expect(next.input).toEqual(plan.input);
    expect(next.paces).toEqual(plan.paces);
    expect(next.source).toBe(plan.source);
    expect(next.raceDate).toBe(plan.raceDate);
    expect(workouts.find((w) => w.type === "race")).toEqual(flat.find((w) => w.type === "race"));
    expect(workouts.every((w) => w.type !== "hills")).toBe(true);
    expect(
      workouts
        .filter((w) => w.kind === "run" && ["tempo", "intervals"].includes(w.type))
        .every((w) => w.date >= addDays(plan.raceDate, -14)),
    ).toBe(true);
    expect(validateCoaching(next, profile).warnings).toEqual([]);
    expect(personalizeGeneratedPlan(plan, profile)).toEqual(next);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it("applies run type and strength focus by selected day with mandatory map values taking precedence", () => {
    const profile = CoachingProfileSchema.parse({
      preferences: {
        runTypeByDay: { tue: "tempo", thu: "easy" },
        strengthFocusByDay: { tue: "pull" },
      },
      constraints: { runTypeByDay: { tue: "easy" }, strengthFocusByDay: { tue: "push" } },
    });
    const next = personalizeGeneratedPlan(plan, profile);
    const workouts = next.weeks.flatMap((week) => week.workouts);
    expect(
      workouts
        .filter((w) => w.kind === "run" && weekdayOf(w.date) === "tue")
        .every((w) => w.type === "easy"),
    ).toBe(true);
    expect(
      workouts
        .filter((w) => w.kind === "strength" && weekdayOf(w.date) === "tue")
        .every((w) => w.kind === "strength" && w.focus === "push" && w.title === "Push"),
    ).toBe(true);
    expect(validateCoaching(next, profile).errors).toEqual([]);
  });
  it("lets preferred hill and quality types yield to mandatory restrictions", () => {
    const profile = CoachingProfileSchema.parse({
      preferences: { runTypeByDay: { tue: "hills", thu: "tempo" } },
      constraints: { allowHills: false, qualityOnlyLastWeeks: 2 },
    });
    const next = personalizeGeneratedPlan(plan, profile);
    expect(validateCoaching(next, profile).errors).toEqual([]);
    expect(
      next.weeks[0].workouts
        .filter((w) => w.kind === "run")
        .every((w) => w.type === "easy" || w.type === "long"),
    ).toBe(true);
  });
  it("retains contradictory mandatory run types so validation reports the conflict", () => {
    const profile = CoachingProfileSchema.parse({
      constraints: { runTypeByDay: { tue: "hills" }, allowHills: false, qualityOnlyLastWeeks: 2 },
    });
    const next = personalizeGeneratedPlan(plan, profile);
    const rules = validateCoaching(next, profile).errors.map((issue) => issue.rule);
    expect(rules).toContain("allowHills");
    expect(rules).toContain("qualityOnlyLastWeeks");
    expect(rules).not.toContain("runTypeByDay");
  });
  it("uses mandatory scalar values over preferences and leaves scheduling conflicts visible", () => {
    const profile = CoachingProfileSchema.parse({
      preferences: { allowHills: false },
      constraints: { allowHills: true, restDays: ["tue"] },
    });
    const next = personalizeGeneratedPlan(plan, profile);
    expect(next.weeks.flatMap((w) => w.workouts).some((w) => w.type === "hills")).toBe(true);
    expect(validateCoaching(next, profile).errors.some((issue) => issue.rule === "restDays")).toBe(
      true,
    );
  });
});
