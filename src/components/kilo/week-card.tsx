import Link from "next/link";
import { cn } from "cn";
import { Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Week } from "@/lib/plan";
import { statusOf, weekStats, type Progress } from "@/lib/plan-view";
import { addDaysIso, km, shortDate, weekdayShort } from "./format";
import { SegmentedProgress } from "./segmented-progress";
import { TypeTag } from "./type-tag";
import { PHASE_LABEL } from "./workout-types";

/** One plan week: phase, segmented progress, totals and the workout list. */
export function WeekCard({
  week,
  progress,
  current,
  totalWeeks,
  actualKm,
}: {
  week: Week;
  progress: Progress;
  current?: boolean;
  totalWeeks: number;
  actualKm?: Record<string, number>;
}) {
  const stats = weekStats(week, progress, actualKm);
  const label = week.index === totalWeeks ? "Race week" : PHASE_LABEL[week.phase];
  return (
    <Card tone={current ? "outline" : "default"} id={`week-${week.index}`}>
      <CardHeader>
        <CardDescription variant="label">
          {shortDate(week.startDate)} – {shortDate(addDaysIso(week.startDate, 6))} · {label}
        </CardDescription>
        <CardTitle variant="display">Week {week.index}</CardTitle>
      </CardHeader>
      <CardContent layout="stack" gap="4">
        <SegmentedProgress done={stats.done} total={stats.total} />
        <div className="text-muted-foreground flex gap-4 text-sm">
          <span>
            Workouts{" "}
            <b className="text-foreground font-semibold">
              {stats.done} / {stats.total}
            </b>
          </span>
          <span>
            Distance{" "}
            <b className="text-foreground font-semibold">
              {stats.kmDone} / {km(stats.kmTarget)}
            </b>
          </span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {week.workouts.map((w) => {
            const done = statusOf(progress, w) === "completed";
            return (
              <li key={w.id}>
                <Link
                  href={`/workouts/${encodeURIComponent(w.id)}`}
                  className="hover:bg-accent -mx-2 flex items-center gap-3 rounded-md px-2 py-1 text-sm"
                >
                  <TypeTag type={w.type} />
                  <span className="text-subtle w-9 shrink-0 text-sm">{weekdayShort(w.date)}</span>
                  <span
                    className={cn(
                      "flex-1",
                      done && "text-muted-foreground line-through decoration-1",
                    )}
                  >
                    {w.title}
                    {w.kind === "strength" && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {w.durationMin.join("–")} min
                      </span>
                    )}
                  </span>
                  {done ? <Check className="text-success size-4" aria-label="Done" /> : <span />}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
