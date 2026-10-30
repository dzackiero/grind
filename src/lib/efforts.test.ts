import { describe, expect, it } from "vitest";
import { bestEfforts, formatEffort } from "./efforts";

/** A run at a steady pace: one sample per second, `paceSecPerKm` all the way. */
function steady(km: number, paceSecPerKm: number) {
  const seconds = Math.round(km * paceSecPerKm);
  const speed = 1000 / paceSecPerKm;
  const time = Array.from({ length: seconds + 1 }, (_, i) => i);
  const distance = time.map((s) => s * speed);
  return { time, distance };
}

describe("bestEfforts", () => {
  it("finds the exact time for a steady run", () => {
    const { time, distance } = steady(10, 300); // 5:00 per km
    const e = bestEfforts(time, distance);
    expect(e["1k"]).toBeCloseTo(300, 0);
    expect(e["5k"]).toBeCloseTo(1500, 0);
    expect(e["10k"]).toBeCloseTo(3000, 0);
    expect(e["1mi"]).toBeCloseTo(482.8, 0);
  });

  it("only reports distances the run is long enough for", () => {
    const e = bestEfforts(...(Object.values(steady(3, 360)) as [number[], number[]]));
    expect(Object.keys(e)).toEqual(["1k", "1mi"]);
    expect(e["2mi"]).toBeUndefined();
  });

  it("finds the fast kilometre hidden inside a slower run", () => {
    // 3 km easy (6:00/km), then 1 km hard (4:30/km), then 3 km easy
    const time: number[] = [0];
    const distance: number[] = [0];
    for (const [km, pace] of [
      [3, 360],
      [1, 270],
      [3, 360],
    ] as const) {
      const start = time.length - 1;
      const secs = km * pace;
      for (let s = 1; s <= secs; s++) {
        time.push(time[start] + s);
        distance.push(distance[start] + (s * 1000) / pace);
      }
    }
    const e = bestEfforts(time, distance);
    expect(e["1k"]).toBeCloseTo(270, 0);
    // The best 5K includes the hard kilometre plus four easy ones
    expect(e["5k"]).toBeCloseTo(270 + 4 * 360, 0);
  });

  it("is not fooled by a GPS jump", () => {
    const { time, distance } = steady(6, 360);
    // At 2 km the watch suddenly reports 400 m more distance, then carries on from there
    for (let i = 360 * 2; i < distance.length; i++) distance[i] += 400;
    const e = bestEfforts(time, distance);
    // Without the clamp the 1K would be around 5:00 or less; it must stay at the real pace
    expect(e["1k"]).toBeGreaterThan(355);
    expect(e["5k"]).toBeGreaterThan(1790);
  });

  it("ignores a spike that reverts", () => {
    const { time, distance } = steady(4, 360);
    distance[700] += 500; // one bad sample, the next is back to normal
    const e = bestEfforts(time, distance);
    expect(e["1k"]).toBeGreaterThan(355);
  });

  it("skips missing samples and repeated timestamps", () => {
    const { time, distance } = steady(2, 360);
    const t = time.map((x, i) => (i % 50 === 7 ? null : x));
    t[100] = t[99]; // duplicate timestamp
    const e = bestEfforts(t, distance);
    expect(e["1k"]).toBeGreaterThan(350);
    expect(e["1k"]).toBeLessThan(380);
  });

  it("returns nothing for empty or tiny streams", () => {
    expect(bestEfforts([], [])).toEqual({});
    expect(bestEfforts([0], [0])).toEqual({});
  });

  it("rejects windows faster than a person can sustain", () => {
    const { time, distance } = steady(2, 120); // 2:00 per km is 8.3 m/s
    expect(bestEfforts(time, distance)["1k"]).toBeUndefined();
  });
});

describe("formatEffort", () => {
  it("formats minutes and hours", () => {
    expect(formatEffort(300)).toBe("5:00");
    expect(formatEffort(1661)).toBe("27:41");
    expect(formatEffort(7110)).toBe("1:58:30");
    expect(formatEffort(59.6)).toBe("1:00");
  });
});
