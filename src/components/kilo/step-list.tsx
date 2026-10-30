import { cn } from "cn";
import { formatPace, type RunWorkout, type SimpleStep } from "@/lib/plan";
import { formatDurationShort } from "./format";

const STEP_NAME: Record<SimpleStep["kind"], string> = {
  warmup: "Warm up",
  work: "Run",
  recovery: "Recover",
  cooldown: "Cool down",
  steady: "Run",
};

/** Strip colour by intensity: easy green, hard orange, steady purple, recoveries neutral. */
function stripClass(step: SimpleStep, type: RunWorkout["type"]) {
  if (step.kind === "recovery") return "bg-line-strong";
  const zone = step.target?.zone;
  if (zone === "E" || step.kind === "warmup" || step.kind === "cooldown")
    return "bg-type-easy-mark";
  if (zone === "M") return "bg-type-long-mark";
  if (zone === "T") return "bg-type-tempo-mark";
  if (zone === "race") return "bg-type-race-mark";
  if (type === "hills") return "bg-type-hills-mark";
  return "bg-type-intervals-mark";
}

function describe(step: SimpleStep) {
  const amount = step.distanceM
    ? step.distanceM >= 1000
      ? `${+(step.distanceM / 1000).toFixed(2)} km`
      : `${step.distanceM} m`
    : formatDurationShort(step.durationSec ?? 0);
  const target = step.target?.pace
    ? `${formatPace(step.target.pace.minSecPerKm)}–${formatPace(step.target.pace.maxSecPerKm)}/km`
    : (step.target?.effort ?? step.note);
  return target ? `${amount} · ${target}` : amount;
}

function StepRow({
  step,
  type,
  nested,
}: {
  step: SimpleStep;
  type: RunWorkout["type"];
  nested?: boolean;
}) {
  return (
    <li
      className={cn(
        "bg-secondary grid grid-cols-[4px_1fr_auto] items-center gap-3 overflow-hidden rounded-md py-2.5 pr-3",
        nested && "ml-4",
      )}
    >
      <span className={cn("self-stretch -my-2.5", stripClass(step, type))} />
      <span className="font-semibold">{STEP_NAME[step.kind]}</span>
      <span className="text-muted-foreground text-right font-mono text-[13px] tabular-nums">
        {describe(step)}
      </span>
    </li>
  );
}

/** Steps of a run, in the order you'd enter them in the watch's workout editor. */
export function StepList({ workout }: { workout: RunWorkout }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {workout.steps.map((s, i) =>
        s.kind === "repeat" ? (
          <li key={i} className="flex flex-col gap-1.5">
            <span className="kilo-label pt-1">Repeat {s.times} times</span>
            <ol className="flex flex-col gap-1.5">
              {s.steps.map((x, j) => (
                <StepRow key={j} step={x} type={workout.type} nested />
              ))}
            </ol>
          </li>
        ) : (
          <StepRow key={i} step={s} type={workout.type} />
        ),
      )}
    </ol>
  );
}
