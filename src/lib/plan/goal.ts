import type { PlanInput } from "./schema";
import { RACE_DISTANCE_M } from "./paces";
import { GOAL_TEMPLATES } from "./templates";

/*
 * A plan targets one of four standard races, or a custom distance. A custom distance borrows the
 * structure (plan length, volume, long run, intervals) of the nearest standard goal, while paces,
 * the race-day workout and labels use the real distance.
 */

type Goal = PlanInput["goal"];

/** Shortest and longest custom goal, in km. */
export const CUSTOM_GOAL_MIN_KM = 3;
export const CUSTOM_GOAL_MAX_KM = 42.2;

/** Standard goal whose template fits a custom distance best (split at the midpoints). */
export function goalForDistanceKm(km: number): Goal {
  if (km <= 7.5) return "5k";
  if (km <= 15.5) return "10k";
  if (km <= 31.6) return "half";
  return "marathon";
}

/** Goal distance in metres: the custom distance when set, otherwise the standard race. */
export function goalDistanceM(input: Pick<PlanInput, "goal" | "goalDistanceKm">): number {
  return input.goalDistanceKm === undefined
    ? RACE_DISTANCE_M[input.goal]
    : Math.round(input.goalDistanceKm * 1000);
}

/** "15K" for a custom distance, otherwise the standard race name ("Half Marathon"). */
export function goalLabel(input: Pick<PlanInput, "goal" | "goalDistanceKm">): string {
  return input.goalDistanceKm === undefined
    ? GOAL_TEMPLATES[input.goal].label
    : `${+input.goalDistanceKm.toFixed(1)}K`;
}
