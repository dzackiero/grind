import type { CoachingProfile } from "../coaching";
import { addDays, weekdayOf } from "./dates";
import { applyChanges, buildChanges, type EditOp } from "./edit";
import type { Plan } from "./schema";

/** Apply executable coaching rules to generated slots without changing their calendar. */
export function personalizeGeneratedPlan(plan: Plan, profile: CoachingProfile): Plan {
  const { preferences, constraints } = profile;
  const allowHills = constraints.allowHills ?? preferences.allowHills;
  const allowProgressive = constraints.allowProgressiveLongRun ?? preferences.allowProgressiveLongRun;
  const qualityWeeks = constraints.qualityOnlyLastWeeks ?? preferences.qualityOnlyLastWeeks;
  const qualityStarts = qualityWeeks === undefined ? undefined : addDays(plan.raceDate, -7 * qualityWeeks);
  const ops: EditOp[] = [];

  for (const workout of plan.weeks.flatMap(week => week.workouts)) {
    if (workout.date < plan.startDate || workout.type === "race") continue;
    const day = weekdayOf(workout.date);
    if (workout.kind === "strength") {
      const focus = constraints.strengthFocusByDay?.[day] ?? preferences.strengthFocusByDay?.[day];
      if (focus !== undefined && focus !== workout.focus)
        ops.push({ op: "update_workout", workoutId: workout.id, patch: { focus } });
      continue;
    }

    const mandatoryType = constraints.runTypeByDay?.[day];
    let type = mandatoryType ?? preferences.runTypeByDay?.[day] ?? workout.type;
    // A mandatory day type stays visible when another mandatory rule contradicts it.
    // Soft restrictions cannot override that type; validation explains remaining conflicts.
    if (mandatoryType === undefined) {
      if (type === "hills" && allowHills === false) type = "easy";
      if (["tempo", "intervals", "hills"].includes(type) && qualityStarts !== undefined
        && (workout.date < qualityStarts || workout.date > plan.raceDate)) type = "easy";
    }
    const steadyLong = type === "long" && allowProgressive === false && workout.steps.some(step => {
      const simple = step.kind === "repeat" ? step.steps : [step];
      return simple.some(s => (s.kind === "work" || s.kind === "steady") && s.target && s.target.zone !== "E");
    });
    if (type !== workout.type || steadyLong) {
      ops.push({ op: "update_workout", workoutId: workout.id, patch: {
        type, ...((type === "easy" || type === "long") && { distanceKm: workout.distanceKm }),
      } });
    }
  }
  if (!ops.length) return plan;
  const changes = buildChanges(plan, ops, { today: plan.startDate, lockedIds: new Set() });
  return { ...applyChanges(plan, changes), source: plan.source };
}
