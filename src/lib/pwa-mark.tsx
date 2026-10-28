/**
 * The Grind mark for app icons: the lime plate with its rim and hub (same drawing as the Logo component),
 * on the dark app background. The plate fills 60% of the icon, inside the safe zone that maskable icons
 * need, so Android can crop the icon to a circle or a squircle without clipping it.
 * Rendered to PNG by next/og, which supports a limited CSS subset: flex layout, borders and radii.
 */
export function PlateMark({ size }: { size: number }) {
  const plate = size * 0.6;
  const u = plate / 32; // the Logo is drawn on a 32-unit grid
  return (
    <div style={{ width: size, height: size, background: "#0d0f0c", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: plate, height: plate, borderRadius: plate, background: "#c8f135", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 23 * u, height: 23 * u, borderRadius: 23 * u, border: `${3 * u}px solid rgba(18, 20, 16, 0.25)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 8 * u, height: 8 * u, borderRadius: 8 * u, background: "#121410" }} />
        </div>
      </div>
    </div>
  );
}
