import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ICON_PLATE_SHARE, MARK } from "./brand-mark";

const read = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");
const c = MARK.size / 2;

/** The static files can't import the numbers, so this keeps them honest: change the mark in one place, fail here until all agree. */
describe("static logo files match the mark", () => {
  const colourFiles = ["public/brand/grind-mark.svg", "public/brand/grind-icon.svg", "src/app/icon.svg"];

  it.each(colourFiles)("%s draws the same disc, teeth, groove and hub", (file) => {
    const svg = read(file);
    expect(svg).toContain(`r="${MARK.discRadius}"`);
    expect(svg).toContain(`r="${MARK.teethRadius}"`);
    expect(svg).toContain(`stroke-width="${MARK.teethWidth}"`);
    expect(svg).toContain(`stroke-dasharray="${MARK.teethDash}"`);
    expect(svg).not.toContain("pathLength"); // renderers and design tools ignore it
    expect(svg).toContain(`rotate(${MARK.teethOffsetAngle} ${c} ${c})`);
    expect(svg).toContain(`r="${MARK.innerRingRadius}"`);
    expect(svg).toContain(`stroke-width="${MARK.innerRingWidth}"`);
    expect(svg).toContain(`stroke-opacity="${MARK.innerRingOpacity}"`);
    expect(svg).toContain(`r="${MARK.hubRadius}"`);
    expect(svg).toContain(MARK.lime);
    expect(svg).toContain(MARK.ink);
  });

  it("the one-colour version cuts the same hole and groove out of the same toothed disc", () => {
    const svg = read("public/brand/grind-mark-mono.svg");
    expect(svg).toContain(`r="${MARK.discRadius}"`);
    expect(svg).toContain(`r="${MARK.teethRadius}"`);
    expect(svg).toContain(`stroke-width="${MARK.teethWidth}"`);
    expect(svg).toContain(`stroke-dasharray="${MARK.teethDash}"`);
    expect(svg).not.toContain("pathLength");
    expect(svg).toContain(`r="${MARK.innerRingRadius}"`);
    expect(svg).toContain(`r="${MARK.hubRadius}"`);
    expect(svg).toContain(MARK.ink);
    expect(svg).not.toContain(MARK.lime);
  });

  it("the app icon sits on the dark background with the mark at the agreed share of the icon", () => {
    const svg = read("public/brand/grind-icon.svg");
    const scale = (512 * ICON_PLATE_SHARE) / MARK.size;
    const offset = (512 - 512 * ICON_PLATE_SHARE) / 2;
    expect(svg).toContain(`fill="${MARK.dark}"`);
    expect(svg).toContain(`translate(${offset} ${offset}) scale(${scale})`);
  });

  it("the teeth fit inside the 64-unit drawing, so nothing is clipped", () => {
    expect(MARK.teethRadius + MARK.teethWidth / 2).toBeLessThanOrEqual(MARK.size / 2);
    // A whole number of teeth, so the pattern closes on itself and a click of one tooth ends where it started
    expect(Number.isInteger(MARK.teethCount)).toBe(true);
    // One dash and one gap are one tooth: 24 of them are exactly the ring's circumference
    const [dash, gap] = MARK.teethDash.split(" ").map(Number);
    const ring = 2 * Math.PI * MARK.teethRadius;
    expect((dash + gap) * MARK.teethCount).toBeCloseTo(ring, 2);
    expect(dash).toBeGreaterThan(gap);
  });
});

describe("every SVG is well formed", () => {
  it.each(["public/brand/grind-mark.svg", "public/brand/grind-icon.svg", "public/brand/grind-mark-mono.svg", "src/app/icon.svg"])("%s has a root element and no stray text", (file) => {
    const svg = read(file).trim();
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect((svg.match(/<g[ >]/g) ?? []).length).toBe((svg.match(/<\/g>/g) ?? []).length);
  });
});
