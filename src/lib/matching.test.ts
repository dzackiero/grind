import { describe, expect, it } from "vitest";
import { matchActivities, type ActivityForMatch, type PlannedForMatch } from "./matching";

const run = (key: string, date: string, distanceKm: number, extra: Partial<PlannedForMatch> = {}): PlannedForMatch => ({
  key,
  date,
  kind: "run",
  distanceKm,
  status: "planned",
  activityId: null,
  ...extra,
});
const strength = (key: string, date: string): PlannedForMatch => ({ key, date, kind: "strength", distanceKm: null, status: "planned", activityId: null });
const act = (id: string, date: string, type: string, km = 0): ActivityForMatch => ({ id, date, type, distanceM: km * 1000 });

describe("matchActivities", () => {
  it("matches a run on the same day", () => {
    expect([...matchActivities([run("w1", "2026-10-28", 6)], [act("a1", "2026-10-28", "Run", 5.8)])]).toEqual([["w1", "a1"]]);
  });

  it("picks the run closest to the planned distance when there are two", () => {
    const links = matchActivities([run("w1", "2026-10-27", 3)], [act("indoor", "2026-10-27", "VirtualRun", 2), act("outdoor", "2026-10-27", "Run", 3.05)]);
    expect(links.get("w1")).toBe("outdoor");
  });

  it("matches strength only to strength activities", () => {
    const links = matchActivities([strength("s1", "2026-10-27")], [act("walk", "2026-10-27", "Walk", 2), act("gym", "2026-10-27", "Workout")]);
    expect(links.get("s1")).toBe("gym");
  });

  it("never matches walks to runs", () => {
    expect(matchActivities([run("w1", "2026-10-28", 3)], [act("walk", "2026-10-28", "Walk", 3)]).size).toBe(0);
  });

  it.each(["2026-10-27", "2026-10-29"])("does not mark October 28 done from a run on %s", (date) => {
    expect(matchActivities([run("w1", "2026-10-28", 5.6)], [act("a", date, "Run", 3.1)]).size).toBe(0);
  });

  it("doesn't let a nearby day steal a run planned on its own day", () => {
    const links = matchActivities([run("fri", "2026-10-30", 3), run("sat", "2026-10-31", 6)], [act("a", "2026-10-30", "Run", 3)]);
    expect(links.get("fri")).toBe("a");
    expect(links.has("sat")).toBe(false);
  });

  it("keeps existing links and leaves skipped workouts alone", () => {
    const links = matchActivities(
      [run("w1", "2026-10-28", 6, { activityId: "a1", status: "completed" }), run("w2", "2026-10-29", 5, { status: "skipped" })],
      [act("a1", "2026-10-28", "Run", 6), act("a2", "2026-10-29", "Run", 5)],
    );
    expect(links.size).toBe(0);
  });

  it("uses each activity once", () => {
    const links = matchActivities([run("am", "2026-10-28", 5), run("pm", "2026-10-28", 5)], [act("a", "2026-10-28", "Run", 5)]);
    expect(links.size).toBe(1);
  });
});
