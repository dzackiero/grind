import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ElevationChart, PaceChart } from "@/components/kilo/activity-charts";
import { ActivityRoute } from "@/components/kilo/activity-route";
import { ActivitySplits } from "@/components/kilo/activity-splits";
import { PlateBadge } from "@/components/kilo/plate-badge";
import { Stat } from "@/components/kilo/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { activityTitle, analyseElevation, analysePace, buildRoute, computeSplits, stepsPerMinute } from "@/lib/activity-detail";
import { EFFORT_DISTANCES, formatEffort } from "@/lib/efforts";
import { formatPace } from "@/lib/plan";
import { getDb } from "@/server/db";
import { getActivityDetail } from "@/server/intervals/activity-detail";
import { requireViewer } from "@/server/queries";

export const metadata = { title: "Activity · Kilo" };

/** "Oct 27, 2026 at 4:33 PM" from the watch's local start time, which has no zone to convert. */
function startLabel(startLocal: string) {
  const match = startLocal.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return startLocal;
  const date = new Date(`${match[1]}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const hour = Number(match[2]);
  return `${date} at ${hour % 12 || 12}:${match[3]} ${hour < 12 ? "AM" : "PM"}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border flex items-center justify-between border-b py-3 last:border-b-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireViewer();
  const detail = await getActivityDetail(await getDb(), user.id, decodeURIComponent(id));
  if (!detail) notFound();
  const { activity: a, efforts, streams, streamsNote } = detail;

  const raw = a.raw as Record<string, unknown>;
  const number = (key: string) => (typeof raw[key] === "number" ? (raw[key] as number) : null);
  const isRun = ["Run", "TrailRun", "VirtualRun", "Treadmill"].includes(a.type);
  const distanceKm = a.distanceM != null ? a.distanceM / 1000 : null;
  const avgPace = distanceKm && a.movingTimeSec ? a.movingTimeSec / distanceKm : null;
  const cadence = isRun ? stepsPerMinute(number("average_cadence")) : null;
  const calories = number("calories");
  const source = typeof raw.source === "string" ? raw.source : null;

  const route = streams ? buildRoute(streams.latlng) : null;
  const splits = isRun && streams ? computeSplits(streams) : [];
  const pace = isRun && streams ? analysePace(streams) : null;
  const elevation = streams ? analyseElevation(streams) : null;
  const effortRows = EFFORT_DISTANCES.flatMap((d) => {
    const found = efforts.find((e) => e.key === d.key);
    return found ? [{ ...d, seconds: found.seconds }] : [];
  });
  const showGap = !!pace?.hasGrade && pace.avgGapSec != null && pace.avgPaceSec != null && Math.abs(pace.avgGapSec - pace.avgPaceSec) >= 1;

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" asChild className="-ml-3 self-start">
        <Link href="/progress">
          <ArrowLeft /> Progress
        </Link>
      </Button>

      {route && <ActivityRoute route={route} />}

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-9 font-extrabold">{activityTitle(a.type, a.name)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{a.type === "VirtualRun" || a.type === "Treadmill" ? "Indoor" : a.type}</Badge>
          {distanceKm != null && <span className="text-muted-foreground text-sm">{distanceKm.toFixed(2)} km</span>}
        </div>
        <p className="text-muted-foreground text-sm">{startLabel(a.startLocal)}</p>
        {source && <p className="text-muted-foreground text-sm">Source: {source.charAt(0) + source.slice(1).toLowerCase()} via intervals.icu</p>}
      </div>

      <Card>
        <CardContent className="grid grid-cols-3 gap-x-4 gap-y-6">
          {distanceKm != null && <Stat label="Distance" value={distanceKm.toFixed(2)} unit="km" />}
          {a.movingTimeSec != null && <Stat label="Time" value={formatEffort(a.movingTimeSec)} />}
          {isRun && avgPace && <Stat label="Avg pace" value={formatPace(avgPace)} unit="/km" />}
          {a.elevationGainM != null && a.elevationGainM > 0 && <Stat label="Elevation gain" value={Math.round(a.elevationGainM)} unit="m" />}
          {a.avgHr != null && <Stat label="Avg HR" value={Math.round(a.avgHr)} unit="bpm" />}
          {cadence != null && <Stat label="Cadence" value={cadence} unit="spm" />}
          {calories != null && <Stat label="Calories" value={Math.round(calories)} />}
        </CardContent>
      </Card>

      {streamsNote && (
        <p className="text-muted-foreground bg-secondary rounded-md p-3 text-sm" role="status">
          {streamsNote}
        </p>
      )}

      {effortRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Best efforts</CardTitle>
            <CardDescription>The fastest stretch of each distance inside this run. They use total time, so pauses count.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            {effortRows.map((e) => (
              <PlateBadge key={e.key} label={e.label} name={e.label} plate={e.plate} value={formatEffort(e.seconds)} caption={`${formatPace(e.seconds / (e.meters / 1000))}/km`} tag="" />
            ))}
          </CardContent>
        </Card>
      )}

      {splits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Splits</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivitySplits splits={splits} />
          </CardContent>
        </Card>
      )}

      {pace && pace.series.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Pace</CardTitle>
            {showGap && <CardDescription>The dashed line is pace adjusted for hills: what the same effort would be on flat ground.</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PaceChart series={pace.series} showGap={showGap} />
            <dl>
              {pace.avgPaceSec != null && <Row label="Avg. pace" value={`${formatPace(pace.avgPaceSec)}/km`} />}
              {showGap && <Row label="Avg. grade-adjusted pace" value={`${formatPace(pace.avgGapSec!)}/km`} />}
              {pace.maxPaceSec != null && <Row label="Max. pace" value={`${formatPace(pace.maxPaceSec)}/km`} />}
            </dl>
          </CardContent>
        </Card>
      )}

      {elevation && elevation.series.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Elevation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ElevationChart series={elevation.series} />
            <dl>
              {a.elevationGainM != null && <Row label="Elevation gain" value={`${Math.round(a.elevationGainM)} m`} />}
              {elevation.maxM != null && <Row label="Max elevation" value={`${Math.round(elevation.maxM)} m`} />}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
