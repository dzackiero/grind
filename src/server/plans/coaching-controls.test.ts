import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { setCoachingProfile } from "../profile/coaching";
import { createPlanFromInput, getActivePlan, setWorkoutStatus } from "./service";
import { listPendingChanges, proposeChanges, resolveChange } from "./changes";
import { getPlanDiff, previewPlanChanges } from "./preview";

let db: DB;
let uid: string;
let workoutId: string;
let sequence = 0;
const TODAY = "2026-10-28";
beforeAll(async () => { db = await createDb("memory://"); });
beforeEach(async () => {
  uid = `controls-${++sequence}`;
  await db.insert(user).values({ id: uid, name: "Runner", email: `${uid}@test.example` });
  const saved = await createPlanFromInput(db, uid, {
    goal: "half", raceDate: "2027-01-17", startDate: TODAY, experience: "intermediate",
    currentWeeklyKm: 15, runDays: ["wed", "fri", "sun"], longRunDay: "sun",
    strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" }, intensity: "balanced",
  });
  workoutId = saved.plan.weeks.flatMap(w => w.workouts).find(w => w.kind === "run" && w.type === "easy" && w.date >= TODAY)!.id;
});

describe("coaching change controls", () => {
  it("previews a structured diff and validation without saving a change", async () => {
    const preview = await previewPlanChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Relaxed run" } }], TODAY, 1);
    expect(preview.validation.ok).toBe(true);
    expect(preview.diff.changedWorkoutIds).toEqual([workoutId]);
    expect(preview.diff.workouts[0].after?.title).toBe("Relaxed run");
    expect((await getActivePlan(db, uid))!.revision).toBe(1);
  });

  it("refuses a proposal based on an old revision", async () => {
    await expect(proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Changed" } }], "Change the title", TODAY, "coach", 0)).rejects.toThrow(/revision/i);
  });

  it("blocks accepting a proposal after its workout is marked completed", async () => {
    const proposal = await proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Changed" } }], "Change the title", TODAY);
    await setWorkoutStatus(db, uid, workoutId, "completed");
    expect((await getPlanDiff(db, uid, proposal.id, TODAY)).stale).toBe(true);
    await expect(resolveChange(db, uid, proposal.id, "accept")).rejects.toThrow(/done|completed|revision/i);
    expect(await listPendingChanges(db, uid)).toEqual([]);
    expect((await getActivePlan(db, uid))!.plan.weeks.flatMap(w => w.workouts).find(w => w.id === workoutId)!.title).not.toBe("Changed");
  });

  it("requires a new proposal after coaching rules change", async () => {
    const proposal = await proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Changed" } }], "Change the title", TODAY);
    await setCoachingProfile(db, uid, { preferences: { allowHills: false }, constraints: {} }, 0);
    await expect(resolveChange(db, uid, proposal.id, "accept")).rejects.toThrow(/coaching|preferences/i);
  });

  it("exposes a stored diff only to its owner", async () => {
    const proposal = await proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Changed" } }], "Change the title", TODAY);
    const diff = await getPlanDiff(db, uid, proposal.id, TODAY);
    expect(diff.baseRevision).toBe(1);
    expect(diff.diff.changedWorkoutIds).toEqual([workoutId]);
    await expect(getPlanDiff(db, "other-user", proposal.id, TODAY)).rejects.toThrow(/exist/i);
  });

  it("keeps the original weekly distance diff after acceptance", async () => {
    const proposal = await proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { distanceKm: 4 } }], "An extra easy kilometre", TODAY);
    const before = await getPlanDiff(db, uid, proposal.id, TODAY);
    await resolveChange(db, uid, proposal.id, "accept");
    const after = await getPlanDiff(db, uid, proposal.id, TODAY);
    expect(after.diff).toEqual(before.diff);
    expect(after.stale).toBe(false);
  });

  it("returns constraint errors and preference warnings on the whole candidate", async () => {
    await setCoachingProfile(db, uid, { preferences: { runDays: ["sun"] }, constraints: { allowHills: false } }, 0);
    const preview = await previewPlanChanges(db, uid, [], TODAY);
    expect(preview.validation.errors.some(e => e.code === "COACHING_CONSTRAINT")).toBe(true);
    expect(preview.validation.warnings.some(e => e.code === "COACHING_PREFERENCE")).toBe(true);
    await expect(proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Changed" } }], "Change the title", TODAY)).rejects.toThrow(/COACHING_CONSTRAINT/);
  });

  it("checks saved constraints when rebuilding a plan", async () => {
    const input = (await getActivePlan(db, uid))!.plan.input;
    await setCoachingProfile(db, uid, { preferences: {}, constraints: { restDays: ["wed"] } }, 0);
    await expect(createPlanFromInput(db, uid, input)).rejects.toThrow(/COACHING_CONSTRAINT/);
    expect((await getActivePlan(db, uid))!.revision).toBe(1);
  });

  it("marks a proposal stale when its workout date passes", async () => {
    const proposal = await proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Changed" } }], "Change the title", TODAY);
    const diff = await getPlanDiff(db, uid, proposal.id, "2026-11-30");
    expect(diff.stale).toBe(true);
    expect(diff.staleReason).toMatch(/past/);
  });

  it("uses saved coaching rules to personalize newly generated sessions", async () => {
    const input = (await getActivePlan(db, uid))!.plan.input;
    await setCoachingProfile(db, uid, { preferences: {}, constraints: { allowHills: false, qualityOnlyLastWeeks: 2, strengthFocusByDay: { thu: "push" } } }, 0);
    const saved = await createPlanFromInput(db, uid, input);
    const workouts = saved.plan.weeks.flatMap(w => w.workouts);
    expect(workouts.some(w => w.kind === "run" && w.type === "hills")).toBe(false);
    expect(workouts.filter(w => w.kind === "strength" && w.date.endsWith("29")).some(w => w.kind === "strength" && w.focus === "push")).toBe(true);
    expect(saved.plan.input.runDays).toEqual(input.runDays);
  });

  it("applies a proposal only once when acceptance requests race", async () => {
    const proposal = await proposeChanges(db, uid, [{ op: "update_workout", workoutId, patch: { title: "Changed" } }], "Change the title", TODAY);
    const results = await Promise.allSettled([
      resolveChange(db, uid, proposal.id, "accept"),
      resolveChange(db, uid, proposal.id, "accept"),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await getActivePlan(db, uid))!.revision).toBe(2);
  });
});
