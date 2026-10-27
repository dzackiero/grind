import { cn } from "cn";

/** Uppercase label over a big number. */
export function Stat({ label, value, unit, hint, className }: { label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="kilo-label">{label}</span>
      <span className="font-display text-2xl leading-8 font-extrabold">
        {value}
        {unit && <span className="text-muted-foreground ml-0.5 font-sans text-sm font-semibold">{unit}</span>}
      </span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}
