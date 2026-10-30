import { describe, expect, it } from "vitest";
import { pointsSummary, tierFor, workoutPoints, WEEK_BONUS, type PointRow } from "./points";

const row = (
  week: number,
  status: PointRow["status"],
  type = "easy",
  km: number | null = 5,
  planId = "p1",
): PointRow => ({
  planId,
  weekIndex: week,
  weekStart: `2026-11-${String(2 + (week - 1) * 7).padStart(2, "0")}`,
  type,
  distanceKm: km,
  status,
});

describe("workoutPoints", () => {
  it("scales runs by distance and keeps strength flat", () => {
    expect(workoutPoints({ type: "easy", distanceKm: 5 })).toBe(160);
    expect(workoutPoints({ type: "long", distanceKm: 10 })).toBe(380);
    expect(workoutPoints({ type: "intervals", distanceKm: 7 })).toBe(304);
    expect(workoutPoints({ type: "strength", distanceKm: null })).toBe(150);
    expect(workoutPoints({ type: "strength", distanceKm: 99 })).toBe(150);
  });
  it("rewards harder and longer sessions more than easy ones", () => {
    expect(workoutPoints({ type: "long", distanceKm: 8 })).toBeGreaterThan(
      workoutPoints({ type: "easy", distanceKm: 8 }),
    );
    expect(workoutPoints({ type: "race", distanceKm: 21 })).toBeGreaterThan(
      workoutPoints({ type: "long", distanceKm: 21 }),
    );
  });
  it("gives something for a type it doesn't know", () => {
    expect(workoutPoints({ type: "mystery", distanceKm: null })).toBe(100);
  });
});

describe("pointsSummary", () => {
  it("counts only completed workouts", () => {
    const s = pointsSummary(
      [row(1, "completed"), row(1, "planned"), row(1, "skipped")],
      "p1",
      "2026-11-03",
    );
    expect(s).toMatchObject({
      workoutPoints: 160,
      bonusPoints: 0,
      points: 160,
      completedWorkouts: 1,
      weeksHit: 0,
    });
  });

  it("adds a bonus for each week with at least 80% done", () => {
    const week1 = [
      row(1, "completed"),
      row(1, "completed"),
      row(1, "completed"),
      row(1, "completed"),
      row(1, "planned"),
    ]; // 4 of 5 = 80%
    const week2 = [row(2, "completed"), row(2, "planned")]; // 50%
    const s = pointsSummary([...week1, ...week2], "p1", "2026-11-20");
    expect(s.weeksHit).toBe(1);
    expect(s.bonusPoints).toBe(WEEK_BONUS);
    expect(s.points).toBe(5 * 160 + WEEK_BONUS);
  });

  it("counts points from earlier plans too", () => {
    const s = pointsSummary(
      [row(1, "completed", "easy", 5, "old"), row(1, "completed", "easy", 5, "p1")],
      "p1",
      "2026-11-03",
    );
    expect(s.completedWorkouts).toBe(2);
  });

  describe("streak", () => {
    const hitWeek = (w: number) => [row(w, "completed"), row(w, "completed")];
    const missWeek = (w: number) => [row(w, "completed"), row(w, "planned"), row(w, "planned")];

    it("counts finished weeks in a row", () => {
      // Weeks 1-3 start Nov 2, 9, 16 and end Nov 8, 15, 22
      expect(
        pointsSummary([...hitWeek(1), ...hitWeek(2), ...hitWeek(3)], "p1", "2026-11-23").streak,
      ).toBe(3);
    });
    it("stops at the first miss, counting back from the latest finished week", () => {
      expect(
        pointsSummary([...hitWeek(1), ...missWeek(2), ...hitWeek(3)], "p1", "2026-11-23").streak,
      ).toBe(1);
      expect(
        pointsSummary([...hitWeek(1), ...hitWeek(2), ...missWeek(3)], "p1", "2026-11-23").streak,
      ).toBe(0);
    });
    it("doesn't let the week in progress break it", () => {
      // Today is Wednesday Nov 18, inside week 3 (Nov 16-22), which is barely started
      const s = pointsSummary(
        [...hitWeek(1), ...hitWeek(2), row(3, "planned"), row(3, "planned")],
        "p1",
        "2026-11-18",
      );
      expect(s.streak).toBe(2);
    });
    it("only follows the active plan", () => {
      expect(pointsSummary([...hitWeek(1), ...hitWeek(2)], "another", "2026-11-23").streak).toBe(0);
    });
    it("is zero with no plan", () => {
      expect(pointsSummary([], null, "2026-11-23")).toMatchObject({
        points: 0,
        streak: 0,
        weeksHit: 0,
      });
    });
  });
});

describe("tierFor", () => {
  it("starts at Bronze and moves up at each threshold", () => {
    expect(tierFor(0).tier.key).toBe("bronze");
    expect(tierFor(1999).tier.key).toBe("bronze");
    expect(tierFor(2000).tier.key).toBe("silver");
    expect(tierFor(6000).tier.key).toBe("gold");
    expect(tierFor(12000).tier.key).toBe("platinum");
    expect(tierFor(20000).tier.key).toBe("lime");
  });
  it("says how far the next tier is", () => {
    const t = tierFor(8050);
    expect(t.tier.key).toBe("gold");
    expect(t.next?.key).toBe("platinum");
    expect(t.remaining).toBe(3950);
    expect(t.progress).toBeCloseTo((8050 - 6000) / 6000, 5);
  });
  it("is full at the top tier and ignores negative points", () => {
    expect(tierFor(25000)).toMatchObject({ next: null, remaining: 0, progress: 1 });
    expect(tierFor(-5).tier.key).toBe("bronze");
  });
});
