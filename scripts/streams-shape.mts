// Runs the activity-page calculations on a real activity and prints the results, never the raw data.
// Run: pnpm tsx scripts/streams-shape.mts [activityId]   (defaults to the latest outdoor run)
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const { createIntervalsClient } = await import("../src/server/intervals/client.ts");
const { analyseElevation, analysePace, buildRoute, computeSplits } = await import("../src/lib/activity-detail.ts");
const { formatPace } = await import("../src/lib/plan/index.ts");

const key = process.env.INTERVALS_DEV_API_KEY;
if (!key) throw new Error("Set INTERVALS_DEV_API_KEY in .env.local");
const client = createIntervalsClient(key, "0");
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const id =
  process.argv[2] ??
  (await client.listActivities(day(-30), day(1)))
    .filter((a) => a.type === "Run")
    .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))[0].id;

const streams = await client.getActivityDetailStreams(id);
if (!streams) throw new Error("no streams");
console.log("activity", id, "samples", streams.time.length, "has latlng", !!streams.latlng, "altitude", !!streams.altitude, "grade", !!streams.grade);
console.log("splits", computeSplits(streams).map((s) => `${s.km}:${formatPace(s.paceSec)}${s.gainSec == null ? "" : ` (${s.gainSec > 0 ? "+" : ""}${Math.round(s.gainSec)}s)`}`).join("  "));
const pace = analysePace(streams);
console.log("avg", pace.avgPaceSec && formatPace(pace.avgPaceSec), "GAP", pace.avgGapSec && formatPace(pace.avgGapSec), "max", pace.maxPaceSec && formatPace(pace.maxPaceSec), "points", pace.series.length);
const elevation = analyseElevation(streams);
console.log("elevation points", elevation.series.length, "max", elevation.maxM, "min", Math.min(...elevation.series.map((p) => p.m)));
const route = buildRoute(streams.latlng);
console.log("route", route ? `${route.path.length} chars, aspect ${route.aspect.toFixed(2)}` : null);
