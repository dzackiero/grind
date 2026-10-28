import { beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { archiveHabit, createHabit, HabitError, listHabits, setHabitDone, updateHabit } from "./service";

let db: DB;
const TODAY = "2026-10-28";
const RANGE = { from: "2026-08-01", to: TODAY };

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "u1", name: "One", email: "one@example.com" },
    { id: "u2", name: "Two", email: "two@example.com" },
  ]);
});

describe("habits", () => {
  it("creates a habit with its schedule and lists it", async () => {
    const created = await createHabit(db, "u1", { name: "  Stretch ", icon: "stretch", days: ["fri", "mon"] });
    expect(created).toMatchObject({ name: "Stretch", icon: "stretch", days: ["mon", "fri"] });
    const list = await listHabits(db, "u1", RANGE);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, doneDates: [] });
  });

  it("rejects bad input", async () => {
    await expect(createHabit(db, "u1", { name: "", days: ["mon"] })).rejects.toBeInstanceOf(ZodError);
    await expect(createHabit(db, "u1", { name: "x", days: [] })).rejects.toBeInstanceOf(ZodError);
  });

  it("ticks and unticks a day, idempotently", async () => {
    const [h] = await listHabits(db, "u1", RANGE);
    await setHabitDone(db, "u1", h.id, TODAY, true, TODAY);
    await setHabitDone(db, "u1", h.id, TODAY, true, TODAY);
    await setHabitDone(db, "u1", h.id, "2026-10-26", true, TODAY);
    expect((await listHabits(db, "u1", RANGE))[0].doneDates).toEqual(["2026-10-26", TODAY]);
    await setHabitDone(db, "u1", h.id, TODAY, false, TODAY);
    await setHabitDone(db, "u1", h.id, TODAY, false, TODAY);
    expect((await listHabits(db, "u1", RANGE))[0].doneDates).toEqual(["2026-10-26"]);
  });

  it("only returns ticks inside the range asked for", async () => {
    const [h] = await listHabits(db, "u1", RANGE);
    expect((await listHabits(db, "u1", { from: "2026-10-27", to: TODAY }))[0].doneDates).toEqual([]);
    expect(h.doneDates).toEqual(["2026-10-26"]);
  });

  it("refuses the future, dates too far back, and badly formed dates", async () => {
    const [h] = await listHabits(db, "u1", RANGE);
    await expect(setHabitDone(db, "u1", h.id, "2026-10-29", true, TODAY)).rejects.toThrow(/hasn't happened/);
    await expect(setHabitDone(db, "u1", h.id, "2026-08-01", true, TODAY)).rejects.toThrow(/last 60 days/);
    await expect(setHabitDone(db, "u1", h.id, "yesterday", true, TODAY)).rejects.toThrow(/look like/);
  });

  it("keeps habits private to their owner", async () => {
    const [h] = await listHabits(db, "u1", RANGE);
    await expect(setHabitDone(db, "u2", h.id, TODAY, true, TODAY)).rejects.toMatchObject({ status: 404 });
    await expect(updateHabit(db, "u2", h.id, { name: "Mine now" })).rejects.toMatchObject({ status: 404 });
    await expect(archiveHabit(db, "u2", h.id)).rejects.toMatchObject({ status: 404 });
    expect(await listHabits(db, "u2", RANGE)).toEqual([]);
  });

  it("edits a habit and keeps its ticks", async () => {
    const [h] = await listHabits(db, "u1", RANGE);
    const changed = await updateHabit(db, "u1", h.id, { name: "Stretch 15 min", days: ["wed", "mon", "fri"] });
    expect(changed).toMatchObject({ name: "Stretch 15 min", days: ["mon", "wed", "fri"], icon: "stretch" });
    expect((await listHabits(db, "u1", RANGE))[0].doneDates).toEqual(["2026-10-26"]);
    await expect(updateHabit(db, "u1", h.id, {})).rejects.toBeInstanceOf(HabitError);
  });

  it("limits how many active habits there are, and archiving frees a slot and hides the habit", async () => {
    for (let i = 0; i < 11; i++) await createHabit(db, "u1", { name: `Habit ${i}`, days: ["mon"] });
    await expect(createHabit(db, "u1", { name: "One too many", days: ["mon"] })).rejects.toThrow(/up to 12/);
    const [first] = await listHabits(db, "u1", RANGE);
    await archiveHabit(db, "u1", first.id);
    expect(await listHabits(db, "u1", RANGE)).toHaveLength(11);
    await expect(setHabitDone(db, "u1", first.id, TODAY, true, TODAY)).rejects.toMatchObject({ status: 404 });
    await expect(createHabit(db, "u1", { name: "Fits now", days: ["mon"] })).resolves.toBeTruthy();
  });
});
