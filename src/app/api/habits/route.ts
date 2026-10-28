import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { createHabit } from "@/server/habits/service";
import { errorResponse } from "@/server/http";

export const runtime = "nodejs";

/** Add a habit: { name, icon?, days: ["mon", …] }. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const habit = await createHabit(await getDb(), user.id, await request.json());
    return Response.json(habit, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
