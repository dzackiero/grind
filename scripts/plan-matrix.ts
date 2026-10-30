// Generates every template combination and counts validator warnings. Run: pnpm plan:matrix
import { generatePlan, validatePlan, type PlanInput } from "../src/lib/plan";

const counts = new Map<string, number>();
let plans = 0;
const peaks: string[] = [];

for (const goal of ["5k", "10k", "half", "marathon"] as const)
  for (const experience of ["beginner", "intermediate", "advanced"] as const)
    for (const intensity of ["steady", "balanced", "push"] as const)
      for (const runDays of [
        ["tue", "thu", "sun"],
        ["mon", "wed", "fri", "sun"],
        ["mon", "tue", "thu", "sat", "sun"],
        ["mon", "tue", "wed", "thu", "fri", "sun"],
      ] as PlanInput["runDays"][]) {
        const plan = generatePlan({
          goal,
          experience,
          intensity,
          startDate: "2026-11-02",
          currentWeeklyKm: { beginner: 10, intermediate: 25, advanced: 45 }[experience],
          runDays,
          longRunDay: "sun",
          strength:
            runDays.length >= 5
              ? { sessionsPerWeek: 5, days: ["mon", "tue", "wed", "thu", "fri"], equipment: "gym" }
              : { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" },
        });
        plans++;
        const r = validatePlan(plan);
        for (const i of [...r.errors, ...r.warnings])
          counts.set(`${i.severity} ${i.code}`, (counts.get(`${i.severity} ${i.code}`) ?? 0) + 1);
        if (intensity === "balanced" && runDays.length === 4) {
          const km = Math.max(...plan.weeks.slice(0, -1).map((w) => w.targetKm));
          const long = Math.max(
            ...plan.weeks
              .flatMap((w) => w.workouts)
              .map((w) => (w.kind === "run" && w.type === "long" ? w.distanceKm : 0)),
          );
          peaks.push(
            `${goal.padEnd(8)} ${experience.padEnd(12)} peak ${km} km/week · longest ${long} km`,
          );
        }
      }

console.log(`${plans} plans`);
console.log(peaks.join("\n"));
console.log([...counts].map(([k, v]) => `${k}: ${v}`).join("\n") || "no issues");
