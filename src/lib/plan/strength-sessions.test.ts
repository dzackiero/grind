import { describe, expect, it } from "vitest";
import { generatePlan } from "./generate";
import {
  ExerciseSchema,
  PhaseSchema,
  StrengthFocusSchema,
  WorkoutSchema,
  type PlanInput,
  type StrengthWorkout,
} from "./schema";
import { buildStrength } from "./strength-sessions";
import { validatePlan } from "./validate";

const focuses = [
  "legs_core",
  "upper",
  "full",
  "lower",
  "push",
  "pull",
  "legs",
  "core",
  "posterior_chain",
  "chest_back",
  "shoulders_arms",
] as const;
const input: PlanInput = {
  goal: "5k",
  startDate: "2026-11-02",
  experience: "intermediate",
  currentWeeklyKm: 20,
  runDays: ["tue", "thu", "sun"],
  longRunDay: "sun",
  intensity: "balanced",
  strength: { sessionsPerWeek: 0, days: [], equipment: "gym" },
};

describe("strength focuses", () => {
  for (const focus of focuses) {
    it(`accepts ${focus} in saved workouts`, () => {
      expect(StrengthFocusSchema.safeParse(focus).success).toBe(true);
    });
    for (const equipment of ["gym", "bodyweight"] as const)
      for (const phase of PhaseSchema.options)
        it(`builds ${focus} with ${equipment} in ${phase}`, () => {
          const workout = buildStrength({
            id: "s",
            date: "2026-11-02",
            focus: focus as StrengthWorkout["focus"],
            phase,
            equipment,
            level: "intermediate",
          });
          expect(WorkoutSchema.safeParse(workout).success).toBe(true);
          expect(workout.exercises.length).toBeGreaterThanOrEqual(2);
          if (equipment === "bodyweight")
            expect(workout.exercises.every((exercise) => exercise.load === "bodyweight")).toBe(
              true,
            );
        });
  }

  for (const focus of ["upper", "push", "pull", "core", "chest_back", "shoulders_arms"] as const)
    it(`does not warn about legs for ${focus} before a hard run`, () => {
      const plan = generatePlan(input);
      plan.weeks[0].workouts = [
        buildStrength({
          id: "s",
          date: "2026-11-02",
          focus: focus as StrengthWorkout["focus"],
          phase: "base",
          equipment: "gym",
          level: "intermediate",
        }),
        {
          id: "r",
          date: "2026-11-03",
          title: "Tempo",
          description: "",
          kind: "run",
          type: "tempo",
          distanceKm: 3,
          estDurationMin: 20,
          steps: [{ kind: "steady", distanceM: 3000 }],
        },
      ];
      const result = validatePlan(plan);
      expect(result.errors.some((issue) => issue.code === "SCHEMA")).toBe(false);
      expect(result.warnings.some((issue) => issue.code === "LEGS_BEFORE_HARD")).toBe(false);
    });

  for (const focus of ["legs_core", "full", "lower", "legs", "posterior_chain"] as const)
    it(`warns about ${focus} before a hard run`, () => {
      const plan = generatePlan(input);
      plan.weeks[0].workouts = [
        buildStrength({
          id: "s",
          date: "2026-11-02",
          focus: focus as StrengthWorkout["focus"],
          phase: "base",
          equipment: "gym",
          level: "intermediate",
        }),
        {
          id: "r",
          date: "2026-11-03",
          title: "Tempo",
          description: "",
          kind: "run",
          type: "tempo",
          distanceKm: 3,
          estDurationMin: 20,
          steps: [{ kind: "steady", distanceM: 3000 }],
        },
      ];
      expect(validatePlan(plan).warnings.some((issue) => issue.code === "LEGS_BEFORE_HARD")).toBe(
        true,
      );
    });

  it.each([
    ["push", /press|push-up|triceps/i, /row|squat|lunge|deadlift/i],
    ["pull", /row|pulldown|curl/i, /press|push-up|squat|lunge/i],
    ["core", /plank|dead bug|hold|bird dog/i, /bench press|shoulder press|squat|deadlift/i],
    ["posterior_chain", /deadlift|bridge|hamstring|hip thrust/i, /bench press|push-up/i],
    ["shoulders_arms", /press|curl|triceps|raise/i, /squat|lunge|deadlift/i],
  ] as const)("keeps %s exercises focused", (focus, included, excluded) => {
    for (const equipment of ["gym", "bodyweight"] as const) {
      const workout = buildStrength({
        id: "s",
        date: "2026-11-02",
        focus: focus as StrengthWorkout["focus"],
        phase: "peak",
        equipment,
        level: "intermediate",
      });
      expect(workout.exercises.some((exercise) => included.test(exercise.name))).toBe(true);
      expect(workout.exercises.some((exercise) => excluded.test(exercise.name))).toBe(false);
    }
  });

  it("preserves optional reps in reserve and rejects values outside the supported range", () => {
    const exercise = buildStrength({
      id: "s",
      date: "2026-11-02",
      focus: "upper",
      phase: "base",
      equipment: "gym",
      level: "intermediate",
    }).exercises[0];
    expect(ExerciseSchema.parse({ ...exercise, rir: 0 })).toHaveProperty("rir", 0);
    expect(ExerciseSchema.parse({ ...exercise, rir: 5 })).toHaveProperty("rir", 5);
    for (const rir of [-1, 6, 1.5])
      expect(ExerciseSchema.safeParse({ ...exercise, rir }).success).toBe(false);
  });
});
