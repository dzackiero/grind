import { beforeAll, describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { createDb, type DB } from "../db/client";
import { user } from "../db/schema";
import { createHabit, setHabitDone } from "../habits/service";
import { todayIn } from "../profile/service";
import { registerHabitTools } from "./habit-tools";

let db: DB;
type Handler = (args: { days: number }) => Promise<{ content: { text: string }[] }>;

/** Registers the tools on a stand-in server and hands back the handlers by name. */
function register(scopes: string[]) {
  const tools = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) =>
      void tools.set(name, handler),
  } as unknown as McpServer;
  registerHabitTools(server, { db, userId: "u1", scopes: new Set(scopes) });
  return tools;
}
const read = async (tools: Map<string, Handler>) => {
  const result = await tools.get("get_habits")!({ days: 28 });
  const body = result.content[0].text;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values({ id: "u1", name: "One", email: "one@example.com" });
});

describe("get_habits", () => {
  it("is only offered with the read scope", () => {
    expect(register(["plan:read"]).has("get_habits")).toBe(true);
    expect(register([]).has("get_habits")).toBe(false);
    expect(register(["plan:write"]).has("get_habits")).toBe(false);
  });

  it("says so when there are no habits", async () => {
    expect(await read(register(["plan:read"]))).toMatch(/doesn't track any habits/);
  });

  it("reports schedule, this week, streak and today's tick", async () => {
    const today = todayIn("UTC");
    const habit = await createHabit(db, "u1", {
      name: "Stretch",
      icon: "stretch",
      days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    });
    await setHabitDone(db, "u1", habit.id, today, true, today);
    const result = await read(register(["plan:read"]));
    expect(result.habits).toHaveLength(1);
    expect(result.habits[0]).toMatchObject({
      name: "Stretch",
      schedule: "Every day",
      doneToday: true,
      streakDays: 1,
    });
    expect(result.habits[0].thisWeek).toMatchObject({ target: 7 });
    expect(result.habits[0].tickedLast14Days).toEqual([today]);
    expect(result.habits[0].lastDays.days).toBe(28);
  });
});
