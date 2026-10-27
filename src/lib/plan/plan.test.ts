import { describe, expect, it } from "vitest";
import { addDays, weekdayOf } from "./dates";
import { fitnessFromRace, predictRaceTime } from "./paces";
import { generatePlan, phasesFor, validatePlan, type PlanInput } from "./index";

const base: PlanInput = {
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

describe("paces", () => {
  it("matches published VDOT values", () => {
    expect(fitnessFromRace(5000, 20 * 60)).toBeCloseTo(49.8, 0);
    expect(fitnessFromRace(5000, 25 * 60)).toBeCloseTo(38.3, 0);
  });

  it("predicts a race time that round-trips to the same fitness", () => {
    const t = predictRaceTime(45, 21097.5);
    expect(fitnessFromRace(21097.5, t)).toBeCloseTo(45, 1);
  });
});

describe("phases", () => {
  it("puts lighter weeks every 4th week and taper at the end", () => {
    expect(phasesFor(12, 2)).toEqual(["base", "base", "base", "recovery", "build", "build", "build", "recovery", "peak", "peak", "taper", "taper"]);
  });
});

describe("generatePlan", () => {
  const plan = generatePlan(base);

  it("produces a valid plan with no errors", () => {
    const result = validatePlan(plan);
    expect(result.errors).toEqual([]);
  });

  it("runs 12 weeks to race day and ends with the race", () => {
    expect(plan.weeks).toHaveLength(12);
    const last = plan.weeks.at(-1)!.workouts.filter((w) => w.kind === "run");
    expect(last.at(-1)).toMatchObject({ type: "race", date: "2027-01-17" });
  });

  it("puts long runs on the chosen day", () => {
    const longs = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.kind === "run" && w.type === "long");
    expect(longs.length).toBeGreaterThan(8);
    for (const l of longs) expect(weekdayOf(l.date)).toBe("sun");
  });

  it("skips days before the start date", () => {
    for (const w of plan.weeks[0].workouts) expect(w.date >= "2026-10-27").toBe(true);
  });

  it("schedules the Runna-style strength split", () => {
    const focuses = plan.weeks[2].workouts.filter((w) => w.kind === "strength").map((w) => (w.kind === "strength" ? w.focus : ""));
    expect(focuses.sort()).toEqual(["full", "legs_core", "upper"]);
  });

  it("gives a faster optimistic estimate than the conservative one", () => {
    expect(plan.estimatedRaceTimeSec.low).toBeLessThan(plan.estimatedRaceTimeSec.high);
  });
});

describe("every template combination is valid", () => {
  const goals = ["5k", "10k", "half", "marathon"] as const;
  const levels = ["beginner", "intermediate", "advanced"] as const;
  const intensities = ["steady", "balanced", "push"] as const;
  const daySets: { runDays: PlanInput["runDays"]; longRunDay: PlanInput["longRunDay"] }[] = [
    { runDays: ["tue", "thu", "sat"], longRunDay: "sat" },
    { runDays: ["mon", "wed", "fri", "sun"], longRunDay: "sun" },
    { runDays: ["mon", "tue", "thu", "sat", "sun"], longRunDay: "sun" },
    { runDays: ["mon", "tue", "wed", "thu", "fri", "sun"], longRunDay: "sun" },
  ];

  for (const goal of goals)
    for (const experience of levels)
      for (const intensity of intensities)
        for (const days of daySets) {
          it(`${goal} ${experience} ${intensity} ${days.runDays.length} days`, () => {
            const plan = generatePlan({
              ...base,
              goal,
              experience,
              intensity,
              raceDate: undefined,
              recentRace: undefined,
              currentWeeklyKm: { beginner: 10, intermediate: 25, advanced: 45 }[experience],
              ...days,
              strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "bodyweight" },
            });
            const { errors } = validatePlan(plan);
            expect(errors).toEqual([]);
          });
        }
});

describe("4–5 strength sessions", () => {
  it.each([4, 5])("schedules %i sessions a week with leg days apart", (n) => {
    const days = (["mon", "tue", "wed", "thu", "sat"] as const).slice(0, n);
    const plan = generatePlan({ ...base, strength: { sessionsPerWeek: n, days: [...days], equipment: "gym" } });
    expect(validatePlan(plan).errors).toEqual([]);
    const week = plan.weeks[4].workouts.filter((w) => w.kind === "strength");
    expect(week).toHaveLength(n);
    const focuses = week.map((w) => (w.kind === "strength" ? w.focus : ""));
    expect(focuses.filter((f) => f === "upper")).toHaveLength(2);
    expect(focuses.filter((f) => f === "legs_core")).toHaveLength(2);
  });
});

describe("validatePlan catches bad edits", () => {
  it("rejects back-to-back hard days", () => {
    const plan = generatePlan(base);
    const week = plan.weeks[5];
    const long = week.workouts.find((w) => w.kind === "run" && w.type === "long")!;
    const easy = week.workouts.find((w) => w.kind === "run" && w.type === "easy")!;
    if (easy.kind === "run") easy.type = "tempo";
    easy.date = addDays(long.date, -1); // hard session the day before the long run
    const { errors } = validatePlan(plan);
    expect(errors.map((e) => e.code)).toContain("BACK_TO_BACK_HARD");
  });

  it("reports schema problems with a path", () => {
    const { ok, errors } = validatePlan({ version: 1 });
    expect(ok).toBe(false);
    expect(errors[0].code).toBe("SCHEMA");
  });
});
