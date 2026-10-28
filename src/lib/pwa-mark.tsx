import { ICON_PLATE_SHARE, MARK } from "./brand-mark";

/**
 * The Grind mark for app icons, on the dark app background. The plate fills 60% of the icon, inside the safe
 * zone that maskable icons need, so Android can crop the icon to a circle or a squircle without clipping it.
 * Rendered to PNG by next/og; the mark itself is an inline SVG, which it draws as-is.
 */
export function AppIcon({ size }: { size: number }) {
  const plate = Math.round(size * ICON_PLATE_SHARE);
  const c = MARK.size / 2;
  return (
    <div style={{ width: size, height: size, background: MARK.dark, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg xmlns="http://www.w3.org/2000/svg" width={plate} height={plate} viewBox={`0 0 ${MARK.size} ${MARK.size}`}>
        <circle cx={c} cy={c} r={MARK.plateRadius} fill={MARK.lime} />
        <circle cx={c} cy={c} r={MARK.ringRadius} fill="none" stroke={MARK.ink} strokeOpacity={0.25} strokeWidth={MARK.ringWidth} />
        <g transform={`rotate(${MARK.beanAngle} ${c} ${c})`}>
          <ellipse cx={c} cy={c} rx={MARK.beanRx} ry={MARK.beanRy} fill={MARK.ink} />
          <path d={MARK.creasePath} fill="none" stroke={MARK.lime} strokeWidth={MARK.creaseWidth} strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
