import Link from "next/link";
import { cn } from "cn";
import { Check } from "lucide-react";
import {
  addDaysIso,
  dayOfMonth,
  km,
  shortDate,
  weekdayShort,
  workoutSummary,
} from "@/components/kilo/format";
import { TypeTag } from "@/components/kilo/type-tag";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RecordedWorkoutCard } from "@/components/kilo/workout-history";
import { actualKm, statusOf, weekFor, weekStats } from "@/lib/plan-view";
import {
  getViewerActuals,
  getViewerAdditionalTraining,
  getViewerToday,
  requireViewerPlan,
} from "@/server/queries";

export const metadata = { title: "Calendar · Grind" };

export default async function CalendarPage() {
  const [{ plan, progress }, today, actuals] = await Promise.all([
    requireViewerPlan(),
    getViewerToday(),
    getViewerActuals(),
  ]);
  const real = actualKm(actuals);
  const current = weekFor(plan, today);
  const additional = await getViewerAdditionalTraining(
    plan.weeks[0].startDate,
    addDaysIso(plan.weeks[plan.weeks.length - 1].startDate, 6),
  );
  const recordedByDate = new Map<string, typeof additional>();
  for (const entry of additional) {
    const entries = recordedByDate.get(entry.date) ?? [];
    entries.push(entry);
    recordedByDate.set(entry.date, entries);
  }
  // Start at the current week; earlier weeks come after a "Show earlier weeks" link would add noise
  const weeks = plan.weeks.filter((w) => w.index >= current.index);

  return (
    <div className="flex flex-col gap-4">
      {current.index > 1 && (
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer">Show weeks 1–{current.index - 1}</summary>
          <div className="mt-4 flex flex-col gap-4">
            {plan.weeks
              .filter((w) => w.index < current.index)
              .map((w) => (
                <WeekBlock key={w.index} weekIndex={w.index} />
              ))}
          </div>
        </details>
      )}
      {weeks.map((w) => (
        <WeekBlock key={w.index} weekIndex={w.index} />
      ))}
    </div>
  );

  function WeekBlock({ weekIndex }: { weekIndex: number }) {
    const week = plan.weeks[weekIndex - 1];
    const stats = weekStats(week, progress, real);
    const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week.startDate, i));
    return (
      <Card spacing="flush" tone={week.index === current.index ? "outline" : "default"}>
        <div className="flex flex-col gap-1 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {shortDate(week.startDate)} – {shortDate(days[6])}
            </span>
            <Badge variant={week.index === current.index ? "default" : "secondary"}>
              Week {week.index}
            </Badge>
          </div>
          <span className="text-muted-foreground text-sm">
            Plan distance: <b className="text-foreground">{stats.kmDone} km</b> /{" "}
            {km(stats.kmTarget)}
          </span>
        </div>
        <ol>
          {days.map((d) => {
            const workouts = week.workouts.filter((w) => w.date === d);
            const recorded = recordedByDate.get(d) ?? [];
            return (
              <li key={d} className="flex gap-3 border-t px-5 py-3">
                <div className="flex w-12 shrink-0 flex-col items-center">
                  <span className="text-subtle text-xs font-semibold uppercase">
                    {weekdayShort(d)}
                  </span>
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full text-sm font-bold tabular-nums",
                      d === today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {dayOfMonth(d)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {workouts.length === 0 && recorded.length === 0 && (
                    <span className="text-subtle self-center py-1.5 text-sm">
                      {d < plan.startDate ? "Before your plan" : "Rest"}
                    </span>
                  )}
                  {workouts.map((w) => {
                    const done = statusOf(progress, w) === "completed";
                    return (
                      <Link
                        key={w.id}
                        href={`/workouts/${encodeURIComponent(w.id)}`}
                        className="bg-secondary hover:bg-accent flex items-center gap-3 rounded-md px-3 py-2"
                      >
                        <TypeTag type={w.type} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={cn(
                              "truncate text-sm font-semibold",
                              done && "text-muted-foreground",
                            )}
                          >
                            {w.title}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {actuals[w.id]?.distanceM
                              ? `${km(real[w.id])} done · planned ${workoutSummary(w)}`
                              : workoutSummary(w)}
                          </span>
                        </span>
                        {done && (
                          <Check className="text-success size-4 shrink-0" aria-label="Done" />
                        )}
                      </Link>
                    );
                  })}
                  {recorded.map((entry) => (
                    <RecordedWorkoutCard
                      key={entry.id}
                      entry={entry}
                      compact
                      contextLabel="Outside plan"
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    );
  }
}
