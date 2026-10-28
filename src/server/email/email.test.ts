import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createDb, type DB } from "../db/client";
import { emailDelivery, user } from "../db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "./transport";
import { accountEmail } from "./templates";
import { deliverPendingEmails, enqueueEmail } from "./outbox";
import { readUnsubscribeToken, unsubscribeToken } from "./unsubscribe";

let db: DB;
beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values({ id: "email-user", name: "Runner", email: "runner@example.com", emailVerified: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("escapes untrusted names and produces text and HTML links", () => {
  const email = accountEmail("verify", '<img src=x onerror="alert(1)">', "https://grind.test/verify?a=1&b=2");
  expect(email.html).not.toContain('<img src=x');
  expect(email.html).toContain("&lt;img");
  expect(email.text).toContain("https://grind.test/verify?a=1&b=2");
  expect(email.html).toContain("a=1&amp;b=2");
});

it("sends server-side credentials and a stable idempotency key; rejects provider errors without leaking payloads", async () => {
  vi.stubEnv("RESEND_API_KEY", "private-test-key");
  vi.stubEnv("EMAIL_FROM", "Grind <noreply@example.com>");
  const requests: RequestInit[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    requests.push(init);
    return Response.json({ message: "secret-provider-detail" }, { status: 429 });
  });
  await expect(sendEmail({ to: "runner@example.com", subject: "Verify", html: "<p>hello</p>", text: "hello" }, "stable-key"))
    .rejects.toThrow("Email provider returned HTTP 429");
  expect(requests[0].headers).toMatchObject({ Authorization: "Bearer private-test-key", "Idempotency-Key": "stable-key" });
  expect(JSON.parse(requests[0].body as string)).toMatchObject({ from: "Grind <noreply@example.com>", to: ["runner@example.com"] });
});

it("queues once and leases concurrent deliveries so only one message is sent", async () => {
  const message = { to: "runner@example.com", ...accountEmail("welcome", "Runner", "http://localhost:3000/onboarding") };
  await enqueueEmail(db, { key: "welcome-email-user", userId: "email-user", kind: "welcome", message });
  await enqueueEmail(db, { key: "welcome-email-user", userId: "email-user", kind: "welcome", message });
  let deliveries = 0;
  const send = async () => { deliveries++; return "provider-id"; };
  await Promise.all([deliverPendingEmails(db, { send }), deliverPendingEmails(db, { send })]);
  expect(deliveries).toBe(1);
  const [row] = await db.select().from(emailDelivery).where(eq(emailDelivery.key, "welcome-email-user"));
  expect(row.sentAt).toBeInstanceOf(Date);
});

it("keeps failed delivery retryable without sending expired links", async () => {
  const now = new Date("2026-10-28T00:00:00Z");
  const message = { to: "runner@example.com", ...accountEmail("reset", "Runner", "https://grind.test/reset-password?token=private") };
  await enqueueEmail(db, { key: "reset-retry", userId: "email-user", kind: "reset", message, now, expiresAt: new Date("2026-10-28T01:00:00Z") });
  const first = await deliverPendingEmails(db, { now, send: async () => { throw new Error("failure"); } });
  expect(first.failed).toBe(1);
  let calls = 0;
  await deliverPendingEmails(db, { now: new Date("2026-10-28T00:10:00Z"), send: async () => { calls++; return "sent"; } });
  expect(calls).toBe(1);
  await enqueueEmail(db, { key: "expired-reset", userId: "email-user", kind: "reset", message, now, expiresAt: new Date("2026-10-28T00:05:00Z") });
  await deliverPendingEmails(db, { now: new Date("2026-10-28T02:00:00Z"), send: async () => { calls++; return "sent"; } });
  expect(calls).toBe(1);
});

it("rejects tampered unsubscribe tokens and scopes a valid token to one user and email type", () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-signing-secret-long-enough-123456");
  const token = unsubscribeToken("email-user", "weekly-recap");
  expect(readUnsubscribeToken(token)).toEqual({ userId: "email-user", kind: "weekly-recap" });
  expect(readUnsubscribeToken(token + "x")).toBeNull();
  expect(readUnsubscribeToken("invalid")).toBeNull();
});

it("rechecks expiry as a slow batch progresses", async () => {
  const now = new Date("2026-12-01T00:00:00Z");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  const message = { to: "runner@example.com", ...accountEmail("reset", "Runner", "https://grind.test/reset") };
  await enqueueEmail(db, { key: "slow-first", userId: "email-user", kind: "reset", message, now: new Date(now.getTime() - 2000) });
  await enqueueEmail(db, { key: "expires-in-batch", userId: "email-user", kind: "reset", message, now: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 60_000) });
  const delivered: string[] = [];
  await deliverPendingEmails(db, { send: async (_message, key) => {
    delivered.push(key);
    vi.setSystemTime(new Date(now.getTime() + 120_000));
    return "id";
  } });
  expect(delivered).toEqual(["slow-first"]);
});
