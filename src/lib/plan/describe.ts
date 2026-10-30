import { weekdayOf } from "./dates";
import type { WorkoutChange } from "./edit";
import { formatPace } from "./paces";
import type { RunWorkout, SimpleStep, StrengthWorkout, Workout } from "./schema";

/** Plain-text descriptions, used by MCP tool results and the Coach card. */

const DAY = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
} as const;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Wed Oct 28" */
export function dayLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${DAY[weekdayOf(iso)]} ${MONTH[m - 1]} ${d}`;
}

function amount(s: SimpleStep) {
  if (s.distanceM)
    return s.distanceM >= 1000 ? `${+(s.distanceM / 1000).toFixed(2)} km` : `${s.distanceM} m`;
  const sec = s.durationSec ?? 0;
  return sec >= 60 && sec % 60 === 0
    ? `${sec / 60} min`
    : sec > 60
      ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
      : `${sec}s`;
}

const NAME: Record<SimpleStep["kind"], string> = {
  warmup: "Warm up",
  work: "Run",
  recovery: "Recover",
  cooldown: "Cool down",
  steady: "Steady run",
};

function stepText(s: SimpleStep) {
  const pace = s.target?.pace
    ? `${formatPace(s.target.pace.minSecPerKm)}–${formatPace(s.target.pace.maxSecPerKm)}/km`
    : undefined;
  const duration =
    s.distanceM !== undefined && s.durationSec !== undefined
      ? ` (${amount({ ...s, distanceM: undefined })})`
      : "";
  const notes = [s.target?.effort, s.note].filter(Boolean);
  return `${NAME[s.kind]} ${amount(s)}${duration}${pace ? ` at ${pace}` : ""}${s.target ? ` [${s.target.zone}]` : ""}${notes.length ? ` · ${notes.join(" · ")}` : ""}`;
}

export function describeRunSteps(w: RunWorkout): string[] {
  return w.steps.map((s) =>
    s.kind === "repeat"
      ? `Repeat ${s.times} times: ${s.steps.map(stepText).join("; ")}`
      : stepText(s),
  );
}

export function describeExercises(w: StrengthWorkout): string[] {
  const n: Record<string, number> = {};
  return w.exercises.map((e) => {
    n[e.group] = (n[e.group] ?? 0) + 1;
    const amt = e.durationSec
      ? `${e.durationSec}s${e.reps !== undefined ? ` (${e.reps} reps)` : ""}`
      : `${e.reps}`;
    return `${e.group}${n[e.group]} ${e.name}: ${e.sets} x ${amt}${e.perSide ? " each side" : ""}, rest ${e.restSec}s, ${e.load}${e.rir !== undefined ? `, RIR ${e.rir}` : ""}${e.cue ? `. ${e.cue}` : ""}`;
  });
}

/** One line: "6 km · about 40 min" or "40–50 min · 6 exercises" */
export function workoutOneLine(w: Workout) {
  return w.kind === "run"
    ? `${w.distanceKm} km, about ${w.estDurationMin} min`
    : `${w.durationMin[0]}–${w.durationMin[1]} min, ${w.exercises.length} exercises`;
}

/** Human-readable before/after content for granular proposal approval, including unchanged context. */
export function describeWorkoutDetails(w: Workout | null): string[] {
  if (!w) return [];
  return [
    `${w.title} · ${w.date}`,
    w.kind === "run"
      ? `Run · ${w.type} · ${workoutOneLine(w)}`
      : `Strength · ${w.focus.replaceAll("_", " + ")} · ${workoutOneLine(w)}`,
    ...(w.description ? [w.description] : []),
    ...(w.coachNote ? [`Coach note: ${w.coachNote}`] : []),
    ...(w.kind === "run" ? describeRunSteps(w) : describeExercises(w)),
  ];
}

export interface ChangeLine {
  workoutKey: string;
  kind: "moved" | "removed" | "added" | "changed";
  /** Day label shown first, e.g. "Wed Oct 28 → Thu Oct 29" */
  when: string;
  from: string | null;
  to: string | null;
}

export function describeChanges(changes: WorkoutChange[]): ChangeLine[] {
  return changes.map((c) => {
    if (!c.before && c.after)
      return {
        workoutKey: c.workoutKey,
        kind: "added",
        when: dayLabel(c.after.date),
        from: null,
        to: `${c.after.title} (${workoutOneLine(c.after)})`,
      };
    if (c.before && !c.after)
      return {
        workoutKey: c.workoutKey,
        kind: "removed",
        when: dayLabel(c.before.date),
        from: c.before.title,
        to: null,
      };
    const b = c.before!;
    const a = c.after!;
    const sameWorkout =
      b.title === a.title &&
      JSON.stringify(b.kind === "run" ? b.steps : (b as StrengthWorkout).exercises) ===
        JSON.stringify(a.kind === "run" ? a.steps : (a as StrengthWorkout).exercises);
    if (sameWorkout && b.date !== a.date)
      return {
        workoutKey: c.workoutKey,
        kind: "moved",
        when: `${dayLabel(b.date)} → ${dayLabel(a.date)}`,
        from: null,
        to: a.title,
      };
    return {
      workoutKey: c.workoutKey,
      kind: "changed",
      when: b.date === a.date ? dayLabel(b.date) : `${dayLabel(b.date)} → ${dayLabel(a.date)}`,
      from: b.title,
      to: `${a.title} (${workoutOneLine(a)})`,
    };
  });
}

export function changeLineText(l: ChangeLine) {
  switch (l.kind) {
    case "moved":
      return `Move "${l.to}": ${l.when}`;
    case "removed":
      return `Remove "${l.from}" on ${l.when}`;
    case "added":
      return `Add "${l.to}" on ${l.when}`;
    case "changed":
      return `${l.when}: "${l.from}" becomes "${l.to}"`;
  }
}
