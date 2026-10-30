import { z } from "zod";
import {
  ExerciseSchema,
  RunTypeSchema,
  StepSchema,
  StrengthFocusSchema,
  WeekdaySchema,
} from "./schema";

/** Reject calendar overflows such as November 31, as well as malformed dates. */
export const WorkoutDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Use a real calendar date");

export const EditableRunTypeSchema = RunTypeSchema.exclude(["race"]);

export const WorkoutPatchSchema = z
  .object({
    date: WorkoutDateSchema.optional(),
    title: z.string().min(1).max(80).optional(),
    description: z.string().max(600).optional(),
    coachNote: z.string().max(600).optional(),
    type: EditableRunTypeSchema.optional(),
    distanceKm: z.number().positive().max(60).optional(),
    steps: z.array(StepSchema).min(1).max(20).optional(),
    focus: StrengthFocusSchema.optional(),
    exercises: z.array(ExerciseSchema).min(2).max(12).optional(),
    durationMin: z
      .tuple([z.number().int().min(10).max(120), z.number().int().min(10).max(120)])
      .refine(([min, max]) => min <= max, "Duration minimum must not exceed maximum")
      .optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    "Provide at least one workout field",
  );
export type WorkoutPatch = z.infer<typeof WorkoutPatchSchema>;

export const WorkoutFilterSchema = z
  .object({
    weekFrom: z.number().int().min(1).max(30).optional(),
    weekTo: z.number().int().min(1).max(30).optional(),
    dateFrom: WorkoutDateSchema.optional(),
    dateTo: WorkoutDateSchema.optional(),
    days: z.array(WeekdaySchema).min(1).max(7).optional(),
    kind: z.enum(["run", "strength"]).optional(),
    types: z.array(EditableRunTypeSchema).min(1).max(5).optional(),
    focuses: z.array(StrengthFocusSchema).min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!Object.values(value).some((v) => v !== undefined))
      ctx.addIssue({ code: "custom", message: "Provide at least one workout filter" });
    if (value.weekFrom !== undefined && value.weekTo !== undefined && value.weekFrom > value.weekTo)
      ctx.addIssue({ code: "custom", message: "weekFrom must not exceed weekTo" });
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo)
      ctx.addIssue({ code: "custom", message: "dateFrom must not exceed dateTo" });
  });
export type WorkoutFilter = z.infer<typeof WorkoutFilterSchema>;
