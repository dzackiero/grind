import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { setWorkoutStatus } from "@/server/plans/service";

export const runtime = "nodejs";

const Body = z.object({ status: z.enum(["planned", "completed", "skipped"]) });

/** Mark a workout done, skipped, or planned again. */
export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireUser();
    const { key } = await params;
    const { status } = Body.parse(await request.json());
    const found = await setWorkoutStatus(await getDb(), user.id, key, status);
    if (!found) return Response.json({ error: "Workout not found in your active plan." }, { status: 404 });
    return Response.json({ key, status });
  } catch (error) {
    return errorResponse(error);
  }
}
