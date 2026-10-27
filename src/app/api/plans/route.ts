import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { createPlanFromInput } from "@/server/plans/service";

export const runtime = "nodejs";

/** Create a plan from the onboarding form. It becomes the active plan. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const saved = await createPlanFromInput(await getDb(), user.id, await request.json());
    return Response.json(saved, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
