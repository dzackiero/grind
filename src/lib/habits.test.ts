import { describe, expect, it } from "vitest";
import { adherence, HabitInputSchema, isIsoDate, scheduleLabel, streak, weekDays, weekProgress } from "./habits";
import type { Weekday } from "./plan/dates";

// 2026-10-28 is a Wednesday; the week runs Mon 26 Oct to Sun 1 Nov
const TODAY = "2026-10-28";
const done = (...dates: string[]) => new Set(dates);
const MWF: Weekday[] = ["mon", "wed", "fri"];
const EVERY: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

describe("HabitInputSchema", () => {
  it("trims the name, orders and de-duplicates nothing it shouldn't, and defaults the icon", () => {
    const parsed = HabitInputSchema.parse({ name: "  Stretch  ", days: ["fri", "mon"] });
    expect(parsed).toEqual({ name: "Stretch", icon: "check", days: ["mon", "fri"] });
  });

  it("refuses an empty name, no days, an unknown icon and a very long name", () => {
    expect(HabitInputSchema.safeParse({ name: "  ", days: ["mon"] }).success).toBe(false);
    expect(HabitInputSchema.safeParse({ name: "x", days: [] }).success).toBe(false);
    expect(HabitInputSchema.safeParse({ name: "x", days: ["mon"], icon: "rocket" }).success).toBe(false);
    expect(HabitInputSchema.safeParse({ name: "x".repeat(41), days: ["mon"] }).success).toBe(false);
    expect(HabitInputSchema.safeParse({ name: "x", days: ["funday"] }).success).toBe(false);
  });
});

describe("scheduleLabel", () => {
  it("names the common patterns and lists the rest", () => {
    expect(scheduleLabel(EVERY)).toBe("Every day");
    expect(scheduleLabel(["mon", "tue", "wed", "thu", "fri"])).toBe("Weekdays");
    expect(scheduleLabel(["sat", "sun"])).toBe("Weekends");
    expect(scheduleLabel(["fri", "mon", "wed"])).toBe("Mon, Wed, Fri");
  });
});

describe("weekProgress", () => {
  it("counts ticks in the Monday to Sunday week against the number of scheduled days", () => {
    expect(weekProgress(MWF, done("2026-10-26", "2026-10-28"), TODAY)).toEqual({ done: 2, target: 3 });
  });

  it("ignores ticks from other weeks and counts a tick on an unscheduled day", () => {
    expect(weekProgress(MWF, done("2026-10-25", "2026-11-02", "2026-10-27"), TODAY)).toEqual({ done: 1, target: 3 });
  });
});

describe("weekDays", () => {
  it("marks done, missed, due, rest and future days", () => {
    const states = weekDays(MWF, done("2026-10-26"), TODAY, TODAY).map((d) => d.state);
    // Mon done, Tue rest (not scheduled), Wed due (today, scheduled), Thu-Sun future
    expect(states).toEqual(["done", "rest", "due", "future", "future", "future", "future"]);
  });

  it("marks a scheduled day with no tick as missed", () => {
    expect(weekDays(MWF, done(), TODAY, TODAY)[0].state).toBe("missed");
  });
});

describe("streak", () => {
  it("counts consecutive ticked days back from today", () => {
    expect(streak(EVERY, done("2026-10-28", "2026-10-27", "2026-10-26"), TODAY)).toBe(3);
  });

  it("keeps today open: an unticked today doesn't end the streak", () => {
    expect(streak(EVERY, done("2026-10-27", "2026-10-26"), TODAY)).toBe(2);
  });

  it("ends at a scheduled day that was missed", () => {
    expect(streak(EVERY, done("2026-10-28", "2026-10-26", "2026-10-25"), TODAY)).toBe(1);
  });

  it("is not broken by days the habit isn't scheduled", () => {
    // Mon/Wed/Fri: Wed today and Mon ticked, Tue is a rest day in between
    expect(streak(MWF, done("2026-10-28", "2026-10-26"), TODAY)).toBe(2);
  });

  it("is zero for a habit never ticked", () => {
    expect(streak(EVERY, done(), TODAY)).toBe(0);
  });
});

describe("adherence", () => {
  it("counts scheduled days since the habit began, leaving today out", () => {
    // Window of 7 days before Wed 28 Oct: Wed 21 .. Tue 27. Mon/Wed/Fri scheduled: Wed 21, Fri 23, Mon 26
    expect(adherence(MWF, done("2026-10-21", "2026-10-26"), TODAY, "2026-09-01", 7)).toEqual({ scheduled: 3, done: 2 });
  });

  it("doesn't count days before the habit was created", () => {
    expect(adherence(EVERY, done(), TODAY, "2026-10-26", 28)).toEqual({ scheduled: 2, done: 0 });
  });
});

describe("isIsoDate", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2026-10-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("28-10-2026")).toBe(false);
  });
});
