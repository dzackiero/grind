import { addDays } from "./plan/dates";

/*
 * Points reward training that was planned and done, not tapping:
 *   - every completed workout earns points by type; runs earn more the further they are
 *   - a week where at least 80% of the planned workouts are done earns a bonus
 *   - the streak counts finished weeks in a row that reached 80% (a week in progress never breaks it)
 * Tiers follow the design system: Bronze, Silver, Gold, Platinum, Lime.
 */

export const TIERS = [
  { key: "bronze", name: "Bronze", min: 0 },
  { key: "silver", name: "Silver", min: 2000 },
  { key: "gold", name: "Gold", min: 6000 },
  { key: "platinum", name: "Platinum", min: 12000 },
  { key: "lime", name: "Lime", min: 20000 },
] as const;
export type TierKey = (typeof TIERS)[number]["key"];

const BASE_POINTS: Record<string, number> = { easy: 100, hills: 180, tempo: 200, intervals: 220, long: 260, race: 500, strength: 150 };
const POINTS_PER_KM = 12;
export const WEEK_BONUS = 200;
/** Share of a week's planned workouts that must be done for the bonus and the streak */
export const WEEK_TARGET = 0.8;

export function workoutPoints(w: { type: string; distanceKm: number | null }) {
  const runKm = w.type === "strength" ? 0 : (w.distanceKm ?? 0);
  return Math.round((BASE_POINTS[w.type] ?? 100) + POINTS_PER_KM * runKm);
}

export interface PointRow {
  planId: string;
  weekIndex: number;
  /** Monday of the plan week, YYYY-MM-DD */
  weekStart: string;
  type: string;
  distanceKm: number | null;
  status: "planned" | "completed" | "skipped";
}

export interface PointsSummary {
  points: number;
  workoutPoints: number;
  bonusPoints: number;
  completedWorkouts: number;
  weeksHit: number;
  streak: number;
}

export function pointsSummary(rows: readonly PointRow[], activePlanId: string | null, today: string): PointsSummary {
  const weeks = new Map<string, { planId: string; weekStart: string; total: number; done: number }>();
  let earned = 0;
  let completed = 0;
  for (const r of rows) {
    const key = `${r.planId}:${r.weekIndex}`;
    const w = weeks.get(key) ?? { planId: r.planId, weekStart: r.weekStart, total: 0, done: 0 };
    w.total++;
    if (r.status === "completed") {
      w.done++;
      completed++;
      earned += workoutPoints(r);
    }
    weeks.set(key, w);
  }

  const hit = (w: { total: number; done: number }) => w.total > 0 && w.done / w.total >= WEEK_TARGET;
  const hitWeeks = [...weeks.values()].filter(hit);

  // Streak: finished weeks of the active plan, newest first, until one falls short
  const finished = [...weeks.values()]
    .filter((w) => w.planId === activePlanId && addDays(w.weekStart, 6) < today)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  let streak = 0;
  for (const w of finished) {
    if (!hit(w)) break;
    streak++;
  }

  const bonus = hitWeeks.length * WEEK_BONUS;
  return { points: earned + bonus, workoutPoints: earned, bonusPoints: bonus, completedWorkouts: completed, weeksHit: hitWeeks.length, streak };
}

export interface TierStatus {
  tier: (typeof TIERS)[number];
  next: (typeof TIERS)[number] | null;
  /** Points still needed for the next tier */
  remaining: number;
  /** 0–1 progress between this tier's start and the next; 1 at the top tier */
  progress: number;
}

export function tierFor(points: number): TierStatus {
  const p = Math.max(0, points);
  const index = TIERS.reduce((best, t, i) => (p >= t.min ? i : best), 0);
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  if (!next) return { tier, next: null, remaining: 0, progress: 1 };
  return { tier, next, remaining: next.min - p, progress: (p - tier.min) / (next.min - tier.min) };
}
