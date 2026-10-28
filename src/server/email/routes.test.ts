import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type DB } from "../db/client";
import { emailDelivery, user } from "../db/schema";
import { getEmailPreferences, setEmailPreferences } from "./preferences";
import { unsubscribeToken } from "./unsubscribe";
import { GET as runCron } from "@/app/api/cron/email/route";
import { GET as unsubscribeGet, POST as unsubscribePost } from "@/app/api/email/unsubscribe/route";

let db: DB;
vi.mock("@/server/db", () => ({ getDb: async () => db }));
beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values({ id: "readiness", name: "Runner", email: "runner@example.com", emailVerified: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("rejects cron calls when the secret is missing or wrong before accessing data", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await runCron(new Request("https://grind.test/api/cron/email"))).status).toBe(401);
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect((await runCron(new Request("https://grind.test/api/cron/email", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  vi.stubEnv("RESEND_API_KEY", "");
  expect((await runCron(new Request("https://grind.test/api/cron/email", { headers: { authorization: "Bearer test-secret" } }))).status).toBe(503);
});
it("only opens confirmation on GET and rejects invalid unsubscribe POSTs", async () => {
  const response = await unsubscribeGet(new Request("https://grind.test/api/email/unsubscribe?token=bad"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://grind.test/email/unsubscribe?token=bad");
  const bad = await unsubscribePost(new Request("https://grind.test/api/email/unsubscribe?token=bad", { method: "POST" }));
  expect(bad.status).toBe(400);
});

it("checks production readiness without queuing or delivering pending mail", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Grind <noreply@example.com>");
  await db.insert(emailDelivery).values({ key: "readiness-pending", userId: "readiness", kind: "reset", expiresAt: new Date("2040-01-01"),
    message: { to: "runner@example.com", subject: "Reset", html: "private", text: "private" } });
  vi.stubGlobal("fetch", async () => { throw new Error("Readiness must not send email"); });
  const response = await runCron(new Request("https://grind.test/api/cron/email?check=1", { headers: { authorization: "Bearer test-secret" } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ready: true });
  const [row] = await db.select().from(emailDelivery).where(eq(emailDelivery.key, "readiness-pending"));
  expect(row.attempts).toBe(0);
  expect(row.sentAt).toBeNull();
});

it("one-click unsubscribe disables only the signed email preference", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-long-enough-for-signing-123");
  await setEmailPreferences(db, "readiness", { weeklyRecap: true, weeklyPreview: true });
  const token = unsubscribeToken("readiness", "weekly-recap");
  const response = await unsubscribePost(new Request(`https://grind.test/api/email/unsubscribe?token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ unsubscribed: true });
  expect(await getEmailPreferences(db, "readiness")).toEqual({ weeklyRecap: false, weeklyPreview: true });
});
