import { and, eq } from "drizzle-orm";
import { decryptSecret } from "../crypto";
import type { DB } from "../db/client";
import { activity, activityEffort, athleteProfile } from "../db/schema";
import { createIntervalsClient, IntervalsError, type IntervalsApi } from "./client";
import type { DetailStreams } from "@/lib/activity-detail";

export type ActivityDetail = {
  activity: typeof activity.$inferSelect;
  efforts: { key: string; seconds: number }[];
  /** Null when intervals.icu has no streams for it, or couldn't be reached (see `streamsNote`) */
  streams: DetailStreams | null;
  streamsNote: string | null;
};

const defaultFactory = (key: string, id: string): IntervalsApi => createIntervalsClient(key, id);

/**
 * One synced activity with its best efforts and, fetched from intervals.icu when asked for, the streams
 * behind the map and charts. Streams aren't stored: they are large and only this page uses them.
 */
export async function getActivityDetail(db: DB, userId: string, id: string, factory = defaultFactory): Promise<ActivityDetail | null> {
  const [row] = await db.select().from(activity).where(and(eq(activity.userId, userId), eq(activity.id, id)));
  if (!row) return null;
  const efforts = await db.select({ key: activityEffort.key, seconds: activityEffort.seconds }).from(activityEffort).where(and(eq(activityEffort.userId, userId), eq(activityEffort.activityId, id)));

  const [profile] = await db.select().from(athleteProfile).where(eq(athleteProfile.userId, userId));
  if (!profile?.intervalsApiKeyEnc) return { activity: row, efforts, streams: null, streamsNote: "Connect intervals.icu to see the map and charts." };
  try {
    const streams = await factory(decryptSecret(profile.intervalsApiKeyEnc), profile.intervalsAthleteId ?? "0").getActivityDetailStreams(id);
    return { activity: row, efforts, streams, streamsNote: streams ? null : "This activity has no distance data, so there is no map or charts." };
  } catch (error) {
    const note = error instanceof IntervalsError ? error.message : "Couldn't load the map and charts. Try again in a moment.";
    return { activity: row, efforts, streams: null, streamsNote: note };
  }
}
