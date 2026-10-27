import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "./auth";
import { getDb } from "./db";
import { getActivities, getIntervalsStatus, getWellnessSummary } from "./intervals/sync";
import type { Actuals } from "@/lib/plan-view";
import { getActivePlan } from "./plans/service";
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

export const getViewerIntervals = cache(async () => {
  const user = await requireViewer();
  return getIntervalsStatus(await getDb(), user.id);
});

/** Today's date in the user's time zone. */
export const getViewerToday = cache(async () => {
  const user = await requireViewer();
  return todayIn(await getTimezone(await getDb(), user.id));
});
