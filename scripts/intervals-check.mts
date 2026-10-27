// Checks the intervals.icu client against a real account. Run: pnpm intervals:check
// Uses INTERVALS_DEV_API_KEY from .env.local. Prints counts and field coverage, not raw data.
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const { createIntervalsClient } = await import("../src/server/intervals/client.ts");

const key = process.env.INTERVALS_DEV_API_KEY;
if (!key) throw new Error("Set INTERVALS_DEV_API_KEY in .env.local");
const client = createIntervalsClient(key, "0");
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const athlete = await client.getAthlete();
console.log(`Athlete: ${athlete.id} (${athlete.name ?? "no name"})`);

const acts = await client.listActivities(day(-60), day(1));
const types = acts.reduce<Record<string, number>>((m, a) => ((m[a.type ?? "?"] = (m[a.type ?? "?"] ?? 0) + 1), m), {});
const sources = acts.reduce<Record<string, number>>((m, a) => ((m[a.source ?? "?"] = (m[a.source ?? "?"] ?? 0) + 1), m), {});
console.log(`Activities (60 days): ${acts.length}`, types, "sources:", sources);
const has = (k: string) => acts.filter((a) => (a as Record<string, unknown>)[k] != null).length;
console.log("Field coverage:", ["distance", "moving_time", "average_heartrate", "icu_training_load", "total_elevation_gain"].map((k) => `${k} ${has(k)}/${acts.length}`).join(", "));
const latest = acts.sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))[0];
if (latest) console.log(`Latest: ${latest.start_date_local} ${latest.type} ${((latest.distance ?? 0) / 1000).toFixed(2)} km, ${Math.round((latest.moving_time ?? 0) / 60)} min`);

const well = await client.listWellness(day(-14), day(1));
const wHas = (k: string) => well.filter((w) => (w as Record<string, unknown>)[k] != null).length;
console.log(`Wellness (14 days): ${well.length} days.`, ["restingHR", "hrv", "sleepSecs", "sleepScore", "ctl", "atl", "readiness"].map((k) => `${k} ${wHas(k)}`).join(", "));
