import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { matchActivities } from "@/lib/matching";
import { decryptSecret, encryptSecret } from "../crypto";
import type { DB } from "../db/client";
import { activity, athleteProfile, plan as planTable, plannedWorkout, wellness } from "../db/schema";
import { createIntervalsClient, IntervalsError, type IntervalsApi } from "./client";

/*
 * intervals.icu connection and sync. The API key is stored encrypted; activities and wellness are
 * copied into our tables so pages never wait on intervals.icu.
 */

export type ClientFactory = (apiKey: string, athleteId: string) => IntervalsApi;
const defaultFactory: ClientFactory = (key, id) => createIntervalsClient(key, id);

/** How far back each sync looks */
export const SYNC_DAYS = 60;

export interface IntervalsStatus {
  connected: boolean;
  athleteName: string | null;
  athleteId: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export async function getIntervalsStatus(db: DB, userId: string): Promise<IntervalsStatus> {
  const [p] = await db.select().from(athleteProfile).where(eq(athleteProfile.userId, userId));
  return {
    connected: !!p?.intervalsApiKeyEnc,
    athleteName: p?.intervalsAthleteName ?? null,
    athleteId: p?.intervalsAthleteId ?? null,
    lastSyncedAt: p?.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: p?.lastSyncError ?? null,
  };
}

/** Check the key against intervals.icu, then store it encrypted. */
export async function connectIntervals(db: DB, userId: string, apiKey: string, athleteId = "", factory = defaultFactory) {
  const key = apiKey.trim();
  const id = athleteId.trim() || "0";
  const athlete = await factory(key, id).getAthlete();
  const values = {
    intervalsApiKeyEnc: encryptSecret(key),
    intervalsAthleteId: athlete.id,
    intervalsAthleteName: athlete.name,
    lastSyncError: null,
    updatedAt: new Date(),
  };
  await db
    .insert(athleteProfile)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: athleteProfile.userId, set: values });
  return athlete;
}

/** Forget the key and delete synced data. Workouts keep their done status but lose the activity link. */
export async function disconnectIntervals(db: DB, userId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(athleteProfile)
      .set({ intervalsApiKeyEnc: null, intervalsAthleteId: null, intervalsAthleteName: null, lastSyncedAt: null, lastSyncError: null, updatedAt: new Date() })
      .where(eq(athleteProfile.userId, userId));
    await tx.update(plannedWorkout).set({ activityId: null }).where(eq(plannedWorkout.userId, userId));
    await tx.delete(activity).where(eq(activity.userId, userId));
    await tx.delete(wellness).where(eq(wellness.userId, userId));
  });
}

export interface SyncResult {
  activities: number;
  wellnessDays: number;
  matched: number;
  oldest: string;
  newest: string;
}

function shiftDate(iso: string, days: number) {
  return new Date(Date.parse(iso + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);
}

/** Pull the last SYNC_DAYS of activities and wellness, then match runs to planned workouts. */
export async function syncIntervals(db: DB, userId: string, today: string, factory = defaultFactory): Promise<SyncResult> {
  const [profile] = await db.select().from(athleteProfile).where(eq(athleteProfile.userId, userId));
  if (!profile?.intervalsApiKeyEnc) throw new IntervalsError("Connect intervals.icu in Settings first.", 400);

  const client = factory(decryptSecret(profile.intervalsApiKeyEnc), profile.intervalsAthleteId ?? "0");
  const oldest = shiftDate(today, -SYNC_DAYS);
  // Include tomorrow: intervals.icu dates are the athlete's local dates, which can be ahead of ours
  const newest = shiftDate(today, 1);

  try {
    const [acts, well] = await Promise.all([client.listActivities(oldest, newest), client.listWellness(oldest, newest)]);

    await db.transaction(async (tx) => {
      for (const a of acts) {
        const row = {
          userId,
          id: a.id,
          date: a.start_date_local.slice(0, 10),
          startLocal: a.start_date_local,
          type: a.type ?? "Other",
          name: a.name ?? null,
          distanceM: a.distance ?? null,
          movingTimeSec: a.moving_time != null ? Math.round(a.moving_time) : null,
          elapsedTimeSec: a.elapsed_time != null ? Math.round(a.elapsed_time) : null,
          avgHr: a.average_heartrate ?? null,
          maxHr: a.max_heartrate ?? null,
          trainingLoad: a.icu_training_load ?? null,
          elevationGainM: a.total_elevation_gain ?? null,
          raw: a as Record<string, unknown>,
          syncedAt: new Date(),
        };
        await tx.insert(activity).values(row).onConflictDoUpdate({ target: [activity.userId, activity.id], set: row });
      }
      for (const w of well) {
        const row = {
          userId,
          date: w.id,
          restingHr: w.restingHR ?? null,
          hrv: w.hrv ?? null,
          sleepSecs: w.sleepSecs != null ? Math.round(w.sleepSecs) : null,
          sleepScore: w.sleepScore ?? null,
          readiness: w.readiness ?? null,
          weightKg: w.weight ?? null,
          ctl: w.ctl ?? null,
          atl: w.atl ?? null,
          raw: w as Record<string, unknown>,
          syncedAt: new Date(),
        };
        await tx.insert(wellness).values(row).onConflictDoUpdate({ target: [wellness.userId, wellness.date], set: row });
      }
    });

    const matched = await matchActivePlan(db, userId, oldest, newest);
    await db.update(athleteProfile).set({ lastSyncedAt: new Date(), lastSyncError: null }).where(eq(athleteProfile.userId, userId));
    return { activities: acts.length, wellnessDays: well.length, matched, oldest, newest };
  } catch (error) {
    const message = error instanceof IntervalsError ? error.message : "Sync failed. Try again in a moment.";
    await db.update(athleteProfile).set({ lastSyncError: message }).where(eq(athleteProfile.userId, userId));
    throw error;
  }
}

/** Link activities to the active plan's workouts and mark them done. Returns how many new links were made. */
export async function matchActivePlan(db: DB, userId: string, oldest: string, newest: string): Promise<number> {
  const [active] = await db
    .select({ id: planTable.id })
    .from(planTable)
    .where(and(eq(planTable.userId, userId), eq(planTable.status, "active")));
  if (!active) return 0;

  const planned = await db
    .select({
      key: plannedWorkout.workoutKey,
      date: plannedWorkout.date,
      kind: plannedWorkout.kind,
      distanceKm: plannedWorkout.distanceKm,
      status: plannedWorkout.status,
      activityId: plannedWorkout.activityId,
    })
    .from(plannedWorkout)
    .where(and(eq(plannedWorkout.planId, active.id), gte(plannedWorkout.date, oldest), lte(plannedWorkout.date, newest)));
  const acts = await db
    .select({ id: activity.id, date: activity.date, type: activity.type, distanceM: activity.distanceM, startLocal: activity.startLocal })
    .from(activity)
    .where(and(eq(activity.userId, userId), gte(activity.date, shiftDate(oldest, -1)), lte(activity.date, shiftDate(newest, 1))));

  const links = matchActivities(planned, acts);
  for (const [key, activityId] of links) {
    const a = acts.find((x) => x.id === activityId)!;
    const p = planned.find((x) => x.key === key)!;
    await db
      .update(plannedWorkout)
      .set({
        activityId,
        // A manual "done" keeps its time; otherwise the activity's start is when it was done
        ...(p.status === "planned" ? { status: "completed" as const, completedAt: new Date(a.startLocal) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(plannedWorkout.planId, active.id), eq(plannedWorkout.workoutKey, key)));
  }
  return links.size;
}

/** Synced activity details for a workout, if one is linked. */
export async function getActivity(db: DB, userId: string, id: string) {
  const [row] = await db
    .select()
    .from(activity)
    .where(and(eq(activity.userId, userId), eq(activity.id, id)));
  return row ?? null;
}

export async function getActivities(db: DB, userId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(activity)
    .where(and(eq(activity.userId, userId), inArray(activity.id, ids)));
}

/** Latest wellness up to a date, plus the 7-day HRV and resting HR averages before it for context. */
export async function getWellnessSummary(db: DB, userId: string, today: string) {
  const rows = await db
    .select()
    .from(wellness)
    .where(and(eq(wellness.userId, userId), lte(wellness.date, today), gte(wellness.date, shiftDate(today, -8))))
    .orderBy(desc(wellness.date));
  const latest = rows.find((r) => r.hrv != null || r.restingHr != null || r.sleepSecs != null) ?? null;
  if (!latest) return null;
  const prior = rows.filter((r) => r.date < latest.date);
  const avg = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return {
    date: latest.date,
    hrv: latest.hrv,
    restingHr: latest.restingHr,
    sleepSecs: latest.sleepSecs,
    sleepScore: latest.sleepScore,
    ctl: latest.ctl,
    atl: latest.atl,
    hrvBaseline: avg(prior.map((r) => r.hrv)),
    restingHrBaseline: avg(prior.map((r) => r.restingHr)),
  };
}

/** Distinct activity ids already linked, for counting in Settings. */
export async function countSynced(db: DB, userId: string) {
  const [a] = await db.select({ n: sql<number>`count(*)::int` }).from(activity).where(eq(activity.userId, userId));
  const [w] = await db.select({ n: sql<number>`count(*)::int` }).from(wellness).where(eq(wellness.userId, userId));
  const [m] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(plannedWorkout)
    .where(and(eq(plannedWorkout.userId, userId), isNotNull(plannedWorkout.activityId)));
  return { activities: a.n, wellnessDays: w.n, matched: m.n };
}
