import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { DoneButton } from "@/components/kilo/done-toggle";
import { ExerciseList } from "@/components/kilo/exercise-list";
import { km, longDate, mainPace } from "@/components/kilo/format";
import { Stat } from "@/components/kilo/stat";
import { StepList } from "@/components/kilo/step-list";
import { WORKOUT_TYPES } from "@/components/kilo/workout-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { findWorkout, statusOf } from "@/lib/plan-view";
import { requireViewerPlan } from "@/server/queries";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { plan } = await requireViewerPlan();
  const found = findWorkout(plan, decodeURIComponent(key));
  return { title: found ? `${found.workout.title} · Kilo` : "Workout · Kilo" };
}

export default async function WorkoutPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { plan, progress } = await requireViewerPlan();
  const found = findWorkout(plan, decodeURIComponent(key));
  if (!found) notFound();
  const { workout, week } = found;
  const status = statusOf(progress, workout);
  const pace = mainPace(workout);

  return (
    <div className="flex flex-col gap-5">
      <Button variant="ghost" size="sm" asChild className="-ml-3 self-start">
        <Link href={`/today?date=${workout.date}`}>
          <ArrowLeft /> {longDate(workout.date)}
        </Link>
      </Button>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${WORKOUT_TYPES[workout.type].fill} text-on-type`}>{WORKOUT_TYPES[workout.type].label}</Badge>
          <Badge variant="secondary">Week {week.index}</Badge>
          {status === "completed" && <Badge className="bg-accent-soft text-foreground">Done</Badge>}
        </div>
        <h1 className="font-display text-3xl leading-9 font-extrabold">{workout.title}</h1>
        <p className="text-muted-foreground">{workout.description}</p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-3 gap-4">
          {workout.kind === "run" ? (
            <>
              <Stat label="Distance" value={km(workout.distanceKm)} />
              <Stat label="Time" value={workout.estDurationMin} unit="min" />
              {pace && <Stat label="Pace /km" value={pace} />}
            </>
          ) : (
            <>
              <Stat label="Duration" value={`${workout.durationMin[0]}–${workout.durationMin[1]}`} unit="min" />
              <Stat label="Exercises" value={workout.exercises.length} />
              <Stat label="Focus" value={workout.title.split(" ")[0]} />
            </>
          )}
        </CardContent>
      </Card>

      {workout.coachNote && (
        <Alert className="bg-accent-soft border-transparent">
          <Sparkles className="text-accent-ink" />
          <AlertTitle>From your coach</AlertTitle>
          <AlertDescription className="text-foreground">{workout.coachNote}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">{workout.kind === "run" ? "Steps" : "Exercises"}</CardTitle>
          {workout.kind === "run" && <CardDescription>Set these up in your watch&apos;s workout editor, in this order.</CardDescription>}
        </CardHeader>
        <CardContent>{workout.kind === "run" ? <StepList workout={workout} /> : <ExerciseList workout={workout} />}</CardContent>
      </Card>

      <DoneButton workoutKey={workout.id} status={status} />
    </div>
  );
}
