import { cn } from "cn";
import { GrindMark } from "./grind-mark";

/** Grind wordmark with the mark: a lime disc with teeth, like a coffee grinder's burr. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <GrindMark className="size-7" />
      <span className="font-display text-2xl font-extrabold tracking-tight">Grind</span>
    </span>
  );
}
