import { cn } from "cn";
import { MARK } from "@/lib/brand-mark";

const c = MARK.size / 2;

/**
 * The Grind mark: a lime plate with a coffee bean on it (numbers in lib/brand-mark.ts). With `animated` the rim
 * turns and the bean beats slowly, for loading; the CSS is in globals.css and stops for prefers-reduced-motion.
 * Colours come from the theme (primary and primary-foreground), which are the same lime and ink in both themes.
 */
export function GrindMark({ className, animated = false, label, size }: { className?: string; animated?: boolean; label?: string; size?: number }) {
  return (
    <svg viewBox={`0 0 ${MARK.size} ${MARK.size}`} width={size} height={size} className={cn(animated && "brand-loader", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <circle cx={c} cy={c} r={MARK.plateRadius} className="fill-primary" />
      <circle
        cx={c}
        cy={c}
        r={MARK.ringRadius}
        fill="none"
        strokeWidth={MARK.ringWidth}
        className={cn("stroke-primary-foreground", animated ? "brand-loader-rim stroke-primary-foreground/45" : "stroke-primary-foreground/25")}
        {...(animated ? { pathLength: 100, strokeDasharray: "21 4", strokeLinecap: "round" as const } : {})}
      />
      <g className={animated ? "brand-loader-bean" : undefined}>
        <g transform={`rotate(${MARK.beanAngle} ${c} ${c})`}>
          <ellipse cx={c} cy={c} rx={MARK.beanRx} ry={MARK.beanRy} className="fill-primary-foreground" />
          <path d={MARK.creasePath} fill="none" strokeWidth={MARK.creaseWidth} strokeLinecap="round" className="stroke-primary" />
        </g>
      </g>
    </svg>
  );
}
