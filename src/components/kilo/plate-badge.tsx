import { cn } from "cn";
import type { PlateColor } from "@/lib/efforts";

/** Plate colours follow competition bumper plates. Literal class names so Tailwind can see them. */
const PLATE: Record<PlateColor, { face: string; text: string }> = {
  white: { face: "fill-plate-white", text: "fill-on-type" },
  green: { face: "fill-plate-green", text: "fill-white" },
  yellow: { face: "fill-plate-yellow", text: "fill-on-type" },
  blue: { face: "fill-plate-blue", text: "fill-white" },
  red: { face: "fill-plate-red", text: "fill-white" },
};

/**
 * A personal record drawn as a weight plate: colour by distance, the time underneath.
 * Locked plates (not run yet, or the goal race) are drawn flat, with a caption saying why.
 */
export function PlateBadge({
  label,
  name,
  plate,
  value,
  caption,
  locked = false,
  tag,
  className,
}: {
  /** Short text on the plate: "1K", "5MI", "21.1" */
  label: string;
  /** Full name for screen readers: "5K", "Half marathon" */
  name: string;
  plate: PlateColor;
  /** The time, like "27:41" */
  value: string;
  /** Under the time: the date, or "Not yet" */
  caption: string;
  locked?: boolean;
  /** Small text above the label: "PR" on earned plates by default, nothing on locked ones unless given ("GOAL") */
  tag?: string;
  className?: string;
}) {
  const colors = PLATE[plate];
  const top = tag ?? (locked ? "" : "PR");
  return (
    <figure className={cn("flex flex-col items-center gap-1.5 text-center", className)} aria-label={locked ? `${name}: ${caption}` : `${name} personal record ${value}, ${caption}`}>
      <svg viewBox="0 0 76 76" className="size-[76px]" aria-hidden>
        <circle cx="38" cy="38" r="38" className="fill-plate-rim" />
        <circle cx="38" cy="38" r="34" className={locked ? "fill-secondary" : colors.face} />
        <circle cx="38" cy="38" r="25" fill="none" strokeWidth="1.5" className="stroke-plate-rim/30" />
        {top && (
          <text x="38" y="27" textAnchor="middle" className={cn("font-sans text-[7px] font-bold tracking-[0.1em]", locked ? "fill-subtle" : colors.text)} opacity={0.75}>
            {top}
          </text>
        )}
        <text x="38" y="46" textAnchor="middle" className={cn("font-display text-[15px] font-extrabold", locked ? "fill-subtle" : colors.text)} style={{ fontStretch: "112%" }}>
          {label}
        </text>
      </svg>
      <span className="text-sm font-bold tabular-nums">{value}</span>
      <span className="text-muted-foreground text-xs">{caption}</span>
    </figure>
  );
}
