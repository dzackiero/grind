import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import type { EmailMessage } from "../../email/transport";

export const emailPreference = pgTable("email_preference", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  weeklyRecap: boolean("weekly_recap").notNull().default(false),
  weeklyPreview: boolean("weekly_preview").notNull().default(false),
});

export const emailDelivery = pgTable("email_delivery", {
  key: text("key").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["verify", "reset", "password-changed", "welcome", "weekly-recap", "weekly-preview"] }).notNull(),
  message: jsonb("message").$type<EmailMessage>().notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
}, (t) => [index("email_delivery_pending").on(t.nextAttemptAt)]);
