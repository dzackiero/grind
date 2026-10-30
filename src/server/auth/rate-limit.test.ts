import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createAuth } from "./create-auth";
import { createDb, type DB } from "../db/client";
import { rateLimit } from "../db/schema";

let db: DB;
beforeAll(async () => { db = await createDb("memory://"); });
afterEach(() => vi.unstubAllEnvs());

function setup() {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-long-enough-for-better-auth-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  return createAuth(db);
}

/** Posts to an auth endpoint as a client at `ip` and returns the status. */
async function hit(auth: ReturnType<typeof createAuth>, path: string, ip: string) {
  const response = await auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: "{}",
    }),
  );
  return response.status;
}

it("limits dynamic client registration per IP, in the database", async () => {
  const auth = setup();
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) statuses.push(await hit(auth, "/oauth2/register", "203.0.113.10"));

  expect(statuses.slice(0, 10)).not.toContain(429);
  expect(statuses[10]).toBe(429);
  // Another client is unaffected, and the counters live in the rate_limit table so every instance sees them
  expect(await hit(auth, "/oauth2/register", "203.0.113.11")).not.toBe(429);
  const rows = await db.select().from(rateLimit);
  expect(rows.find((r) => r.key === "203.0.113.10|/oauth2/register")).toMatchObject({ count: 10 });
});

it("limits the consent step", async () => {
  const auth = setup();
  const statuses: number[] = [];
  for (let i = 0; i < 21; i++) statuses.push(await hit(auth, "/oauth2/consent", "203.0.113.20"));
  expect(statuses.slice(0, 20)).not.toContain(429);
  expect(statuses[20]).toBe(429);
});

it("limits guest sign-in per IP", async () => {
  const auth = setup();
  const statuses: number[] = [];
  for (let i = 0; i < 11; i++) statuses.push(await hit(auth, "/sign-in/anonymous", "203.0.113.30"));
  expect(statuses.slice(0, 10)).not.toContain(429);
  expect(statuses[10]).toBe(429);
});
