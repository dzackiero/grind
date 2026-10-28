import { z } from "zod";
import { addDays, weekdayOf } from "./dates";
import { easyRun, finishRun, hillRun, intervalRun, longRun, round05, stepsDistanceKm, stepsDurationMin, tempoRun } from "./run-sessions";
import { PlanSchema, StrengthFocusSchema, WorkoutSchema, type Plan, type Week, type Workout } from "./schema";
import { buildStrength } from "./strength-sessions";
import { HILLS, INTERVALS, TEMPO } from "./templates";
import { WorkoutDateSchema, WorkoutFilterSchema, WorkoutPatchSchema, type WorkoutFilter, type WorkoutPatch } from "./workout-patch";

/*
 * Plan edits. Claude (through MCP) describes what should change; this module works out the new workouts
 * with the same builders the templates use, so paces and distances stay consistent with the plan.
 *
 *   buildChanges(plan, ops)    → the before/after of every touched workout (throws PlanEditError)
 *   applyChanges(plan, changes) → the edited plan (pure; the caller validates it)
 */

const isoDate = WorkoutDateSchema;
const id = z.string().min(1).describe("A workout id from get_week or get_workout");

export const EditOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("move"), workoutId: id, toDate: isoDate.describe("New date, YYYY-MM-DD") }).describe("Move a workout to another day"),
  z.object({ op: z.literal("swap"), workoutId: id, withWorkoutId: id }).describe("Swap the days of two workouts"),
  z.object({ op: z.literal("remove"), workoutId: id }).describe("Remove a workout from the plan"),
  z
    .object({
      op: z.literal("replace_run"),
      workoutId: id,
      as: z.enum(["easy", "long", "tempo", "intervals", "hills"]).describe("The kind of session to turn this run into"),
      distanceKm: z.number().min(2).max(45).optional().describe("Only for easy and long runs"),
      level: z.number().int().min(0).max(9).optional().describe("Difficulty step for tempo, intervals or hills; 0 is the easiest"),
    })
    .describe("Turn a run into a different kind of run, for example an easier or shorter one"),
  z.object({ op: z.literal("add_run"), date: isoDate, distanceKm: z.number().min(2).max(30) }).describe("Add an easy run"),
  z.object({ op: z.literal("add_strength"), date: isoDate, focus: StrengthFocusSchema }).describe("Add a strength session"),
  z.object({ op: z.literal("update_workout"), workoutId: id, patch: WorkoutPatchSchema }).strict().describe("Edit individual workout fields; preserve omitted fields"),
  z.object({ op: z.literal("bulk_update_workouts"), filter: WorkoutFilterSchema, patch: WorkoutPatchSchema }).strict().describe("Edit matching future workouts, excluding races and completed or skipped sessions"),
]);
export type EditOp = z.infer<typeof EditOpSchema>;

export interface WorkoutChange {
  workoutKey: string;
  before: Workout | null;
  after: Workout | null;
}

export interface EditContext {
  /** The athlete's today, YYYY-MM-DD. Nothing can be moved to an earlier day. */
  today: string;
  /** Workouts that are already done or skipped: they can't be changed. */
  lockedIds: ReadonlySet<string>;
}

/** An edit that can't be made. The message says why and what to do instead. */
export class PlanEditError extends Error {}

/** Stable JSON: object keys sorted, so jsonb round trips compare equal. */
function canon(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
}

export function weekOfDate(plan: Plan, date: string): Week | undefined {
  return plan.weeks.find((w) => w.startDate <= date && date <= addDays(w.startDate, 6));
}

/** The earliest day that can still be edited: the first day of the week the athlete is in, so Monday and Tuesday stay open on Wednesday. */
export function editableFrom(plan: Plan, today: string): string {
  const week = weekOfDate(plan, today);
  return week && week.startDate < today ? week.startDate : today;
}

export function buildChanges(plan: Plan, ops: EditOp[], ctx: EditContext): WorkoutChange[] {
  if (!ops.length) throw new PlanEditError("No changes given.");
  const floor = editableFrom(plan, ctx.today);
  const original = new Map(plan.weeks.flatMap((w) => w.workouts).map((w) => [w.id, w]));
  const current = new Map<string, Workout | null>(original);
  const touched = new Set<string>();

  const get = (workoutId: string) => {
    const w = current.get(workoutId);
    if (!w) throw new PlanEditError(`There's no workout "${workoutId}" in the plan (or it was already removed). Use get_week to see the ids.`);
    if (ctx.lockedIds.has(workoutId)) throw new PlanEditError(`"${w.title}" on ${w.date} is already done or skipped, so it can't be changed.`);
    if (w.kind === "run" && w.type === "race") throw new PlanEditError(`Race day can't be changed here. Change the race date by building a new plan.`);
    if (w.date < floor) throw new PlanEditError(`"${w.title}" on ${w.date} is in a past week and can't be changed.`);
    return w;
  };
  const checkDate = (date: string) => {
    if (!WorkoutDateSchema.safeParse(date).success) throw new PlanEditError(`${date} is not a real YYYY-MM-DD date.`);
    if (date < floor) throw new PlanEditError(`${date} is in a past week. Pick ${floor} or later.`);
    if (date > plan.raceDate) throw new PlanEditError(`${date} is after race day (${plan.raceDate}).`);
    if (!weekOfDate(plan, date)) throw new PlanEditError(`${date} is outside the plan (${plan.weeks[0].startDate} to ${addDays(plan.weeks.at(-1)!.startDate, 6)}).`);
  };
  const set = (workoutId: string, w: Workout | null) => {
    current.set(workoutId, w);
    touched.add(workoutId);
  };
  const newId = (date: string, tag: string) => {
    let n = 1;
    while (current.has(`coach-${date}-${tag}-${n}`)) n++;
    return `coach-${date}-${tag}-${n}`;
  };

  const patchWorkout = (w: Workout, patch: WorkoutPatch): Workout => {
    checkDate(patch.date ?? w.date);
    const { date, title, description, coachNote, type, distanceKm, steps, focus, exercises, durationMin } = patch;
    const common = { ...(date !== undefined && { date }), ...(title !== undefined && { title }),
      ...(description !== undefined && { description }), ...(coachNote !== undefined && { coachNote }) };
    if (w.kind === "strength") {
      if (type !== undefined || distanceKm !== undefined || steps !== undefined) throw new PlanEditError("Run fields cannot be applied to a strength session.");
      const base = focus !== undefined && focus !== w.focus ? {
        ...buildStrength({ id: w.id, date: date ?? w.date, focus, phase: weekOfDate(plan, date ?? w.date)!.phase,
          equipment: plan.input.strength.equipment, level: plan.input.experience }),
        ...(w.coachNote !== undefined && { coachNote: w.coachNote }),
      } : w;
      return WorkoutSchema.parse({ ...base, ...common, ...(focus !== undefined && { focus }),
        ...(exercises !== undefined && { exercises }), ...(durationMin !== undefined && { durationMin }) });
    }
    if (focus !== undefined || exercises !== undefined || durationMin !== undefined) throw new PlanEditError("Strength fields cannot be applied to a run.");
    let base = w;
    if (steps !== undefined) {
      base = { ...w, type: type ?? w.type, steps, distanceKm: Math.round(stepsDistanceKm(steps, plan.paces) * 1e6) / 1e6,
        estDurationMin: Math.round(stepsDurationMin(steps, plan.paces)) };
      if (distanceKm !== undefined && Math.abs(base.distanceKm - distanceKm) > 0.000001)
        throw new PlanEditError(`Declared distance ${distanceKm}km does not match the steps (${base.distanceKm}km).`);
    } else if (type !== undefined || distanceKm !== undefined) {
      const as = type ?? w.type;
      if (as === "race") throw new PlanEditError("Race day cannot be edited.");
      if (distanceKm !== undefined && as !== "easy" && as !== "long")
        throw new PlanEditError("The distance of a structured run comes from its steps. Provide matching steps to change distance.");
      const draft = as === "easy" ? easyRun(distanceKm ?? w.distanceKm, plan.paces)
        : as === "long" ? longRun(distanceKm ?? w.distanceKm, "easy", plan.paces)
        : as === "tempo" ? tempoRun(0, plan.input.experience, plan.paces)
        : as === "intervals" ? intervalRun(INTERVALS[plan.goal][0], plan.input.experience, plan.paces)
        : hillRun(0, plan.input.experience, plan.paces);
      // These two builders produce one steady step but normally round to half kilometres.
      // Granular edits retain the caller's exact requested distance.
      if (as === "easy" || as === "long") {
        const km = distanceKm ?? w.distanceKm;
        draft.steps = [{ kind: "steady", distanceM: km * 1000, target: { zone: "E", pace: plan.paces.E } }];
        draft.title = `${km}km ${as === "easy" ? "Easy" : "Long"} Run`;
      }
      base = { ...finishRun(draft, w.id, date ?? w.date, plan.paces),
        distanceKm: Math.round(stepsDistanceKm(draft.steps, plan.paces) * 1e6) / 1e6,
        estDurationMin: Math.round(stepsDurationMin(draft.steps, plan.paces)),
        ...(w.coachNote !== undefined && { coachNote: w.coachNote }) };
    }
    return WorkoutSchema.parse({ ...base, ...common });
  };

  const matches = (w: Workout, filter: WorkoutFilter) => {
    const week = weekOfDate(plan, w.date)!;
    return (filter.weekFrom === undefined || week.index >= filter.weekFrom)
      && (filter.weekTo === undefined || week.index <= filter.weekTo)
      && (!filter.dateFrom || w.date >= filter.dateFrom) && (!filter.dateTo || w.date <= filter.dateTo)
      && (!filter.days || filter.days.includes(weekdayOf(w.date))) && (!filter.kind || w.kind === filter.kind)
      && (!filter.types || (w.kind === "run" && w.type !== "race" && filter.types.includes(w.type)))
      && (!filter.focuses || (w.kind === "strength" && filter.focuses.includes(w.focus)));
  };

  for (const op of ops) {
    switch (op.op) {
      case "move": {
        const w = get(op.workoutId);
        checkDate(op.toDate);
        set(w.id, { ...w, date: op.toDate });
        break;
      }
      case "update_workout": {
        const w = get(op.workoutId);
        set(w.id, patchWorkout(w, WorkoutPatchSchema.parse(op.patch)));
        break;
      }
      case "bulk_update_workouts": {
        const filter = WorkoutFilterSchema.parse(op.filter);
        const patch = WorkoutPatchSchema.parse(op.patch);
        if (patch.date !== undefined) throw new PlanEditError("A bulk update cannot set an absolute date. Move workouts individually.");
        const candidates = [...current.values()].filter((w): w is Workout => w !== null && w.date >= ctx.today
          && !ctx.lockedIds.has(w.id) && !(w.kind === "run" && w.type === "race") && matches(w, filter));
        if (!candidates.length) throw new PlanEditError("No editable workouts match this filter.");
        if (candidates.length > 200) throw new PlanEditError("A bulk update may affect at most 200 workouts. Narrow the filter.");
        const updated = candidates.map(w => patchWorkout(w, patch));
        for (const w of updated) set(w.id, w);
        break;
      }
      case "swap": {
        if (op.workoutId === op.withWorkoutId) throw new PlanEditError("Pick two different workouts to swap.");
        const a = get(op.workoutId);
        const b = get(op.withWorkoutId);
        // Each workout takes the other's day, so both days must still be ahead
        checkDate(b.date);
        checkDate(a.date);
        set(a.id, { ...a, date: b.date });
        set(b.id, { ...b, date: a.date });
        break;
      }
      case "remove": {
        const w = get(op.workoutId);
        set(w.id, null);
        break;
      }
      case "replace_run": {
        const w = get(op.workoutId);
        if (w.kind !== "run") throw new PlanEditError(`"${w.title}" is a strength session. Remove it or add a different one instead.`);
        const level = op.level ?? 0;
        const { paces, input } = plan;
        const limit = { tempo: TEMPO.length, intervals: INTERVALS[plan.goal].length, hills: HILLS.length } as const;
        if ((op.as === "tempo" || op.as === "intervals" || op.as === "hills") && level >= limit[op.as])
          throw new PlanEditError(`${op.as} has levels 0–${limit[op.as] - 1} in this plan.`);
        if ((op.as === "tempo" || op.as === "intervals" || op.as === "hills") && op.distanceKm !== undefined)
          throw new PlanEditError(`The distance of a ${op.as} session comes from its structure. Change the level instead.`);
        const km = op.distanceKm ?? w.distanceKm;
        const draft =
          op.as === "easy"
            ? easyRun(km, paces)
            : op.as === "long"
              ? longRun(km, "easy", paces)
              : op.as === "tempo"
                ? tempoRun(level, input.experience, paces)
                : op.as === "intervals"
                  ? intervalRun(INTERVALS[plan.goal][level], input.experience, paces)
                  : hillRun(level, input.experience, paces);
        set(w.id, finishRun(draft, w.id, w.date, paces));
        break;
      }
      case "add_run": {
        checkDate(op.date);
        const wid = newId(op.date, "easy");
        set(wid, finishRun(easyRun(round05(op.distanceKm), plan.paces), wid, op.date, plan.paces));
        break;
      }
      case "add_strength": {
        checkDate(op.date);
        const wid = newId(op.date, `str-${op.focus}`);
        set(
          wid,
          buildStrength({ id: wid, date: op.date, focus: op.focus, phase: weekOfDate(plan, op.date)!.phase, equipment: plan.input.strength.equipment, level: plan.input.experience }),
        );
        break;
      }
    }
  }

  return [...touched]
    .map((key) => ({ workoutKey: key, before: original.get(key) ?? null, after: current.get(key) ?? null }))
    .filter((c) => canon(c.before) !== canon(c.after));
}

/** Why changes no longer fit the plan (it moved on since they were proposed), or null if they still apply. */
export function staleReason(plan: Plan, changes: WorkoutChange[]): string | null {
  const now = new Map(plan.weeks.flatMap((w) => w.workouts).map((w) => [w.id, w]));
  for (const c of changes) {
    const have = now.get(c.workoutKey) ?? null;
    if (canon(have) !== canon(c.before)) {
      const title = (c.before ?? c.after)?.title ?? c.workoutKey;
      return `"${title}" has changed since this was suggested.`;
    }
  }
  return null;
}

/** The plan with the changes applied. Workouts go back into the week their date falls in. */
export function applyChanges(plan: Plan, changes: WorkoutChange[]): Plan {
  const all = new Map(plan.weeks.flatMap((w) => w.workouts).map((w) => [w.id, w]));
  for (const c of changes) {
    if (c.after) all.set(c.workoutKey, c.after);
    else all.delete(c.workoutKey);
  }
  const weeks = plan.weeks.map((w) => ({ ...w, workouts: [] as Workout[] }));
  for (const w of all.values()) {
    const week = weeks.find((x) => x.startDate <= w.date && w.date <= addDays(x.startDate, 6));
    if (!week) throw new PlanEditError(`"${w.title}" would land on ${w.date}, outside the plan.`);
    week.workouts.push(w);
  }
  for (const week of weeks) {
    // By day; on the same day the run comes first, as the templates do
    week.workouts.sort((a, b) => (a.date === b.date ? (a.kind === "run" ? -1 : 1) - (b.kind === "run" ? -1 : 1) : a.date < b.date ? -1 : 1));
    week.targetKm = round05(week.workouts.reduce((s, w) => s + (w.kind === "run" ? w.distanceKm : 0), 0));
  }
  return PlanSchema.parse({ ...plan, source: "coach", weeks });
}
