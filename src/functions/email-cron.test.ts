import { afterEach, expect, it, vi } from "vitest";
import handler from "./email-cron";

const payload = {
  version: 1,
  invocation_id: "test-invocation",
  trigger: { type: "schedule", id: "trigger-test", name: "email-every-15-minutes" },
  data: { scheduled_at: "2026-10-28T10:15:00Z" },
};
function request(body: unknown = payload, invocationId = "test-invocation") {
  return new Request("https://email.compute.test/cron", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(invocationId ? { "x-neon-trigger-invocation-id": invocationId } : {}),
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("rejects public and mismatched trigger requests before touching the email endpoint", async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("Unauthenticated request reached fetch");
  });
  expect((await handler.fetch(request(payload, ""))).status).toBe(401);
  expect((await handler.fetch(request(payload, "wrong-id"))).status).toBe(401);
  expect((await handler.fetch(request({ ...payload, data: {} }))).status).toBe(400);
  expect((await handler.fetch(new Request("https://email.compute.test/cron"))).status).toBe(405);
  expect(
    (await handler.fetch(new Request("https://email.compute.test/elsewhere", { method: "POST" })))
      .status,
  ).toBe(404);
});

it.each([
  "",
  "http://localhost:3000",
  "https://localhost",
  "https://127.0.0.1",
  "https://user:password@grind.test",
  "https://grind.test/other",
  "https://grind.test/?key=private",
])("refuses invalid or non-production target configuration: %s", async (target) => {
  vi.stubEnv("CRON_TARGET_URL", target);
  vi.stubEnv("CRON_SECRET", "private-cron-secret");
  const response = await handler.fetch(request());
  expect(response.status).toBe(503);
});

it("requires a secret before invoking the production endpoint", async () => {
  vi.stubEnv("CRON_TARGET_URL", "https://grind.test");
  vi.stubEnv("CRON_SECRET", "");
  expect((await handler.fetch(request())).status).toBe(503);
});

it("calls only the configured app endpoint with the secret and never follows redirects", async () => {
  vi.stubEnv("CRON_TARGET_URL", "https://grind.test/");
  vi.stubEnv("CRON_SECRET", "private-cron-secret");
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({ sent: 1, failed: 0, privateUpstreamDetail: "must-not-be-forwarded" });
  });
  const response = await handler.fetch(request());
  expect(response.status).toBe(200);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://grind.test/api/cron/email");
  expect(calls[0].init).toMatchObject({
    method: "GET",
    redirect: "manual",
    headers: { Authorization: "Bearer private-cron-secret" },
  });
  const body = await response.text();
  expect(body).toContain("test-invocation");
  expect(body).not.toContain("private-cron-secret");
  expect(body).not.toContain("must-not-be-forwarded");
});

it.each([302, 401, 404, 429, 500, 502])(
  "reports unsuccessful upstream status %s without leaking its response",
  async (status) => {
    vi.stubEnv("CRON_TARGET_URL", "https://grind.test");
    vi.stubEnv("CRON_SECRET", "private-cron-secret");
    vi.stubGlobal("fetch", async () => new Response("private upstream body", { status }));
    const response = await handler.fetch(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private upstream body");
  },
);

it("reports network errors without leaking request credentials", async () => {
  vi.stubEnv("CRON_TARGET_URL", "https://grind.test");
  vi.stubEnv("CRON_SECRET", "private-cron-secret");
  vi.stubGlobal("fetch", async () => {
    throw new Error("private-cron-secret");
  });
  const response = await handler.fetch(request());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private-cron-secret");
});
