import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { setHabitDone } from "@/server/habits/service";
import { errorResponse } from "@/server/http";
import { getTimezone, todayIn } from "@/server/profile/service";

export const runtime = "nodejs";

const Body = z.object({ date: z.string(), done: z.boolean() });

/** Tick or untick a habit for a day: { date: "2026-10-28", done: true }. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { date, done } = Body.parse(await request.json());
    const db = await getDb();
    await setHabitDone(db, user.id, id, date, done, todayIn(await getTimezone(db, user.id)));
    return Response.json({ id, date, done });
  } catch (error) {
    return errorResponse(error);
  }
}
