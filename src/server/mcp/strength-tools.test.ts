import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { createPlanFromInput, getActivePlan } from "../plans/service";
import { saveExerciseSets } from "../strength/service";
import { registerStrengthTools } from "./strength-tools";

let db: DB;
type Handler = (args: { days: number }) => Promise<{ content: { text: string }[] }>;

function register(scopes: string[]) {
  const tools = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) =>
      void tools.set(name, handler),
  } as unknown as McpServer;
  registerStrengthTools(server, { db, userId: "lifter", scopes: new Set(scopes) });
  return tools;
}
const read = async (tools: Map<string, Handler>, days = 28) => {
  const body = (await tools.get("get_strength_log")!({ days })).content[0].text;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

let sessions: { id: string; date: string; exercises: { id: string; name: string }[] }[] = [];

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values({ id: "lifter", name: "Lifter", email: "lifter@example.com" });
  await createPlanFromInput(db, "lifter", {
    goal: "half",
    raceDate: "2027-01-17",
    startDate: "2026-10-27",
    experience: "intermediate",
    currentWeeklyKm: 15,
    runDays: ["wed", "fri", "sun"],
    longRunDay: "sun",
    strength: { sessionsPerWeek: 3, days: ["mon", "tue", "thu"], equipment: "gym" },
    intensity: "balanced",
  });
  const all = (await getActivePlan(db, "lifter"))!.plan.weeks.flatMap((w) => w.workouts);
  sessions = all.flatMap((w) =>
    w.kind === "strength"
      ? [
          {
            id: w.id,
            date: w.date,
            exercises: w.exercises.map((e) => ({ id: e.id, name: e.name })),
          },
        ]
      : [],
  );
});

afterEach(() => vi.useRealTimers());

describe("get_strength_log", () => {
  it("is only offered with the read scope", () => {
    expect(register(["plan:read"]).has("get_strength_log")).toBe(true);
    expect(register([]).has("get_strength_log")).toBe(false);
    expect(register(["plan:write"]).has("get_strength_log")).toBe(false);
  });

  it("says so when nothing was logged, without implying a missed session", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    expect(await read(register(["plan:read"]))).toMatch(
      /No strength sets logged.*may still have done/,
    );
  });

  it("reports sessions, volume, the heaviest set, an estimated one-rep max and the best of the period", async () => {
    const first = sessions.find((s) => s.date === "2026-10-27")!;
    const second = sessions.find((s) => s.date === "2026-10-29")!;
    const name = first.exercises[0].name;
    const set = (reps: number, weightKg: number, done = true) => ({
      reps,
      weightKg,
      seconds: null,
      done,
    });
    await saveExerciseSets(
      db,
      "lifter",
      first.id,
      {
        exerciseId: first.exercises[0].id,
        exerciseName: name,
        sets: [set(8, 40), set(5, 60), set(5, 70, false)],
      },
      "2026-12-31",
    );
    await saveExerciseSets(
      db,
      "lifter",
      second.id,
      {
        exerciseId: second.exercises[0].id,
        exerciseName: second.exercises[0].name,
        sets: [set(5, 65)],
      },
      "2026-12-31",
    );

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    const log = await read(register(["plan:read"]));

    expect(log.sessions.map((s: { date: string }) => s.date)).toEqual(["2026-10-27", "2026-10-29"]);
    const squat = log.sessions[0].exercises[0];
    expect(squat).toMatchObject({
      exercise: name,
      setsDone: 2,
      setsLogged: 3,
      volumeKg: 620,
      heaviestSet: { kg: 60, reps: 5 },
    });
    expect(squat.estimatedOneRepMaxKg).toBe(70); // 60 × (1 + 5/30)
    expect(squat.sets).toHaveLength(3);
    expect(log.bestOfPeriod.find((b: { exercise: string }) => b.exercise === name)).toMatchObject({
      heaviestKg: 60,
    });
    expect(log.units.weight).toBe("kg");
  });

  it("only looks back as far as asked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
    expect(await read(register(["plan:read"]), 7)).toMatch(
      /No strength sets logged in the last 7 days/,
    );
  });
});
