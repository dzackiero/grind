export * from "./schema";
export { generatePlan, phasesFor, weeklyVolumes } from "./generate";
export { validatePlan, type PlanIssue, type ValidationResult } from "./validate";
export { applyChanges, buildChanges, EditOpSchema, PlanEditError, staleReason, weekOfDate, type EditContext, type EditOp, type WorkoutChange } from "./edit";
export { fitnessFromRace, predictRaceTime, paceZones, formatPace, formatDuration, RACE_DISTANCE_M } from "./paces";
export { GOAL_TEMPLATES } from "./templates";
export { changeLineText, dayLabel, describeChanges, describeExercises, describeRunSteps, workoutOneLine, type ChangeLine } from "./describe";
