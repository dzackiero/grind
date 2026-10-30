import { cn } from "cn";
import type { Split } from "@/lib/activity-detail";
import { formatPace } from "@/lib/plan";

function gain(seconds: number) {
  const s = Math.round(Math.abs(seconds));
  return `${seconds < 0 ? "-" : "+"}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Pace for each kilometre as bars: a longer bar is a faster split. "+/-" is the change from the split before. */
export function ActivitySplits({ splits }: { splits: Split[] }) {
  const fastest = Math.min(...splits.map((s) => s.paceSec));
  return (
    <div className="flex flex-col gap-2" role="table" aria-label="Splits">
      <div className="kilo-label flex gap-3" role="row">
        <span role="columnheader" className="w-8 shrink-0">
          KM
        </span>
        <span role="columnheader" className="flex-1">
          Avg pace
        </span>
        <span role="columnheader" className="w-14 shrink-0 text-right">
          +/-
        </span>
      </div>
      {splits.map((split) => (
        <div key={split.km} className="flex items-center gap-3" role="row">
          <span className="text-muted-foreground w-8 shrink-0 text-sm tabular-nums" role="cell">
            {split.distanceKm < 0.995 ? split.distanceKm.toFixed(2) : split.km}
          </span>
          <div role="cell" className="flex-1">
            <div
              className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-semibold tabular-nums w-(--pace-width)"
              style={
                {
                  "--pace-width": `${Math.max(45, (fastest / split.paceSec) * 100)}%`,
                } as React.CSSProperties
              }
            >
              {formatPace(split.paceSec)}/km
            </div>
          </div>
          <span
            role="cell"
            className={cn(
              "w-14 shrink-0 text-right text-sm font-semibold tabular-nums",
              split.gainSec == null ? "" : split.gainSec >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {split.gainSec == null ? "" : gain(split.gainSec)}
          </span>
        </div>
      ))}
    </div>
  );
}
