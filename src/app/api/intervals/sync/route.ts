import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { IntervalsError } from "@/server/intervals/client";
import { getIntervalsStatus, syncIntervals } from "@/server/intervals/sync";
import { getTimezone, todayIn } from "@/server/profile/service";

export const runtime = "nodejs";

/** Each sync is a year of activities plus stream fetches from intervals.icu, so repeat calls are refused for a few seconds. */
const SYNC_COOLDOWN_MS = 10_000;

/** Pull recent activities and wellness from intervals.icu and match them to the plan. */
export async function POST() {
  try {
    const user = await requireUser();
    const db = await getDb();
    const { lastSyncedAt } = await getIntervalsStatus(db, user.id);
    if (lastSyncedAt && Date.now() - Date.parse(lastSyncedAt) < SYNC_COOLDOWN_MS)
      throw new IntervalsError("Just synced. Try again in a few seconds.", 429);
    return Response.json(await syncIntervals(db, user.id, todayIn(await getTimezone(db, user.id))));
  } catch (error) {
    return errorResponse(error);
  }
}
