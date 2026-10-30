import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createDb, type DB } from "../db/client";
import { createAuth } from "../auth/create-auth";
import { emailDelivery } from "../db/schema";

let db: DB;
beforeAll(async () => {
  db = await createDb("memory://");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("lets people in before verifying, welcomes once verified, and resets a password with confirmation and session revocation", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-long-enough-for-better-auth-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Grind <noreply@example.com>");
  const sent: { subject: string; text: string }[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return Response.json({ id: "provider-id" });
  });
  const auth = createAuth(db);
  const signup = await auth.api.signUpEmail({
    body: {
      name: "Runner",
      email: "auth-email@example.com",
      password: "original-password",
      callbackURL: "/sign-in",
    },
  });
  expect(signup.token).toBeTruthy();
  expect(sent.map((s) => s.subject)).toEqual(["Verify your email"]);
  const unverified = await auth.api.signInEmail({
    body: { email: "auth-email@example.com", password: "original-password" },
    asResponse: true,
  });
  expect(unverified.status).toBe(200);
  const verifyUrl = sent[0].text.match(/http:\/\/localhost:3000\/api\/auth\/verify-email\?\S+/)![0];
  const verified = await auth.api.verifyEmail({
    query: { token: new URL(verifyUrl).searchParams.get("token")! },
  });
  expect(verified).toMatchObject({ status: true });
  expect(sent.filter((s) => s.subject === "Welcome to Grind")).toHaveLength(1);
  const login = await auth.api.signInEmail({
    body: { email: "auth-email@example.com", password: "original-password" },
    asResponse: true,
  });
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  await auth.api.requestPasswordReset({
    body: { email: "auth-email@example.com", redirectTo: "http://localhost:3000/reset-password" },
  });
  const reset = sent.find((s) => s.subject === "Reset your password")!;
  const resetUrl = reset.text.match(/http:\/\/localhost:3000\/api\/auth\/reset-password\/\S+/)![0];
  const token = new URL(resetUrl).pathname.split("/").at(-1)!;
  await auth.api.resetPassword({ body: { token, newPassword: "replacement-password" } });
  expect(sent.filter((s) => s.subject === "Your password was changed")).toHaveLength(1);
  expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  const newLogin = await auth.api.signInEmail({
    body: { email: "auth-email@example.com", password: "replacement-password" },
    asResponse: true,
  });
  expect(newLogin.status).toBe(200);
  await expect(
    auth.api.resetPassword({ body: { token, newPassword: "another-password" } }),
  ).rejects.toThrow();
});

it("persists an auth email for retry when Resend is down", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-long-enough-for-better-auth-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Grind <noreply@example.com>");
  vi.stubGlobal("fetch", async () => Response.json({}, { status: 503 }));
  await createAuth(db).api.signUpEmail({
    body: { name: "Retry", email: "retry-auth@example.com", password: "original-password" },
  });
  const pending = (await db.select().from(emailDelivery)).filter(
    (row) => row.message.to === "retry-auth@example.com",
  );
  expect(pending).toHaveLength(1);
  expect(pending[0].sentAt).toBeNull();
  expect(pending[0].attempts).toBe(1);
});

it("starts a guest session without an email address and never mails it", async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-long-enough-for-better-auth-123");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "Grind <noreply@example.com>");
  const sent: unknown[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string));
    return Response.json({ id: "provider-id" });
  });
  const auth = createAuth(db);
  const response = await auth.api.signInAnonymous({ asResponse: true });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  expect(session?.user).toMatchObject({ name: "Guest", isAnonymous: true, emailVerified: false });
  expect(session?.user.email.endsWith("@guest.invalid")).toBe(true);
  expect(sent).toEqual([]);
});
