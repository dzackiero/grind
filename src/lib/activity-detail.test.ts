import { describe, expect, it } from "vitest";
import { analyseElevation, analysePace, buildRoute, computeSplits, gradeFactor, stepsPerMinute } from "./activity-detail";

/** One sample per second at a constant speed given as seconds per km. */
function steady(totalKm: number, paceSec: number) {
  const seconds = Math.round(totalKm * paceSec);
  const time = Array.from({ length: seconds + 1 }, (_, i) => i);
  return { time, distance: time.map((s) => (s * 1000) / paceSec) };
}

describe("computeSplits", () => {
  it("makes one split per full kilometre and drops a tiny remainder", () => {
    const splits = computeSplits(steady(3.02, 480));
    expect(splits.map((s) => s.km)).toEqual([1, 2, 3]);
    expect(splits[0].paceSec).toBeCloseTo(480, 0);
    expect(splits[0].gainSec).toBeNull();
    expect(splits[1].gainSec).toBeCloseTo(0, 0);
  });

  it("keeps a remainder of at least 100 m as a shorter split", () => {
    const splits = computeSplits(steady(2.4, 360));
    expect(splits).toHaveLength(3);
    expect(splits[2].distanceKm).toBeCloseTo(0.4, 1);
    expect(splits[2].paceSec).toBeCloseTo(360, 0);
  });

  it("reports faster splits as a positive gain", () => {
    const time = Array.from({ length: 1001 }, (_, i) => i);
    // First km at 6:00/km, second at 5:00/km
    const distance = time.map((t) => (t <= 360 ? (t * 1000) / 360 : 1000 + ((t - 360) * 1000) / 300));
    const splits = computeSplits({ time, distance });
    expect(splits[1].gainSec).toBeCloseTo(60, 0);
  });

  it("ignores a GPS jump instead of inventing a fast split", () => {
    const { time, distance } = steady(2, 360);
    const jumped = distance.map((d, i) => (i >= 100 ? d + 500 : d));
    const [first] = computeSplits({ time, distance: jumped });
    expect(first.paceSec).toBeGreaterThan(300);
  });

  it("returns nothing for an empty stream", () => {
    expect(computeSplits({ time: [], distance: [] })).toEqual([]);
  });
});

describe("gradeFactor", () => {
  it("is 1 on flat ground and harder uphill", () => {
    expect(gradeFactor(0)).toBeCloseTo(1, 5);
    expect(gradeFactor(10)).toBeGreaterThan(1.5);
    expect(gradeFactor(5)).toBeLessThan(gradeFactor(10));
  });

  it("follows the published downhill points: 0.88 at -9%, back to 1 at -18%", () => {
    expect(gradeFactor(-9)).toBeCloseTo(0.88, 2);
    expect(gradeFactor(-18)).toBeCloseTo(1, 2);
    expect(gradeFactor(-4)).toBeGreaterThan(0.88);
    expect(gradeFactor(-4)).toBeLessThan(1);
  });
});

describe("analysePace", () => {
  it("gives the same pace and GAP on flat ground", () => {
    const flat = analysePace({ ...steady(2, 360), altitude: null, grade: null });
    expect(flat.avgPaceSec).toBeCloseTo(360, 0);
    expect(flat.avgGapSec).toBeCloseTo(360, 0);
    expect(flat.hasGrade).toBe(false);
  });

  it("makes a climb count as faster than it looked", () => {
    const s = steady(2, 400);
    const climb = analysePace({ ...s, altitude: null, grade: s.time.map(() => 6) });
    expect(climb.avgPaceSec).toBeCloseTo(400, 0);
    expect(climb.avgGapSec!).toBeLessThan(climb.avgPaceSec! - 40);
  });

  it("works out slope from altitude when there is no grade stream", () => {
    const s = steady(2, 400);
    // 5 m climb per 100 m: 5%
    const altitude = s.distance.map((d) => d / 20);
    const result = analysePace({ ...s, altitude, grade: null });
    expect(result.avgGapSec!).toBeLessThan(result.avgPaceSec!);
  });

  it("finds the fastest stretch", () => {
    const time = Array.from({ length: 801 }, (_, i) => i);
    const distance = time.map((t) => (t <= 400 ? (t * 1000) / 400 : 1000 + ((t - 400) * 1000) / 200));
    const result = analysePace({ time, distance, altitude: null, grade: null });
    expect(result.maxPaceSec!).toBeLessThan(260);
  });
});

describe("analyseElevation", () => {
  it("returns altitude along the run and the highest point", () => {
    const s = steady(1, 360);
    const altitude = s.distance.map((d) => 50 + d / 100);
    const result = analyseElevation({ ...s, altitude });
    expect(result.maxM).toBeCloseTo(60, 0);
    expect(result.series.length).toBeGreaterThan(20);
    expect(result.series[0].km).toBe(0);
  });

  it("is empty without altitude", () => {
    expect(analyseElevation({ ...steady(1, 360), altitude: null })).toEqual({ series: [], maxM: null });
  });
});

describe("buildRoute", () => {
  it("draws a path inside a 0–100 box", () => {
    const route = buildRoute([[-6.37, 106.96], [-6.368, 106.961], [-6.366, 106.96]])!;
    expect(route.path.startsWith("M")).toBe(true);
    const numbers = route.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(100);
  });

  it("skips missing and zero coordinates, and needs two points", () => {
    expect(buildRoute(null)).toBeNull();
    expect(buildRoute([[0, 0], null, [-6.37, 106.96]])).toBeNull();
  });
});

describe("stepsPerMinute", () => {
  it("doubles the stride cadence", () => {
    expect(stepsPerMinute(77.4)).toBe(155);
    expect(stepsPerMinute(null)).toBeNull();
    expect(stepsPerMinute(0)).toBeNull();
  });
});
