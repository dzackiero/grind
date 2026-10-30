import { randomUUID } from "node:crypto";
import { and, eq, lt, notExists, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { account, session, user } from "../db/schema";
import type { Auth } from "../auth/create-auth";
import { emailConfigured } from "../email/transport";

/** Guests whose sessions all expired, this long after they were created, are deleted with their data. */
export const GUEST_RETENTION_DAYS = 30;

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Turns a guest into a full account in place. The user id stays the same, so the plan, progress, habits
 * and intervals.icu connection carry over without moving any rows. A verification email follows, but
 * nothing waits on it.
 */
export async function upgradeGuest(
  auth: Auth,
  db: DB,
  userId: string,
  input: { name: string; email: string; password: string },
) {
  const email = input.email.trim().toLowerCase();
  const [current] = await db
    .select({ isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, userId));
  if (!current?.isAnonymous) throw new AccountError("This account is already saved.", 409);
  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (taken)
    throw new AccountError("That email already has an account. Sign in to it instead.", 409);

  const hash = (await auth.$context).password.hash;
  const password = await hash(input.password);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({
        name: input.name.trim(),
        email,
        emailVerified: false,
        isAnonymous: false,
        updatedAt: now,
      })
      .where(eq(user.id, userId));
    await tx.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password,
      createdAt: now,
      updatedAt: now,
    });
  });
  if (emailConfigured())
    await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/today" } });
  return { email };
}

/** Deletes abandoned guests (and, by cascade, everything they logged). Returns how many were removed. */
export async function pruneInactiveGuests(db: DB, now = new Date()) {
  const cutoff = new Date(now.getTime() - GUEST_RETENTION_DAYS * 86_400_000);
  const live = db
    .select({ one: sql`1` })
    .from(session)
    .where(and(eq(session.userId, user.id), sql`${session.expiresAt} > ${now}`));
  const removed = await db
    .delete(user)
    .where(and(eq(user.isAnonymous, true), lt(user.createdAt, cutoff), notExists(live)))
    .returning({ id: user.id });
  return removed.length;
}
