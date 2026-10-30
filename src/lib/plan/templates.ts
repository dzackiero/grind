import type { PlanInput } from "./schema";

type Goal = PlanInput["goal"];
type Level = PlanInput["experience"];
type ByLevel = Record<Level, number>;

export interface GoalTemplate {
  label: string;
  minWeeks: number;
  defaultWeeks: number;
  maxWeeks: number;
  /** Weeks before race day that reduce volume, race week included */
  taperFactors: number[];
  /** Weekly km at the top of the plan (balanced intensity) */
  peakKm: ByLevel;
  /** Lowest weekly km the plan starts from */
  floorKm: number;
  maxLongKm: ByLevel;
  minLongKm: number;
  /** Largest share of the week's km the long run may take */
  maxLongShare: number;
  /** Multiplier on LONG_STEP_KM: longer races build the long run faster */
  longStepFactor: number;
}

export const GOAL_TEMPLATES: Record<Goal, GoalTemplate> = {
  "5k": {
    label: "5K",
    minWeeks: 6,
    defaultWeeks: 8,
    maxWeeks: 12,
    taperFactors: [0.6],
    peakKm: { beginner: 25, intermediate: 35, advanced: 50 },
    floorKm: 10,
    maxLongKm: { beginner: 10, intermediate: 13, advanced: 16 },
    minLongKm: 4,
    maxLongShare: 0.4,
    longStepFactor: 1,
  },
  "10k": {
    label: "10K",
    minWeeks: 8,
    defaultWeeks: 10,
    maxWeeks: 14,
    taperFactors: [0.6],
    peakKm: { beginner: 30, intermediate: 42, advanced: 60 },
    floorKm: 12,
    maxLongKm: { beginner: 13, intermediate: 16, advanced: 19 },
    minLongKm: 5,
    maxLongShare: 0.4,
    longStepFactor: 1,
  },
  half: {
    label: "Half Marathon",
    minWeeks: 10,
    defaultWeeks: 12,
    maxWeeks: 16,
    taperFactors: [0.75, 0.5],
    peakKm: { beginner: 35, intermediate: 48, advanced: 65 },
    floorKm: 15,
    maxLongKm: { beginner: 18, intermediate: 20, advanced: 22 },
    minLongKm: 6,
    maxLongShare: 0.42,
    longStepFactor: 1.2,
  },
  marathon: {
    label: "Marathon",
    minWeeks: 14,
    defaultWeeks: 16,
    maxWeeks: 20,
    taperFactors: [0.8, 0.6, 0.4],
    peakKm: { beginner: 45, intermediate: 60, advanced: 80 },
    floorKm: 20,
    maxLongKm: { beginner: 30, intermediate: 32, advanced: 34 },
    minLongKm: 8,
    maxLongShare: 0.5,
    longStepFactor: 1.5,
  },
};

/**
 * weeklyGrowth: % added per loading week. minStepKm: smallest step, so low starting volumes
 * still grow (8% of 15 km is barely 1 km). Steps never exceed 15% of the week.
 * longStepKm: km added to the long run per loading week.
 */
export const INTENSITY = {
  steady: { peakFactor: 0.9, weeklyGrowth: 0.06, minStepKm: 1.5, longStepKm: -0.5 },
  balanced: { peakFactor: 1, weeklyGrowth: 0.08, minStepKm: 2.5, longStepKm: 0 },
  push: { peakFactor: 1.1, weeklyGrowth: 0.1, minStepKm: 3.5, longStepKm: 0.5 },
} as const;

export const LONG_STEP_KM: Record<Level, number> = { beginner: 1, intermediate: 1.5, advanced: 2 };

/** Share of the week's km that goes into the long run, by number of run days */
export function longRunShare(runDays: number): number {
  return runDays <= 3 ? 0.4 : runDays === 4 ? 0.33 : 0.28;
}

// ---------- Session progressions ----------
// Each list goes from easiest to hardest. The engine picks the next entry each time the session type repeats.

export interface RepeatSet {
  reps: number;
  meters: number;
  zone: "I" | "R";
  recoverySec: number;
}

export const INTERVALS: Record<Goal, RepeatSet[]> = {
  "5k": [
    { reps: 8, meters: 400, zone: "R", recoverySec: 60 },
    { reps: 5, meters: 800, zone: "I", recoverySec: 90 },
    { reps: 6, meters: 800, zone: "I", recoverySec: 90 },
    { reps: 5, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 10, meters: 400, zone: "R", recoverySec: 60 },
    { reps: 4, meters: 1200, zone: "I", recoverySec: 120 },
    { reps: 6, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 3, meters: 1600, zone: "I", recoverySec: 180 },
  ],
  "10k": [
    { reps: 5, meters: 800, zone: "I", recoverySec: 90 },
    { reps: 6, meters: 800, zone: "I", recoverySec: 90 },
    { reps: 5, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 6, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 4, meters: 1200, zone: "I", recoverySec: 120 },
    { reps: 5, meters: 1200, zone: "I", recoverySec: 150 },
    { reps: 4, meters: 1600, zone: "I", recoverySec: 180 },
  ],
  half: [
    { reps: 5, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 6, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 4, meters: 1200, zone: "I", recoverySec: 120 },
    { reps: 3, meters: 1600, zone: "I", recoverySec: 180 },
    { reps: 4, meters: 1600, zone: "I", recoverySec: 180 },
  ],
  marathon: [
    { reps: 5, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 6, meters: 1000, zone: "I", recoverySec: 120 },
    { reps: 4, meters: 1200, zone: "I", recoverySec: 120 },
    { reps: 3, meters: 1600, zone: "I", recoverySec: 180 },
    { reps: 4, meters: 1600, zone: "I", recoverySec: 180 },
  ],
};

export type TempoSession =
  | { kind: "continuous"; minutes: number }
  | { kind: "cruise"; reps: number; minutes: number; recoverySec: number };

export const TEMPO: TempoSession[] = [
  { kind: "continuous", minutes: 15 },
  { kind: "cruise", reps: 3, minutes: 8, recoverySec: 120 },
  { kind: "continuous", minutes: 20 },
  { kind: "cruise", reps: 3, minutes: 10, recoverySec: 120 },
  { kind: "continuous", minutes: 25 },
  { kind: "cruise", reps: 4, minutes: 10, recoverySec: 120 },
  { kind: "continuous", minutes: 30 },
  { kind: "cruise", reps: 3, minutes: 15, recoverySec: 180 },
];

export const HILLS: { reps: number; seconds: number }[] = [
  { reps: 6, seconds: 60 },
  { reps: 8, seconds: 60 },
  { reps: 10, seconds: 60 },
  { reps: 8, seconds: 90 },
  { reps: 10, seconds: 90 },
];

/** Hardest entry a level reaches, as an index into the lists above */
export const PROGRESSION_CAP: Record<Level, number> = {
  beginner: 3,
  intermediate: 6,
  advanced: 99,
};

export const PHASE_FOCUS = {
  base: "Build the habit and your aerobic base. Most running is easy.",
  build: "Add speed and threshold work while the distance keeps growing.",
  peak: "Your biggest weeks. Sessions get specific to race day.",
  recovery: "Lighter week so your body can absorb the work.",
  taper: "Less volume, same sharpness. Arrive at the start line fresh.",
} as const;
