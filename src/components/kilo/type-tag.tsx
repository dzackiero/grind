import { cn } from "cn";
import type { Workout } from "@/lib/plan";
import { WORKOUT_TYPES } from "./workout-types";

/** 14px coloured square that marks a workout type in lists. */
export function TypeTag({ type, className }: { type: Workout["type"]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3.5 shrink-0 rounded-sm",
        WORKOUT_TYPES[type].fill,
        className,
      )}
    />
  );
}

/** 6px dot under week-strip days. Uses the -mark colours so it reads on light backgrounds. */
export function TypeDot({ type }: { type: Workout["type"] }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-1.5 rounded-full", WORKOUT_TYPES[type].mark)}
    />
  );
}
