import { z } from "zod";
import { addDays, weekdayOf } from "./plan/dates";
import { RunTypeSchema, StrengthFocusSchema, WeekdaySchema, type Plan } from "./plan/schema";

const days = z
  .array(WeekdaySchema)
  .max(7)
  .refine((value) => new Set(value).size === value.length, "Each day can appear once.");

/** Omitted rules express no preference or restriction. Day lists restrict allowed days; they do not require sessions. */
export const CoachingRulesSchema = z
  .object({
    runDays: days.optional(),
    longRunDay: WeekdaySchema.optional(),
    runTypeByDay: z.partialRecord(WeekdaySchema, RunTypeSchema.exclude(["race"])).optional(),
    allowHills: z.boolean().optional(),
    allowProgressiveLongRun: z.boolean().optional(),
    qualityOnlyLastWeeks: z.number().int().min(1).max(12).optional(),
    strengthDays: days.optional(),
    strengthFocusByDay: z.partialRecord(WeekdaySchema, StrengthFocusSchema).optional(),
    strengthSessionsPerWeek: z.number().int().min(0).max(5).optional(),
    restDays: days.optional(),
  })
  .strict();
export type CoachingRules = z.infer<typeof CoachingRulesSchema>;

export const CoachingProfileSchema = z
  .object({
    preferences: CoachingRulesSchema.default({}),
    constraints: CoachingRulesSchema.default({}),
    /** Athlete-reported context for the coach, not a diagnosis or executable rule. */
    context: z
      .object({
        reportedLimitations: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
        notes: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CoachingProfile = z.infer<typeof CoachingProfileSchema>;

export interface CoachingIssue {
  severity: "error" | "warning";
  code: "COACHING_CONSTRAINT" | "COACHING_PREFERENCE";
  rule: keyof CoachingRules;
  workoutId?: string;
  week?: number;
  message: string;
}
export interface CoachingValidationResult {
  ok: boolean;
  errors: CoachingIssue[];
  warnings: CoachingIssue[];
}

/**
 * Validate explicit rules only. Races are exempt from run-day/type patterns, but explicit
 * rest days still apply. Quality means tempo, intervals, or hills, within raceDate - N*7
 * days through raceDate inclusive. Weekly strength frequency applies only to complete
 * plan weeks that have not started before today, preserving elapsed training history.
 */
export function validateCoaching(
  plan: Plan,
  profile: CoachingProfile,
  today?: string,
): CoachingValidationResult {
  const errors: CoachingIssue[] = [];
  const warnings: CoachingIssue[] = [];
  for (const section of ["constraints", "preferences"] as const) {
    const rules = profile[section];
    const severity = section === "constraints" ? "error" : "warning";
    const code = section === "constraints" ? "COACHING_CONSTRAINT" : "COACHING_PREFERENCE";
    const issues = section === "constraints" ? errors : warnings;
    for (const week of plan.weeks) {
      const issue = (rule: keyof CoachingRules, message: string, workoutId?: string) =>
        issues.push({
          severity,
          code,
          rule,
          week: week.index,
          ...(workoutId ? { workoutId } : {}),
          message,
        });
      for (const workout of week.workouts) {
        if (today && workout.date < today) continue;
        const day = weekdayOf(workout.date);
        const fail = (rule: keyof CoachingRules, message: string) =>
          issue(rule, message, workout.id);
        if (rules.restDays?.includes(day))
          fail("restDays", `${workout.date} is a rest day; ${workout.title} is scheduled.`);
        if (workout.kind === "run") {
          if (workout.type !== "race") {
            if (rules.runDays && !rules.runDays.includes(day))
              fail("runDays", `Running on ${day} is outside the allowed run days.`);
            if (rules.longRunDay && workout.type === "long" && day !== rules.longRunDay)
              fail("longRunDay", `Long runs belong on ${rules.longRunDay}, not ${day}.`);
            if (rules.runTypeByDay?.[day] && workout.type !== rules.runTypeByDay[day])
              fail(
                "runTypeByDay",
                `${day} runs should be ${rules.runTypeByDay[day]}, not ${workout.type}.`,
              );
          }
          if (rules.allowHills === false && workout.type === "hills")
            fail("allowHills", "Hill sessions are excluded.");
          if (rules.allowProgressiveLongRun === false && workout.type === "long") {
            const steps = workout.steps.flatMap((step) =>
              step.kind === "repeat" ? step.steps : [step],
            );
            if (
              steps.some(
                (step) =>
                  (step.kind === "work" || step.kind === "steady") &&
                  step.target &&
                  step.target.zone !== "E",
              )
            )
              fail(
                "allowProgressiveLongRun",
                "Long runs must keep their work and steady steps at easy effort.",
              );
          }
          if (
            rules.qualityOnlyLastWeeks !== undefined &&
            ["tempo", "intervals", "hills"].includes(workout.type)
          ) {
            if (
              workout.date < addDays(plan.raceDate, -7 * rules.qualityOnlyLastWeeks) ||
              workout.date > plan.raceDate
            )
              fail(
                "qualityOnlyLastWeeks",
                `Quality sessions are limited to the final ${rules.qualityOnlyLastWeeks} weeks before race day.`,
              );
          }
        } else {
          if (rules.strengthDays && !rules.strengthDays.includes(day))
            fail("strengthDays", `Strength on ${day} is outside the allowed strength days.`);
          if (rules.strengthFocusByDay?.[day] && workout.focus !== rules.strengthFocusByDay[day])
            fail(
              "strengthFocusByDay",
              `${day} strength should focus on ${rules.strengthFocusByDay[day]}, not ${workout.focus}.`,
            );
        }
      }
      const completeWeek =
        week.startDate >= plan.startDate &&
        addDays(week.startDate, 6) <= plan.raceDate &&
        (!today || week.startDate >= today);
      if (rules.strengthSessionsPerWeek !== undefined && completeWeek) {
        const count = week.workouts.filter((workout) => workout.kind === "strength").length;
        if (count !== rules.strengthSessionsPerWeek)
          issue(
            "strengthSessionsPerWeek",
            `Week ${week.index} has ${count} strength sessions; expected ${rules.strengthSessionsPerWeek}.`,
          );
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
