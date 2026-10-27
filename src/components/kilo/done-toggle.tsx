"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { WorkoutStatus } from "@/server/plans/service";

async function saveStatus(key: string, status: WorkoutStatus) {
  const res = await fetch(`/api/workouts/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't save. Try again.");
}

function useDoneState(workoutKey: string, status: WorkoutStatus) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(status);
  const done = optimistic === "completed";

  const toggle = () =>
    startTransition(async () => {
      const next: WorkoutStatus = done ? "planned" : "completed";
      setOptimistic(next);
      try {
        await saveStatus(workoutKey, next);
        if (next === "completed") toast.success("Workout done. Nice work.");
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });

  return { done, pending, toggle };
}

/** Square checkbox on workout cards. */
export function DoneCheckbox({ workoutKey, status, label }: { workoutKey: string; status: WorkoutStatus; label: string }) {
  const { done, pending, toggle } = useDoneState(workoutKey, status);
  return <Checkbox checked={done} disabled={pending} onCheckedChange={toggle} aria-label={done ? `Mark ${label} not done` : `Mark ${label} done`} className="size-7 rounded-[9px]" />;
}

/** Full-width button on the workout page. */
export function DoneButton({ workoutKey, status }: { workoutKey: string; status: WorkoutStatus }) {
  const { done, pending, toggle } = useDoneState(workoutKey, status);
  return (
    <Button size="lg" variant={done ? "outline" : "default"} className="w-full" disabled={pending} onClick={toggle}>
      {done ? "Mark as not done" : "Mark as done"}
    </Button>
  );
}
