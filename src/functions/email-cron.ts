import { parseTriggerDelivery } from "@neon/functions/triggers";

/** A deployment-controlled origin, never a URL from the trigger payload. */
export function emailCronTarget(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "[::1]" ||
      /^[\d.]+$/.test(host)
    )
      return null;
    return new URL("/api/cron/email", url);
  } catch {
    return null;
  }
}

const handler = {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/cron")
      return Response.json({ error: "Not found" }, { status: 404 });
    if (request.method !== "POST")
      return Response.json(
        { error: "Method not allowed" },
        { status: 405, headers: { Allow: "POST" } },
      );
    // The deployed Neon proxy strips client-supplied x-neon-* headers. The SDK checks
    // that the platform's invocation header matches the scheduled delivery body.
    const parsed = await parseTriggerDelivery(request);
    if (!parsed.ok)
      return Response.json(
        { error: "Invalid trigger delivery" },
        { status: parsed.error === "invalid_body" ? 400 : 401 },
      );
    if (parsed.invocation.type !== "schedule")
      return Response.json({ error: "Expected scheduled trigger" }, { status: 400 });

    const target = emailCronTarget(process.env.CRON_TARGET_URL);
    const secret = process.env.CRON_SECRET?.trim();
    if (!target || !secret)
      return Response.json({ error: "Email cron is not configured" }, { status: 503 });
    try {
      const response = await fetch(target.href, {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(270_000),
      });
      const { invocationId, data } = parsed.invocation;
      // Read no upstream body: it may contain deployment errors or private data.
      if (!response.ok) {
        console.error(`Email cron ${invocationId}: app returned HTTP ${response.status}`);
        return Response.json(
          { error: "Email processing failed", upstreamStatus: response.status },
          { status: 502 },
        );
      }
      console.log(`Email cron ${invocationId}: completed scheduled run ${data.scheduledAt}`);
      return Response.json({ ok: true, invocationId, scheduledAt: data.scheduledAt });
    } catch {
      console.error("Email cron could not reach the configured app endpoint.");
      return Response.json({ error: "Email endpoint unavailable" }, { status: 502 });
    }
  },
};

export default handler;
