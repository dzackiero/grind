import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, Watch } from "lucide-react";
import { BackLink } from "@/components/kilo/back-link";
import { DoneButton } from "@/components/kilo/done-toggle";
import { ExerciseList } from "@/components/kilo/exercise-list";
import { km, longDate, mainPace, paceFrom } from "@/components/kilo/format";
import { Stat } from "@/components/kilo/stat";
import { StepList } from "@/components/kilo/step-list";
import { WORKOUT_TYPES } from "@/components/kilo/workout-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { distanceScore, findWorkout, statusOf } from "@/lib/plan-view";
import { StrengthLog } from "@/components/kilo/strength-log";
import { getDb } from "@/server/db";
import {
  getViewerActuals,
  getViewerToday,
  requireViewer,
  requireViewerPlan,
} from "@/server/queries";
import { lastPerformance, listWorkoutSets } from "@/server/strength/service";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { plan } = await requireViewerPlan();
  const found = findWorkout(plan, decodeURIComponent(key));
  return { title: found ? `${found.workout.title} · Grind` : "Workout · Grind" };
}

export default async function WorkoutPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [{ plan, progress }, actuals] = await Promise.all([
    requireViewerPlan(),
    getViewerActuals(),
  ]);
  const found = findWorkout(plan, decodeURIComponent(key));
  if (!found) notFound();
  const { workout, week } = found;
  const status = statusOf(progress, workout);
  const pace = mainPace(workout);
  const actual = actuals[workout.id];
  const actualPace = actual ? paceFrom(actual.distanceM, actual.movingTimeSec) : null;
  const score =
    actual && workout.kind === "run" ? distanceScore(workout.distanceKm, actual.distanceM) : null;

  // Strength sessions can log sets once the day has come: what was saved, and what was lifted last time
  const [today, user] = await Promise.all([getViewerToday(), requireViewer()]);
  const canLog = workout.kind === "strength" && workout.date <= today;
  const db = await getDb();
  const [logged, last] =
    workout.kind === "strength" && canLog
      ? await Promise.all([
          listWorkoutSets(db, user.id, workout.id),
          lastPerformance(
            db,
            user.id,
            workout.exercises.map((e) => e.name),
            workout.date,
          ),
        ])
      : [[], {}];

  return (
    <div className="flex flex-col gap-5">
      <BackLink href={`/today?date=${workout.date}`}>{longDate(workout.date)}</BackLink>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="ghost" asChild>
            <span className={`${WORKOUT_TYPES[workout.type].fill} text-on-type`}>
              {WORKOUT_TYPES[workout.type].label}
            </span>
          </Badge>
          <Badge variant="secondary">Week {week.index}</Badge>
          {status === "completed" && <Badge variant="accent">Done</Badge>}
        </div>
        <h1 className="font-display text-3xl leading-9 font-extrabold">{workout.title}</h1>
        <p className="text-muted-foreground">{workout.description}</p>
      </div>

      <Card>
        <CardContent layout="grid-3" gap="4">
          {workout.kind === "run" ? (
            <>
              <Stat label="Distance" value={km(workout.distanceKm)} />
              <Stat label="Time" value={workout.estDurationMin} unit="min" />
              {pace && <Stat label="Pace /km" value={pace} />}
            </>
          ) : (
            <>
              <Stat
                label="Duration"
                value={`${workout.durationMin[0]}–${workout.durationMin[1]}`}
                unit="min"
              />
              <Stat label="Exercises" value={workout.exercises.length} />
              <Stat label="Focus" value={workout.title.split(" ")[0]} />
            </>
          )}
        </CardContent>
      </Card>

      {actual && (
        <Card tone="outline">
          <CardHeader>
            <CardTitle layout="inline">
              <Watch className="text-accent-ink size-5" />{" "}
              {workout.kind === "run" ? "Your run" : "Your session"}
            </CardTitle>
            <CardDescription>
              {actual.name ?? "Activity"} · synced from intervals.icu
              {score != null && (
                <>
                  {" · "}
                  <span
                    className={
                      score >= 90
                        ? "text-success"
                        : score >= 70
                          ? "text-warning"
                          : "text-destructive"
                    }
                  >
                    {score}% of planned distance
                  </span>
                </>
              )}
            </CardDescription>
            <div className="mt-2 self-start">
              <Button asChild variant="outline" size="sm">
                <Link href={`/activities/${encodeURIComponent(actual.activityId)}`}>
                  See map, splits and charts
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent layout="grid-3" gap="4">
            {actual.distanceM != null && (
              <Stat label="Distance" value={km(Math.round(actual.distanceM / 100) / 10)} />
            )}
            {actual.movingTimeSec != null && (
              <Stat label="Time" value={Math.round(actual.movingTimeSec / 60)} unit="min" />
            )}
            {workout.kind === "run" && actualPace && <Stat label="Pace /km" value={actualPace} />}
            {actual.avgHr != null && (
              <Stat label="Avg HR" value={Math.round(actual.avgHr)} unit="bpm" />
            )}
            {/* A single session rarely scores over 500; above that intervals.icu's threshold settings are off */}
            {actual.trainingLoad != null && actual.trainingLoad <= 500 && (
              <Stat label="Load" value={Math.round(actual.trainingLoad)} />
            )}
            {actual.elevationGainM != null && actual.elevationGainM > 0 && (
              <Stat label="Climb" value={Math.round(actual.elevationGainM)} unit="m" />
            )}
          </CardContent>
        </Card>
      )}

      {workout.coachNote && (
        <Alert variant="accent">
          <Sparkles className="text-accent-ink" />
          <AlertTitle>From your coach</AlertTitle>
          <AlertDescription>{workout.coachNote}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{workout.kind === "run" ? "Steps" : "Exercises"}</CardTitle>
          {workout.kind === "run" && (
            <CardDescription>
              Set these up in your watch&apos;s workout editor, in this order.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {workout.kind === "run" ? (
            <StepList workout={workout} />
          ) : canLog ? (
            <StrengthLog workout={workout} initial={logged} last={last} />
          ) : (
            <ExerciseList workout={workout} />
          )}
        </CardContent>
      </Card>

      <DoneButton workoutKey={workout.id} status={status} />
    </div>
  );
}
