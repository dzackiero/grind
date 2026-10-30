import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { setEmailPreferences } from "@/server/email/preferences";
import { errorResponse } from "@/server/http";
import { isValidTimezone, setTimezone } from "@/server/profile/service";

const Body = z.object({
  weeklyRecap: z.boolean(),
  weeklyPreview: z.boolean(),
  timezone: z.string().refine(isValidTimezone, "Unknown time zone."),
});
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const body = Body.parse(await request.json());
    if ((body.weeklyRecap || body.weeklyPreview) && !user.emailVerified)
      return Response.json(
        { error: "Verify your email before enabling weekly emails." },
        { status: 403 },
      );
    const db = await getDb();
    const preferences = await db.transaction(async (tx) => {
      await setTimezone(tx as unknown as typeof db, user.id, body.timezone);
      return setEmailPreferences(tx as unknown as typeof db, user.id, {
        weeklyRecap: body.weeklyRecap,
        weeklyPreview: body.weeklyPreview,
      });
    });
    return Response.json({ ...preferences, timezone: body.timezone });
  } catch (error) {
    return errorResponse(error);
  }
}
