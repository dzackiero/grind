import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "./auth";
import { getDb } from "./db";
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

/** Today's date in the user's time zone. */
export const getViewerToday = cache(async () => {
  const user = await requireViewer();
  return todayIn(await getTimezone(await getDb(), user.id));
});
