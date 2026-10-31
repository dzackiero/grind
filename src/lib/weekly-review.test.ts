import { describe, expect, it } from "vitest";
import type { CoachingProfile } from "./coaching";
import {
  buildWeeklyReview,
  maxConsecutiveDays,
  recoveryTrend,
  selectWeek,
  type ReviewWorkout,
  type WellnessDay,
} from "./weekly-review";

// 2026-10-19 is a Monday.
const W = "2026-10-19";
const none: CoachingProfile = { preferences: {}, constraints: {} };

let n = 0;
const workout = (date: string, type: string, over: Partial<ReviewWorkout> = {}): ReviewWorkout => ({
  workoutId: `w${n++}-${date}-${type}`,
  date,
  kind: type === "strength" ? "strength" : "run",
  type,
  title: type,
  status: "planned",
  plannedKm: type === "strength" ? null : 8,
  actualKm: null,
  linked: false,
  ...over,
});
const done = (date: string, type: string, km = 8) =>
  workout(date, type, { status: "completed", actualKm: km, linked: true });

const review = (over: Partial<Parameters<typeof buildWeeklyReview>[0]>) =>
  buildWeeklyReview({
    weekStart: W,
    today: "2026-10-26",
    workouts: [],
    weeklyKm: [],
    wellness: [],
    coaching: none,
    ...over,
  });

// Tempo, hills and long run on Mon, Tue and Sat of the week starting `start`.
const hardWeek = (monday: string) => {
  const [y, m, d] = monday.split("-").map(Number);
  const at = (offset: number) =>
    new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  return [done(at(0), "tempo"), done(at(1), "hills"), done(at(5), "long")];
};

describe("selectWeek", () => {
  it("uses the Monday of a requested date", () => {
    expect(selectWeek("2026-10-25", "2026-11-02", [])).toBe(W);
  });
  it("defaults to last week when it had planned workouts, else the current week", () => {
    expect(selectWeek(undefined, "2026-10-27", ["2026-10-20"])).toBe(W);
    expect(selectWeek(undefined, "2026-10-27", ["2026-10-27"])).toBe("2026-10-26");
    expect(selectWeek(undefined, "2026-10-27", [])).toBe("2026-10-26");
  });
});

describe("maxConsecutiveDays", () => {
  it("finds the longest run of adjacent dates", () => {
    expect(maxConsecutiveDays([])).toBe(0);
    expect(maxConsecutiveDays(["2026-10-19", "2026-10-21", "2026-10-22", "2026-10-23"])).toBe(3);
  });
});

describe("completion and key sessions", () => {
  it("separates completed, skipped, missed and upcoming", () => {
    const r = review({
      today: "2026-10-22",
      workouts: [
        done("2026-10-20", "easy"),
        workout("2026-10-21", "tempo", { status: "skipped" }),
        workout("2026-10-19", "strength"),
        workout("2026-10-24", "long"),
      ],
    });
    expect(r.week).toMatchObject({
      start: W,
      end: "2026-10-25",
      isCurrent: true,
      isComplete: false,
    });
    expect(r.completion).toMatchObject({
      planned: 4,
      completed: 1,
      matched: 1,
      skipped: 1,
      missed: 2,
      upcoming: 1,
      completionRatio: 0.25,
    });
    expect(r.keySessions.missed.map((s) => s.type)).toEqual(["tempo"]);
  });

  it("handles an empty week", () => {
    const r = review({});
    expect(r.completion.planned).toBe(0);
    expect(r.completion.completionRatio).toBeNull();
    expect(r.suggestedAdjustments).toEqual([]);
    expect(r.recovery).toBeNull();
    expect(r.load.changePct).toBeNull();
  });
});

describe("load change", () => {
  it("compares with the previous week and is null without a baseline", () => {
    const weeklyKm = [
      { weekStart: "2026-10-12", km: 20 },
      { weekStart: W, km: 25 },
    ];
    expect(review({ weeklyKm }).load).toMatchObject({ changeKm: 5, changePct: 25 });
    expect(review({ weeklyKm: [{ weekStart: W, km: 25 }] }).load.changePct).toBeNull();
    expect(
      review({
        weeklyKm: [
          { weekStart: "2026-10-12", km: 0 },
          { weekStart: W, km: 5 },
        ],
      }).load.changePct,
    ).toBeNull();
  });

  it("suggests trimming next week's long run on a spike", () => {
    const next = workout("2026-10-31", "long", { plannedKm: 20 });
    const r = review({
      weeklyKm: [
        { weekStart: "2026-10-12", km: 20 },
        { weekStart: W, km: 25 },
      ],
      workouts: [next],
    });
    const s = r.suggestedAdjustments.find((a) => a.code === "load_spike");
    expect(s?.changes).toEqual([
      { op: "replace_run", workoutId: next.workoutId, as: "long", distanceKm: 18 },
    ]);
    expect(s?.reason).toMatch(/25%/);
  });
});

describe("missed key sessions", () => {
  it("moves a missed long run to a free day this week", () => {
    const long = workout("2026-10-20", "long");
    const r = review({
      today: "2026-10-22",
      workouts: [long, done("2026-10-21", "easy"), workout("2026-10-23", "easy")],
    });
    const s = r.suggestedAdjustments[0];
    expect(s.code).toBe("long_run_missed");
    expect(s.changes).toEqual([{ op: "move", workoutId: long.workoutId, toDate: "2026-10-22" }]);
    expect(s.status).toBe("ready");
  });

  it("prefers the long run day and never picks a constraint-blocked day", () => {
    const long = workout("2026-10-20", "long");
    const blocked = review({
      today: "2026-10-22",
      workouts: [long],
      coaching: { preferences: { longRunDay: "sat" }, constraints: { restDays: ["sat"] } },
    });
    expect(blocked.suggestedAdjustments[0].changes).toEqual([
      { op: "move", workoutId: long.workoutId, toDate: "2026-10-22" },
    ]);
    const preferred = review({
      today: "2026-10-22",
      workouts: [long],
      coaching: { preferences: { longRunDay: "sun" }, constraints: {} },
    });
    expect(preferred.suggestedAdjustments[0].changes).toEqual([
      { op: "move", workoutId: long.workoutId, toDate: "2026-10-25" },
    ]);
    expect(preferred.suggestedAdjustments[0].reason).toMatch(/sun/i);
  });

  it("gives advice only once the week is over", () => {
    const r = review({ today: "2026-10-27", workouts: [workout("2026-10-25", "long")] });
    expect(r.week.isComplete).toBe(true);
    expect(r.suggestedAdjustments).toHaveLength(1);
    expect(r.suggestedAdjustments[0]).toMatchObject({ code: "long_run_missed", changes: [] });
  });

  it("flags missed quality sessions separately", () => {
    const r = review({ today: "2026-10-22", workouts: [workout("2026-10-21", "intervals")] });
    expect(r.suggestedAdjustments[0].code).toBe("quality_missed");
  });
});

describe("hard days and weeks", () => {
  it("counts consecutive hard days from completed sessions", () => {
    const r = review({ workouts: hardWeek(W) });
    expect(r.intensity.hardDays).toHaveLength(3);
    expect(r.intensity.maxConsecutiveHardDays).toBe(2);
    expect(r.intensity.weeks[0].hard).toBe(true);
  });

  it("eases next week after two hard weeks in a row", () => {
    const quality = workout("2026-10-27", "tempo");
    const r = review({ workouts: [...hardWeek(W), ...hardWeek("2026-10-12"), quality] });
    expect(r.intensity.hardWeekStreak).toBe(2);
    const s = r.suggestedAdjustments.find((a) => a.code === "hard_weeks_in_a_row");
    expect(s?.changes).toEqual([{ op: "replace_run", workoutId: quality.workoutId, as: "easy" }]);
  });

  it("is not a streak after one hard week", () => {
    const r = review({ workouts: [...hardWeek(W), done("2026-10-13", "easy")] });
    expect(r.intensity.hardWeekStreak).toBe(1);
    expect(r.suggestedAdjustments.find((a) => a.code === "hard_weeks_in_a_row")).toBeUndefined();
  });

  it("suggests separating upcoming back-to-back hard days", () => {
    const second = workout("2026-10-28", "intervals");
    const r = review({
      today: "2026-10-26",
      workouts: [workout("2026-10-27", "tempo"), second, workout("2026-10-31", "long")],
    });
    const s = r.suggestedAdjustments.find((a) => a.code === "hard_days_back_to_back");
    // Thu 29th is the first free day that does not touch another hard day.
    expect(s?.changes).toEqual([{ op: "move", workoutId: second.workoutId, toDate: "2026-10-29" }]);
  });
});

describe("recovery", () => {
  const day = (date: string, over: Partial<WellnessDay> = {}): WellnessDay => ({
    date,
    restingHr: null,
    hrv: null,
    sleepSecs: null,
    sleepScore: null,
    ...over,
  });

  it("is null with no data in the week", () => {
    expect(recoveryTrend([day("2026-10-01", { hrv: 60 })], W)).toBeNull();
  });

  it("keeps missing fields null, with units and source", () => {
    const r = recoveryTrend(
      [day("2026-10-20", { restingHr: 50 }), day("2026-10-05", { restingHr: 48 })],
      W,
    )!;
    expect(r.hrv).toEqual({ current: null, baseline: null, change: null });
    expect(r.restingHr).toMatchObject({ current: 50, baseline: 48, change: 2 });
    expect(r.trend).toBeNull();
    expect(r.units.restingHr).toBe("bpm");
    expect(r.source).toMatch(/intervals/);
  });

  it("is strained when two signals worsen and eases next week", () => {
    const quality = workout("2026-10-28", "tempo");
    const r = review({
      workouts: [quality],
      wellness: [
        day("2026-10-20", { restingHr: 58, hrv: 40, sleepSecs: 7 * 3600 }),
        day("2026-10-05", { restingHr: 50, hrv: 60, sleepSecs: 7.5 * 3600 }),
      ],
    });
    expect(r.recovery?.trend).toBe("strained");
    expect(r.suggestedAdjustments[0]).toMatchObject({
      code: "recovery_strained",
      changes: [{ op: "replace_run", workoutId: quality.workoutId, as: "easy" }],
    });
  });

  it("merges suggestions that propose the same edit", () => {
    const quality = workout("2026-10-28", "tempo");
    const r = review({
      workouts: [quality, ...hardWeek(W), ...hardWeek("2026-10-12")],
      wellness: [
        day("2026-10-20", { restingHr: 58, hrv: 40 }),
        day("2026-10-05", { restingHr: 50, hrv: 60 }),
      ],
    });
    expect(r.suggestedAdjustments).toHaveLength(1);
    expect(r.suggestedAdjustments[0].reason).toMatch(/hard weeks[\s\S]*Also: [\s\S]*Recovery/);
  });
});
