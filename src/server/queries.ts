import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "./auth";
import { getDb } from "./db";
import { getActivities, getIntervalsStatus, getWellnessSummary } from "./intervals/sync";
import type { Actuals } from "@/lib/plan-view";
import { describeChanges } from "@/lib/plan";
import { listPendingChanges } from "./plans/changes";
import { getActivePlan } from "./plans/service";
import { countRunsToCheck, getPoints, getRecords, getWeeklyTotals } from "./progress/service";
import { getTimezone, todayIn } from "./profile/service";

// Per-request cached reads for server components, so layout and page share one query.

export const getViewer = cache(getCurrentUser);

/** Signed-in user, or redirect to sign in. */
export const requireViewer = cache(async () => {
  const user = await getViewer();
  if (!user) redirect("/sign-in");
  return user;
});

export const getViewerPlan = cache(async () => {
  const user = await requireViewer();
  return getActivePlan(await getDb(), user.id);
});

/** Active plan, or redirect to onboarding. */
export const requireViewerPlan = cache(async () => {
  const saved = await getViewerPlan();
  if (!saved) redirect("/onboarding");
  return saved;
});

/** Synced activities linked to the active plan, keyed by workout id. */
export const getViewerActuals = cache(async (): Promise<Actuals> => {
  const user = await requireViewer();
  const saved = await getViewerPlan();
  if (!saved) return {};
  const links = Object.entries(saved.progress).filter(([, p]) => p.activityId) as [string, { activityId: string }][];
  const rows = await getActivities(
    await getDb(),
    user.id,
    links.map(([, p]) => p.activityId),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Actuals = {};
  for (const [key, p] of links) {
    const a = byId.get(p.activityId);
    if (a)
      out[key] = {
        activityId: a.id,
        name: a.name,
        distanceM: a.distanceM,
        movingTimeSec: a.movingTimeSec,
        avgHr: a.avgHr,
        maxHr: a.maxHr,
        trainingLoad: a.trainingLoad,
        elevationGainM: a.elevationGainM,
      };
  }
  return out;
});

export const getViewerWellness = cache(async () => {
  const user = await requireViewer();
  return getWellnessSummary(await getDb(), user.id, await getViewerToday());
});

/** Coach suggestions waiting for an answer, ready to show. */
export const getViewerPendingChanges = cache(async () => {
  const user = await requireViewer();
  const pending = await listPendingChanges(await getDb(), user.id);
  return pending.map((c) => ({ id: c.id, summary: c.summary, lines: describeChanges(c.changes) }));
});

/** Everything on the Progress page: points and tier, personal records, the last 12 weeks, and runs still to check. */
export const getViewerProgress = cache(async () => {
  const user = await requireViewer();
  const db = await getDb();
  const today = await getViewerToday();
  const [points, records, weeks, toCheck] = await Promise.all([
    getPoints(db, user.id, today),
    getRecords(db, user.id),
    getWeeklyTotals(db, user.id, today, 12),
    countRunsToCheck(db, user.id),
  ]);
  return { points, records, weeks, toCheck };
});

export const getViewerIntervals = cache(async () => {
  const user = await requireViewer();
  return getIntervalsStatus(await getDb(), user.id);
});

/** Today's date in the user's time zone. */
export const getViewerToday = cache(async () => {
  const user = await requireViewer();
  return todayIn(await getTimezone(await getDb(), user.id));
});
