import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { CoachingRevisionError, getCoachingProfile, setCoachingProfile } from "./coaching";

let db: DB;
beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values(["coach-a", "coach-b", "coach-c"].map((id) => ({ id, name: id, email: `${id}@example.com` })));
});

describe("coaching profile persistence", () => {
  it("returns empty default rules before the first write", async () => {
    expect(await getCoachingProfile(db, "coach-a")).toEqual({ profile: { preferences: {}, constraints: {} }, revision: 0 });
  });
  it("stores a validated profile with increasing revisions, isolated per user", async () => {
    expect(await setCoachingProfile(db, "coach-a", { constraints: { allowHills: false }, preferences: {} }, 0)).toEqual({ profile: { constraints: { allowHills: false }, preferences: {} }, revision: 1 });
    expect((await setCoachingProfile(db, "coach-a", { constraints: {}, preferences: { longRunDay: "sun" } }, 1)).revision).toBe(2);
    expect((await getCoachingProfile(db, "coach-b")).revision).toBe(0);
  });
  it("rejects stale writes without replacing the stored profile", async () => {
    const before = await getCoachingProfile(db, "coach-a");
    await expect(setCoachingProfile(db, "coach-a", { constraints: { allowHills: true }, preferences: {} }, 1)).rejects.toBeInstanceOf(CoachingRevisionError);
    expect(await getCoachingProfile(db, "coach-a")).toEqual(before);
  });
  it("validates before creating or changing rows", async () => {
    const before = await getCoachingProfile(db, "coach-a");
    await expect(setCoachingProfile(db, "coach-a", { constraints: { strengthSessionsPerWeek: 9 }, preferences: {} })).rejects.toThrow();
    expect(await getCoachingProfile(db, "coach-a")).toEqual(before);
    await expect(setCoachingProfile(db, "coach-b", { constraints: {}, preferences: {} }, 5)).rejects.toBeInstanceOf(CoachingRevisionError);
    expect((await getCoachingProfile(db, "coach-b")).revision).toBe(0);
  });
  it("allows exactly one concurrent writer with the same expected revision", async () => {
    const results = await Promise.allSettled([
      setCoachingProfile(db, "coach-c", { constraints: { allowHills: false }, preferences: {} }, 0),
      setCoachingProfile(db, "coach-c", { constraints: { allowHills: true }, preferences: {} }, 0),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(CoachingRevisionError);
    expect((await getCoachingProfile(db, "coach-c")).revision).toBe(1);
  });
});
