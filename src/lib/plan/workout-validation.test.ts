import { expect, it } from "vitest";
import { ExerciseSchema } from "./schema";

it("requires a repetition or timed prescription for a custom exercise", () => {
  const base = { id: "press", name: "Dumbbell press", group: "A", sets: 3, restSec: 90, load: "moderate" };
  expect(ExerciseSchema.safeParse(base).success).toBe(false);
  expect(ExerciseSchema.safeParse({ ...base, reps: 8 }).success).toBe(true);
  expect(ExerciseSchema.safeParse({ ...base, durationSec: 30 }).success).toBe(true);
});
