import { describe, expect, it } from "vitest";
import { goalDistanceM, goalForDistanceKm, goalLabel } from "./goal";
import { generatePlan, PlanInputSchema, validatePlan, type PlanInput } from "./index";
import type { RunWorkout } from "./schema";

const base: PlanInput = {
  goal: "10k",
  goalDistanceKm: 15,
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 25,
  recentRace: { distanceM: 5000, timeSec: 27 * 60 + 41 },
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 0, days: [], equipment: "gym" },
  intensity: "balanced",
};

describe("custom goal distance", () => {
  it("maps a distance to the nearest standard template", () => {
    expect(goalForDistanceKm(3)).toBe("5k");
    expect(goalForDistanceKm(7.5)).toBe("5k");
    expect(goalForDistanceKm(15)).toBe("10k");
    expect(goalForDistanceKm(21)).toBe("half");
    expect(goalForDistanceKm(30)).toBe("half");
    expect(goalForDistanceKm(35)).toBe("marathon");
  });

  it("keeps the standard distances and labels without a custom distance", () => {
    expect(goalDistanceM({ goal: "half" })).toBe(21097.5);
    expect(goalLabel({ goal: "half" })).toBe("Half Marathon");
    expect(goalLabel({ goal: "10k", goalDistanceKm: 12.5 })).toBe("12.5K");
  });

  it("rejects distances outside the range and a goal that doesn't fit the distance", () => {
    expect(PlanInputSchema.safeParse({ ...base, goalDistanceKm: 2 }).success).toBe(false);
    expect(PlanInputSchema.safeParse({ ...base, goalDistanceKm: 50 }).success).toBe(false);
    expect(PlanInputSchema.safeParse({ ...base, goal: "marathon" }).success).toBe(false);
  });

  it("plans the race day, label and race pace around the custom distance", () => {
    const plan = generatePlan(base);
    expect(plan.title).toBe("15K Plan");
    expect(plan.goal).toBe("10k");
    const race = plan.weeks.at(-1)!.workouts.find((w) => w.kind === "run" && w.type === "race");
    expect(race).toBeDefined();
    const run = race as RunWorkout;
    expect(run.title).toBe("Race Day: 15K");
    expect(run.distanceKm).toBe(15);
    expect(validatePlan(plan).ok).toBe(true);

    const tenK = generatePlan({ ...base, goalDistanceKm: undefined });
    expect(plan.paces.race.minSecPerKm).toBeGreaterThan(tenK.paces.race.minSecPerKm);
  });
});
