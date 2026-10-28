import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MARK } from "./brand-mark";

const read = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");

/** The static files can't import the numbers, so this keeps them honest: change the mark in one place, fail here until all agree. */
describe("static logo files match the mark", () => {
  const colourFiles = ["public/brand/grind-mark.svg", "public/brand/grind-icon.svg", "src/app/icon.svg"];

  it.each(colourFiles)("%s draws the same plate, ring, bean and crease", (file) => {
    const svg = read(file);
    expect(svg).toContain(`r="${MARK.plateRadius}"`);
    expect(svg).toContain(`r="${MARK.ringRadius}"`);
    expect(svg).toContain(`stroke-width="${MARK.ringWidth}"`);
    expect(svg).toContain(`rx="${MARK.beanRx}" ry="${MARK.beanRy}"`);
    expect(svg).toContain(`rotate(${MARK.beanAngle} ${MARK.size / 2} ${MARK.size / 2})`);
    expect(svg).toContain(`d="${MARK.creasePath}"`);
    expect(svg).toContain(`stroke-width="${MARK.creaseWidth}"`);
    expect(svg).toContain(MARK.lime);
    expect(svg).toContain(MARK.ink);
  });

  it("the one-colour version cuts the same bean out of the same plate", () => {
    const svg = read("public/brand/grind-mark-mono.svg");
    expect(svg).toContain(`r="${MARK.plateRadius}"`);
    expect(svg).toContain(`rx="${MARK.beanRx}" ry="${MARK.beanRy}"`);
    expect(svg).toContain(`d="${MARK.creasePath}"`);
    expect(svg).toContain(MARK.ink);
    expect(svg).not.toContain(MARK.lime);
  });

  it("the app icon sits on the dark background with the plate at 60% (4.8 × 64 units on a 512 grid)", () => {
    const svg = read("public/brand/grind-icon.svg");
    expect(svg).toContain(`fill="${MARK.dark}"`);
    expect(svg).toContain("translate(102.4 102.4) scale(4.8)");
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
