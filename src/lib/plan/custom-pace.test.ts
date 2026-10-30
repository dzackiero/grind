import { describe, expect, it } from "vitest";
import { stepsDistanceKm, stepsDurationMin } from "./run-sessions";
import type { PaceZones, Step } from "./schema";

const paces: PaceZones = {
  E: { minSecPerKm: 300, maxSecPerKm: 360 },
  M: { minSecPerKm: 280, maxSecPerKm: 300 },
  T: { minSecPerKm: 250, maxSecPerKm: 270 },
  I: { minSecPerKm: 220, maxSecPerKm: 240 },
  R: { minSecPerKm: 200, maxSecPerKm: 220 },
  race: { minSecPerKm: 260, maxSecPerKm: 280 },
};
const target = { zone: "E" as const, pace: { minSecPerKm: 580, maxSecPerKm: 620 } };

describe("custom step paces", () => {
  it("uses the explicit pace midpoint to derive distance from duration", () => {
    expect(stepsDistanceKm([{ kind: "steady", durationSec: 300, target }], paces)).toBe(0.5);
  });
  it("uses the explicit pace midpoint to derive duration from distance", () => {
    expect(stepsDurationMin([{ kind: "steady", distanceM: 1000, target }], paces)).toBe(10);
  });
  it("honors explicit recovery pace inside repeat steps", () => {
    const steps: Step[] = [
      {
        kind: "repeat",
        times: 3,
        steps: [
          { kind: "work", distanceM: 1000, target },
          { kind: "recovery", durationSec: 300, target },
        ],
      },
    ];
    expect(stepsDistanceKm(steps, paces)).toBe(4.5);
    expect(stepsDurationMin(steps, paces)).toBe(45);
  });
  it("keeps plan-zone and recovery-jog defaults when no explicit pace is present", () => {
    expect(
      stepsDurationMin([{ kind: "work", distanceM: 1000, target: { zone: "E" } }], paces),
    ).toBe(5.5);
    expect(stepsDurationMin([{ kind: "recovery", distanceM: 1000 }], paces)).toBeCloseTo(6 + 1 / 3);
  });
  it("keeps explicit distance and duration precedence when both are provided", () => {
    const steps: Step[] = [{ kind: "steady", distanceM: 1000, durationSec: 300, target }];
    expect(stepsDistanceKm(steps, paces)).toBe(1);
    expect(stepsDurationMin(steps, paces)).toBe(5);
  });
});
