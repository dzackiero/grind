import { formatPace } from "@/lib/plan/paces";
import type { Workout } from "@/lib/plan/schema";

const DAY_MS = 86_400_000;

function utc(iso: string) {
  return new Date(iso + "T00:00:00Z");
}

/** "Wednesday, Nov 4" */
export function longDate(iso: string) {
  return utc(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Nov 4" */
export function shortDate(iso: string) {
  return utc(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Wed" */
export function weekdayShort(iso: string) {
  return utc(iso).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export function dayOfMonth(iso: string) {
  return utc(iso).getUTCDate();
}

export function addDaysIso(iso: string, days: number) {
  return new Date(utc(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysUntil(fromIso: string, toIso: string) {
  return Math.round((utc(toIso).getTime() - utc(fromIso).getTime()) / DAY_MS);
}

export function km(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} km`;
}

/** One-line summary under a workout title */
export function workoutSummary(w: Workout) {
  return w.kind === "run"
    ? `${km(w.distanceKm)} · about ${w.estDurationMin} min`
    : `${w.durationMin[0]}–${w.durationMin[1]} min · ${w.exercises.length} exercises`;
}

/** Main target pace of a run (its first work step), e.g. "4:10/km" */
export function mainPace(w: Workout): string | null {
  if (w.kind !== "run") return null;
  for (const s of w.steps) {
    const steps = s.kind === "repeat" ? s.steps : [s];
    for (const x of steps) {
      if ((x.kind === "work" || x.kind === "steady") && x.target?.pace)
        return `${formatPace(x.target.pace.minSecPerKm)}`;
    }
  }
  return null;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** 5:32 per km from metres and seconds */
export function paceFrom(distanceM: number | null, seconds: number | null) {
  if (!distanceM || !seconds) return null;
  const secPerKm = seconds / (distanceM / 1000);
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")}`;
}

export function formatDurationShort(sec: number) {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} min`;
  if (sec > 60) return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  return `${sec}s`;
}
