"use client";

import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import type { HabitWithLogs } from "@/server/habits/service";

type Ticks = Record<string, Set<string>>;

/**
 * The ticked days of every habit, changing on the tap and saving in the background. Streaks and weekly counts are
 * worked out from these sets, so they move with the tick too. A failed save puts the tick back and says so.
 */
export function useHabitTicks(habits: HabitWithLogs[]) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const saved = useMemo<Ticks>(
    () => Object.fromEntries(habits.map((h) => [h.id, new Set(h.doneDates)])),
    [habits],
  );
  const [ticks, apply] = useOptimistic(
    saved,
    (state: Ticks, change: { id: string; date: string; done: boolean }) => {
      const days = new Set(state[change.id]);
      if (change.done) days.add(change.date);
      else days.delete(change.date);
      return { ...state, [change.id]: days };
    },
  );

  const setDone = (id: string, date: string, done: boolean) =>
    startTransition(async () => {
      apply({ id, date, done });
      try {
        const res = await fetch(`/api/habits/${id}/log`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date, done }),
        });
        if (!res.ok)
          throw new Error(
            (await res.json().catch(() => null))?.error ?? "Couldn't save. Try again.",
          );
      } catch (e) {
        toast.error((e as Error).message);
      }
      router.refresh();
    });

  return { ticks, setDone };
}
