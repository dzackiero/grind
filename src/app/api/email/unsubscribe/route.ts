import { getDb } from "@/server/db";
import { setEmailPreferences } from "@/server/email/preferences";
import { readUnsubscribeToken } from "@/server/email/unsubscribe";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return Response.redirect(
    new URL(`/email/unsubscribe?${new URLSearchParams({ token })}`, request.url),
    303,
  );
}

/** One-click mail clients POST here. GET never changes a subscription (link scanners are safe). */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const data = readUnsubscribeToken(token);
  if (!data) return Response.json({ error: "This unsubscribe link is invalid." }, { status: 400 });
  await setEmailPreferences(
    await getDb(),
    data.userId,
    data.kind === "weekly-recap" ? { weeklyRecap: false } : { weeklyPreview: false },
  );
  const form = await request.formData().catch(() => null);
  if (form?.get("List-Unsubscribe") === "One-Click") return Response.json({ unsubscribed: true });
  return Response.redirect(new URL("/email/unsubscribe?done=1", request.url), 303);
}
