import { and, asc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { emailDelivery, user } from "../db/schema";
import { getEmailPreferences } from "./preferences";
import { sendEmail, type EmailMessage } from "./transport";

type Kind = typeof emailDelivery.$inferInsert.kind;
export async function enqueueEmail(
  db: DB,
  input: {
    key: string;
    userId: string;
    kind: Kind;
    message: EmailMessage;
    now?: Date;
    expiresAt?: Date;
  },
) {
  const now = input.now ?? new Date();
  // Stay inside Resend's 24-hour idempotency retention window, even after an ambiguous timeout.
  const deadline = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  await db
    .insert(emailDelivery)
    .values({
      key: input.key,
      userId: input.userId,
      kind: input.kind,
      message: input.message,
      createdAt: now,
      nextAttemptAt: now,
      expiresAt: input.expiresAt && input.expiresAt < deadline ? input.expiresAt : deadline,
    })
    .onConflictDoNothing();
}

export async function deliverPendingEmails(
  db: DB,
  options: {
    now?: Date;
    send?: typeof sendEmail;
    key?: string;
    limit?: number;
    pauseMs?: number;
    deadline?: number;
  } = {},
) {
  const clock = () => options.now ?? new Date();
  const ready = (now: Date) =>
    and(
      isNull(emailDelivery.sentAt),
      isNull(emailDelivery.cancelledAt),
      lt(emailDelivery.attempts, 6),
      lte(emailDelivery.nextAttemptAt, now),
      gt(emailDelivery.expiresAt, now),
      or(isNull(emailDelivery.leaseUntil), lte(emailDelivery.leaseUntil, now)),
    );
  const candidates = await db
    .select({ key: emailDelivery.key })
    .from(emailDelivery)
    .where(and(ready(clock()), options.key ? eq(emailDelivery.key, options.key) : undefined))
    .orderBy(
      sql`case when ${emailDelivery.kind} in ('verify', 'reset', 'password-changed') then 0 else 1 end`,
      asc(emailDelivery.nextAttemptAt),
    )
    .limit(options.limit ?? 40);
  let sent = 0,
    failed = 0;
  for (const candidate of candidates) {
    if (options.deadline && Date.now() >= options.deadline) break;
    const now = clock();
    const [row] = await db
      .update(emailDelivery)
      .set({
        leaseUntil: new Date(now.getTime() + 60_000),
        attempts: sql`${emailDelivery.attempts} + 1`,
      })
      .where(and(eq(emailDelivery.key, candidate.key), ready(now)))
      .returning();
    if (!row) continue;
    const [recipient] = await db
      .select({ email: user.email, verified: user.emailVerified })
      .from(user)
      .where(eq(user.id, row.userId));
    const weekly = row.kind === "weekly-recap" || row.kind === "weekly-preview";
    const prefs = weekly ? await getEmailPreferences(db, row.userId) : null;
    if (
      !recipient ||
      recipient.email !== row.message.to ||
      (weekly &&
        (!recipient.verified ||
          !(row.kind === "weekly-recap" ? prefs?.weeklyRecap : prefs?.weeklyPreview)))
    ) {
      await db
        .update(emailDelivery)
        .set({ cancelledAt: now, leaseUntil: null })
        .where(eq(emailDelivery.key, row.key));
      continue;
    }
    try {
      await (options.send ?? sendEmail)(row.message, row.key);
      await db
        .update(emailDelivery)
        .set({ sentAt: clock(), leaseUntil: null })
        .where(eq(emailDelivery.key, row.key));
      sent++;
    } catch {
      // Never log message bodies, auth URLs, recipients or provider response bodies.
      await db
        .update(emailDelivery)
        .set({
          leaseUntil: null,
          nextAttemptAt: new Date(clock().getTime() + Math.min(60, 2 ** row.attempts) * 60_000),
        })
        .where(eq(emailDelivery.key, row.key));
      failed++;
    }
    if (options.pauseMs) await new Promise((resolve) => setTimeout(resolve, options.pauseMs));
  }
  return { sent, failed };
}
