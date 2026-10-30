"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "cn";
import { Archive, Check, Flame, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  scheduleLabel,
  streak,
  weekDays,
  weekProgress,
  WEEKDAY_LABELS,
  type DayState,
} from "@/lib/habits";
import type { HabitWithLogs } from "@/server/habits/service";
import { HabitForm } from "./habit-form";
import { HabitIconView } from "./habit-icon";

const STATE_LABEL: Record<DayState, string> = {
  done: "done",
  missed: "missed",
  due: "to do today",
  rest: "not scheduled",
  future: "coming up",
};
const STATE_STYLE: Record<DayState, string> = {
  done: "bg-primary text-primary-foreground border-primary",
  missed: "border-line-strong text-muted-foreground",
  due: "border-primary text-foreground ring-2 ring-primary/40",
  rest: "border-dashed border-line-strong text-muted-foreground/60",
  future: "border-line-strong text-muted-foreground/60",
};

/** Everything about the athlete's habits: this week at a glance, streaks, and editing. */
export function HabitsPanel({ habits, today }: { habits: HabitWithLogs[]; today: string }) {
  const router = useRouter();
  const [archiving, setArchiving] = useState<HabitWithLogs | null>(null);

  const archive = async (h: HabitWithLogs) => {
    const res = await fetch(`/api/habits/${h.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok)
      toast.error((await res.json().catch(() => null))?.error ?? "Couldn't archive the habit.");
    else toast.success("Habit archived.");
    setArchiving(null);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Tick habits off on the Today tab. Pick an earlier day in the week strip to fill in one you
          forgot.
        </p>
        <HabitForm
          trigger={
            <Button>
              <Plus /> Add
            </Button>
          }
        />
      </div>

      {habits.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No habits yet. Add one to start a streak: stretching, sleep, water, anything that
              helps you train.
            </p>
          </CardContent>
        </Card>
      )}

      {habits.map((h) => {
        const done = new Set(h.doneDates);
        const run = streak(h.days, done, today);
        const week = weekProgress(h.days, done, today);
        return (
          <Card key={h.id}>
            <CardHeader>
              <CardTitle layout="start">
                <span className="bg-secondary text-muted-foreground grid size-10 shrink-0 place-items-center rounded-full">
                  <HabitIconView icon={h.icon} className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{h.name}</span>
                  <span className="text-muted-foreground text-sm font-normal">
                    {scheduleLabel(h.days)}
                  </span>
                </span>
                <span className="flex shrink-0">
                  <HabitForm
                    habit={{ id: h.id, name: h.name, icon: h.icon, days: h.days }}
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Edit ${h.name}`}>
                        <Pencil />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Archive ${h.name}`}
                    onClick={() => setArchiving(h)}
                  >
                    <Archive />
                  </Button>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent layout="stack" gap="4">
              <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
                {weekDays(h.days, done, today, today).map((d) => (
                  <li
                    key={d.date}
                    className="flex flex-col items-center gap-1"
                    aria-label={`${WEEKDAY_LABELS[d.weekday]}: ${STATE_LABEL[d.state]}`}
                  >
                    <span className="text-muted-foreground text-xs">
                      {WEEKDAY_LABELS[d.weekday].slice(0, 1)}
                    </span>
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-full border-2",
                        STATE_STYLE[d.state],
                      )}
                    >
                      {d.state === "done" && (
                        <Check className="size-4" strokeWidth={3} aria-hidden />
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground tabular-nums">
                  <b className="text-foreground">
                    {week.done}/{week.target}
                  </b>{" "}
                  this week
                </span>
                <span
                  className={cn(
                    "flex items-center gap-1 font-semibold tabular-nums",
                    run > 0 ? "text-accent-ink" : "text-muted-foreground",
                  )}
                >
                  <Flame className="size-4" aria-hidden /> {run} {run === 1 ? "day" : "days"} in a
                  row
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <AlertDialog open={!!archiving} onOpenChange={(open) => !open && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{archiving?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from Today and this list. Your ticks are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => archiving && archive(archiving)}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
