import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { km, longDate } from "@/components/kilo/format";
import { Stat } from "@/components/kilo/stat";
import { WeekCard } from "@/components/kilo/week-card";
import { WeeklyKmChart } from "@/components/kilo/weekly-km-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration, formatPace } from "@/lib/plan";
import { actualKm, weekFor, weekStats } from "@/lib/plan-view";
import { getViewerActuals, getViewerToday, requireViewerPlan } from "@/server/queries";

export const metadata = { title: "Plan · Grind" };

const ZONES = [
  { key: "E", label: "Easy" },
  { key: "M", label: "Marathon" },
  { key: "T", label: "Threshold" },
  { key: "I", label: "Interval" },
  { key: "R", label: "Repetition" },
  { key: "race", label: "Goal race" },
] as const;

export default async function PlanPage() {
  const [{ plan, progress }, today, actuals] = await Promise.all([
    requireViewerPlan(),
    getViewerToday(),
    getViewerActuals(),
  ]);
  const current = weekFor(plan, today);
  const real = actualKm(actuals);
  const chart = plan.weeks.map((w) => ({
    week: w.index,
    planned: w.targetKm,
    done: weekStats(w, progress, real).kmDone,
  }));
  const totalKm = plan.weeks.reduce((s, w) => s + w.targetKm, 0);
  const doneKm = chart.reduce((s, w) => s + w.done, 0);
  const totalWorkouts = plan.weeks.reduce((s, w) => s + w.workouts.length, 0);
  const doneWorkouts = Object.values(progress).filter((p) => p.status === "completed").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl font-extrabold">{plan.title}</CardTitle>
            <CardDescription>
              Your race: <b className="text-foreground">{longDate(plan.raceDate)}</b>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="Estimated finish"
                value={formatDuration(plan.estimatedRaceTimeSec.low)}
                hint={`to ${formatDuration(plan.estimatedRaceTimeSec.high)} in ${plan.weeks.length} weeks`}
              />
              <Stat
                label="Plan progress"
                value={`${doneWorkouts}/${totalWorkouts}`}
                hint={`${Math.round(doneKm)} of ${Math.round(totalKm)} km`}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{plan.input.runDays.length} runs a week</Badge>
              {plan.input.strength.sessionsPerWeek > 0 && (
                <Badge variant="secondary">
                  {plan.input.strength.sessionsPerWeek} strength sessions
                </Badge>
              )}
              <Badge variant="secondary" className="capitalize">
                {plan.input.intensity === "push" ? "Push me" : plan.input.intensity}
              </Badge>
            </div>
            <Button variant="outline" asChild>
              <Link href="/onboarding">
                <RefreshCw /> Start a new plan
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Plan overview</CardTitle>
            <CardDescription>
              Kilometers per week. Lime shows what you&apos;ve done.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyKmChart data={chart} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Your paces</CardTitle>
          <CardDescription>Per kilometer, from your fitness today.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {ZONES.map((z) => (
              <div key={z.key} className="flex flex-col">
                <dt className="kilo-label">{z.label}</dt>
                <dd className="font-mono text-sm tabular-nums">
                  {formatPace(plan.paces[z.key].minSecPerKm)}–
                  {formatPace(plan.paces[z.key].maxSecPerKm)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4" aria-label="Weeks">
        {plan.weeks.map((w) => (
          <WeekCard
            key={w.index}
            week={w}
            progress={progress}
            current={w.index === current.index}
            totalWeeks={plan.weeks.length}
            actualKm={real}
          />
        ))}
      </section>
      <p className="text-muted-foreground text-center text-xs">
        Total {km(Math.round(totalKm))} over {plan.weeks.length} weeks.
      </p>
    </div>
  );
}
