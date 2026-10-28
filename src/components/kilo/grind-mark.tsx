import { cn } from "cn";
import { MARK } from "@/lib/brand-mark";

const c = MARK.size / 2;

/**
 * The Grind mark: a lime disc with teeth on its rim and a hole in the middle, like a coffee grinder's burr (numbers in
 * lib/brand-mark.ts). With `animated` the groove draws itself, the hole opens and the teeth click round one tooth at a
 * time, for loading; the CSS is in globals.css and stops for prefers-reduced-motion, which leaves the finished mark.
 * Colours come from the theme (primary and primary-foreground), which are the same lime and ink in both themes.
 */
export function GrindMark({ className, animated = false, label, size }: { className?: string; animated?: boolean; label?: string; size?: number }) {
  return (
    <svg viewBox={`0 0 ${MARK.size} ${MARK.size}`} width={size} height={size} className={cn(animated && "brand-loader", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx={c} cy={c} r={MARK.discRadius} className="fill-primary" />
      <g transform={`rotate(${MARK.teethOffsetAngle} ${c} ${c})`}>
        <circle
          cx={c}
          cy={c}
          r={MARK.teethRadius}
          fill="none"
          strokeWidth={MARK.teethWidth}
          strokeDasharray={MARK.teethDash}
          className={cn("stroke-primary", animated && "brand-loader-teeth")}
        />
      </g>
      <circle
        cx={c}
        cy={c}
        r={MARK.innerRingRadius}
        fill="none"
        strokeWidth={MARK.innerRingWidth}
        pathLength={100}
        className={cn("stroke-primary-foreground/25", animated && "brand-loader-ring")}
      />
      <circle cx={c} cy={c} r={MARK.hubRadius} className={cn("fill-primary-foreground", animated && "brand-loader-hub")} />
    </svg>
  );
}
