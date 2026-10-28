import { describe, expect, it } from "vitest";
import { adjacentWeekDate, swipeDirection } from "./week-navigation";

describe("adjacentWeekDate", () => {
  const week = { index: 2, startDate: "2026-11-02" };

  it("preserves the selected weekday when moving either way", () => {
    expect(adjacentWeekDate(week, 4, "2026-11-05", -1)).toBe("2026-10-29");
    expect(adjacentWeekDate(week, 4, "2026-11-05", 1)).toBe("2026-11-12");
  });

  it("disables navigation beyond the first and final week", () => {
    expect(adjacentWeekDate({ ...week, index: 1 }, 4, "2026-11-05", -1)).toBeNull();
    expect(adjacentWeekDate({ ...week, index: 4 }, 4, "2026-11-05", 1)).toBeNull();
    expect(adjacentWeekDate({ ...week, index: 1 }, 1, "2026-11-05", 1)).toBeNull();
  });

  it("anchors out-of-plan selections to the displayed week", () => {
    expect(adjacentWeekDate(week, 4, "2027-01-07", -1)).toBe("2026-10-29");
    expect(adjacentWeekDate(week, 4, "2026-09-10", 1)).toBe("2026-11-12");
  });

  it("moves from a partial first week using its Monday start", () => {
    expect(adjacentWeekDate({ index: 1, startDate: "2026-10-26" }, 4, "2026-10-28", 1)).toBe("2026-11-04");
  });

  it("handles year boundaries and invalid date input", () => {
    expect(adjacentWeekDate({ index: 2, startDate: "2026-12-28" }, 4, "2026-12-31", 1)).toBe("2027-01-07");
    expect(adjacentWeekDate(week, 4, "2026-99-99", 1)).toBe("2026-11-09");
  });
});

describe("swipeDirection", () => {
  it("maps deliberate horizontal swipes to adjacent weeks", () => {
    expect(swipeDirection(-60, 10)).toBe(1);
    expect(swipeDirection(60, -10)).toBe(-1);
  });

  it("ignores taps, short movement, vertical scrolling and diagonal gestures", () => {
    expect(swipeDirection(0, 0)).toBeNull();
    expect(swipeDirection(-30, 0)).toBeNull();
    expect(swipeDirection(60, 100)).toBeNull();
    expect(swipeDirection(60, 50)).toBeNull();
  });
});
