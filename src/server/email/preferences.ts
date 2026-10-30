import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { emailPreference } from "../db/schema";

export async function getEmailPreferences(db: DB, userId: string) {
  const [row] = await db.select().from(emailPreference).where(eq(emailPreference.userId, userId));
  return { weeklyRecap: row?.weeklyRecap ?? false, weeklyPreview: row?.weeklyPreview ?? false };
}
export async function setEmailPreferences(
  db: DB,
  userId: string,
  patch: { weeklyRecap?: boolean; weeklyPreview?: boolean },
) {
  await db
    .insert(emailPreference)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: emailPreference.userId, set: patch });
  return getEmailPreferences(db, userId);
}
