import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { resolveChange } from "@/server/plans/changes";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["accept", "reject"]) });

/** Accept or keep-my-plan on a suggestion from the coach. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action } = Body.parse(await request.json());
    return Response.json(await resolveChange(await getDb(), user.id, id, action));
  } catch (error) {
    return errorResponse(error);
  }
}
