/*
 * Match synced activities to planned workouts.
 * - Run workouts match run activities (Run, TrailRun, VirtualRun, Treadmill); strength matches WeightTraining/Workout.
 * - Same day first, closest distance wins. Unmatched runs then try activities one day either side,
 *   so a long run moved from Sunday to Saturday still counts.
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

function dayGap(a: string, b: string) {
  return Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000;
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

  for (const maxGap of [0, 1]) {
    for (const p of open) {
      if (links.has(p.key)) continue;
      if (maxGap > 0 && p.kind !== "run") continue;
      const candidates = activities
        .filter((a) => !claimed.has(a.id) && compatible(p, a) && dayGap(a.date, p.date) === maxGap)
        // An activity one day off shouldn't steal from a workout planned on its own day
        .filter((a) => maxGap === 0 || !open.some((o) => o.date === a.date && o.kind === p.kind && !links.has(o.key) && o.key !== p.key))
        .sort((a, b) => cost(p, a) - cost(p, b));
      const best = candidates[0];
      if (best) {
        links.set(p.key, best.id);
        claimed.add(best.id);
      }
    }
  }
  return links;
}
