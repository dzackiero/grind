import { z } from "zod";
import { WEEKDAYS } from "./dates";

/*
 * The plan format. Templates, Claude (through MCP) and the UI all speak this shape.
 * Anything written to the database goes through `PlanSchema.parse` and `validatePlan`.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const WeekdaySchema = z.enum(WEEKDAYS);
export const GoalSchema = z.enum(["5k", "10k", "half", "marathon"]);
export const ExperienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const IntensitySchema = z.enum(["steady", "balanced", "push"]);
export const PhaseSchema = z.enum(["base", "build", "peak", "taper", "recovery"]);

export const RunTypeSchema = z.enum(["easy", "tempo", "intervals", "hills", "long", "race"]);
export const StrengthFocusSchema = z.enum(["legs_core", "upper", "full"]);
export const PaceZoneSchema = z.enum(["E", "M", "T", "I", "R", "race"]);

// ---------- Onboarding form ----------

export const PlanInputSchema = z
  .object({
    goal: GoalSchema,
    /** Race day. Leave out for a "get fitter" plan of default length. */
    raceDate: isoDate.optional(),
    /** First day the athlete can train. Defaults to today. */
    startDate: isoDate,
    experience: ExperienceSchema,
    currentWeeklyKm: z.number().min(0).max(250),
    /** Recent race or time trial, used for paces. Leave out to estimate from experience. */
    recentRace: z
      .object({
        distanceM: z.number().min(1000).max(42195),
        timeSec: z.number().min(150).max(8 * 3600),
      })
      .optional(),
    runDays: z.array(WeekdaySchema).min(3).max(6),
    longRunDay: WeekdaySchema,
    strength: z.object({
      sessionsPerWeek: z.number().int().min(0).max(5),
      days: z.array(WeekdaySchema).max(5),
      equipment: z.enum(["gym", "bodyweight"]),
    }),
    intensity: IntensitySchema,
  })
  .superRefine((v, ctx) => {
    if (new Set(v.runDays).size !== v.runDays.length)
      ctx.addIssue({ code: "custom", path: ["runDays"], message: "Each run day can appear once." });
    if (!v.runDays.includes(v.longRunDay))
      ctx.addIssue({ code: "custom", path: ["longRunDay"], message: "The long run day must be one of the run days." });
    if (v.strength.days.length < v.strength.sessionsPerWeek)
      ctx.addIssue({
        code: "custom",
        path: ["strength", "days"],
        message: `Pick ${v.strength.sessionsPerWeek} strength days.`,
      });
    if (v.raceDate && v.raceDate <= v.startDate)
      ctx.addIssue({ code: "custom", path: ["raceDate"], message: "Race day must be after the start date." });
  });
export type PlanInput = z.infer<typeof PlanInputSchema>;

// ---------- Paces ----------

export const PaceRangeSchema = z.object({
  /** Faster end, seconds per km */
  minSecPerKm: z.number().min(120).max(720),
  /** Slower end, seconds per km */
  maxSecPerKm: z.number().min(120).max(720),
});
export type PaceRange = z.infer<typeof PaceRangeSchema>;

export const PaceZonesSchema = z.object({
  E: PaceRangeSchema,
  M: PaceRangeSchema,
  T: PaceRangeSchema,
  I: PaceRangeSchema,
  R: PaceRangeSchema,
  race: PaceRangeSchema,
});
export type PaceZones = z.infer<typeof PaceZonesSchema>;

// ---------- Run steps ----------

export const TargetSchema = z.object({
  zone: PaceZoneSchema,
  pace: PaceRangeSchema.optional(),
  /** Effort cue for steps without a pace, like hills: "hard uphill, jog down". */
  effort: z.string().max(80).optional(),
});

export const SimpleStepSchema = z
  .object({
    kind: z.enum(["warmup", "work", "recovery", "cooldown", "steady"]),
    distanceM: z.number().positive().max(42195).optional(),
    durationSec: z.number().positive().max(6 * 3600).optional(),
    target: TargetSchema.optional(),
    /** Recovery as walk or jog */
    note: z.string().max(80).optional(),
  })
  .refine((s) => s.distanceM !== undefined || s.durationSec !== undefined, {
    message: "A step needs a distance or a duration.",
  });
export type SimpleStep = z.infer<typeof SimpleStepSchema>;

export const RepeatStepSchema = z.object({
  kind: z.literal("repeat"),
  times: z.number().int().min(2).max(30),
  steps: z.array(SimpleStepSchema).min(1).max(4),
});
export type RepeatStep = z.infer<typeof RepeatStepSchema>;

export const StepSchema = z.union([RepeatStepSchema, SimpleStepSchema]);
export type Step = z.infer<typeof StepSchema>;

// ---------- Workouts ----------

const workoutBase = {
  id: z.string().min(1).max(80),
  date: isoDate,
  title: z.string().min(1).max(80),
  /** Short explanation shown on the card. Templates write a default; Claude rewrites it. */
  description: z.string().max(600),
  /** Personal note from the coach (Claude), e.g. why this session is here this week. */
  coachNote: z.string().max(600).optional(),
};

export const RunWorkoutSchema = z.object({
  ...workoutBase,
  kind: z.literal("run"),
  type: RunTypeSchema,
  distanceKm: z.number().positive().max(60),
  /** Rough duration at target paces, minutes */
  estDurationMin: z.number().positive().max(400),
  steps: z.array(StepSchema).min(1).max(20),
});
export type RunWorkout = z.infer<typeof RunWorkoutSchema>;

export const ExerciseSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().min(1).max(60),
  /** Superset group shown as A1, A2, B1… */
  group: z.enum(["A", "B", "C", "D"]),
  sets: z.number().int().min(1).max(8),
  reps: z.number().int().min(1).max(50).optional(),
  durationSec: z.number().int().min(5).max(600).optional(),
  perSide: z.boolean().default(false),
  restSec: z.number().int().min(0).max(300),
  /** Effort guide: reps in reserve style */
  load: z.enum(["bodyweight", "light", "moderate", "heavy"]),
  cue: z.string().max(160).optional(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

export const StrengthWorkoutSchema = z.object({
  ...workoutBase,
  kind: z.literal("strength"),
  type: z.literal("strength"),
  focus: StrengthFocusSchema,
  durationMin: z.tuple([z.number().int().min(10), z.number().int().max(120)]),
  exercises: z.array(ExerciseSchema).min(2).max(12),
});
export type StrengthWorkout = z.infer<typeof StrengthWorkoutSchema>;

export const WorkoutSchema = z.discriminatedUnion("kind", [RunWorkoutSchema, StrengthWorkoutSchema]);
export type Workout = z.infer<typeof WorkoutSchema>;

// ---------- Plan ----------

export const WeekSchema = z.object({
  index: z.number().int().min(1),
  startDate: isoDate,
  phase: PhaseSchema,
  targetKm: z.number().min(0).max(250),
  /** One line about the week's purpose, e.g. "Lighter week to absorb the work." */
  focus: z.string().max(200),
  workouts: z.array(WorkoutSchema).max(14),
});
export type Week = z.infer<typeof WeekSchema>;

export const PlanSchema = z.object({
  version: z.literal(1),
  goal: GoalSchema,
  title: z.string().max(80),
  raceDate: isoDate,
  startDate: isoDate,
  /** VDOT-style fitness score the paces come from */
  fitnessScore: z.number().min(20).max(85),
  paces: PaceZonesSchema,
  estimatedRaceTimeSec: z.object({ low: z.number().positive(), high: z.number().positive() }),
  input: PlanInputSchema,
  /** "template" when built by the engine only, "coach" once Claude has edited it */
  source: z.enum(["template", "coach"]),
  weeks: z.array(WeekSchema).min(1).max(30),
});
export type Plan = z.infer<typeof PlanSchema>;
