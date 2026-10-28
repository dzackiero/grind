import { z } from "zod";

/*
 * Logging strength sets: weight, reps (or seconds for exercises held for time) and a tick per set. Everything
 * here is optional, a workout can still just be marked done. Pure rules only; storage is in server/strength.
 */

export const MAX_SETS_PER_EXERCISE = 20;
export const MAX_CUSTOM_EXERCISES = 20;

/** Ids of exercises the athlete added themselves; planned exercises keep the plan's own ids. */
export const CUSTOM_EXERCISE_ID = /^custom-[a-z0-9-]{4,40}$/;
export const newCustomExerciseId = () => `custom-${Math.random().toString(36).slice(2, 10)}`;

const optionalNumber = (max: number, integer: boolean) => {
  const base = integer ? z.number().int() : z.number();
  return base.min(0).max(max).nullable();
};

export const SetInputSchema = z.object({
  reps: optionalNumber(100, true),
  /** Kilograms, in steps as small as 0.25 */
  weightKg: optionalNumber(1000, false),
  seconds: optionalNumber(3600, true),
  done: z.boolean(),
});
export type SetInput = z.infer<typeof SetInputSchema>;

export const ExerciseSetsSchema = z.object({
  exerciseId: z.string().trim().min(1).max(60),
  exerciseName: z.string().trim().min(1, "Give the exercise a name.").max(60, "Keep the name under 60 characters."),
  sets: z.array(SetInputSchema).max(MAX_SETS_PER_EXERCISE, `Up to ${MAX_SETS_PER_EXERCISE} sets per exercise.`),
});
export type ExerciseSetsInput = z.infer<typeof ExerciseSetsSchema>;

/** One row on screen. Numbers are kept as text while typing, so "62." and an empty box are fine. */
export interface SetRow {
  weight: string;
  /** Reps, or seconds for exercises held for time */
  amount: string;
  done: boolean;
}

/** A logged set as it comes back from storage. */
export interface LoggedSet {
  position: number;
  reps: number | null;
  weightKg: number | null;
  seconds: number | null;
  done: boolean;
}

/** "62.5", "60": no trailing zeros. */
export function formatWeight(kg: number | null | undefined): string {
  if (kg == null || !Number.isFinite(kg)) return "";
  return String(Math.round(kg * 100) / 100);
}

/** What the athlete typed, as a number, or null when empty or not a number. A comma works as the decimal mark. */
export function parseAmount(text: string, integer = false): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return integer ? Math.round(n) : n;
}

export interface PlannedAmount {
  sets: number;
  reps?: number;
  durationSec?: number;
}

/** How the athlete did the last time they logged this exercise: the sets they ticked. */
export interface LastTime {
  date: string;
  sets: { reps: number | null; weightKg: number | null; seconds: number | null }[];
}

/**
 * The starting rows for an exercise nobody has logged yet: as many sets as planned, the planned reps (or seconds),
 * and the weight used last time, set by set when there are enough, otherwise the heaviest. Nothing is ticked.
 */
export function startingRows(planned: PlannedAmount, last?: LastTime | null): SetRow[] {
  const timed = planned.durationSec !== undefined && planned.reps === undefined;
  const plannedAmount = timed ? planned.durationSec : planned.reps;
  const lastWeights = (last?.sets ?? []).map((s) => s.weightKg).filter((w): w is number => w != null);
  const heaviest = lastWeights.length ? Math.max(...lastWeights) : null;
  return Array.from({ length: planned.sets }, (_, i) => {
    const weight = last?.sets[i]?.weightKg ?? heaviest;
    return { weight: formatWeight(weight), amount: plannedAmount !== undefined ? String(plannedAmount) : "", done: false };
  });
}

/** Rows from sets that were saved earlier. */
export function rowsFromLogged(sets: LoggedSet[], timed: boolean): SetRow[] {
  return [...sets]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ weight: formatWeight(s.weightKg), amount: String(timed ? (s.seconds ?? "") : (s.reps ?? "")), done: s.done }));
}

/** Rows ready to save. */
export function rowsToSets(rows: SetRow[], timed: boolean): SetInput[] {
  return rows.map((r) => ({
    reps: timed ? null : parseAmount(r.amount, true),
    seconds: timed ? parseAmount(r.amount, true) : null,
    weightKg: parseAmount(r.weight),
    done: r.done,
  }));
}

/** Estimated one-rep max from a set (Epley). Only meaningful up to about 12 reps; null otherwise. */
export function estimatedOneRepMax(weightKg: number | null, reps: number | null): number | null {
  if (!weightKg || !reps || reps < 1 || reps > 12) return null;
  return reps === 1 ? weightKg : Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export interface ExerciseSummary {
  setsDone: number;
  setsTotal: number;
  /** Kilograms lifted over the ticked sets: weight × reps added up */
  volumeKg: number;
  /** The heaviest ticked set; ties go to the one with more reps */
  topSet: { weightKg: number; reps: number | null } | null;
}

export function summariseExercise(sets: { reps: number | null; weightKg: number | null; done: boolean }[]): ExerciseSummary {
  const done = sets.filter((s) => s.done);
  let top: ExerciseSummary["topSet"] = null;
  for (const s of done) {
    if (s.weightKg == null || s.weightKg <= 0) continue;
    if (!top || s.weightKg > top.weightKg || (s.weightKg === top.weightKg && (s.reps ?? 0) > (top.reps ?? 0))) top = { weightKg: s.weightKg, reps: s.reps };
  }
  return {
    setsDone: done.length,
    setsTotal: sets.length,
    volumeKg: Math.round(done.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0) * 10) / 10,
    topSet: top,
  };
}

type LastSet = LastTime["sets"][number];

const isTimed = (last: LastTime) => last.sets.every((s) => s.reps == null) && last.sets.some((s) => s.seconds != null);

/** One set from last time, short enough for a table cell: "32.5 × 8", "× 12" without a weight, "45 s" for a hold. */
export function lastSetText(set: LastSet | undefined): string {
  if (!set) return "–";
  const weight = set.weightKg != null && set.weightKg > 0 ? formatWeight(set.weightKg) : null;
  if (set.reps == null && set.seconds != null) return weight ? `${weight} × ${set.seconds} s` : `${set.seconds} s`;
  if (set.reps == null) return weight ?? "–";
  return weight ? `${weight} × ${set.reps}` : `× ${set.reps}`;
}

/** The weight to beat, from the heaviest set last time: "32.5 kg × 8 · 2 sets". Without weights, just "2 × 12". */
export function lastTimeText(last: LastTime): string {
  const weights = last.sets.map((s) => s.weightKg).filter((w): w is number => w != null && w > 0);
  const timed = isTimed(last);
  const unit = (s: LastSet) => (timed ? `${s.seconds ?? "?"} s` : `${s.reps ?? "?"}`);
  if (!weights.length) return `${last.sets.length} × ${last.sets[0] ? unit(last.sets[0]) : "?"}`;
  const top = Math.max(...weights);
  const heaviest = last.sets.find((s) => s.weightKg === top)!;
  return `${formatWeight(top)} kg × ${unit(heaviest)} · ${last.sets.length} ${last.sets.length === 1 ? "set" : "sets"}`;
}
