import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { listPendingChanges } from "@/server/plans/changes";

export const runtime = "nodejs";

/** Suggestions from the coach that are waiting for an answer. */
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ changes: await listPendingChanges(await getDb(), user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
