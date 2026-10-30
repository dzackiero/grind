import type { Workout } from "@/lib/plan";

type WorkoutType = Workout["type"];

/** Display info per workout type. Class names are literal so Tailwind can see them. */
export const WORKOUT_TYPES: Record<
  WorkoutType,
  { label: string; fill: string; mark: string; text: string }
> = {
  easy: {
    label: "Easy",
    fill: "bg-type-easy",
    mark: "bg-type-easy-mark",
    text: "text-type-easy-mark",
  },
  tempo: {
    label: "Tempo",
    fill: "bg-type-tempo",
    mark: "bg-type-tempo-mark",
    text: "text-type-tempo-mark",
  },
  intervals: {
    label: "Intervals",
    fill: "bg-type-intervals",
    mark: "bg-type-intervals-mark",
    text: "text-type-intervals-mark",
  },
  hills: {
    label: "Hills",
    fill: "bg-type-hills",
    mark: "bg-type-hills-mark",
    text: "text-type-hills-mark",
  },
  long: {
    label: "Long run",
    fill: "bg-type-long",
    mark: "bg-type-long-mark",
    text: "text-type-long-mark",
  },
  race: {
    label: "Race",
    fill: "bg-type-race",
    mark: "bg-type-race-mark",
    text: "text-type-race-mark",
  },
  strength: {
    label: "Strength",
    fill: "bg-type-strength",
    mark: "bg-type-strength-mark",
    text: "text-type-strength-mark",
  },
};

export const PHASE_LABEL = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
  recovery: "Lighter week",
} as const;
