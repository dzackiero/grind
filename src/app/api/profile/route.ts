import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";
import { isValidTimezone, setTimezone } from "@/server/profile/service";

export const runtime = "nodejs";

const Body = z.object({ timezone: z.string().refine(isValidTimezone, "Unknown time zone.") });

/** Save profile settings. For now: the time zone that decides what "today" is. */
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const { timezone } = Body.parse(await request.json());
    await setTimezone(await getDb(), user.id, timezone);
    return Response.json({ timezone });
  } catch (error) {
    return errorResponse(error);
  }
}
