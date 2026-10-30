import { cn } from "cn";

/** One segment per workout; done segments fill with lime. */
export function SegmentedProgress({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex gap-1.5", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={`${done} of ${total} workouts done`}
    >
      {Array.from({ length: Math.max(total, 1) }, (_, i) => (
        <span
          key={i}
          className={cn("h-1.5 flex-1 rounded-full", i < done ? "bg-primary" : "bg-secondary")}
        />
      ))}
    </div>
  );
}
