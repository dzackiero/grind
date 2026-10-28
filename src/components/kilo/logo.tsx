import { cn } from "cn";

/** Grind wordmark with the plate mark (a lime plate with its rim and hub). */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <circle cx="16" cy="16" r="16" className="fill-primary" />
        <circle cx="16" cy="16" r="10" fill="none" strokeWidth="3" className="stroke-primary-foreground/25" />
        <circle cx="16" cy="16" r="4" className="fill-primary-foreground" />
      </svg>
      <span className="font-display text-2xl font-extrabold tracking-tight">Grind</span>
    </span>
  );
}
