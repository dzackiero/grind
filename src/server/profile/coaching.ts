import { and, eq, sql } from "drizzle-orm";
import { CoachingProfileSchema, type CoachingProfile } from "@/lib/coaching";
import type { DB } from "../db/client";
import { athleteProfile } from "../db/schema";

export interface CoachingProfileSnapshot {
  profile: CoachingProfile;
  revision: number;
}

export class CoachingRevisionError extends Error {
  constructor(
    public readonly expectedRevision: number,
    public readonly currentRevision: number,
  ) {
    super(
      `Coaching profile changed (expected revision ${expectedRevision}, current revision ${currentRevision}). Read the current profile before updating it.`,
    );
    this.name = "CoachingRevisionError";
  }
}

export async function getCoachingProfile(db: DB, userId: string): Promise<CoachingProfileSnapshot> {
  const [row] = await db
    .select({ profile: athleteProfile.coaching, revision: athleteProfile.coachingRevision })
    .from(athleteProfile)
    .where(eq(athleteProfile.userId, userId));
  return { profile: CoachingProfileSchema.parse(row?.profile ?? {}), revision: row?.revision ?? 0 };
}

/** Replaces the whole profile. A supplied revision is compared atomically; a stale write changes nothing. */
export async function setCoachingProfile(
  db: DB,
  userId: string,
  profile: CoachingProfile,
  expectedRevision?: number,
): Promise<CoachingProfileSnapshot> {
  const parsed = CoachingProfileSchema.parse(profile);
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
  )
    throw new RangeError("Expected coaching revision must be a non-negative integer.");
  return db.transaction(async (tx) => {
    // Insert first so concurrent first writes share the same row and CAS behavior as updates.
    // A stale write rolls back this insert as well as any subsequent changes.
    await tx
      .insert(athleteProfile)
      .values({ userId })
      .onConflictDoNothing({ target: athleteProfile.userId });
    const [row] = await tx
      .update(athleteProfile)
      .set({
        coaching: parsed,
        coachingRevision: sql`${athleteProfile.coachingRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(athleteProfile.userId, userId),
          expectedRevision === undefined
            ? undefined
            : eq(athleteProfile.coachingRevision, expectedRevision),
        ),
      )
      .returning({ profile: athleteProfile.coaching, revision: athleteProfile.coachingRevision });
    if (!row) {
      const [current] = await tx
        .select({ revision: athleteProfile.coachingRevision })
        .from(athleteProfile)
        .where(eq(athleteProfile.userId, userId));
      throw new CoachingRevisionError(expectedRevision!, current?.revision ?? 0);
    }
    return { profile: CoachingProfileSchema.parse(row.profile), revision: row.revision };
  });
}
