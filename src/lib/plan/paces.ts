import type { PaceRange, PaceZones, PlanInput } from "./schema";

/*
 * Fitness score and training paces, based on Jack Daniels' VDOT formulas.
 *   VO2 cost of running at v m/min:  -4.60 + 0.182258 v + 0.000104 v²
 *   Share of VO2max held for t min:   0.8 + 0.1894393 e^(-0.012778 t) + 0.2989558 e^(-0.1932605 t)
 */

export const RACE_DISTANCE_M = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
  marathon: 42195,
} as const;

function vo2Cost(vMetersPerMin: number): number {
  return -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2;
}

function sustainableFraction(minutes: number): number {
  return (
    0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

/** Fitness score (VDOT) from a race result. */
export function fitnessFromRace(distanceM: number, timeSec: number): number {
  const minutes = timeSec / 60;
  return vo2Cost(distanceM / minutes) / sustainableFraction(minutes);
}

/** Predicted race time in seconds for a fitness score, found by bisection. */
export function predictRaceTime(fitness: number, distanceM: number): number {
  let lo = distanceM / 400; // 400 m/min is faster than any human
  let hi = distanceM / 60; // 60 m/min is walking slowly
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (fitnessFromRace(distanceM, mid * 60) > fitness) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 60);
}

/** Seconds per km when running at a given share of the fitness score's VO2max. */
function paceAtFraction(fitness: number, fraction: number): number {
  const target = fitness * fraction;
  // Solve 0.000104 v² + 0.182258 v - (4.6 + target) = 0 for v (m/min)
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + target);
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return Math.round((1000 / v) * 60);
}

function range(fastSec: number, slowSec: number): PaceRange {
  return { minSecPerKm: Math.round(fastSec), maxSecPerKm: Math.round(slowSec) };
}

/** Training zones for a fitness score and goal race. */
export function paceZones(fitness: number, goalDistanceM: number): PaceZones {
  const marathonPace = predictRaceTime(fitness, 42195) / 42.195;
  const racePace = predictRaceTime(fitness, goalDistanceM) / (goalDistanceM / 1000);
  return {
    E: range(paceAtFraction(fitness, 0.74), paceAtFraction(fitness, 0.62)),
    M: range(marathonPace - 4, marathonPace + 4),
    T: range(paceAtFraction(fitness, 0.88), paceAtFraction(fitness, 0.84)),
    I: range(paceAtFraction(fitness, 1.0), paceAtFraction(fitness, 0.96)),
    R: range(paceAtFraction(fitness, 1.08), paceAtFraction(fitness, 1.04)),
    race: range(racePace - 3, racePace + 3),
  };
}

const DEFAULT_FITNESS = { beginner: 32, intermediate: 40, advanced: 48 } as const;

/** Starting fitness: from a recent race when given, otherwise a safe guess from experience. */
export function startingFitness(input: Pick<PlanInput, "recentRace" | "experience">): number {
  if (input.recentRace) {
    const f = fitnessFromRace(input.recentRace.distanceM, input.recentRace.timeSec);
    return Math.min(85, Math.max(20, Math.round(f * 10) / 10));
  }
  return DEFAULT_FITNESS[input.experience];
}

/**
 * Expected fitness gain over the plan. Newer runners improve faster; gains flatten with time.
 * Returns [conservative, optimistic]. Conservative assumes no gain, so the slow end is today's fitness.
 */
export function expectedGain(weeks: number, experience: PlanInput["experience"]): [number, number] {
  const perWeek = { beginner: 0.3, intermediate: 0.2, advanced: 0.12 }[experience];
  const cap = { beginner: 4, intermediate: 3, advanced: 1.5 }[experience];
  return [0, Math.min(cap, perWeek * weeks)];
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
