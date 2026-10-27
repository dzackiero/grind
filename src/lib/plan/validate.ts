import { addDays, daysBetween, weekdayIndex } from "./dates";
import { stepsDistanceKm } from "./run-sessions";
import { PlanSchema, type Plan, type RunWorkout, type Step } from "./schema";
import { GOAL_TEMPLATES } from "./templates";

/*
 * Checks a plan before it is saved. Claude gets the codes and messages back through MCP,
 * so messages say what is wrong and how to fix it.
 */

export interface PlanIssue {
  severity: "error" | "warning";
  code:
    | "SCHEMA"
    | "WEEK_SEQUENCE"
    | "WORKOUT_OUTSIDE_WEEK"
    | "AFTER_RACE"
    | "RACE_MISSING"
    | "DOUBLE_STRENGTH"
    | "DOUBLE_RUN"
    | "BACK_TO_BACK_HARD"
    | "VOLUME_JUMP"
    | "LONG_RUN_TOO_LONG"
    | "LONG_RUN_SHARE"
    | "LONG_RUN_JUMP"
    | "PACE_RANGE"
    | "PACE_MISMATCH"
    | "DISTANCE_MISMATCH"
    | "LEGS_BEFORE_HARD"
    | "NO_REST_DAY"
    | "PLAN_TOO_SHORT"
    | "LOW_BASE";
  message: string;
  week?: number;
  workoutId?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: PlanIssue[];
  warnings: PlanIssue[];
}

const HARD_TYPES = new Set<RunWorkout["type"]>(["intervals", "tempo", "hills", "long", "race"]);

function flatSteps(steps: Step[]) {
  return steps.flatMap((s) => (s.kind === "repeat" ? s.steps : [s]));
}

export function validatePlan(candidate: unknown): ValidationResult {
  const issues: PlanIssue[] = [];
  const parsed = PlanSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 20)) {
      issues.push({ severity: "error", code: "SCHEMA", message: `${i.path.join(".") || "plan"}: ${i.message}` });
    }
    return { ok: false, errors: issues, warnings: [] };
  }
  const plan: Plan = parsed.data;
  const tpl = GOAL_TEMPLATES[plan.goal];
  const add = (issue: PlanIssue) => issues.push(issue);

  if (plan.weeks.length < tpl.minWeeks) {
    add({
      severity: "warning",
      code: "PLAN_TOO_SHORT",
      message: `${plan.weeks.length} weeks is short for a ${tpl.label}; ${tpl.minWeeks}+ is recommended. Keep volume conservative.`,
    });
  }

  if (plan.input.currentWeeklyKm < tpl.floorKm) {
    add({
      severity: "warning",
      code: "LOW_BASE",
      message: `Starting from ${plan.input.currentWeeklyKm} km/week is low for a ${tpl.label} (${tpl.floorKm}+ recommended). The plan starts at ${tpl.floorKm} km; build up first if that feels like a lot.`,
    });
  }

  // Week structure
  plan.weeks.forEach((w, i) => {
    if (w.index !== i + 1) add({ severity: "error", code: "WEEK_SEQUENCE", week: w.index, message: `Week ${w.index} should be week ${i + 1}.` });
    if (weekdayIndex(w.startDate) !== 0) add({ severity: "error", code: "WEEK_SEQUENCE", week: w.index, message: `Week ${w.index} must start on a Monday.` });
    if (i > 0 && daysBetween(plan.weeks[i - 1].startDate, w.startDate) !== 7)
      add({ severity: "error", code: "WEEK_SEQUENCE", week: w.index, message: `Week ${w.index} must start 7 days after week ${i}.` });

    const end = addDays(w.startDate, 6);
    for (const wo of w.workouts) {
      if (wo.date < w.startDate || wo.date > end)
        add({ severity: "error", code: "WORKOUT_OUTSIDE_WEEK", week: w.index, workoutId: wo.id, message: `"${wo.title}" on ${wo.date} is outside week ${w.index} (${w.startDate} to ${end}). Move it to the right week.` });
      if (wo.date > plan.raceDate)
        add({ severity: "error", code: "AFTER_RACE", week: w.index, workoutId: wo.id, message: `"${wo.title}" is after race day (${plan.raceDate}). Remove it.` });
    }
  });

  const all = plan.weeks.flatMap((w) => w.workouts.map((wo) => ({ wo, week: w.index })));
  const runs = all.filter((x): x is { wo: RunWorkout; week: number } => x.wo.kind === "run");

  if (!runs.some(({ wo }) => wo.type === "race" && wo.date === plan.raceDate))
    add({ severity: "error", code: "RACE_MISSING", message: `Race day (${plan.raceDate}) needs a workout of type "race".` });

  // Per-day checks
  const byDate = new Map<string, typeof all>();
  for (const x of all) byDate.set(x.wo.date, [...(byDate.get(x.wo.date) ?? []), x]);
  for (const [date, list] of byDate) {
    const s = list.filter((x) => x.wo.kind === "strength");
    const r = list.filter((x) => x.wo.kind === "run");
    if (s.length > 1) add({ severity: "error", code: "DOUBLE_STRENGTH", week: s[0].week, message: `Two strength sessions on ${date}. Keep one per day.` });
    if (r.length > 1) add({ severity: "warning", code: "DOUBLE_RUN", week: r[0].week, message: `Two runs on ${date}. Fine for advanced runners, otherwise combine them.` });
  }

  // Hard days must not touch
  const hardDates = [...new Set(runs.filter(({ wo }) => HARD_TYPES.has(wo.type)).map(({ wo }) => wo.date))].sort();
  for (let i = 1; i < hardDates.length; i++) {
    if (daysBetween(hardDates[i - 1], hardDates[i]) === 1) {
      const second = runs.find(({ wo }) => wo.date === hardDates[i] && HARD_TYPES.has(wo.type))!;
      add({
        severity: "error",
        code: "BACK_TO_BACK_HARD",
        week: second.week,
        workoutId: second.wo.id,
        message: `Hard sessions on ${hardDates[i - 1]} and ${hardDates[i]} are back to back. Leave an easy or rest day between them.`,
      });
    }
  }

  // Volume
  const weekKm = plan.weeks.map((w) => w.workouts.reduce((s, wo) => s + (wo.kind === "run" ? wo.distanceKm : 0), 0));
  plan.weeks.forEach((w, i) => {
    if (i < 2 || w.phase === "taper") return;
    const ref = Math.max(weekKm[i - 1], weekKm[i - 2]);
    const rise = weekKm[i] - ref;
    if (ref > 0 && rise > 3) {
      const pct = rise / ref;
      if (pct > 0.3)
        add({ severity: "error", code: "VOLUME_JUMP", week: w.index, message: `Week ${w.index} jumps ${Math.round(pct * 100)}% to ${weekKm[i].toFixed(1)} km. Keep weekly increases under 15%.` });
      else if (pct > 0.2)
        add({ severity: "warning", code: "VOLUME_JUMP", week: w.index, message: `Week ${w.index} rises ${Math.round(pct * 100)}% to ${weekKm[i].toFixed(1)} km. Consider a smaller step.` });
    }
  });

  // Long runs
  let longest = 0;
  plan.weeks.forEach((w, i) => {
    for (const wo of w.workouts) {
      if (wo.kind !== "run" || wo.type !== "long") continue;
      const max = tpl.maxLongKm[plan.input.experience];
      if (wo.distanceKm > max * 1.1)
        add({ severity: "error", code: "LONG_RUN_TOO_LONG", week: w.index, workoutId: wo.id, message: `${wo.distanceKm} km is longer than this plan needs (max about ${max} km for this level).` });
      if (weekKm[i] > 15 && wo.distanceKm / weekKm[i] > tpl.maxLongShare + 0.03)
        add({ severity: "warning", code: "LONG_RUN_SHARE", week: w.index, workoutId: wo.id, message: `The long run is ${Math.round((wo.distanceKm / weekKm[i]) * 100)}% of week ${w.index}. Spread some distance into easy runs.` });
      if (longest > 0 && wo.distanceKm > longest + 3)
        add({ severity: "warning", code: "LONG_RUN_JUMP", week: w.index, workoutId: wo.id, message: `Long run grows from ${longest} km to ${wo.distanceKm} km. Add at most 2–3 km at a time.` });
      longest = Math.max(longest, wo.distanceKm);
    }
  });

  // Paces and distances
  for (const { wo, week } of runs) {
    for (const s of flatSteps(wo.steps)) {
      const pace = s.target?.pace;
      if (!pace || !s.target) continue;
      if (pace.minSecPerKm > pace.maxSecPerKm)
        add({ severity: "error", code: "PACE_RANGE", week, workoutId: wo.id, message: `"${wo.title}": pace range is reversed (faster value must come first).` });
      const ref = plan.paces[s.target.zone];
      const drift = Math.abs((pace.minSecPerKm + pace.maxSecPerKm) / 2 - (ref.minSecPerKm + ref.maxSecPerKm) / 2);
      if (drift > 20)
        add({ severity: "warning", code: "PACE_MISMATCH", week, workoutId: wo.id, message: `"${wo.title}": ${s.target.zone} pace is ${Math.round(drift)} s/km off the plan's ${s.target.zone} zone. Use plan.paces.${s.target.zone}.` });
    }
    const fromSteps = stepsDistanceKm(wo.steps, plan.paces);
    if (Math.abs(fromSteps - wo.distanceKm) > Math.max(0.75, wo.distanceKm * 0.15))
      add({ severity: "warning", code: "DISTANCE_MISMATCH", week, workoutId: wo.id, message: `"${wo.title}" says ${wo.distanceKm} km but its steps add up to ${fromSteps.toFixed(1)} km.` });
  }

  // Strength placement
  const hardSet = new Set(hardDates);
  for (const { wo, week } of all) {
    if (wo.kind !== "strength" || wo.focus === "upper") continue;
    if (hardSet.has(addDays(wo.date, 1)))
      add({ severity: "warning", code: "LEGS_BEFORE_HARD", week, workoutId: wo.id, message: `${wo.title} on ${wo.date} is the day before a hard run. Move it to the same day as the hard run or after it.` });
  }

  // Rest
  for (const w of plan.weeks) {
    const days = new Set(w.workouts.map((wo) => wo.date));
    if (days.size >= 7) add({ severity: "warning", code: "NO_REST_DAY", week: w.index, message: `Week ${w.index} has no rest day. Keep at least one day off.` });
  }

  const errors = issues.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.severity === "warning") };
}
