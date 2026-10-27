import Link from "next/link";
import { cn } from "cn";
import { Check } from "lucide-react";
import { addDaysIso, dayOfMonth, km, shortDate, weekdayShort, workoutSummary } from "@/components/kilo/format";
import { TypeTag } from "@/components/kilo/type-tag";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { actualKm, statusOf, weekFor, weekStats } from "@/lib/plan-view";
import { getViewerActuals, getViewerToday, requireViewerPlan } from "@/server/queries";

export const metadata = { title: "Calendar · Kilo" };

export default async function CalendarPage() {
  const [{ plan, progress }, today, actuals] = await Promise.all([requireViewerPlan(), getViewerToday(), getViewerActuals()]);
  const real = actualKm(actuals);
  const current = weekFor(plan, today);
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
      <Card className={cn("gap-0 py-0", week.index === current.index && "border-line-strong")}>
        <div className="flex flex-col gap-1 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {shortDate(week.startDate)} – {shortDate(days[6])}
            </span>
            <Badge variant={week.index === current.index ? "default" : "secondary"}>Week {week.index}</Badge>
          </div>
          <span className="text-muted-foreground text-sm">
            Total: <b className="text-foreground">{stats.kmDone} km</b> / {km(stats.kmTarget)}
          </span>
        </div>
        <ol>
          {days.map((d) => {
            const workouts = week.workouts.filter((w) => w.date === d);
            return (
              <li key={d} className="grid grid-cols-[48px_1fr] gap-3 border-t px-5 py-3">
                <div className="flex flex-col items-center">
                  <span className="text-subtle text-[11px] font-semibold uppercase">{weekdayShort(d)}</span>
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full text-sm font-bold tabular-nums",
                      d === today ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {dayOfMonth(d)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  {workouts.length === 0 && <span className="text-subtle self-center py-1.5 text-sm">{d < plan.startDate ? "Before your plan" : "Rest"}</span>}
                  {workouts.map((w) => {
                    const done = statusOf(progress, w) === "completed";
                    return (
                      <Link key={w.id} href={`/workouts/${encodeURIComponent(w.id)}`} className="bg-secondary hover:bg-accent flex items-center gap-3 rounded-md px-3 py-2">
                        <TypeTag type={w.type} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className={cn("truncate text-sm font-semibold", done && "text-muted-foreground")}>{w.title}</span>
                          <span className="text-muted-foreground text-xs">
                            {actuals[w.id]?.distanceM ? `${km(real[w.id])} done · planned ${workoutSummary(w)}` : workoutSummary(w)}
                          </span>
                        </span>
                        {done && <Check className="text-success size-4 shrink-0" aria-label="Done" />}
                      </Link>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    );
  }
}
