import { beforeAll, describe, expect, it } from "vitest";
import { PlanEditError, validatePlan, type PlanInput } from "@/lib/plan";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { listPendingChanges, proposeChanges, resolveChange, setCoachNotes } from "./changes";
import { createPlanFromInput, getActivePlan, PlanValidationError, setWorkoutStatus } from "./service";

const input: PlanInput = {
  goal: "half",
  raceDate: "2027-01-17",
  startDate: "2026-10-27",
  experience: "intermediate",
  currentWeeklyKm: 15,
  runDays: ["wed", "fri", "sun"],
  longRunDay: "sun",
  strength: { sessionsPerWeek: 2, days: ["mon", "thu"], equipment: "gym" },
  intensity: "balanced",
};
const TODAY = "2026-10-28";

let db: DB;
let hillsId: string;
let easyId: string;

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: "u1", name: "One", email: "one@example.com" },
    { id: "u2", name: "Two", email: "two@example.com" },
  ]);
  const saved = await createPlanFromInput(db, "u1", input);
  const all = saved.plan.weeks.flatMap((w) => w.workouts);
  hillsId = all.find((w) => w.date === "2026-10-28" && w.kind === "run")!.id;
  easyId = all.find((w) => w.date === "2026-10-30" && w.kind === "run")!.id;
});

describe("plan changes", () => {
  it("stores a proposal without touching the plan", async () => {
    const { id, changes } = await proposeChanges(db, "u1", [{ op: "move", workoutId: easyId, toDate: "2026-10-31" }], "Rest Friday", TODAY);
    expect(changes).toHaveLength(1);
    expect((await listPendingChanges(db, "u1")).map((c) => c.id)).toEqual([id]);
    const saved = await getActivePlan(db, "u1");
    expect(saved!.plan.weeks[0].workouts.find((w) => w.id === easyId)?.date).toBe("2026-10-30");
    expect(saved!.plan.source).toBe("template");
  });

  it("a newer suggestion replaces the one waiting", async () => {
    const first = (await listPendingChanges(db, "u1"))[0];
    const second = await proposeChanges(db, "u1", [{ op: "remove", workoutId: easyId }], "Skip the easy run", TODAY);
    const pending = await listPendingChanges(db, "u1");
    expect(pending.map((c) => c.id)).toEqual([second.id]);
    await expect(resolveChange(db, "u1", first.id, "accept")).rejects.toThrow(/already rejected/);
  });

  it("accepting writes the edited plan and keeps progress on other workouts", async () => {
    await setWorkoutStatus(db, "u1", hillsId, "completed");
    const { id } = await proposeChanges(db, "u1", [{ op: "move", workoutId: easyId, toDate: "2026-10-31" }], "Rest Friday", TODAY);
    expect(await resolveChange(db, "u1", id, "accept")).toMatchObject({ status: "accepted" });

    const saved = await getActivePlan(db, "u1");
    expect(saved!.plan.source).toBe("coach");
    expect(saved!.revision).toBe(2);
    expect(saved!.plan.weeks[0].workouts.find((w) => w.id === easyId)?.date).toBe("2026-10-31");
    expect(saved!.progress[hillsId].status).toBe("completed");
    expect(validatePlan(saved!.plan).errors).toEqual([]);
    expect(await listPendingChanges(db, "u1")).toEqual([]);
  });

  it("refuses to change workouts that are already done", async () => {
    await expect(proposeChanges(db, "u1", [{ op: "remove", workoutId: hillsId }], "x", TODAY)).rejects.toThrow(/already done/);
  });

  it("refuses edits that break the plan's rules, naming the problem", async () => {
    const all = (await getActivePlan(db, "u1"))!.plan.weeks.flatMap((w) => w.workouts);
    const long = all.find((w) => w.date === "2026-11-01" && w.kind === "run")!;
    const error = await proposeChanges(db, "u1", [{ op: "move", workoutId: easyId, toDate: "2026-10-31" }, { op: "move", workoutId: long.id, toDate: "2026-11-01" }], "x", TODAY).catch((e) => e);
    // Easy run is on Saturday now and the long run is Sunday: both easy-pace days are fine, so this is a no-op
    expect(error).toBeInstanceOf(PlanEditError);
    const clash = await proposeChanges(db, "u1", [{ op: "replace_run", workoutId: easyId, as: "tempo" }], "x", TODAY).catch((e) => e);
    expect(clash).toBeInstanceOf(PlanValidationError);
    expect(clash.result.errors.map((e: { code: string }) => e.code)).toContain("BACK_TO_BACK_HARD");
  });

  it("rejecting leaves the plan alone", async () => {
    const { id } = await proposeChanges(db, "u1", [{ op: "add_run", date: "2026-11-03", distanceKm: 4 }], "Extra easy run", TODAY);
    expect(await resolveChange(db, "u1", id, "reject")).toEqual({ status: "rejected" });
    const flat = (await getActivePlan(db, "u1"))!.plan.weeks.flatMap((w) => w.workouts);
    expect(flat.some((w) => w.id.startsWith("coach-2026-11-03"))).toBe(false);
  });

  it("adds new workouts and removes others when accepted", async () => {
    const { id } = await proposeChanges(db, "u1", [{ op: "add_run", date: "2026-11-03", distanceKm: 4 }], "Extra easy run", TODAY);
    await resolveChange(db, "u1", id, "accept");
    const saved = await getActivePlan(db, "u1");
    expect(saved!.plan.weeks[1].workouts.find((w) => w.id === "coach-2026-11-03-easy-1")).toMatchObject({ distanceKm: 4 });
    expect(saved!.progress["coach-2026-11-03-easy-1"].status).toBe("planned");

    const rm = await proposeChanges(db, "u1", [{ op: "remove", workoutId: "coach-2026-11-03-easy-1" }], "Never mind", TODAY);
    await resolveChange(db, "u1", rm.id, "accept");
    expect((await getActivePlan(db, "u1"))!.plan.weeks.flatMap((w) => w.workouts).some((w) => w.id === "coach-2026-11-03-easy-1")).toBe(false);
  });

  it("won't accept a suggestion once the plan has moved on", async () => {
    const a = await proposeChanges(db, "u1", [{ op: "move", workoutId: easyId, toDate: "2026-10-30" }], "Back to Friday", TODAY);
    // The athlete changes the same workout another way before answering
    await db.execute(`update planned_workout set data = jsonb_set(data, '{title}', '"Edited elsewhere"') where workout_key = '${easyId}'`);
    await expect(resolveChange(db, "u1", a.id, "accept")).rejects.toThrow(/has changed since/);
  });

  it("keeps each athlete's suggestions to themselves", async () => {
    expect(await listPendingChanges(db, "u2")).toEqual([]);
    await expect(proposeChanges(db, "u2", [{ op: "remove", workoutId: easyId }], "x", TODAY)).rejects.toThrow(/no active plan/i);
  });

  it("coach notes apply straight away and show on the workout", async () => {
    expect(await setCoachNotes(db, "u1", [{ workoutId: easyId, note: "Keep this one truly easy." }])).toBe(1);
    const w = (await getActivePlan(db, "u1"))!.plan.weeks.flatMap((x) => x.workouts).find((x) => x.id === easyId)!;
    expect(w.coachNote).toBe("Keep this one truly easy.");
    await expect(setCoachNotes(db, "u1", [{ workoutId: "nope", note: "x" }])).rejects.toThrow(/No workout/);
  });
});
