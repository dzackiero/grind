import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret } from "../crypto";
import { createDb, type DB } from "../db/client";
import { activity, activityEffort, athleteProfile, user } from "../db/schema";
import { getActivityDetail } from "./activity-detail";
import { IntervalsError, type IntervalsApi } from "./client";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

let db: DB;
const USER = "runner";
const streams = { time: [0, 1, 2], distance: [0, 3, 6], latlng: null, altitude: null, heartrate: null, cadence: null, grade: null };
const api = (detail: IntervalsApi["getActivityDetailStreams"]) => () => ({ getActivityDetailStreams: detail }) as IntervalsApi;

beforeAll(async () => {
  db = await createDb("memory://");
  await db.insert(user).values([
    { id: USER, name: "Runner", email: "runner@example.com" },
    { id: "other", name: "Other", email: "other@example.com" },
  ]);
  await db.insert(activity).values({ userId: USER, id: "a1", date: "2026-10-27", startLocal: "2026-10-27T16:33:47", type: "Run", distanceM: 3020, raw: {} });
  await db.insert(activityEffort).values([{ userId: USER, activityId: "a1", key: "1k", seconds: 469 }]);
});

describe("getActivityDetail", () => {
  it("returns nothing for an activity that isn't yours", async () => {
    expect(await getActivityDetail(db, "other", "a1", api(async () => streams))).toBeNull();
    expect(await getActivityDetail(db, USER, "missing", api(async () => streams))).toBeNull();
  });

  it("explains itself when intervals.icu isn't connected, and still shows the efforts", async () => {
    const detail = await getActivityDetail(db, USER, "a1", api(async () => streams));
    expect(detail?.streams).toBeNull();
    expect(detail?.streamsNote).toMatch(/Connect intervals.icu/);
    expect(detail?.efforts).toEqual([{ key: "1k", seconds: 469 }]);
  });

  it("fetches the streams once connected", async () => {
    await db.insert(athleteProfile).values({ userId: USER, intervalsApiKeyEnc: encryptSecret("good-key-123456"), intervalsAthleteId: "i1" });
    const detail = await getActivityDetail(db, USER, "a1", api(async () => streams));
    expect(detail?.streams).toEqual(streams);
    expect(detail?.streamsNote).toBeNull();
  });

  it("keeps the page working when intervals.icu fails or has no streams", async () => {
    const busy = await getActivityDetail(db, USER, "a1", api(async () => Promise.reject(new IntervalsError("intervals.icu is rate limiting requests.", 429))));
    expect(busy?.activity.id).toBe("a1");
    expect(busy?.streamsNote).toMatch(/rate limiting/);
    const none = await getActivityDetail(db, USER, "a1", api(async () => null));
    expect(none?.streamsNote).toMatch(/no distance data/);
    const broken = await getActivityDetail(db, USER, "a1", api(async () => Promise.reject(new Error("boom"))));
    expect(broken?.streamsNote).toMatch(/Couldn't load/);
  });
});
