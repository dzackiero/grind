import type { CoachingProfile, CoachingRules } from "./coaching";
import { addDays, daysBetween, mondayOf, weekdayOf, type Weekday } from "./plan/dates";
import type { EditOp } from "./plan/edit";

/*
 * Deterministic weekly review. No model calls: fixed rules turn the athlete's recorded
 * week into facts and small suggested edits. Suggestions are only data; nothing here
 * writes to a plan, and the server dry-runs each one through the plan validator.
 */

export const HARD_RUN_TYPES = ["long", "tempo", "intervals", "hills", "race"] as const;
export const QUALITY_RUN_TYPES = ["tempo", "intervals", "hills"] as const;
/** A week counts as hard with this many hard days, or this much more run km than the week before while it has two. */
export const HARD_WEEK_DAYS = 3;
export const HARD_WEEK_LOAD_RATIO = 1.15;
export const LOAD_SPIKE_RATIO = 1.15;
export const HARD_WEEK_STREAK_TO_EASE = 2;
export const LONG_RUN_TRIM = 0.9;
export const RECOVERY_BASELINE_DAYS = 21;
const RECOVERY_THRESHOLDS = { restingHrBpm: 5, hrvRatio: 0.85, sleepHours: 1 } as const;

const isHard = (type: string) => (HARD_RUN_TYPES as readonly string[]).includes(type);
const isQuality = (type: string) => (QUALITY_RUN_TYPES as readonly string[]).includes(type);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ReviewWorkout {
  workoutId: string;
  date: string;
  kind: "run" | "strength";
  type: string;
  title: string;
  status: "planned" | "completed" | "skipped";
  plannedKm: number | null;
  actualKm: number | null;
  /** A synced activity is linked to this workout. */
  linked: boolean;
}

export interface WellnessDay {
  date: string;
  restingHr: number | null;
  hrv: number | null;
  sleepSecs: number | null;
  sleepScore: number | null;
}

export interface WeeklyKm {
  weekStart: string;
  km: number | null;
}

export interface SuggestedAdjustment {
  code:
    | "long_run_missed"
    | "quality_missed"
    | "hard_weeks_in_a_row"
    | "load_spike"
    | "recovery_strained"
    | "hard_days_back_to_back";
  /** Why, in plain words Claude can pass on to the athlete. */
  reason: string;
  /** Valid input for propose_plan_changes `changes`. Empty means advice only. */
  changes: EditOp[];
  /** The server sets `blocked` when the plan validator rejects the edit (constraints). */
  status: "ready" | "blocked";
  warnings: unknown[];
  blockedBy: unknown[];
}

export interface WeeklyReviewInput {
  weekStart: string;
  today: string;
  /** Planned workouts from three weeks before the review week through the week after it. */
  workouts: ReviewWorkout[];
  /** Actual run km per week, covering the review week and the weeks before it. */
  weeklyKm: WeeklyKm[];
  wellness: WellnessDay[];
  coaching: CoachingProfile;
}

/**
 * The week to review: the one containing `requested`, else last week when it had planned
 * workouts, else the current week. Returns Monday.
 */
export function selectWeek(requested: string | undefined, today: string, plannedDates: string[]) {
  if (requested) return mondayOf(requested);
  const current = mondayOf(today);
  const last = addDays(current, -7);
  return plannedDates.some((d) => d >= last && d < current) ? last : current;
}

export function missed(w: ReviewWorkout, today: string) {
  return w.status === "skipped" || (w.status === "planned" && w.date < today);
}

function inWeek(w: { date: string }, weekStart: string) {
  return w.date >= weekStart && w.date <= addDays(weekStart, 6);
}

function hardDates(workouts: ReviewWorkout[], weekStart: string) {
  return [
    ...new Set(
      workouts
        .filter(
          (w) =>
            inWeek(w, weekStart) && w.kind === "run" && isHard(w.type) && w.status === "completed",
        )
        .map((w) => w.date),
    ),
  ].sort();
}

/** Longest run of calendar-adjacent dates. */
export function maxConsecutiveDays(dates: string[]) {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  sorted.forEach((date, i) => {
    run = i > 0 && daysBetween(sorted[i - 1], date) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

function kmOf(weeklyKm: WeeklyKm[], weekStart: string) {
  return weeklyKm.find((w) => w.weekStart === weekStart)?.km ?? null;
}

function average(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}

export function recoveryTrend(wellness: WellnessDay[], weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const baselineFrom = addDays(weekStart, -RECOVERY_BASELINE_DAYS);
  const week = wellness.filter((r) => r.date >= weekStart && r.date <= weekEnd);
  if (!week.length) return null;
  const base = wellness.filter((r) => r.date >= baselineFrom && r.date < weekStart);
  const hours = (r: WellnessDay) => (r.sleepSecs === null ? null : r.sleepSecs / 3600);
  const stat = (pick: (r: WellnessDay) => number | null) => {
    const current = average(week.map(pick));
    const baseline = average(base.map(pick));
    return {
      current: current === null ? null : round1(current),
      baseline: baseline === null ? null : round1(baseline),
      change: current !== null && baseline !== null ? round1(current - baseline) : null,
    };
  };
  const restingHr = stat((r) => r.restingHr);
  const hrv = stat((r) => r.hrv);
  const sleepHours = stat(hours);
  const sleepScore = stat((r) => r.sleepScore);
  const signals: { signal: string; worse: boolean }[] = [];
  if (restingHr.change !== null)
    signals.push({
      signal: "restingHr",
      worse: restingHr.change >= RECOVERY_THRESHOLDS.restingHrBpm,
    });
  if (hrv.current !== null && hrv.baseline)
    signals.push({
      signal: "hrv",
      worse: hrv.current / hrv.baseline <= RECOVERY_THRESHOLDS.hrvRatio,
    });
  if (sleepHours.change !== null)
    signals.push({
      signal: "sleepHours",
      worse: sleepHours.change <= -RECOVERY_THRESHOLDS.sleepHours,
    });
  const worse = signals.filter((s) => s.worse).map((s) => s.signal);
  return {
    source: "intervals.icu wellness",
    units: { restingHr: "bpm", hrv: "ms", sleepHours: "hours", sleepScore: "score" },
    daysWithData: week.length,
    baselineDays: base.length,
    restingHr,
    hrv,
    sleepHours,
    sleepScore,
    /** `null` when fewer than two signals can be compared with the baseline. */
    trend:
      signals.length < 2 ? null : worse.length >= 2 ? ("strained" as const) : ("steady" as const),
    worseSignals: worse,
  };
}

type Recovery = ReturnType<typeof recoveryTrend>;

/** Whether a run may go on this weekday under one set of rules. */
function dayAllowed(day: Weekday, rules: CoachingRules) {
  return !rules.restDays?.includes(day) && (!rules.runDays || rules.runDays.includes(day));
}

function findFreeDay(opts: {
  workouts: ReviewWorkout[];
  from: string;
  to: string;
  excludeId: string;
  hard: boolean;
  coaching: CoachingProfile;
  preferLongRunDay?: boolean;
}) {
  const { workouts, from, to, excludeId, hard, coaching } = opts;
  const others = workouts.filter((w) => w.workoutId !== excludeId && w.status !== "skipped");
  const runDates = new Set(others.filter((w) => w.kind === "run").map((w) => w.date));
  const hardSet = new Set(
    others.filter((w) => w.kind === "run" && isHard(w.type)).map((w) => w.date),
  );
  const candidates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = weekdayOf(d);
    if (runDates.has(d) || !dayAllowed(day, coaching.constraints)) continue;
    if (hard && (hardSet.has(addDays(d, -1)) || hardSet.has(addDays(d, 1)))) continue;
    candidates.push(d);
  }
  const score = (d: string) => {
    const day = weekdayOf(d);
    const prefs = coaching.preferences;
    let s = 0;
    if (!dayAllowed(day, prefs)) s += 2;
    if (opts.preferLongRunDay && prefs.longRunDay && prefs.longRunDay !== day) s += 1;
    return s;
  };
  return candidates.sort((a, b) => score(a) - score(b) || (a < b ? -1 : 1))[0] ?? null;
}

const adjustment = (
  code: SuggestedAdjustment["code"],
  reason: string,
  changes: EditOp[],
): SuggestedAdjustment => ({ code, reason, changes, status: "ready", warnings: [], blockedBy: [] });

export function buildWeeklyReview(input: WeeklyReviewInput) {
  const { weekStart, today, workouts, weeklyKm, wellness, coaching } = input;
  const weekEnd = addDays(weekStart, 6);
  const week = workouts.filter((w) => inWeek(w, weekStart));
  const done = week.filter((w) => w.status === "completed");
  const missedWorkouts = week.filter((w) => missed(w, today));
  const runs = week.filter((w) => w.kind === "run");
  const plannedRunKm = runs.length ? runs.reduce((s, w) => s + (w.plannedKm ?? 0), 0) : 0;

  const completion = {
    planned: week.length,
    completed: done.length,
    matched: week.filter((w) => w.linked).length,
    skipped: week.filter((w) => w.status === "skipped").length,
    missed: missedWorkouts.length,
    upcoming: week.filter((w) => w.status === "planned" && w.date >= today).length,
    completionRatio: week.length ? Math.round((done.length / week.length) * 100) / 100 : null,
    plannedRunKm: round1(plannedRunKm),
  };

  const keyMissed = missedWorkouts.filter(
    (w) => w.kind === "run" && (w.type === "long" || isQuality(w.type)),
  );

  const runKm = kmOf(weeklyKm, weekStart);
  const previousKm = kmOf(weeklyKm, addDays(weekStart, -7));
  const load = {
    source: "synced_activities",
    units: { runKm: "km", changePct: "percent" },
    runKm: runKm === null ? null : round1(runKm),
    previousRunKm: previousKm === null ? null : round1(previousKm),
    changeKm: runKm !== null && previousKm !== null ? round1(runKm - previousKm) : null,
    changePct:
      runKm !== null && previousKm !== null && previousKm > 0
        ? round1(((runKm - previousKm) / previousKm) * 100)
        : null,
  };

  // Hard weeks, newest first, over the review week and the three before it.
  const weeks = [0, 1, 2, 3].map((i) => {
    const start = addDays(weekStart, -7 * i);
    const days = hardDates(workouts, start);
    const km = kmOf(weeklyKm, start);
    const prev = kmOf(weeklyKm, addDays(start, -7));
    const jump = km !== null && prev !== null && prev > 0 && km / prev >= HARD_WEEK_LOAD_RATIO;
    return {
      weekStart: start,
      hardDays: days.length,
      maxConsecutiveHardDays: maxConsecutiveDays(days),
      runKm: km === null ? null : round1(km),
      hard: days.length >= HARD_WEEK_DAYS || (days.length >= 2 && jump),
    };
  });
  let hardWeekStreak = 0;
  while (hardWeekStreak < weeks.length && weeks[hardWeekStreak].hard) hardWeekStreak++;
  const intensity = {
    hardDays: hardDates(workouts, weekStart),
    maxConsecutiveHardDays: weeks[0].maxConsecutiveHardDays,
    hardWeekStreak,
    weeks,
    definition:
      "Hard day: completed long, tempo, intervals, hills or race run. Hard week: 3+ hard days, or 2+ with run km up 15% or more on the week before.",
  };

  const recovery: Recovery = recoveryTrend(wellness, weekStart);

  // ---- suggestions ----
  const suggestions: SuggestedAdjustment[] = [];
  const claimed = new Set<string>();
  const nextStart = addDays(weekStart, 7);
  const editableTo = addDays(mondayOf(today), 6);
  const upcoming = workouts.filter((w) => w.status === "planned" && w.date >= today);

  for (const w of keyMissed) {
    const isLong = w.type === "long";
    const code = isLong ? "long_run_missed" : "quality_missed";
    const label = isLong ? "long run" : `${w.type} session`;
    const lastDay = weekEnd < today ? null : weekEnd;
    const target =
      lastDay && w.status === "planned" && w.date < today
        ? findFreeDay({
            workouts: week,
            from: today,
            to: lastDay,
            excludeId: w.workoutId,
            hard: true,
            coaching,
            preferLongRunDay: isLong,
          })
        : null;
    if (target && target <= editableTo) {
      claimed.add(w.workoutId);
      suggestions.push(
        adjustment(
          code,
          `${label} missed on ${w.date}: move it to ${weekdayOf(target)} ${target}, which is free and not next to another hard day.`,
          [{ op: "move", workoutId: w.workoutId, toDate: target }],
        ),
      );
    } else {
      suggestions.push(
        adjustment(
          code,
          `${label} missed on ${w.date} and this week has no suitable day left. Don't squeeze it in or stack it onto another hard day; carry on with the plan.`,
          [],
        ),
      );
    }
  }

  const nextWeek = upcoming.filter((w) => w.date >= nextStart && w.date <= addDays(nextStart, 6));
  const easeQuality = (reason: string, code: SuggestedAdjustment["code"]) => {
    const target = nextWeek.find((w) => w.kind === "run" && isQuality(w.type));
    suggestions.push(
      adjustment(
        code,
        reason,
        target ? [{ op: "replace_run", workoutId: target.workoutId, as: "easy" }] : [],
      ),
    );
  };

  if (hardWeekStreak >= HARD_WEEK_STREAK_TO_EASE)
    easeQuality(
      `${hardWeekStreak} hard weeks in a row: ease next week by turning its first quality session into an easy run.`,
      "hard_weeks_in_a_row",
    );

  if (load.changePct !== null && load.changePct > (LOAD_SPIKE_RATIO - 1) * 100) {
    const long = nextWeek.find((w) => w.kind === "run" && w.type === "long");
    const km = long?.plannedKm ? Math.max(2, Math.round(long.plannedKm * LONG_RUN_TRIM)) : null;
    suggestions.push(
      adjustment(
        "load_spike",
        `Run volume rose ${load.changePct}% on the week before: trim next week's long run by about 10%.`,
        long && km && km < (long.plannedKm ?? 0)
          ? [{ op: "replace_run", workoutId: long.workoutId, as: "long", distanceKm: km }]
          : [],
      ),
    );
  }

  if (recovery?.trend === "strained")
    easeQuality(
      `Recovery is trending worse than the previous ${RECOVERY_BASELINE_DAYS} days (${recovery.worseSignals.join(", ")}): ease next week's first quality session.`,
      "recovery_strained",
    );

  // Upcoming back-to-back hard days, limited to the weeks that can still be edited.
  const hardUpcoming = upcoming
    .filter((w) => w.kind === "run" && isHard(w.type) && w.type !== "race")
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 1; i < hardUpcoming.length; i++) {
    const [first, second] = [hardUpcoming[i - 1], hardUpcoming[i]];
    if (daysBetween(first.date, second.date) !== 1 || claimed.has(second.workoutId)) continue;
    const start = mondayOf(second.date);
    const target = findFreeDay({
      workouts: workouts.filter((w) => inWeek(w, start)),
      from: start > today ? start : today,
      to: addDays(start, 6),
      excludeId: second.workoutId,
      hard: true,
      coaching,
      preferLongRunDay: second.type === "long",
    });
    if (!target) continue;
    claimed.add(second.workoutId);
    suggestions.push(
      adjustment(
        "hard_days_back_to_back",
        `${first.title} on ${first.date} and ${second.title} on ${second.date} are back to back: move the second to ${weekdayOf(target)} ${target}.`,
        [{ op: "move", workoutId: second.workoutId, toDate: target }],
      ),
    );
  }

  // Merge suggestions that propose the same edit.
  const merged: SuggestedAdjustment[] = [];
  for (const s of suggestions) {
    const same = s.changes.length
      ? merged.find((m) => JSON.stringify(m.changes) === JSON.stringify(s.changes))
      : undefined;
    if (same) same.reason += ` Also: ${s.reason}`;
    else merged.push(s);
  }

  return {
    week: {
      start: weekStart,
      end: weekEnd,
      isCurrent: today >= weekStart && today <= weekEnd,
      isComplete: today > weekEnd,
    },
    completion,
    keySessions: {
      planned: runs
        .filter((w) => w.type === "long" || isQuality(w.type))
        .map((w) => ({
          workoutId: w.workoutId,
          date: w.date,
          type: w.type,
          title: w.title,
          status: w.status,
        })),
      missed: keyMissed.map((w) => ({
        workoutId: w.workoutId,
        date: w.date,
        type: w.type,
        title: w.title,
        status: w.status,
      })),
    },
    load,
    intensity,
    recovery,
    suggestedAdjustments: merged,
  };
}
