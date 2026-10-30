/*
 * Match synced activities to planned workouts.
 * - Run workouts match run activities (Run, TrailRun, VirtualRun, Treadmill); strength matches WeightTraining/Workout.
 * - Same local date only, closest distance wins. A run on a different date must not complete this day's workout.
 * - An activity matches at most one workout; existing links are kept; skipped workouts are left alone.
 */

export const RUN_ACTIVITY_TYPES = new Set(["Run", "TrailRun", "VirtualRun", "Treadmill"]);
export const STRENGTH_ACTIVITY_TYPES = new Set([
  "WeightTraining",
  "Workout",
  "Crossfit",
  "HighIntensityIntervalTraining",
]);

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

/**
 * Returns new links: workout key → activity ids, the closest match first. Existing links are not repeated.
 * A run workout takes every other run recorded the same day too (a watch that split warm-up and main set,
 * or a pause that started a second recording), so they count as one session. Strength takes the best one.
 */
export function matchActivityGroups(
  planned: PlannedForMatch[],
  activities: ActivityForMatch[],
): Map<string, string[]> {
  const claimed = new Set(planned.map((p) => p.activityId).filter((id): id is string => !!id));
  const open = planned
    .filter((p) => !p.activityId && p.status !== "skipped")
    .sort((a, b) => a.date.localeCompare(b.date));
  const links = new Map<string, string[]>();

  for (const p of open) {
    const candidates = activities
      .filter((a) => !claimed.has(a.id) && compatible(p, a) && a.date === p.date)
      .sort((a, b) => cost(p, a) - cost(p, b));
    if (!candidates.length) continue;
    const picked = p.kind === "run" ? candidates : candidates.slice(0, 1);
    links.set(
      p.key,
      picked.map((a) => a.id),
    );
    for (const a of picked) claimed.add(a.id);
  }
  return links;
}

/**
 * Runs recorded after a run workout was already matched: same day, not linked to anything yet.
 * `activities` must only hold activities that no workout or historical session has claimed.
 */
export function extraRunsForLinked(
  planned: PlannedForMatch[],
  activities: ActivityForMatch[],
): Map<string, string[]> {
  const extras = new Map<string, string[]>();
  const used = new Set<string>();
  for (const p of planned) {
    if (p.kind !== "run" || !p.activityId || p.status === "skipped") continue;
    const ids = activities
      .filter(
        (a) => !used.has(a.id) && a.id !== p.activityId && compatible(p, a) && a.date === p.date,
      )
      .map((a) => a.id);
    if (!ids.length) continue;
    extras.set(p.key, ids);
    for (const id of ids) used.add(id);
  }
  return extras;
}

/** Returns new links: workout key → the closest activity id. */
export function matchActivities(
  planned: PlannedForMatch[],
  activities: ActivityForMatch[],
): Map<string, string> {
  return new Map([...matchActivityGroups(planned, activities)].map(([key, ids]) => [key, ids[0]]));
}
