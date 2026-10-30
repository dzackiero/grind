import Link from "next/link";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Workout } from "@/lib/plan";
import type { ActualSummary } from "@/lib/plan-view";
import type { WorkoutStatus } from "@/server/plans/service";
import { DoneCheckbox } from "./done-toggle";
import { km, longDate, mainPace, paceFrom } from "./format";
import { TypeTag } from "./type-tag";
import { WORKOUT_TYPES } from "./workout-types";

/**
 * Today's workout: type, title, key numbers and a done checkbox. Tapping opens the workout page.
 * When a synced activity is linked, the numbers show what the watch recorded.
 */
export function WorkoutCard({
  workout,
  status,
  actual,
  className,
}: {
  workout: Workout;
  status: WorkoutStatus;
  actual?: ActualSummary;
  className?: string;
}) {
  const done = status === "completed";
  const actualPace = actual ? paceFrom(actual.distanceM, actual.movingTimeSec) : null;
  const metrics: { label: string; value: string }[] = actual
    ? [
        ...(actual.distanceM
          ? [{ label: "Distance", value: km(Math.round(actual.distanceM / 100) / 10) }]
          : []),
        ...(actual.movingTimeSec
          ? [{ label: "Time", value: `${Math.round(actual.movingTimeSec / 60)} min` }]
          : []),
        ...(workout.kind === "run" && actualPace ? [{ label: "Pace /km", value: actualPace }] : []),
        ...(workout.kind === "strength" && actual.avgHr
          ? [{ label: "Avg HR", value: `${Math.round(actual.avgHr)}` }]
          : []),
      ]
    : workout.kind === "run"
      ? [
          { label: "Distance", value: km(workout.distanceKm) },
          { label: "Time", value: `${workout.estDurationMin} min` },
          ...(mainPace(workout) ? [{ label: "Pace /km", value: mainPace(workout)! }] : []),
        ]
      : [
          { label: "Duration", value: `${workout.durationMin[0]}–${workout.durationMin[1]} min` },
          { label: "Exercises", value: String(workout.exercises.length) },
        ];

  return (
    <Card dimmed={done} className={className}>
      <CardHeader>
        <div className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
          <TypeTag type={workout.type} />
          {WORKOUT_TYPES[workout.type].label}
          {done && (
            <span className="text-success">· {actual ? "Synced from your watch" : "Done"}</span>
          )}
        </div>
        <CardTitle variant="display">
          <Link
            href={`/workouts/${encodeURIComponent(workout.id)}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {workout.title}
          </Link>
        </CardTitle>
        <CardDescription>{longDate(workout.date)}</CardDescription>
        <CardAction>
          <DoneCheckbox workoutKey={workout.id} status={status} label={workout.title} />
        </CardAction>
      </CardHeader>
      <CardContent layout="stack" gap="3">
        <Separator />
        <div className="flex gap-6">
          {metrics.map((m) => (
            <div key={m.label} className="flex flex-col gap-0.5">
              <span className="kilo-label">{m.label}</span>
              <span className="font-display text-xl font-extrabold">{m.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
