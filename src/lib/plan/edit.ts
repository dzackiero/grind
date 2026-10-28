import { z } from "zod";
import { addDays } from "./dates";
import { easyRun, finishRun, hillRun, intervalRun, longRun, round05, tempoRun } from "./run-sessions";
import { PlanSchema, StrengthFocusSchema, type Plan, type Week, type Workout } from "./schema";
import { buildStrength } from "./strength-sessions";
import { HILLS, INTERVALS, TEMPO } from "./templates";

/*
 * Plan edits. Claude (through MCP) describes what should change; this module works out the new workouts
 * with the same builders the templates use, so paces and distances stay consistent with the plan.
 *
 *   buildChanges(plan, ops)    → the before/after of every touched workout (throws PlanEditError)
 *   applyChanges(plan, changes) → the edited plan (pure; the caller validates it)
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
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

export function buildChanges(plan: Plan, ops: EditOp[], ctx: EditContext): WorkoutChange[] {
  if (!ops.length) throw new PlanEditError("No changes given.");
  const original = new Map(plan.weeks.flatMap((w) => w.workouts).map((w) => [w.id, w]));
  const current = new Map<string, Workout | null>(original);
  const touched = new Set<string>();

  const get = (workoutId: string) => {
    const w = current.get(workoutId);
    if (!w) throw new PlanEditError(`There's no workout "${workoutId}" in the plan (or it was already removed). Use get_week to see the ids.`);
    if (ctx.lockedIds.has(workoutId)) throw new PlanEditError(`"${w.title}" on ${w.date} is already done or skipped, so it can't be changed.`);
    if (w.kind === "run" && w.type === "race") throw new PlanEditError(`Race day can't be changed here. Change the race date by building a new plan.`);
    return w;
  };
  const checkDate = (date: string) => {
    if (date < ctx.today) throw new PlanEditError(`${date} is in the past. Pick ${ctx.today} or later.`);
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

  for (const op of ops) {
    switch (op.op) {
      case "move": {
        const w = get(op.workoutId);
        checkDate(op.toDate);
        set(w.id, { ...w, date: op.toDate });
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
