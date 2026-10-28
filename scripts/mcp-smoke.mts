/* eslint-disable @typescript-eslint/no-explicit-any -- this script reads arbitrary JSON from HTTP and MCP responses */
// End-to-end check of Kilo's OAuth + MCP, playing the part of an MCP client such as Claude.
// Run the app (pnpm dev or pnpm start), then: pnpm mcp:smoke [baseUrl]
// Creates a throwaway user and OAuth clients in the database, and deletes them at the end.
import { createHash, randomBytes } from "node:crypto";
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const email = `mcp-smoke-${Date.now()}@kilo.test`;
const password = randomBytes(12).toString("base64url");
// Against a real https site the test client uses an https callback, like Claude; locally a loopback one
const HTTPS = base.startsWith("https://");
const REDIRECT = HTTPS ? "https://example.com/oauth/callback" : "http://127.0.0.1:8976/callback";
let failures = 0;
let cookie = "";
/** Deletes this run's athlete (cascades to plans and tokens) and the OAuth clients it registered. Safe to call twice. */
async function cleanup() {
  const { Client } = await import("pg");
  const db = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(`delete from "user" where email = $1`, [email]);
    await db.query(`delete from oauth_client where name like 'Kilo smoke test%'`);
    const r = await db.query(`select (select count(*) from oauth_client where name like 'Kilo smoke test%')::int as clients, (select count(*) from "user" where email = $1)::int as users`, [email]);
    return r.rows[0] as { clients: number; users: number };
  } finally {
    await db.end();
  }
}
// If anything throws part-way, still remove what this run created
for (const event of ["uncaughtException", "unhandledRejection"] as const)
  process.on(event, async (error) => {
    console.error(error);
    await cleanup().catch(() => {});
    process.exit(1);
  });

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const b64url = (b: Buffer) => b.toString("base64url");
const claimsOf = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

async function api(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { res, status: res.status, json: json as any, text };
}

/** One JSON-RPC call to /api/mcp. The response is JSON or an SSE stream. */
async function rpc(token: string, method: string, params: unknown = {}, id = 1) {
  const res = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`, "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  const data = res.headers.get("content-type")?.includes("event-stream") ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).at(-1) : text;
  return { status: res.status, body: data ? JSON.parse(data) : null };
}
const tool = async (token: string, name: string, args: unknown = {}) => {
  const r = await rpc(token, "tools/call", { name, arguments: args }, 7);
  const out = r.body?.result;
  const txt: string = out?.content?.[0]?.text ?? "";
  let json: any = null;
  try {
    json = JSON.parse(txt);
  } catch {}
  return { isError: !!out?.isError, text: txt, json, error: r.body?.error };
};

/** Register a client, sign it in as the current user and walk the authorization flow. Returns its tokens. */
async function connect(scope: string, name: string) {
  const reg = await api("POST", "/api/auth/oauth2/register", {
    client_name: name,
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: "none",
    application_type: HTTPS ? "web" : "native",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope,
  });
  const clientId: string = reg.json?.client_id;
  const verifier = b64url(randomBytes(32));
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    scope,
    state: "xyz",
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    resource: `${base}/api/mcp`,
  });
  const auth = await api("GET", `/api/auth/oauth2/authorize?${q}`);
  // A browser gets a 302; a script fetch (sec-fetch-mode: cors) gets the same target as JSON
  const location = auth.res.headers.get("location") ?? auth.json?.url ?? "";
  const consentUrl = new URL(location, base);
  return { clientId, verifier, consentUrl, regStatus: reg.status, authStatus: auth.status, authBody: auth.text.slice(0, 200), location };
}

async function finish(c: Awaited<ReturnType<typeof connect>>) {
  const consent = await api("POST", "/api/auth/oauth2/consent", { accept: true, oauth_query: c.consentUrl.search.slice(1) });
  const redirectUrl = new URL(consent.json?.url ?? "http://none");
  const code = redirectUrl.searchParams.get("code") ?? "";
  const token = await fetch(`${base}/api/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: c.clientId, code_verifier: c.verifier, resource: `${base}/api/mcp` }),
  });
  return { consent, redirectUrl, code, tokenStatus: token.status, tokens: (await token.json().catch(() => ({}))) as Record<string, string> };
}

// ---- discovery ----
const rm = await api("GET", "/.well-known/oauth-protected-resource/api/mcp");
check("Protected resource metadata is served", rm.status === 200 && rm.json?.resource === `${base}/api/mcp`, `resource ${rm.json?.resource}`);
const asm = await api("GET", "/.well-known/oauth-authorization-server/api/auth");
check("Authorization server metadata lists endpoints, PKCE and registration", asm.status === 200 && !!asm.json?.registration_endpoint && asm.json?.code_challenge_methods_supported?.includes("S256"));

const noAuth = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
check("MCP endpoint refuses a request without a token", noAuth.status === 401 && /resource_metadata/.test(noAuth.headers.get("www-authenticate") ?? ""), `status ${noAuth.status}`);
check("GET on the MCP endpoint is refused", (await fetch(`${base}/api/mcp`)).status === 405);

// ---- an athlete with a plan ----
const up = await api("POST", "/api/auth/sign-up/email", { name: "Smoke Runner", email, password });
check("Athlete signs up", up.status === 200 && !!cookie);
const plan = await api("POST", "/api/plans", {
  goal: "half",
  raceDate: new Date(Date.now() + 84 * 86_400_000).toISOString().slice(0, 10),
  startDate: new Date().toISOString().slice(0, 10),
  experience: "intermediate",
  currentWeeklyKm: 15,
  runDays: ["tue", "thu", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 2, days: ["mon", "wed"], equipment: "gym" },
  intensity: "balanced",
});
check("Athlete has a plan", plan.status === 201, `status ${plan.status}`);

// ---- full access client ----
const FULL = "openid offline_access plan:read plan:write";
const a = await connect(FULL, "Kilo smoke test");
check("Client registers itself", a.regStatus === 200 || a.regStatus === 201, `status ${a.regStatus}`);
check("Authorize sends the signed-in athlete to the consent page", a.consentUrl.pathname === "/consent" && a.consentUrl.searchParams.has("sig"), `status ${a.authStatus} location "${decodeURIComponent(a.location).slice(0, 400)}"`);

const page = await fetch(a.consentUrl, { headers: { cookie } });
// React puts <!-- --> between adjacent text nodes; ignore them when reading the page
const html = (await page.text()).replace(/<!-- -->/g, "");
const wanted = ["Connect Kilo smoke test to Kilo?", "See your training", "Suggest changes to your plan", new URL(REDIRECT).host];
const missingText = wanted.filter((t) => !html.includes(t));
check("Consent page shows who is asking and what for", page.status === 200 && !missingText.length, `status ${page.status}, missing: ${missingText.join(" | ") || "nothing"}`);
const tampered = new URL(a.consentUrl);
tampered.searchParams.set("scope", "openid plan:write plan:read offline_access email");
const bad = await (await fetch(tampered, { headers: { cookie } })).text();
check("Consent page rejects an edited link", bad.includes("This link isn&#x27;t valid") || bad.includes("This link isn't valid"));

const done = await finish(a);
check("Approving returns a code to the client's redirect", done.redirectUrl.origin + done.redirectUrl.pathname === REDIRECT && !!done.code && done.redirectUrl.searchParams.get("state") === "xyz");
const access = done.tokens.access_token;
check("Code is exchanged for an access and refresh token", done.tokenStatus === 200 && !!access && !!done.tokens.refresh_token, `status ${done.tokenStatus}`);
const claims = access ? claimsOf(access) : {};
check("Token is bound to the MCP address and this athlete", claims.aud === `${base}/api/mcp` || (Array.isArray(claims.aud) && claims.aud.includes(`${base}/api/mcp`)), `aud ${JSON.stringify(claims.aud)}, scope "${claims.scope}", lasts ${claims.exp - claims.iat}s`);

// ---- MCP with the token ----
const init = await rpc(access, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } }, 1);
check("MCP initialize works and carries the coaching instructions", init.status === 200 && init.body?.result?.serverInfo?.name === "kilo" && /coach/i.test(init.body?.result?.instructions ?? ""), `status ${init.status}`);
const list = await rpc(access, "tools/list", {}, 2);
const names: string[] = (list.body?.result?.tools ?? []).map((t: { name: string }) => t.name);
const expected = ["get_plan", "get_week", "get_workout", "get_recent_activities", "get_recovery", "propose_plan_changes", "apply_plan_changes", "discard_plan_changes", "write_coach_notes"];
check("Full-access token sees all tools", expected.every((n) => names.includes(n)), names.join(", "));

const overview = await tool(access, "get_plan");
check("get_plan returns the athlete's plan", overview.json?.goal === "half" && overview.json?.weeks?.length >= 10 && !!overview.json?.paces?.E, `${overview.json?.title}, ${overview.json?.weeks?.length} weeks`);
const week = await tool(access, "get_week", {});
const workouts: any[] = week.json?.workouts ?? [];
check("get_week lists workouts with ids", workouts.length >= 3 && workouts.every((w) => !!w.id), `${workouts.length} workouts in week ${week.json?.week}`);
const detail = await tool(access, "get_workout", { workoutId: workouts.find((w) => w.type !== "strength")?.id });
check("get_workout gives steps with paces", Array.isArray(detail.json?.steps) && /\/km/.test(detail.json.steps.join(" ")), detail.json?.steps?.[0]);
check("get_recovery says so when there is no data", /No recovery data/.test((await tool(access, "get_recovery")).text));
const missing = await tool(access, "get_workout", { workoutId: "nope" });
check("An unknown workout id is a clear error", missing.isError && /get_week/.test(missing.text));

const wk2 = await tool(access, "get_week", { week: 2 });
const w2: any[] = wk2.json?.workouts ?? [];
const easy = w2.find((w) => w.type === "easy");
const easyBefore = (await tool(access, "get_workout", { workoutId: easy.id })).json;
const note = await tool(access, "write_coach_notes", { notes: [{ workoutId: easy.id, note: "Keep this one truly easy. If you can't chat, slow down." }] });
check("Coach notes save immediately", !note.isError && /Saved 1 note/.test(note.text));
check("The note shows on the workout", (await tool(access, "get_workout", { workoutId: easy.id })).json?.coachNote?.startsWith("Keep this one"));

// A suggestion that breaks a rule is refused with the reason
const hard = w2.find((w) => ["tempo", "intervals", "hills"].includes(w.type));
const longRun = w2.find((w) => w.type === "long");
const dayBefore = new Date(Date.parse(longRun.date) - 86_400_000).toISOString().slice(0, 10);
const broken = await tool(access, "propose_plan_changes", { summary: "Move the hard session to the day before the long run", changes: [{ op: "move", workoutId: hard.id, toDate: dayBefore }] });
check("A change that breaks the plan's rules is refused, with the reason", broken.isError && /back to back/i.test(broken.text), broken.text.split("\n")[1]);

const proposal = await tool(access, "propose_plan_changes", { summary: "Shorten the easy run to 4 km so the week is lighter.", changes: [{ op: "replace_run", workoutId: easy.id, as: "easy", distanceKm: 4 }] });
check("A valid suggestion is stored, not applied", !proposal.isError && !!proposal.json?.changeId && proposal.json?.status === "proposed", proposal.json?.changes?.[0]);
const stillOld = (await tool(access, "get_workout", { workoutId: easy.id })).json;
check("The plan is unchanged until it's accepted", stillOld?.summary === easyBefore?.summary && stillOld?.title === easyBefore?.title, stillOld?.title);
const pending = await api("GET", "/api/plan-changes");
check("The athlete sees the suggestion in the app API", pending.json?.changes?.length === 1 && pending.json.changes[0].id === proposal.json?.changeId);

const accepted = await tool(access, "apply_plan_changes", { changeId: proposal.json.changeId });
check("Applying a suggestion updates the plan", !accepted.isError && accepted.json?.status === "accepted", accepted.text.slice(0, 80));
const after = await api("GET", "/api/plans/active");
const edited = after.json?.plan?.weeks?.flatMap((w: any) => w.workouts).find((w: any) => w.id === easy.id);
check("The app's plan shows the edit and is marked as coach-edited", after.json?.plan?.source === "coach" && edited?.distanceKm === 4 && after.json?.revision === 2, `${edited?.title}, revision ${after.json?.revision}`);
check("A suggestion can't be applied twice", (await tool(access, "apply_plan_changes", { changeId: proposal.json.changeId })).isError);

const second = await tool(access, "propose_plan_changes", { summary: "Swap the easy run to Wednesday.", changes: [{ op: "move", workoutId: easy.id, toDate: new Date(Date.parse(easy.date) + 86_400_000).toISOString().slice(0, 10) }] });
check("A second suggestion is accepted for storing", !second.isError && !!second.json?.changeId, second.text.slice(0, 160));
const viaApp = await api("PATCH", `/api/plan-changes/${second.json.changeId}`, { action: "accept" });
check("The athlete can accept in the app instead", viaApp.status === 200 && viaApp.json?.status === "accepted");
const third = await tool(access, "propose_plan_changes", { summary: "Add an upper body session on Friday.", changes: [{ op: "add_strength", date: new Date(Date.parse(easy.date) + 3 * 86_400_000).toISOString().slice(0, 10), focus: "upper" }] });
check("A third suggestion replaces nothing pending", !third.isError && !!third.json?.changeId, third.text.slice(0, 160));
const discarded = await tool(access, "discard_plan_changes", { changeId: third.json.changeId });
check("A suggestion can be discarded", discarded.json?.status === "rejected");

// ---- refresh ----
const refresh = await fetch(`${base}/api/auth/oauth2/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: done.tokens.refresh_token, client_id: a.clientId, resource: `${base}/api/mcp` }),
});
const refreshed = (await refresh.json().catch(() => ({}))) as Record<string, string>;
check("A refresh token gives a new access token that works", refresh.status === 200 && !!refreshed.access_token && (await tool(refreshed.access_token, "get_plan")).json?.goal === "half", `status ${refresh.status}`);

// ---- read-only client ----
const r = await connect("openid plan:read", "Kilo smoke test read-only");
const rDone = await finish(r);
const rTools = ((await rpc(rDone.tokens.access_token, "tools/list", {}, 3)).body?.result?.tools ?? []).map((t: { name: string }) => t.name);
check("A read-only token sees read tools and no write tools", rTools.includes("get_plan") && !rTools.includes("propose_plan_changes") && !rTools.includes("write_coach_notes"), rTools.join(", "));

// ---- a token with no plan access ----
const n = await connect("openid", "Kilo smoke test no-plan");
const nDone = await finish(n);
const nRes = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${nDone.tokens.access_token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
check("A token without plan access is told to ask for more scope", nRes.status === 403 && /insufficient_scope/.test(nRes.headers.get("www-authenticate") ?? ""), `status ${nRes.status}`);

// ---- disconnecting ----
const revoke = await api("DELETE", `/api/mcp-connections/${encodeURIComponent(a.clientId)}`);
check("Athlete disconnects the app", revoke.status === 200);
const revokedStatus = (await rpc(access, "tools/list", {}, 4)).status;
check("A disconnected app is cut off straight away", revokedStatus === 401 || revokedStatus === 403, `status ${revokedStatus}`);

// ---- cleanup ----
const left = await cleanup();
check("Cleanup: test athlete and clients deleted", left.clients === 0 && left.users === 0);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);