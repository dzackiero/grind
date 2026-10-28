import Link from "next/link";
import { ChevronRight, Coffee } from "lucide-react";
import { addDaysIso, daysUntil, km, longDate, workoutSummary } from "@/components/kilo/format";
import { SegmentedProgress } from "@/components/kilo/segmented-progress";
import { Stat } from "@/components/kilo/stat";
import { TypeTag } from "@/components/kilo/type-tag";
import { WeekStrip } from "@/components/kilo/week-strip";
import { WorkoutCard } from "@/components/kilo/workout-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/plan";
import { PlanChangeCard } from "@/components/kilo/plan-change-card";
import { RecoveryCard } from "@/components/kilo/recovery-card";
import { actualKm, nextWorkout, statusOf, weekFor, weekStats, workoutsOn } from "@/lib/plan-view";
import { HabitsCard } from "@/components/kilo/habits-card";
import { getViewerActuals, getViewerHabits, getViewerIntervals, getViewerPendingChanges, getViewerToday, getViewerWellness, requireViewerPlan } from "@/server/queries";

export const metadata = { title: "Today · Kilo" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const [{ plan, progress }, today, { date }, actuals, wellness, intervals, suggestions, habits] = await Promise.all([
    requireViewerPlan(),
    getViewerToday(),
    searchParams,
    getViewerActuals(),
    getViewerWellness(),
    getViewerIntervals(),
    getViewerPendingChanges(),
    getViewerHabits(),
  ]);
  const selected = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const week = weekFor(plan, selected);
  const workouts = workoutsOn(plan, selected);
  const stats = weekStats(week, progress, actualKm(actuals));
  const upNext = nextWorkout(plan, progress, selected);
  const toRace = daysUntil(today, plan.raceDate);
  const beforeStart = selected < plan.startDate;

  return (
    <div className="-mt-5 flex flex-col gap-6">
      <WeekStrip week={week} totalWeeks={plan.weeks.length} progress={progress} today={today} selected={selected} />

      {suggestions[0] && <PlanChangeCard change={suggestions[0]} />}

      <section className="flex flex-col gap-3" aria-label={selected === today ? "Today's workouts" : `Workouts on ${longDate(selected)}`}>
        {selected !== today && (
          <div className="flex items-center justify-between">
            <h2 className="kilo-label">{longDate(selected)}</h2>
            <Link href="/today" className="text-accent-ink text-sm font-semibold">
              Back to today
            </Link>
          </div>
        )}
        {workouts.length ? (
          workouts.map((w) => <WorkoutCard key={w.id} workout={w} status={statusOf(progress, w)} actual={actuals[w.id]} />)
        ) : (
          <Card>
            <CardHeader>
              <div className="text-muted-foreground flex items-center gap-2 text-[13px] font-semibold">
                <Coffee className="size-4" /> {beforeStart ? "Plan starts soon" : "Rest day"}
              </div>
              <CardTitle className="font-display text-[22px] leading-[26px] font-extrabold">
                {beforeStart ? `Your plan starts ${longDate(plan.startDate)}` : "Nothing planned. Recover well."}
              </CardTitle>
              <CardDescription>
                {beforeStart ? "Keep moving easy until then." : "An easy walk or some mobility is fine. Sleep and food do the rest."}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <HabitsCard habits={habits} date={selected} today={today} />

      <Link href="/plan" className="group">
        <Card className="group-hover:border-line-strong">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base font-semibold">
              Week {week.index} overview <ChevronRight className="text-muted-foreground size-5" />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <SegmentedProgress done={stats.done} total={stats.total} />
            <div className="text-muted-foreground flex justify-between text-[13px]">
              <span>
                Workouts{" "}
                <b className="text-foreground">
                  {stats.done}/{stats.total}
                </b>
              </span>
              <span>
                Distance{" "}
                <b className="text-foreground">
                  {stats.kmDone}/{km(stats.kmTarget)}
                </b>
              </span>
            </div>
            <p className="text-muted-foreground text-sm">{week.focus}</p>
          </CardContent>
        </Card>
      </Link>

      <RecoveryCard wellness={wellness} connected={intervals.connected} />

      <Card>
        <CardContent className="grid grid-cols-2 gap-4">
          <Stat label="Race day" value={toRace > 0 ? toRace : "Today"} unit={toRace > 0 ? (toRace === 1 ? "day" : "days") : undefined} hint={longDate(plan.raceDate)} />
          <Stat
            label="Estimate"
            value={formatDuration(plan.estimatedRaceTimeSec.low)}
            hint={`to ${formatDuration(plan.estimatedRaceTimeSec.high)} · ${plan.title.replace(" Plan", "")}`}
          />
        </CardContent>
      </Card>

      {upNext && (
        <section className="flex flex-col gap-3">
          <h2 className="kilo-label">Up next</h2>
          <Link href={`/workouts/${encodeURIComponent(upNext.id)}`} className="bg-card hover:border-line-strong flex items-center gap-3 rounded-xl border border-transparent p-4">
            <TypeTag type={upNext.type} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{upNext.title}</span>
              <span className="text-muted-foreground text-[13px]">
                {upNext.date === addDaysIso(selected, 1) ? "Tomorrow" : longDate(upNext.date)} · {workoutSummary(upNext)}
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-5" />
          </Link>
        </section>
      )}
    </div>
  );
}
