import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { syncIntervals } from "@/server/intervals/sync";
import { getTimezone, todayIn } from "@/server/profile/service";

export const runtime = "nodejs";

/** Pull recent activities and wellness from intervals.icu and match them to the plan. */
export async function POST() {
  try {
    const user = await requireUser();
    const db = await getDb();
    return Response.json(await syncIntervals(db, user.id, todayIn(await getTimezone(db, user.id))));
  } catch (error) {
    return errorResponse(error);
  }
}
