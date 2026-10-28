// Dev only: creates a throwaway account with a plan, connects INTERVALS_DEV_API_KEY and syncs.
// Credentials come from DEV_TEST_EMAIL / DEV_TEST_PASSWORD in .env.local. Run with --delete to remove the account.
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const { createDb } = await import("../src/server/db/client.ts");
const { createAuth } = await import("../src/server/auth/create-auth.ts");
const { createPlanFromInput } = await import("../src/server/plans/service.ts");
const { connectIntervals, syncIntervals } = await import("../src/server/intervals/sync.ts");
const { setTimezone, todayIn } = await import("../src/server/profile/service.ts");
const { user } = await import("../src/server/db/schema/index.ts");
const { eq } = await import("drizzle-orm");

const email = process.env.DEV_TEST_EMAIL!;
const password = process.env.DEV_TEST_PASSWORD!;
if (!email || !password || !process.env.INTERVALS_DEV_API_KEY) throw new Error("Set DEV_TEST_EMAIL, DEV_TEST_PASSWORD and INTERVALS_DEV_API_KEY in .env.local");

const db = await createDb(process.env.DATABASE_URL);
await db.delete(user).where(eq(user.email, email));
if (process.argv.includes("--delete")) {
  console.log("Deleted dev account.");
  process.exit(0);
}

const { user: u } = await createAuth(db).api.signUpEmail({ body: { name: "Dev Runner", email, password } });
const tz = "Asia/Jakarta";
await setTimezone(db, u.id, tz);
await createPlanFromInput(db, u.id, {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-12",
  experience: "intermediate",
  currentWeeklyKm: 15,
  recentRace: { distanceM: 5000, timeSec: 1661 },
  runDays: ["tue", "thu", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 2, days: ["mon", "wed"], equipment: "gym" },
  intensity: "balanced",
});
const athlete = await connectIntervals(db, u.id, process.env.INTERVALS_DEV_API_KEY!);
let result = await syncIntervals(db, u.id, todayIn(tz));
// Older runs are checked in batches; keep going so the dev account has all its records
for (let i = 0; i < 8 && result.recordsPending > 0; i++) result = await syncIntervals(db, u.id, todayIn(tz));
console.log(`Connected as ${athlete.name} (${athlete.id}).`, result);
process.exit(0);
