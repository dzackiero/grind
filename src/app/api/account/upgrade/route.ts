import { z } from "zod";
import { upgradeGuest, AccountError } from "@/server/account/guest";
import { getAuth, requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { errorResponse } from "@/server/http";

const Body = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

/** Turns the signed-in guest into a full account with an email and password. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = Body.parse(await request.json());
    const result = await upgradeGuest(await getAuth(), await getDb(), user.id, body);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AccountError)
      return Response.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
