// Prints a generated plan as a readable table. Run: pnpm plan:sample [goal]
import {
  formatDuration,
  formatPace,
  generatePlan,
  validatePlan,
  type PlanInput,
} from "../src/lib/plan";

const goal = (process.argv[2] as PlanInput["goal"]) ?? "half";

const plan = generatePlan({
  goal,
  raceDate: goal === "half" ? "2027-01-17" : undefined,
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 15,
  recentRace: { distanceM: 5000, timeSec: 27 * 60 + 41 },
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 3, days: ["mon", "tue", "thu"], equipment: "gym" },
  intensity: "balanced",
});

console.log(`${plan.title} · race ${plan.raceDate} · fitness ${plan.fitnessScore}`);
console.log(
  `Estimate: ${formatDuration(plan.estimatedRaceTimeSec.low)} – ${formatDuration(plan.estimatedRaceTimeSec.high)}`,
);
console.log(
  "Paces /km: " +
    Object.entries(plan.paces)
      .map(([z, p]) => `${z} ${formatPace(p.minSecPerKm)}-${formatPace(p.maxSecPerKm)}`)
      .join(" · "),
);
for (const w of plan.weeks) {
  console.log(`\nWeek ${w.index} (${w.startDate}) ${w.phase.toUpperCase()} · ${w.targetKm} km`);
  for (const wo of w.workouts) {
    const day = new Date(wo.date + "T00:00:00Z").toUTCString().slice(0, 3);
    const extra =
      wo.kind === "run"
        ? `${wo.distanceKm} km · ~${wo.estDurationMin} min`
        : `${wo.durationMin.join("–")} min · ${wo.exercises.length} exercises`;
    console.log(`  ${day} ${wo.date}  [${wo.type}] ${wo.title} — ${extra}`);
  }
}
const result = validatePlan(plan);
console.log(
  `\nValidation: ${result.ok ? "OK" : "FAILED"} · ${result.errors.length} errors · ${result.warnings.length} warnings`,
);
for (const i of [...result.errors, ...result.warnings])
  console.log(`  ${i.severity} ${i.code}: ${i.message}`);
