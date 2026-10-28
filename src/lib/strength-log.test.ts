import { describe, expect, it } from "vitest";
import { CUSTOM_EXERCISE_ID, estimatedOneRepMax, ExerciseSetsSchema, formatWeight, lastSetText, lastTimeText, newCustomExerciseId, parseAmount, rowsFromLogged, rowsToSets, startingRows, summariseExercise } from "./strength-log";

describe("formatWeight and parseAmount", () => {
  it("drops trailing zeros and shows nothing for no weight", () => {
    expect(formatWeight(60)).toBe("60");
    expect(formatWeight(62.5)).toBe("62.5");
    expect(formatWeight(62.50001)).toBe("62.5");
    expect(formatWeight(null)).toBe("");
  });

  it("reads what was typed, with a comma as the decimal mark", () => {
    expect(parseAmount("62,5")).toBe(62.5);
    expect(parseAmount(" 8 ", true)).toBe(8);
    expect(parseAmount("7.6", true)).toBe(8);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});

describe("ExerciseSetsSchema", () => {
  const set = { reps: 8, weightKg: 60, seconds: null, done: true };

  it("accepts sets with empty fields, since everything is optional", () => {
    const ok = ExerciseSetsSchema.safeParse({ exerciseId: "squat", exerciseName: "Goblet squat", sets: [{ reps: null, weightKg: null, seconds: null, done: false }, set] });
    expect(ok.success).toBe(true);
  });

  it("refuses an empty name, too many sets, and numbers outside sensible bounds", () => {
    expect(ExerciseSetsSchema.safeParse({ exerciseId: "x", exerciseName: "  ", sets: [] }).success).toBe(false);
    expect(ExerciseSetsSchema.safeParse({ exerciseId: "x", exerciseName: "Squat", sets: Array(21).fill(set) }).success).toBe(false);
    expect(ExerciseSetsSchema.safeParse({ exerciseId: "x", exerciseName: "Squat", sets: [{ ...set, weightKg: -1 }] }).success).toBe(false);
    expect(ExerciseSetsSchema.safeParse({ exerciseId: "x", exerciseName: "Squat", sets: [{ ...set, reps: 1.5 }] }).success).toBe(false);
    expect(ExerciseSetsSchema.safeParse({ exerciseId: "x", exerciseName: "Squat", sets: [{ ...set, weightKg: 5000 }] }).success).toBe(false);
  });

  it("allows no sets at all, which clears the exercise", () => {
    expect(ExerciseSetsSchema.safeParse({ exerciseId: "x", exerciseName: "Squat", sets: [] }).success).toBe(true);
  });
});

describe("custom exercise ids", () => {
  it("makes ids that pass the custom pattern", () => {
    for (let i = 0; i < 20; i++) expect(newCustomExerciseId()).toMatch(CUSTOM_EXERCISE_ID);
    expect("squat").not.toMatch(CUSTOM_EXERCISE_ID);
  });
});

describe("startingRows", () => {
  it("makes the planned number of sets with the planned reps and nothing ticked", () => {
    const rows = startingRows({ sets: 3, reps: 8 });
    expect(rows).toEqual([
      { weight: "", amount: "8", done: false },
      { weight: "", amount: "8", done: false },
      { weight: "", amount: "8", done: false },
    ]);
  });

  it("uses seconds for an exercise held for time", () => {
    expect(startingRows({ sets: 2, durationSec: 45 })[0].amount).toBe("45");
  });

  it("starts from the weight used last time, set by set, and the heaviest for extra sets", () => {
    const last = { date: "2026-10-20", sets: [{ reps: 8, weightKg: 50, seconds: null }, { reps: 8, weightKg: 55, seconds: null }] };
    expect(startingRows({ sets: 3, reps: 8 }, last).map((r) => r.weight)).toEqual(["50", "55", "55"]);
  });
});

describe("rows and sets", () => {
  it("turns saved sets into rows in order, and back into sets to save", () => {
    const rows = rowsFromLogged([
      { position: 2, reps: 6, weightKg: 62.5, seconds: null, done: false },
      { position: 1, reps: 8, weightKg: 60, seconds: null, done: true },
    ], false);
    expect(rows).toEqual([{ weight: "60", amount: "8", done: true }, { weight: "62.5", amount: "6", done: false }]);
    expect(rowsToSets(rows, false)).toEqual([
      { reps: 8, weightKg: 60, seconds: null, done: true },
      { reps: 6, weightKg: 62.5, seconds: null, done: false },
    ]);
  });

  it("keeps seconds for timed exercises and leaves reps empty", () => {
    expect(rowsToSets([{ weight: "", amount: "45", done: true }], true)).toEqual([{ reps: null, weightKg: null, seconds: 45, done: true }]);
    expect(rowsFromLogged([{ position: 1, reps: null, weightKg: null, seconds: 45, done: true }], true)[0].amount).toBe("45");
  });

  it("turns empty boxes into nulls", () => {
    expect(rowsToSets([{ weight: "", amount: "", done: false }], false)).toEqual([{ reps: null, weightKg: null, seconds: null, done: false }]);
  });
});

describe("estimatedOneRepMax", () => {
  it("uses Epley and refuses high-rep sets", () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 5)).toBe(116.7);
    expect(estimatedOneRepMax(100, 20)).toBeNull();
    expect(estimatedOneRepMax(null, 5)).toBeNull();
    expect(estimatedOneRepMax(100, 0)).toBeNull();
  });
});

describe("summariseExercise", () => {
  it("counts ticked sets, adds up volume and finds the heaviest set", () => {
    const s = summariseExercise([
      { reps: 8, weightKg: 60, done: true },
      { reps: 6, weightKg: 65, done: true },
      { reps: 6, weightKg: 70, done: false },
    ]);
    expect(s).toEqual({ setsDone: 2, setsTotal: 3, volumeKg: 870, topSet: { weightKg: 65, reps: 6 } });
  });

  it("gives the tie to the set with more reps, and no top set for bodyweight work", () => {
    expect(summariseExercise([{ reps: 5, weightKg: 60, done: true }, { reps: 8, weightKg: 60, done: true }]).topSet).toEqual({ weightKg: 60, reps: 8 });
    expect(summariseExercise([{ reps: 12, weightKg: null, done: true }]).topSet).toBeNull();
    expect(summariseExercise([]).setsTotal).toBe(0);
  });
});

describe("lastTimeText", () => {
  it("describes the heaviest set, or just the sets and reps without weights", () => {
    expect(lastTimeText({ date: "2026-10-20", sets: [{ reps: 8, weightKg: 50, seconds: null }, { reps: 6, weightKg: 55, seconds: null }] })).toBe("55 kg × 6 · 2 sets");
    expect(lastTimeText({ date: "2026-10-20", sets: [{ reps: 8, weightKg: 62.5, seconds: null }] })).toBe("62.5 kg × 8 · 1 set");
    expect(lastTimeText({ date: "2026-10-20", sets: [{ reps: 12, weightKg: null, seconds: null }, { reps: 12, weightKg: null, seconds: null }] })).toBe("2 × 12");
    expect(lastTimeText({ date: "2026-10-20", sets: [{ reps: null, weightKg: null, seconds: 45 }] })).toBe("1 × 45 s");
  });
});

describe("lastSetText", () => {
  it("shows weight and reps for a table cell", () => {
    expect(lastSetText({ reps: 8, weightKg: 32.5, seconds: null })).toBe("32.5 × 8");
    expect(lastSetText({ reps: 8, weightKg: 40, seconds: null })).toBe("40 × 8");
  });

  it("copes with bodyweight sets, holds and nothing there", () => {
    expect(lastSetText({ reps: 12, weightKg: null, seconds: null })).toBe("× 12");
    expect(lastSetText({ reps: 12, weightKg: 0, seconds: null })).toBe("× 12");
    expect(lastSetText({ reps: null, weightKg: null, seconds: 45 })).toBe("45 s");
    expect(lastSetText({ reps: null, weightKg: 10, seconds: 30 })).toBe("10 × 30 s");
    expect(lastSetText({ reps: null, weightKg: 20, seconds: null })).toBe("20");
    expect(lastSetText(undefined)).toBe("–");
  });
});
