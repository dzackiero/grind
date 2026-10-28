import { and, asc, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { CUSTOM_EXERCISE_ID, ExerciseSetsSchema, MAX_CUSTOM_EXERCISES, type LastTime, type LoggedSet } from "@/lib/strength-log";
import type { DB } from "../db/client";
import { plan, plannedWorkout, strengthSet } from "../db/schema";

/** A strength log action that can't be done. The message says why; `status` is the HTTP status to answer with. */
export class StrengthLogError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 = 409,
  ) {
    super(message);
  }
}

export interface LoggedExercise {
  exerciseId: string;
  exerciseName: string;
  sets: LoggedSet[];
}

/** A strength workout of the active plan, by its key. */
async function findWorkout(db: DB, userId: string, workoutKey: string) {
  const [row] = await db
    .select({ id: plannedWorkout.id, date: plannedWorkout.date, kind: plannedWorkout.kind, title: plannedWorkout.title, data: plannedWorkout.data })
    .from(plannedWorkout)
    .innerJoin(plan, eq(plan.id, plannedWorkout.planId))
    .where(and(eq(plannedWorkout.userId, userId), eq(plannedWorkout.workoutKey, workoutKey), eq(plan.status, "active")));
  return row ?? null;
}

/**
 * Replace the logged sets of one exercise in one workout. An empty list clears the exercise, which is also how
 * an exercise the athlete added is removed. Planned exercises keep the plan's name; added ones use the name given.
 */
export async function saveExerciseSets(db: DB, userId: string, workoutKey: string, rawInput: unknown, today: string) {
  const input = ExerciseSetsSchema.parse(rawInput);
  const workout = await findWorkout(db, userId, workoutKey);
  if (!workout) throw new StrengthLogError("That workout isn't in your active plan.", 404);
  if (workout.kind !== "strength" || workout.data.kind !== "strength") throw new StrengthLogError("Only strength workouts have sets to log.");
  if (workout.date > today) throw new StrengthLogError("You can't log sets for a workout that hasn't happened yet.");

  const planned = workout.data.exercises.find((e) => e.id === input.exerciseId);
  if (!planned && !CUSTOM_EXERCISE_ID.test(input.exerciseId)) throw new StrengthLogError("That exercise isn't part of this workout.");

  return db.transaction(async (tx) => {
    if (!planned && input.sets.length) {
      const others = await tx
        .selectDistinct({ id: strengthSet.exerciseId })
        .from(strengthSet)
        .where(and(eq(strengthSet.plannedWorkoutId, workout.id), eq(strengthSet.userId, userId)));
      const custom = others.filter((o) => CUSTOM_EXERCISE_ID.test(o.id) && o.id !== input.exerciseId);
      if (custom.length >= MAX_CUSTOM_EXERCISES) throw new StrengthLogError(`You can add up to ${MAX_CUSTOM_EXERCISES} extra exercises to a workout.`);
    }
    await tx.delete(strengthSet).where(and(eq(strengthSet.plannedWorkoutId, workout.id), eq(strengthSet.userId, userId), eq(strengthSet.exerciseId, input.exerciseId)));
    if (!input.sets.length) return { saved: 0 };
    await tx.insert(strengthSet).values(
      input.sets.map((s, i) => ({
        userId,
        plannedWorkoutId: workout.id,
        exerciseId: input.exerciseId,
        exerciseName: planned?.name ?? input.exerciseName,
        position: i + 1,
        reps: s.reps,
        weightKg: s.weightKg,
        seconds: s.seconds,
        done: s.done,
        date: workout.date,
      })),
    );
    return { saved: input.sets.length };
  });
}

/** Everything logged for a workout, exercise by exercise in the order they were first logged. */
export async function listWorkoutSets(db: DB, userId: string, workoutKey: string): Promise<LoggedExercise[]> {
  const workout = await findWorkout(db, userId, workoutKey);
  if (!workout) return [];
  const rows = await db
    .select()
    .from(strengthSet)
    .where(and(eq(strengthSet.plannedWorkoutId, workout.id), eq(strengthSet.userId, userId)))
    .orderBy(asc(strengthSet.createdAt), asc(strengthSet.exerciseId), asc(strengthSet.position));
  const byExercise = new Map<string, LoggedExercise>();
  for (const r of rows) {
    const entry = byExercise.get(r.exerciseId) ?? { exerciseId: r.exerciseId, exerciseName: r.exerciseName, sets: [] };
    entry.sets.push({ position: r.position, reps: r.reps, weightKg: r.weightKg, seconds: r.seconds, done: r.done });
    byExercise.set(r.exerciseId, entry);
  }
  return [...byExercise.values()];
}

/**
 * For each exercise name, the ticked sets of the most recent day it was logged before `before`, from any plan.
 * Used to start a new session from what the athlete lifted last time.
 */
export async function lastPerformance(db: DB, userId: string, names: string[], before: string): Promise<Record<string, LastTime>> {
  const unique = [...new Set(names)];
  if (!unique.length) return {};
  const rows = await db
    .select({ name: strengthSet.exerciseName, date: strengthSet.date, position: strengthSet.position, reps: strengthSet.reps, weightKg: strengthSet.weightKg, seconds: strengthSet.seconds })
    .from(strengthSet)
    .where(and(eq(strengthSet.userId, userId), inArray(strengthSet.exerciseName, unique), eq(strengthSet.done, true), lt(strengthSet.date, before)))
    .orderBy(desc(strengthSet.date), asc(strengthSet.position))
    .limit(500);
  const out: Record<string, LastTime> = {};
  for (const r of rows) {
    const found = out[r.name];
    if (!found) out[r.name] = { date: r.date, sets: [{ reps: r.reps, weightKg: r.weightKg, seconds: r.seconds }] };
    else if (found.date === r.date) found.sets.push({ reps: r.reps, weightKg: r.weightKg, seconds: r.seconds });
  }
  return out;
}

export interface StrengthSession {
  workoutId: string;
  date: string;
  title: string;
  exercises: LoggedExercise[];
}

/** Logged strength sessions between two dates, oldest first, for the coach. */
export async function listStrengthSessions(db: DB, userId: string, range: { from: string; to: string }): Promise<StrengthSession[]> {
  const rows = await db
    .select({ set: strengthSet, title: plannedWorkout.title, workoutKey: plannedWorkout.workoutKey })
    .from(strengthSet)
    .innerJoin(plannedWorkout, eq(plannedWorkout.id, strengthSet.plannedWorkoutId))
    .where(and(eq(strengthSet.userId, userId), gte(strengthSet.date, range.from), lte(strengthSet.date, range.to)))
    .orderBy(asc(strengthSet.date), asc(strengthSet.createdAt), asc(strengthSet.position));
  const sessions = new Map<string, StrengthSession>();
  for (const { set, title, workoutKey } of rows) {
    const session = sessions.get(set.plannedWorkoutId) ?? { workoutId: workoutKey, date: set.date, title, exercises: [] };
    let exercise = session.exercises.find((e) => e.exerciseId === set.exerciseId);
    if (!exercise) {
      exercise = { exerciseId: set.exerciseId, exerciseName: set.exerciseName, sets: [] };
      session.exercises.push(exercise);
    }
    exercise.sets.push({ position: set.position, reps: set.reps, weightKg: set.weightKg, seconds: set.seconds, done: set.done });
    sessions.set(set.plannedWorkoutId, session);
  }
  return [...sessions.values()];
}
