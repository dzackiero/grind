import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { archiveHabit, updateHabit } from "@/server/habits/service";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** Edit a habit ({ name?, icon?, days? }) or stop tracking it ({ archived: true }). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const db = await getDb();
    const body = await request.json();
    if (
      z
        .object({ archived: z.literal(true) })
        .strict()
        .safeParse(body).success
    ) {
      await archiveHabit(db, user.id, id);
      return Response.json({ id, archived: true });
    }
    return Response.json(await updateHabit(db, user.id, id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
