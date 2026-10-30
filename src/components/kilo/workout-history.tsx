import Link from "next/link";
import { Activity, Check, Dumbbell, Footprints } from "lucide-react";
import { activityTitle } from "@/lib/activity-detail";
import { HistoryFilters as HistoryFilterForm } from "@/components/kilo/history-filters";
import { formatPace } from "@/lib/plan";
import type { HistoryEntry, HistoryFilters, MonthTotals } from "@/server/progress/history-list";

const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2020, i, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }));
function dateLabel(date: string) { return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }
function localTime(value: string | null) {
  const match = value?.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}
function duration(seconds: number) {
  const s = Math.round(seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${minutes}:${String(s % 60).padStart(2, "0")}`;
}
function pageUrl(filters: HistoryFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.year) params.set("year", String(filters.year));
  if (filters.month) params.set("month", String(filters.month));
  params.set("page", String(page));
  return `/progress?${params}`;
}
function titleOf(entry: HistoryEntry) { return activityTitle(entry.type, entry.title); }
export function RecordedWorkoutCard({ entry, compact = false, contextLabel }: { entry: HistoryEntry; compact?: boolean; contextLabel?: string }) {
  const Icon = entry.kind === "run" || ["Walk", "Hike"].includes(entry.type) ? Footprints : entry.kind === "strength" ? Dumbbell : Activity;
  const time = localTime(entry.startLocal);
  const pace = entry.distanceM && entry.distanceM > 0 && entry.movingTimeSec && entry.movingTimeSec > 0 ? formatPace(entry.movingTimeSec / (entry.distanceM / 1000)) : null;
  const card = compact ? <article className="bg-secondary flex items-center gap-3 rounded-md px-3 py-2">
    <Icon className="text-success size-4 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold">{titleOf(entry)}</p>
      <p className="text-muted-foreground text-xs">{[
        contextLabel, time,
        entry.distanceM != null ? `${(entry.distanceM / 1000).toFixed(2)} km` : null,
        entry.movingTimeSec != null ? duration(entry.movingTimeSec) : null,
      ].filter(Boolean).join(" · ")}</p>
    </div>
    <Check className="text-success size-4 shrink-0" aria-label="Recorded activity" />
  </article> : <article className="border-border bg-card flex gap-4 rounded-xl border p-4 sm:p-5">
    <div className="bg-secondary text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"><Icon className="size-5" aria-hidden="true" /></div>
    <div className="min-w-0 flex-1">
      {contextLabel && <p className="text-success mb-1 text-xs font-semibold">Recorded · {contextLabel}</p>}
      <h3 className="font-semibold">{titleOf(entry)}</h3>
      <p className="text-muted-foreground mt-1 text-sm">{dateLabel(entry.date)}{time ? ` · ${time}` : ""}</p>
      {entry.historyTitle && entry.historyTitle !== entry.title && <p className="text-muted-foreground mt-1 text-sm">{entry.historyTitle}</p>}
      {entry.focus && <p className="text-muted-foreground mt-1 text-sm">{entry.focus}</p>}
      {(entry.distanceM != null || entry.movingTimeSec != null || pace) && <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
        {entry.distanceM != null && <div><dt className="text-muted-foreground text-xs">Distance</dt><dd className="mt-0.5 text-sm font-semibold">{(entry.distanceM / 1000).toFixed(2)} km</dd></div>}
        {entry.movingTimeSec != null && <div><dt className="text-muted-foreground text-xs">Time</dt><dd className="mt-0.5 text-sm font-semibold">{duration(entry.movingTimeSec)}</dd></div>}
        {pace && <div><dt className="text-muted-foreground text-xs">Avg pace</dt><dd className="mt-0.5 text-sm font-semibold">{pace} /km</dd></div>}
      </dl>}
    </div>
  </article>;
  // Synced activities open their detail page; sessions recorded by hand have none
  return entry.id.startsWith("activity:") ? <Link href={`/activities/${encodeURIComponent(entry.id.slice("activity:".length))}`} aria-label={`${titleOf(entry)}, ${dateLabel(entry.date)}${contextLabel ? `, ${contextLabel}` : ""}`} className="focus-visible:ring-ring block rounded-xl outline-none focus-visible:ring-2">{card}</Link> : card;
}

export function WorkoutHistory({ result, filters }: { result: { entries: HistoryEntry[]; years: number[]; page: number; hasNext: boolean; totals: Record<string, MonthTotals> }; filters: HistoryFilters }) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of result.entries) { const key = entry.date.slice(0, 7); groups.set(key, [...(groups.get(key) || []), entry]); }
  return <div className="flex flex-col gap-6">
    <div><h2 className="text-xl font-bold">Workout history</h2><p className="text-muted-foreground mt-1 text-sm">Your recorded activities and past workouts.</p></div>
    <HistoryFilterForm years={result.years} months={months} type={filters.type} year={filters.year} month={filters.month} />
    {result.entries.length === 0 ? <div className="border-border rounded-xl border border-dashed p-8 text-center"><p className="font-medium">No workouts found</p><p className="text-muted-foreground mt-1 text-sm">Try different filters, or sync your activities to see them here.</p></div> : Array.from(groups, ([key, entries]) => {
      const [year, month] = key.split("-");
      const total = result.totals[key];
      return <section key={key} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4"><h2 className="text-lg font-bold">{months[Number(month) - 1]} {year}</h2>{total && total.distanceM > 0 && <span className="text-muted-foreground text-sm font-medium">{(total.distanceM / 1000).toFixed(1)} km</span>}</div>
        {total && <p className="text-muted-foreground -mt-1 text-sm">{total.count} {total.count === 1 ? "activity" : "activities"}{total.movingTimeSec > 0 ? ` · ${duration(total.movingTimeSec)}` : ""}</p>}
        {entries.map((entry) => <RecordedWorkoutCard key={entry.id} entry={entry} />)}</section>;
    })}
    {(result.page > 1 || result.hasNext) && <nav aria-label="Workout history pages" className="flex items-center justify-between gap-4 text-sm"><div>{result.page > 1 && <Link className="underline underline-offset-4" href={pageUrl(filters, result.page - 1)}>Previous</Link>}</div><span className="text-muted-foreground">Page {result.page}</span><div>{result.hasNext && <Link className="underline underline-offset-4" href={pageUrl(filters, result.page + 1)}>Next</Link>}</div></nav>}
  </div>;
}
