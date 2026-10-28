/*
 * Match synced activities to planned workouts.
 * - Run workouts match run activities (Run, TrailRun, VirtualRun, Treadmill); strength matches WeightTraining/Workout.
 * - Same local date only, closest distance wins. A run on a different date must not complete this day's workout.
 * - An activity matches at most one workout; existing links are kept; skipped workouts are left alone.
 */

export const RUN_ACTIVITY_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);
export const STRENGTH_ACTIVITY_TYPES = new Set(["WeightTraining", "Workout", "Crossfit", "HighIntensityIntervalTraining"]);

export interface PlannedForMatch {
  key: string;
  date: string;
  kind: "run" | "strength";
  distanceKm: number | null;
  status: "planned" | "completed" | "skipped";
  activityId: string | null;
}

export interface ActivityForMatch {
  id: string;
  date: string;
  type: string;
  distanceM: number | null;
}

function compatible(p: PlannedForMatch, a: ActivityForMatch) {
  return p.kind === "run" ? RUN_ACTIVITY_TYPES.has(a.type) : STRENGTH_ACTIVITY_TYPES.has(a.type);
}

/** Lower is better: distance difference in km for runs, 0 for strength. */
function cost(p: PlannedForMatch, a: ActivityForMatch) {
  if (p.kind === "strength" || p.distanceKm === null) return 0;
  return Math.abs((a.distanceM ?? 0) / 1000 - p.distanceKm);
}

/** Returns new links: workout key → activity id. Existing links are not repeated. */
export function matchActivities(planned: PlannedForMatch[], activities: ActivityForMatch[]): Map<string, string> {
  const claimed = new Set(planned.map((p) => p.activityId).filter((id): id is string => !!id));
  const open = planned.filter((p) => !p.activityId && p.status !== "skipped").sort((a, b) => a.date.localeCompare(b.date));
  const links = new Map<string, string>();

  for (const p of open) {
    const candidates = activities
      .filter((a) => !claimed.has(a.id) && compatible(p, a) && a.date === p.date)
      .sort((a, b) => cost(p, a) - cost(p, b));
    const best = candidates[0];
    if (best) {
      links.set(p.key, best.id);
      claimed.add(best.id);
    }
  }
  return links;
}
