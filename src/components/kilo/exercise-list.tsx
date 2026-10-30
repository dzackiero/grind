import type { StrengthWorkout } from "@/lib/plan";
import { Separator } from "@/components/ui/separator";
import { formatDurationShort } from "./format";

const LOAD_LABEL = {
  bodyweight: "Bodyweight",
  light: "Light",
  moderate: "Moderate",
  heavy: "Heavy",
} as const;

/** Exercises of a strength session, numbered by superset (A1, A2, B1…). */
export function ExerciseList({ workout }: { workout: StrengthWorkout }) {
  const counters: Record<string, number> = {};
  return (
    <ul className="flex flex-col">
      {workout.exercises.map((ex, i) => {
        counters[ex.group] = (counters[ex.group] ?? 0) + 1;
        const amount = ex.durationSec ? formatDurationShort(ex.durationSec) : `${ex.reps}`;
        return (
          <li key={ex.id}>
            {i > 0 && <Separator />}
            <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3 py-3">
              <span className="bg-secondary text-type-strength-mark font-display grid size-11 place-items-center rounded-md text-[13px] font-extrabold">
                {ex.group}
                {counters[ex.group]}
              </span>
              <div className="min-w-0">
                <div className="font-semibold">{ex.name}</div>
                <div className="text-muted-foreground font-mono text-[13px]">
                  {ex.sets} × {amount}
                  {ex.perSide ? " each side" : ""} · rest {formatDurationShort(ex.restSec)}
                  {ex.rir !== undefined ? ` · RIR ${ex.rir}` : ""}
                </div>
                {ex.cue && <div className="text-muted-foreground mt-0.5 text-xs">{ex.cue}</div>}
              </div>
              <span className="text-muted-foreground text-right text-xs font-semibold">
                {LOAD_LABEL[ex.load]}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
