import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { EFFORT_DISTANCES, RECORD_ACTIVITY_TYPES, type EffortKey } from "@/lib/efforts";
import { RUN_ACTIVITY_TYPES, STRENGTH_ACTIVITY_TYPES } from "@/lib/matching";
import { addDays, mondayOf } from "@/lib/plan/dates";
import {
  pointsSummary,
  tierFor,
  type PointRow,
  type PointsSummary,
  type TierStatus,
} from "@/lib/points";
import type { DB } from "../db/client";
import {
  activity,
  activityEffort,
  plan as planTable,
  plannedWorkout,
  planWeek,
} from "../db/schema";

/** Everything the Progress page shows: records, weekly totals, and points. */

export interface PersonalRecord {
  seconds: number;
  /** Day of the run, YYYY-MM-DD */
  date: string;
  activityId: string;
  name: string | null;
}

/** The athlete's fastest time for each standard distance, across every synced outdoor run. */
export async function getRecords(
  db: DB,
  userId: string,
): Promise<Partial<Record<EffortKey, PersonalRecord>>> {
  const rows = await db
    .select({
      key: activityEffort.key,
      seconds: activityEffort.seconds,
      activityId: activity.id,
      date: activity.date,
      name: activity.name,
    })
    .from(activityEffort)
    .innerJoin(
      activity,
      and(eq(activity.userId, activityEffort.userId), eq(activity.id, activityEffort.activityId)),
    )
    .where(eq(activityEffort.userId, userId))
    // Fastest first; on a tie the earlier run keeps the record
    .orderBy(asc(activityEffort.seconds), asc(activity.date));

  const known = new Set<string>(EFFORT_DISTANCES.map((d) => d.key));
  const best: Partial<Record<EffortKey, PersonalRecord>> = {};
  for (const r of rows) {
    const key = r.key as EffortKey;
    if (!known.has(r.key) || best[key]) continue;
    best[key] = { seconds: r.seconds, date: r.date, activityId: r.activityId, name: r.name };
  }
  return best;
}

/** Outdoor runs whose records haven't been worked out yet. Each sync takes a batch, so older history fills in over time. */
export async function countRunsToCheck(db: DB, userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activity)
    .where(
      and(
        eq(activity.userId, userId),
        isNull(activity.effortsAt),
        inArray(activity.type, [...RECORD_ACTIVITY_TYPES]),
        gte(activity.distanceM, 1000),
      ),
    );
  return n;
}

export interface WeekTotals {
  /** Monday, YYYY-MM-DD */
  start: string;
  km: number;
  /** Moving time of runs and strength sessions */
  minutes: number;
  runs: number;
  strength: number;
}

/** Totals for the last `weeks` weeks (oldest first, the current week last). Walks and other sports aren't counted. */
export async function getWeeklyTotals(
  db: DB,
  userId: string,
  today: string,
  weeks = 12,
): Promise<WeekTotals[]> {
  const currentMonday = mondayOf(today);
  const first = addDays(currentMonday, -(weeks - 1) * 7);
  const rows = await db
    .select({
      date: activity.date,
      type: activity.type,
      distanceM: activity.distanceM,
      movingTimeSec: activity.movingTimeSec,
    })
    .from(activity)
    .where(
      and(
        eq(activity.userId, userId),
        gte(activity.date, first),
        lte(activity.date, addDays(currentMonday, 6)),
      ),
    );

  const totals = Array.from({ length: weeks }, (_, i) => ({
    start: addDays(first, i * 7),
    km: 0,
    seconds: 0,
    runs: 0,
    strength: 0,
  }));
  for (const r of rows) {
    const week =
      totals[Math.floor((Date.parse(mondayOf(r.date)) - Date.parse(first)) / (7 * 86_400_000))];
    if (!week) continue;
    if (RUN_ACTIVITY_TYPES.has(r.type)) {
      week.runs++;
      week.km += (r.distanceM ?? 0) / 1000;
      week.seconds += r.movingTimeSec ?? 0;
    } else if (STRENGTH_ACTIVITY_TYPES.has(r.type)) {
      week.strength++;
      week.seconds += r.movingTimeSec ?? 0;
    }
  }
  return totals.map((w) => ({
    start: w.start,
    km: Math.round(w.km * 10) / 10,
    minutes: Math.round(w.seconds / 60),
    runs: w.runs,
    strength: w.strength,
  }));
}

export interface PointsStatus extends PointsSummary {
  tier: TierStatus;
}

/** Points, tier and streak, from every workout the athlete has completed (earlier plans included). */
export async function getPoints(db: DB, userId: string, today: string): Promise<PointsStatus> {
  const [active] = await db
    .select({ id: planTable.id })
    .from(planTable)
    .where(and(eq(planTable.userId, userId), eq(planTable.status, "active")));

  const rows: PointRow[] = await db
    .select({
      planId: plannedWorkout.planId,
      weekIndex: plannedWorkout.weekIndex,
      weekStart: planWeek.startDate,
      type: plannedWorkout.type,
      distanceKm: plannedWorkout.distanceKm,
      status: plannedWorkout.status,
    })
    .from(plannedWorkout)
    .innerJoin(
      planWeek,
      and(eq(planWeek.planId, plannedWorkout.planId), eq(planWeek.index, plannedWorkout.weekIndex)),
    )
    .where(eq(plannedWorkout.userId, userId));

  const summary = pointsSummary(rows, active?.id ?? null, today);
  return { ...summary, tier: tierFor(summary.points) };
}
