"use client";

import Link from "next/link";
import { cn } from "cn";
import { Check, ChevronRight, Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isScheduled, streak, weekProgress } from "@/lib/habits";
import type { HabitWithLogs } from "@/server/habits/service";
import { HabitForm } from "./habit-form";
import { HabitIconView } from "./habit-icon";
import { useHabitTicks } from "./use-habit-ticks";

/** Today's habits as big tick rows. `date` is the day shown (today, or one picked in the week strip). */
export function HabitsCard({ habits, date, today }: { habits: HabitWithLogs[]; date: string; today: string }) {
  const { ticks, setDone } = useHabitTicks(habits);

  if (!habits.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Habits</CardTitle>
          <CardDescription>Small daily things that help you train: stretching, sleep, water. Pick the days and tick them off.</CardDescription>
        </CardHeader>
        <CardContent>
          <HabitForm
            trigger={
              <Button variant="outline" className="h-11">
                <Plus /> Add a habit
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const shown = habits.filter((h) => isScheduled(h.days, date) || ticks[h.id].has(date));
  const doneCount = shown.filter((h) => ticks[h.id].has(date)).length;
  const future = date > today;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          Habits
          <span className="text-muted-foreground text-[13px] font-medium tabular-nums">{shown.length ? `${doneCount}/${shown.length} done` : ""}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {shown.length === 0 && <p className="text-muted-foreground px-1 pb-2 text-sm">Nothing scheduled {date === today ? "today" : "that day"}.</p>}
        {shown.map((h) => {
          const days = ticks[h.id];
          const done = days.has(date);
          const run = streak(h.days, days, today);
          const week = weekProgress(h.days, days, date);
          return (
            <button
              key={h.id}
              type="button"
              aria-pressed={done}
              disabled={future}
              onClick={() => setDone(h.id, date, !done)}
              className="active:bg-secondary focus-visible:ring-ring -mx-2 flex min-h-14 touch-manipulation items-center gap-3 rounded-xl px-2 py-2 text-left outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", done ? "bg-accent-soft text-accent-ink" : "bg-secondary text-muted-foreground")}>
                <HabitIconView icon={h.icon} className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("truncate font-semibold", done && "text-muted-foreground line-through")}>{h.name}</span>
                <span className="text-muted-foreground flex items-center gap-2 text-[13px]">
                  <span className="tabular-nums">
                    {week.done}/{week.target} this week
                  </span>
                  {run > 0 && (
                    <span className="text-accent-ink flex items-center gap-0.5 font-semibold tabular-nums">
                      <Flame className="size-3.5" aria-hidden /> {run} {run === 1 ? "day" : "days"}
                    </span>
                  )}
                </span>
              </span>
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors", done ? "bg-primary border-primary text-primary-foreground" : "border-line-strong")}>
                {done && <Check className="size-5" strokeWidth={3} aria-hidden />}
              </span>
            </button>
          );
        })}
        <Link href="/progress?tab=habits" className="text-accent-ink flex h-11 items-center gap-1 self-start text-sm font-semibold">
          Manage habits <ChevronRight className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
