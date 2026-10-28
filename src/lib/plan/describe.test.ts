import { describe, expect, it } from "vitest";
import { describeExercises, describeRunSteps, describeWorkoutDetails } from "./describe";
import type { RunWorkout, StrengthWorkout } from "./schema";

const strength: StrengthWorkout = { id: "s1", date: "2026-11-02", title: "Upper Body", description: "Keep control.", coachNote: "Adjusted after your last session.", kind: "strength", type: "strength", focus: "upper", durationMin: [30, 40], exercises: [{ id: "push", group: "A", name: "Push-up", sets: 3, reps: 8, perSide: false, restSec: 60, load: "bodyweight", rir: 0, cue: "Keep the elbows close." }] };

describe("workout descriptions for proposal review", () => {
  it("preserves RIR zero and exercise cues in the review text", () => {
    expect(describeExercises(strength)).toEqual(["A1 Push-up: 3 x 8, rest 60s, bodyweight, RIR 0. Keep the elbows close."]);
    const withoutRir = structuredClone(strength);
    delete withoutRir.exercises[0].rir;
    expect(describeExercises(withoutRir)[0]).not.toContain("RIR");
  });
  it("includes metadata and full exercises when the title and exercise count stay the same", () => {
    const after = structuredClone(strength);
    after.exercises[0].sets = 4;
    after.exercises[0].rir = 2;
    expect(describeWorkoutDetails(strength)).toEqual([
      "Upper Body · 2026-11-02", "Strength · upper · 30–40 min, 1 exercises", "Keep control.", "Coach note: Adjusted after your last session.", "A1 Push-up: 3 x 8, rest 60s, bodyweight, RIR 0. Keep the elbows close.",
    ]);
    expect(describeWorkoutDetails(after).at(-1)).toContain("4 x 8, rest 60s, bodyweight, RIR 2");
    expect(describeWorkoutDetails(null)).toEqual([]);
  });
  it("shows both run measures, zone, effort, pace and step notes", () => {
    const run: RunWorkout = { id: "r1", date: "2026-11-03", title: "Easy", description: "", kind: "run", type: "easy", distanceKm: 5, estDurationMin: 30, steps: [{ kind: "steady", distanceM: 5000, durationSec: 1800, target: { zone: "E", pace: { minSecPerKm: 300, maxSecPerKm: 360 }, effort: "Conversational" }, note: "Stay relaxed" }] };
    expect(describeRunSteps(run)[0]).toBe("Steady run 5 km (30 min) at 5:00–6:00/km [E] · Conversational · Stay relaxed");
    expect(describeWorkoutDetails(run)[1]).toBe("Run · easy · 5 km, about 30 min");
  });
});
