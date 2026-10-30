import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { getTimezone, todayIn } from "@/server/profile/service";
import { saveExerciseSets } from "@/server/strength/service";

export const runtime = "nodejs";

/**
 * Save the logged sets of one exercise in a strength workout, replacing what was there:
 * { exerciseId, exerciseName, sets: [{ reps, weightKg, seconds, done }] }. An empty list clears the exercise.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await requireUser();
    const { key } = await params;
    const db = await getDb();
    const result = await saveExerciseSets(
      db,
      user.id,
      decodeURIComponent(key),
      await request.json(),
      todayIn(await getTimezone(db, user.id)),
    );
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
