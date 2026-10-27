import Link from "next/link";
import { cn } from "cn";
import type { Week } from "@/lib/plan";
import { statusOf, type Progress } from "@/lib/plan-view";
import { addDaysIso, dayOfMonth, weekdayShort } from "./format";
import { TypeDot } from "./type-tag";

/** Plan progress ring next to "Week 2 / 12". */
function PlanRing({ value }: { value: number }) {
  const r = 8.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 22 22" className="size-[22px]" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3" className="stroke-secondary" />
      <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-primary" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 11 11)" />
    </svg>
  );
}

/** Header strip on Today: the plan week, seven days and one dot per workout. Days link to ?date=. */
export function WeekStrip({ week, totalWeeks, progress, today, selected }: { week: Week; totalWeeks: number; progress: Progress; today: string; selected: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week.startDate, i));
  return (
    <nav aria-label={`Week ${week.index} of ${totalWeeks}`} className="bg-card -mx-4 rounded-b-xl px-4 pt-3 pb-4">
      <div className="mb-3 flex items-center justify-center gap-2 text-[15px] font-bold">
        <PlanRing value={week.index / totalWeeks} />
        Week {week.index} / {totalWeeks}
      </div>
      <ol className="grid grid-cols-7 gap-0.5 text-center">
        {days.map((d) => {
          const workouts = week.workouts.filter((w) => w.date === d);
          const allDone = workouts.length > 0 && workouts.every((w) => statusOf(progress, w) === "completed");
          return (
            <li key={d}>
              <Link href={`/today?date=${d}`} className="flex flex-col items-center gap-1.5 rounded-md py-1" aria-current={d === selected ? "date" : undefined}>
                <span className="text-subtle text-[11px] font-semibold tracking-[0.06em] uppercase">{weekdayShort(d)}</span>
                <span
                  className={cn(
                    "grid size-[34px] place-items-center rounded-full text-[15px] font-bold tabular-nums",
                    d === today && "bg-primary text-primary-foreground",
                    d !== today && d === selected && "bg-secondary",
                    allDone && d !== today && "ring-success ring-2 ring-inset",
                  )}
                >
                  {dayOfMonth(d)}
                </span>
                <span className="flex h-1.5 gap-[3px]">
                  {workouts.slice(0, 3).map((w) => (
                    <TypeDot key={w.id} type={w.type} />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
