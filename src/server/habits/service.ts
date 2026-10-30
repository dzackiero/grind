import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays } from "@/lib/plan/dates";
import {
  HabitInputSchema,
  HabitPatchSchema,
  isIsoDate,
  MAX_BACKFILL_DAYS,
  MAX_HABITS,
} from "@/lib/habits";
import type { Weekday } from "@/lib/plan/dates";
import type { DB } from "../db/client";
import { habit, habitLog } from "../db/schema";

/** A habit action that can't be done. The message says why; `status` is the HTTP status to answer with. */
export class HabitError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409 = 409,
  ) {
    super(message);
  }
}

export interface HabitWithLogs {
  id: string;
  name: string;
  icon: string;
  days: Weekday[];
  /** The day it was created, YYYY-MM-DD */
  createdOn: string;
  /** Days ticked within the range asked for */
  doneDates: string[];
}

const toWeekdays = (days: string[]) => days as Weekday[];

export async function createHabit(db: DB, userId: string, rawInput: unknown) {
  const input = HabitInputSchema.parse(rawInput);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(habit)
    .where(and(eq(habit.userId, userId), isNull(habit.archivedAt)));
  if (n >= MAX_HABITS)
    throw new HabitError(`You can track up to ${MAX_HABITS} habits. Archive one to add another.`);
  const [row] = await db
    .insert(habit)
    .values({ userId, name: input.name, icon: input.icon, days: input.days })
    .returning();
  return { id: row.id, name: row.name, icon: row.icon, days: toWeekdays(row.days) };
}

/** Change a habit's name, icon or days. Its ticks stay. */
export async function updateHabit(db: DB, userId: string, id: string, rawPatch: unknown) {
  const patch = HabitPatchSchema.parse(rawPatch);
  if (!Object.keys(patch).length) throw new HabitError("Nothing to change.");
  const [row] = await db
    .update(habit)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(habit.id, id), eq(habit.userId, userId), isNull(habit.archivedAt)))
    .returning();
  if (!row) throw new HabitError("That habit doesn't exist.", 404);
  return { id: row.id, name: row.name, icon: row.icon, days: toWeekdays(row.days) };
}

/** Stops tracking a habit. Its history is kept, so unarchiving later would bring it back. */
export async function archiveHabit(db: DB, userId: string, id: string) {
  const [row] = await db
    .update(habit)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(habit.id, id), eq(habit.userId, userId), isNull(habit.archivedAt)))
    .returning({ id: habit.id });
  if (!row) throw new HabitError("That habit doesn't exist.", 404);
}

/** Tick or untick a habit for a day: today or up to 60 days back, never the future. */
export async function setHabitDone(
  db: DB,
  userId: string,
  id: string,
  date: string,
  done: boolean,
  today: string,
) {
  if (!isIsoDate(date)) throw new HabitError("The date must look like 2026-10-28.");
  if (date > today)
    throw new HabitError("You can't tick a habit for a day that hasn't happened yet.");
  if (date < addDays(today, -MAX_BACKFILL_DAYS))
    throw new HabitError(`You can only change the last ${MAX_BACKFILL_DAYS} days.`);
  const [found] = await db
    .select({ id: habit.id })
    .from(habit)
    .where(and(eq(habit.id, id), eq(habit.userId, userId), isNull(habit.archivedAt)));
  if (!found) throw new HabitError("That habit doesn't exist.", 404);
  if (done) await db.insert(habitLog).values({ habitId: id, userId, date }).onConflictDoNothing();
  else
    await db
      .delete(habitLog)
      .where(and(eq(habitLog.habitId, id), eq(habitLog.userId, userId), eq(habitLog.date, date)));
}

/** The athlete's active habits, oldest first, each with the days ticked between `from` and `to`. */
export async function listHabits(
  db: DB,
  userId: string,
  range: { from: string; to: string },
): Promise<HabitWithLogs[]> {
  const habits = await db
    .select()
    .from(habit)
    .where(and(eq(habit.userId, userId), isNull(habit.archivedAt)))
    .orderBy(asc(habit.createdAt), asc(habit.id));
  if (!habits.length) return [];
  const logs = await db
    .select({ habitId: habitLog.habitId, date: habitLog.date })
    .from(habitLog)
    .where(
      and(
        eq(habitLog.userId, userId),
        inArray(
          habitLog.habitId,
          habits.map((h) => h.id),
        ),
        gte(habitLog.date, range.from),
        lte(habitLog.date, range.to),
      ),
    );
  const byHabit = new Map<string, string[]>();
  for (const l of logs) byHabit.set(l.habitId, [...(byHabit.get(l.habitId) ?? []), l.date]);
  return habits.map((h) => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    days: toWeekdays(h.days),
    createdOn: h.createdAt.toISOString().slice(0, 10),
    doneDates: (byHabit.get(h.id) ?? []).sort(),
  }));
}
