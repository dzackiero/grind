import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db/client";

export type HistoryFilters = { type?: string; year?: number; month?: number; page?: number };
export type HistoryEntry = { id: string; date: string; startLocal: string | null; type: string; kind: string; title: string; historyTitle: string | null; focus: string | null; distanceM: number | null; movingTimeSec: number | null };
export type MonthTotals = { count: number; distanceM: number; movingTimeSec: number };
const PAGE_SIZE = 50;

function historySource(userId: string, onlyAdditional = false) {
  return sql`
    SELECT 'activity:' || a.id AS id, a.date, a.start_local AS "startLocal", a.type,
      CASE WHEN a.type IN ('Run', 'TrailRun', 'VirtualRun', 'Treadmill') THEN 'run'
           WHEN a.type IN ('WeightTraining', 'Workout', 'Crossfit', 'HighIntensityIntervalTraining') THEN 'strength' ELSE 'other' END AS kind,
      COALESCE(NULLIF(a.name, ''), a.type) AS title, h.title AS "historyTitle", h.focus,
      a.distance_m AS "distanceM", a.moving_time_sec AS "movingTimeSec"
    FROM activity a
    LEFT JOIN workout_activity wa ON wa.user_id = a.user_id AND wa.activity_id = a.id
    LEFT JOIN historical_workout h ON h.id = wa.history_id AND h.user_id = a.user_id
    WHERE a.user_id = ${userId}
    ${onlyAdditional ? sql`AND NOT EXISTS (
      SELECT 1 FROM planned_workout pw
      JOIN plan p ON p.id = pw.plan_id AND p.user_id = pw.user_id AND p.status = 'active'
      WHERE pw.user_id = a.user_id AND pw.date = a.date AND (
        EXISTS (
          SELECT 1 FROM workout_activity linked
          WHERE linked.user_id = a.user_id AND linked.activity_id = a.id AND linked.planned_workout_id = pw.id
        ) OR (
          pw.activity_id = a.id AND NOT EXISTS (
            SELECT 1 FROM workout_activity claimed
            WHERE claimed.user_id = a.user_id AND claimed.activity_id = a.id
              AND claimed.planned_workout_id IS DISTINCT FROM pw.id
          )
        )
      )
    )` : sql``}
    UNION ALL
    SELECT 'history:' || h.id::text, h.date, NULL::text, h.kind, h.kind, h.title, NULL::text, h.focus, NULL::real, NULL::integer
    FROM historical_workout h
    WHERE h.user_id = ${userId} AND NOT EXISTS (
      SELECT 1 FROM workout_activity wa WHERE wa.user_id = h.user_id AND wa.history_id = h.id
    )`;
}

/** Recorded training not already represented by a plan card on the same date.
 * Includes every activity type and manual history; archived/different-date links
 * must not hide an activity. Read-only: displaying an activity never completes a plan workout.
 */
export async function listAdditionalTraining(db: DB, userId: string, from: string, to: string): Promise<HistoryEntry[]> {
  z.iso.date().parse(from);
  z.iso.date().parse(to);
  if (from > to) throw new RangeError("Invalid date range.");
  const result = await db.execute(sql`
    SELECT id, to_char(date, 'YYYY-MM-DD') AS date, "startLocal", type, kind, title, "historyTitle", focus, "distanceM", "movingTimeSec"
    FROM (${historySource(userId, true)}) entries
    WHERE date >= ${from}::date AND date <= ${to}::date
    ORDER BY date ASC, "startLocal" ASC NULLS LAST, id ASC
  `);
  return (result as { rows: HistoryEntry[] }).rows;
}

/** Returns at most one page of the viewer's history, without loading activity payloads. */
export async function listWorkoutHistory(db: DB, userId: string, filters: HistoryFilters) {
  const page = Number.isFinite(filters.page) ? Math.min(10000, Math.max(1, Math.trunc(filters.page!))) : 1;
  const type = ["run", "strength", "other"].includes(filters.type || "") ? filters.type : undefined;
  const year = filters.year && filters.year >= 1900 && filters.year <= 9999 ? Math.trunc(filters.year) : undefined;
  const month = filters.month && filters.month >= 1 && filters.month <= 12 ? Math.trunc(filters.month) : undefined;
  const source = historySource(userId);
  const condition = sql`WHERE 1=1 ${type ? sql`AND kind = ${type}` : sql``} ${year ? sql`AND EXTRACT(YEAR FROM date) = ${year}` : sql``} ${month ? sql`AND EXTRACT(MONTH FROM date) = ${month}` : sql``}`;
  const [result, yearsResult, totalsResult] = await Promise.all([
    db.execute(sql`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, "startLocal", type, kind, title, "historyTitle", focus, "distanceM", "movingTimeSec" FROM (${source}) entries ${condition} ORDER BY date DESC, "startLocal" DESC NULLS LAST, id DESC LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`),
    db.execute(sql`SELECT DISTINCT EXTRACT(YEAR FROM date)::integer AS year FROM (${source}) entries ORDER BY year DESC`),
    // Month totals cover every matching entry, not only the current page
    db.execute(sql`SELECT to_char(date, 'YYYY-MM') AS month, COUNT(*)::integer AS count, COALESCE(SUM("distanceM"), 0)::float AS "distanceM", COALESCE(SUM("movingTimeSec"), 0)::float AS "movingTimeSec" FROM (${source}) entries ${condition} GROUP BY 1`),
  ]);
  const rows = (result as { rows: HistoryEntry[] }).rows;
  const totals: Record<string, MonthTotals> = {};
  for (const r of (totalsResult as { rows: (MonthTotals & { month: string })[] }).rows) totals[r.month] = { count: r.count, distanceM: r.distanceM, movingTimeSec: r.movingTimeSec };
  return { entries: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE, page, years: (yearsResult as { rows: { year: number }[] }).rows.map((r) => r.year), totals };
}

