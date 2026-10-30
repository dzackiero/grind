import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { athleteProfile } from "../db/schema";

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getTimezone(db: DB, userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: athleteProfile.timezone })
    .from(athleteProfile)
    .where(eq(athleteProfile.userId, userId));
  return row?.timezone ?? "UTC";
}

export async function setTimezone(db: DB, userId: string, timezone: string) {
  if (!isValidTimezone(timezone)) throw new RangeError(`Unknown time zone "${timezone}".`);
  await db
    .insert(athleteProfile)
    .values({ userId, timezone })
    .onConflictDoUpdate({
      target: athleteProfile.userId,
      set: { timezone, updatedAt: new Date() },
    });
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timezone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
