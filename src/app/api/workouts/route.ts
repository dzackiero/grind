import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { listWorkouts } from "@/server/plans/service";

export const runtime = "nodejs";

const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Workouts of the active plan in a date range: GET /api/workouts?from=2026-11-02&to=2026-11-08 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { from, to } = Query.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json({ workouts: await listWorkouts(await getDb(), user.id, from, to) });
  } catch (error) {
    return errorResponse(error);
  }
}
