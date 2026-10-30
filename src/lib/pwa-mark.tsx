import { ICON_PLATE_SHARE, MARK } from "./brand-mark";

/**
 * The Grind mark for app icons, on the dark app background. The mark fills 62% of the icon, inside the safe
 * zone that maskable icons need, so Android can crop the icon to a circle or a squircle without clipping it.
 * Rendered to PNG by next/og; the mark itself is an inline SVG, which it draws as-is.
 */
export function AppIcon({ size }: { size: number }) {
  const mark = Math.round(size * ICON_PLATE_SHARE);
  const c = MARK.size / 2;
  return (
    <div
      style={{
        width: size,
        height: size,
        background: MARK.dark,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={mark}
        height={mark}
        viewBox={`0 0 ${MARK.size} ${MARK.size}`}
      >
        <circle cx={c} cy={c} r={MARK.discRadius} fill={MARK.lime} />
        <circle
          cx={c}
          cy={c}
          r={MARK.teethRadius}
          fill="none"
          stroke={MARK.lime}
          strokeWidth={MARK.teethWidth}
          strokeDasharray={MARK.teethDash}
          transform={`rotate(${MARK.teethOffsetAngle} ${c} ${c})`}
        />
        <circle
          cx={c}
          cy={c}
          r={MARK.innerRingRadius}
          fill="none"
          stroke={MARK.ink}
          strokeOpacity={MARK.innerRingOpacity}
          strokeWidth={MARK.innerRingWidth}
        />
        <circle cx={c} cy={c} r={MARK.hubRadius} fill={MARK.ink} />
      </svg>
    </div>
  );
}
