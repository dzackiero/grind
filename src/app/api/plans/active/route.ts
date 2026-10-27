import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { getActivePlan } from "@/server/plans/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const saved = await getActivePlan(await getDb(), user.id);
    if (!saved) return Response.json({ error: "No active plan yet." }, { status: 404 });
    return Response.json(saved);
  } catch (error) {
    return errorResponse(error);
  }
}
