import { timingSafeEqual } from "node:crypto";
import { pruneInactiveGuests } from "@/server/account/guest";
import { getDb } from "@/server/db";
import { emailDelivery, emailPreference } from "@/server/db/schema";
import { deliverPendingEmails } from "@/server/email/outbox";
import { emailConfigured } from "@/server/email/transport";
import { queueWeeklyEmails } from "@/server/email/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || expected.length !== provided.length || !timingSafeEqual(expected, provided)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Housekeeping rides on this schedule: abandoned guest accounts expire after 30 days.
  await getDb().then((db) => pruneInactiveGuests(db)).catch(() => console.error("Guest cleanup failed."));
  if (!emailConfigured()) return Response.json({ error: "Email delivery is not configured." }, { status: 503 });
  try {
    const db = await getDb();
    if (new URL(request.url).searchParams.get("check") === "1") {
      // Authenticated readiness probe: checks config and migration without
      // queuing/sending mail or changing preferences.
      await Promise.all([
        db.select({ key: emailDelivery.key }).from(emailDelivery).limit(1),
        db.select({ userId: emailPreference.userId }).from(emailPreference).limit(1),
      ]);
      return Response.json({ ready: true });
    }
    const deadline = Date.now() + 240_000;
    // Drain older retries before generating new weekly messages, then use remaining time for new mail.
    const previous = await deliverPendingEmails(db, { limit: 20, pauseMs: 600, deadline });
    const queued = await queueWeeklyEmails(db, new Date(), deadline);
    const current = await deliverPendingEmails(db, { limit: 20, pauseMs: 600, deadline });
    const delivered = { sent: previous.sent + current.sent, failed: previous.failed + current.failed };
    // Retried rows remain in the outbox; return a failed status so the scheduled run is observable.
    return Response.json({ ...queued, ...delivered }, { status: delivered.failed ? 502 : 200 });
  } catch {
    console.error("Email cron failed. Check database connectivity and email configuration.");
    return Response.json({ error: "Email processing failed." }, { status: 500 });
  }
}
