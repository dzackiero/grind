// End-to-end check against a running server and its database.
// Run: pnpm start (in another terminal), then: pnpm smoke [baseUrl]
// Creates a throwaway user, exercises auth + plans + workouts over HTTP, checks the rows in the
// database directly, then deletes the user (cascades to their plan).
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const base = process.argv[2] ?? "http://localhost:3000";
const email = `smoke-${Date.now()}@kilo.test`;
let cookie = "";
let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie)
    cookie = setCookie
      .split(",")
      .map((c) => c.split(";")[0])
      .join("; ");
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const input = {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 15,
  recentRace: { distanceM: 5000, timeSec: 1661 },
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 3, days: ["mon", "tue", "thu"], equipment: "gym" },
  intensity: "balanced",
};

const anon = await call("GET", "/api/plans/active");
check("Signed-out request is refused", anon.status === 401, `status ${anon.status}`);

const signUp = await call("POST", "/api/auth/sign-up/email", {
  name: "Smoke Test",
  email,
  password: "smoke-test-password",
});
check(
  "Sign up with email + password",
  signUp.status === 200 && !!cookie,
  `status ${signUp.status}`,
);

const session = await call("GET", "/api/auth/get-session");
check("Session cookie identifies the user", session.json?.user?.email === email);

const none = await call("GET", "/api/plans/active");
check("New user has no plan yet", none.status === 404, `status ${none.status}`);

const bad = await call("POST", "/api/plans", { ...input, runDays: ["wed"] });
check(
  "Invalid form is rejected",
  bad.status === 400,
  `status ${bad.status}, ${bad.json?.issues?.[0]?.message ?? ""}`,
);

const created = await call("POST", "/api/plans", input);
check(
  "Create half marathon plan",
  created.status === 201,
  `status ${created.status}, ${created.json?.plan?.weeks?.length} weeks`,
);

const active = await call("GET", "/api/plans/active");
check(
  "Active plan loads back",
  active.status === 200 && active.json?.id === created.json?.id,
  `${active.json?.plan?.title}, race ${active.json?.plan?.raceDate}`,
);

const week = await call("GET", "/api/workouts?from=2026-11-02&to=2026-11-08");
const first = week.json?.workouts?.[0];
check(
  "Week 2 workouts by date",
  week.status === 200 && week.json.workouts.length > 3,
  `${week.json?.workouts?.length} workouts, first: ${first?.workout?.title}`,
);

const done = await call("PATCH", `/api/workouts/${first.key}`, { status: "completed" });
check("Mark a workout completed", done.status === 200, `status ${done.status}`);

const after = await call("GET", "/api/plans/active");
check("Completion is saved", after.json?.progress?.[first.key]?.status === "completed");

// Look at the rows directly in the database
const { Client } = await import("pg");
const db = new Client({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
});
await db.connect();
const { rows } = await db.query(
  `select u.id, count(distinct p.id)::int as plans, count(w.id)::int as workouts,
          count(w.id) filter (where w.status = 'completed')::int as completed
     from "user" u left join plan p on p.user_id = u.id left join planned_workout w on w.plan_id = p.id
    where u.email = $1 group by u.id`,
  [email],
);
check(
  `Rows in Neon branch "${process.env.NEON_BRANCH ?? "?"}"`,
  rows[0]?.plans === 1 && rows[0]?.workouts > 40 && rows[0]?.completed === 1,
  `1 user, ${rows[0]?.plans} plan, ${rows[0]?.workouts} workouts, ${rows[0]?.completed} completed`,
);
await db.query(`delete from "user" where email = $1`, [email]);
const left = await db.query(
  `select count(*)::int as n from plan p join "user" u on u.id = p.user_id where u.email = $1`,
  [email],
);
check("Cleanup: test user and plan deleted", left.rows[0].n === 0);
await db.end();

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
