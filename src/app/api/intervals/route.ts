import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { connectIntervals, disconnectIntervals, getIntervalsStatus, syncIntervals } from "@/server/intervals/sync";
import { getTimezone, todayIn } from "@/server/profile/service";

export const runtime = "nodejs";

/** Connection status (never returns the key). */
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await getIntervalsStatus(await getDb(), user.id));
  } catch (error) {
    return errorResponse(error);
  }
}

const Connect = z.object({
  apiKey: z.string().trim().min(10, "Paste your intervals.icu API key."),
  athleteId: z.string().trim().max(32).optional().default(""),
});

/** Connect with an API key, then run the first sync. */
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const db = await getDb();
    const { apiKey, athleteId } = Connect.parse(await request.json());
    const athlete = await connectIntervals(db, user.id, apiKey, athleteId);
    const sync = await syncIntervals(db, user.id, todayIn(await getTimezone(db, user.id)));
    return Response.json({ athlete, sync });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Disconnect: forget the key and delete synced activities and wellness. */
export async function DELETE() {
  try {
    const user = await requireUser();
    await disconnectIntervals(await getDb(), user.id);
    return Response.json({ connected: false });
  } catch (error) {
    return errorResponse(error);
  }
}
