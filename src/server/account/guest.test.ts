import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth/create-auth";
import { createDb, type DB } from "../db/client";
import { session, user } from "../db/schema";
import { AccountError, GUEST_RETENTION_DAYS, pruneInactiveGuests, upgradeGuest } from "./guest";

let db: DB;
beforeAll(async () => { db = await createDb("memory://"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function configure() {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-long-enough-for-better-auth-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Grind <noreply@example.com>");
  const sent: { subject: string; to: string }[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return Response.json({ id: "provider-id" });
  });
  return sent;
}

async function guest(auth: ReturnType<typeof createAuth>) {
  const response = await auth.api.signInAnonymous({ asResponse: true });
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const current = await auth.api.getSession({ headers: new Headers({ cookie }) });
  return { cookie, id: current!.user.id };
}

it("upgrades a guest in place: same user, real credentials, verification email, nothing blocked", async () => {
  const sent = configure();
  const auth = createAuth(db);
  const { cookie, id } = await guest(auth);

  await upgradeGuest(auth, db, id, { name: "Dzaky", email: "Upgrade@Example.com", password: "a-long-password" });

  const [row] = await db.select().from(user).where(eq(user.id, id));
  expect(row).toMatchObject({ name: "Dzaky", email: "upgrade@example.com", isAnonymous: false, emailVerified: false });
  const current = await auth.api.getSession({ headers: new Headers({ cookie }) });
  expect(current?.user).toMatchObject({ id, isAnonymous: false });
  expect(sent.map((m) => m.subject)).toEqual(["Verify your email"]);
  const login = await auth.api.signInEmail({ body: { email: "upgrade@example.com", password: "a-long-password" }, asResponse: true });
  expect(login.status).toBe(200);
});

it("refuses an email that already has an account, and accounts that aren't guests", async () => {
  configure();
  const auth = createAuth(db);
  await auth.api.signUpEmail({ body: { name: "Existing", email: "existing@example.com", password: "a-long-password" } });
  const { id } = await guest(auth);
  await expect(upgradeGuest(auth, db, id, { name: "Dup", email: "existing@example.com", password: "a-long-password" })).rejects.toMatchObject({ status: 409 });
  const [existing] = await db.select().from(user).where(eq(user.email, "existing@example.com"));
  await expect(upgradeGuest(auth, db, existing.id, { name: "Dup", email: "other@example.com", password: "a-long-password" })).rejects.toBeInstanceOf(AccountError);
});

it("deletes only guests that are old and have no live session", async () => {
  configure();
  const auth = createAuth(db);
  const now = new Date();
  const old = new Date(now.getTime() - (GUEST_RETENTION_DAYS + 1) * 86_400_000);
  const abandoned = (await guest(auth)).id;
  const active = (await guest(auth)).id;
  const fresh = (await guest(auth)).id;
  const real = (await auth.api.signUpEmail({ body: { name: "Real", email: "keeper@example.com", password: "a-long-password" } })).user.id;
  for (const id of [abandoned, active, real]) await db.update(user).set({ createdAt: old }).where(eq(user.id, id));
  await db.update(session).set({ expiresAt: old }).where(eq(session.userId, abandoned));

  expect(await pruneInactiveGuests(db, now)).toBe(1);
  const remaining = (await db.select({ id: user.id }).from(user)).map((u) => u.id);
  expect(remaining).toEqual(expect.arrayContaining([active, fresh, real]));
  expect(remaining).not.toContain(abandoned);
});
