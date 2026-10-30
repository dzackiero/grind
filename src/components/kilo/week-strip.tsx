"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import type { Week } from "@/lib/plan";
import { statusOf, type Progress } from "@/lib/plan-view";
import { adjacentWeekDate, swipeDirection, type WeekDirection } from "@/lib/week-navigation";
import { addDaysIso, dayOfMonth, weekdayShort } from "./format";
import { TypeDot } from "./type-tag";

/** Plan progress ring next to "Week 2 / 12". */
function PlanRing({ value }: { value: number }) {
  const r = 8.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 22 22" className="size-5.5" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3" className="stroke-secondary" />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-primary"
        strokeDasharray={`${c * value} ${c}`}
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

/** Header strip on Today: the plan week, seven days and one dot per workout. Days link to ?date=. */
export function WeekStrip({
  week,
  totalWeeks,
  progress,
  today,
  selected,
  additionalCounts = {},
}: {
  week: Week;
  totalWeeks: number;
  progress: Progress;
  today: string;
  selected: string;
  additionalCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const gesture = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
  const suppressClickUntil = useRef(0);
  const previous = adjacentWeekDate(week, totalWeeks, selected, -1);
  const next = adjacentWeekDate(week, totalWeeks, selected, 1);
  function navigate(direction: WeekDirection) {
    const date = direction === -1 ? previous : next;
    if (date) router.push(`/today?date=${date}`, { scroll: false });
  }
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(week.startDate, i));
  return (
    <nav
      aria-label={`Week ${week.index} of ${totalWeeks}`}
      className="bg-card -mx-4 touch-pan-y rounded-b-xl px-4 pt-3 pb-4"
      onTouchStart={(event) => {
        suppressClickUntil.current = 0;
        const touch = event.touches[0];
        gesture.current =
          event.touches.length === 1
            ? { x: touch.clientX, y: touch.clientY, vertical: false }
            : null;
      }}
      onTouchMove={(event) => {
        const start = gesture.current;
        if (!start) return;
        if (event.touches.length !== 1) {
          gesture.current = null;
          return;
        }
        const dx = event.touches[0].clientX - start.x;
        const dy = event.touches[0].clientY - start.y;
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) start.vertical = true;
        if (!start.vertical && swipeDirection(dx, dy))
          suppressClickUntil.current = Date.now() + 500;
      }}
      onTouchEnd={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (!start || start.vertical) return;
        const touch = event.changedTouches[0];
        const direction = swipeDirection(touch.clientX - start.x, touch.clientY - start.y);
        if (direction) {
          suppressClickUntil.current = Date.now() + 500;
          navigate(direction);
        }
      }}
      onTouchCancel={() => {
        gesture.current = null;
      }}
      onClickCapture={(event) => {
        if (event.detail > 0 && Date.now() < suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="mb-3 flex items-center justify-between text-base font-bold">
        <button
          type="button"
          aria-label="Previous week"
          disabled={!previous}
          onClick={() => navigate(-1)}
          className="grid size-9 place-items-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-30"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <span className="flex items-center gap-2">
          <PlanRing value={week.index / totalWeeks} />
          Week {week.index} / {totalWeeks}
        </span>
        <button
          type="button"
          aria-label="Next week"
          disabled={!next}
          onClick={() => navigate(1)}
          className="grid size-9 place-items-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-30"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <ol className="grid grid-cols-7 gap-0.5 text-center">
        {days.map((d) => {
          const workouts = week.workouts.filter((w) => w.date === d);
          const allDone =
            workouts.length > 0 && workouts.every((w) => statusOf(progress, w) === "completed");
          return (
            <li key={d}>
              <Link
                href={`/today?date=${d}`}
                scroll={false}
                className="flex flex-col items-center gap-1.5 rounded-md py-1"
                aria-current={d === selected ? "date" : undefined}
              >
                <span className="text-subtle text-xs font-semibold tracking-wider uppercase">
                  {weekdayShort(d)}
                </span>
                <span
                  className={cn(
                    "grid size-8.5 place-items-center rounded-full text-base font-bold tabular-nums",
                    d === today && "bg-primary text-primary-foreground",
                    d !== today && d === selected && "bg-secondary",
                    allDone && d !== today && "ring-success ring-2 ring-inset",
                  )}
                >
                  {dayOfMonth(d)}
                </span>
                <span className="flex h-1.5 gap-0.75">
                  {workouts.slice(0, 3).map((w) => (
                    <TypeDot key={w.id} type={w.type} />
                  ))}
                  {additionalCounts[d] > 0 && (
                    <span
                      role="img"
                      aria-label={`${additionalCounts[d]} recorded outside plan`}
                      title={`${additionalCounts[d]} recorded outside plan`}
                      className="bg-success size-1.5 rounded-full"
                    />
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
