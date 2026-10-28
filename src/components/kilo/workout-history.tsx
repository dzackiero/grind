import Link from "next/link";
import { Activity, Dumbbell, Footprints } from "lucide-react";
import { formatPace } from "@/lib/plan";
import type { HistoryEntry, HistoryFilters } from "@/server/progress/history-list";

const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2020, i, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" }));
const selectClass = "border-input bg-background h-10 w-full rounded-md border px-3 text-sm";
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
function WorkoutCard({ entry }: { entry: HistoryEntry }) {
  const Icon = entry.kind === "run" ? Footprints : entry.kind === "strength" ? Dumbbell : Activity;
  const time = localTime(entry.startLocal);
  const pace = entry.distanceM && entry.distanceM > 0 && entry.movingTimeSec && entry.movingTimeSec > 0 ? formatPace(entry.movingTimeSec / (entry.distanceM / 1000)) : null;
  return <article className="border-border bg-card flex gap-4 rounded-xl border p-4 sm:p-5">
    <div className="bg-secondary text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"><Icon className="size-5" aria-hidden="true" /></div>
    <div className="min-w-0 flex-1">
      <h3 className="font-semibold">{entry.title}</h3>
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
}

export function WorkoutHistory({ result, filters }: { result: { entries: HistoryEntry[]; years: number[]; page: number; hasNext: boolean }; filters: HistoryFilters }) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of result.entries) { const key = entry.date.slice(0, 7); groups.set(key, [...(groups.get(key) || []), entry]); }
  return <div className="flex flex-col gap-6">
    <div><h2 className="text-xl font-bold">Workout history</h2><p className="text-muted-foreground mt-1 text-sm">Your recorded activities and past workouts.</p></div>
    <form action="/progress" className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <label className="text-sm font-medium">Workout type<select name="type" defaultValue={filters.type || ""} className={`${selectClass} mt-1.5`}><option value="">All types</option><option value="run">Run</option><option value="strength">Strength</option><option value="other">Other</option></select></label>
      <label className="text-sm font-medium">Year<select name="year" defaultValue={filters.year || ""} className={`${selectClass} mt-1.5`}><option value="">All years</option>{result.years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
      <label className="text-sm font-medium">Month<select name="month" defaultValue={filters.month || ""} className={`${selectClass} mt-1.5`}><option value="">All months</option>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
      <button className="bg-primary text-primary-foreground h-10 rounded-md px-4 text-sm font-medium" type="submit">Apply filters</button>
    </form>
    {result.entries.length === 0 ? <div className="border-border rounded-xl border border-dashed p-8 text-center"><p className="font-medium">No workouts found</p><p className="text-muted-foreground mt-1 text-sm">Try different filters, or sync your activities to see them here.</p></div> : Array.from(groups, ([key, entries]) => {
      const [year, month] = key.split("-");
      return <section key={key} className="flex flex-col gap-3"><h2 className="text-lg font-bold">{months[Number(month) - 1]} {year}</h2>{entries.map((entry) => <WorkoutCard key={entry.id} entry={entry} />)}</section>;
    })}
    {(result.page > 1 || result.hasNext) && <nav aria-label="Workout history pages" className="flex items-center justify-between gap-4 text-sm"><div>{result.page > 1 && <Link className="underline underline-offset-4" href={pageUrl(filters, result.page - 1)}>Previous</Link>}</div><span className="text-muted-foreground">Page {result.page}</span><div>{result.hasNext && <Link className="underline underline-offset-4" href={pageUrl(filters, result.page + 1)}>Next</Link>}</div></nav>}
  </div>;
}
