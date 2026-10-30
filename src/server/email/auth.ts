import { createHash, randomUUID } from "node:crypto";
import type { DB } from "../db/client";
import { deliverPendingEmails, enqueueEmail } from "./outbox";
import { accountEmail } from "./templates";
import { emailConfigured } from "./transport";

type Recipient = { id: string; name: string; email: string; emailVerified: boolean };
export type BackgroundTask = (task: Promise<unknown>) => void;

export function authEmailOptions(db: DB, baseUrl: string, background?: BackgroundTask) {
  if (!emailConfigured()) return {};

  async function dispatch(kind: "verify" | "reset" | "password-changed" | "welcome", user: Recipient, url: string) {
    const identity = kind === "welcome" ? user.id : kind === "password-changed" ? randomUUID() : url;
    const key = createHash("sha256").update(`${kind}:${identity}`).digest("hex");
    await enqueueEmail(db, {
      key, userId: user.id, kind, message: { to: user.email, ...accountEmail(kind, user.name, url) },
      ...(["verify", "reset"].includes(kind) ? { expiresAt: new Date(Date.now() + 60 * 60_000) } : {}),
    });
    const delivery = deliverPendingEmails(db, { key }).then(({ failed }) => {
      if (failed) console.error("Account email delivery failed; queued for retry.");
    }).catch(() => { console.error("Account email delivery could not finish; queued for retry."); });
    if (background) background(delivery);
    else await delivery;
  }

  return {
    emailAndPassword: {
      enabled: true, minPasswordLength: 8, revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }: { user: Recipient; url: string }) => { await dispatch("reset", user, url); },
      onPasswordReset: async ({ user }: { user: Recipient }) => { await dispatch("password-changed", user, `${baseUrl}/forgot-password`); },
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: false, expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }: { user: Recipient; url: string }) => { await dispatch("verify", user, url); },
      afterEmailVerification: async (user: Recipient) => { await dispatch("welcome", user, `${baseUrl}/onboarding`); },
    },
    databaseHooks: {
      user: { create: { after: async (user: Recipient) => {
        if (user.emailVerified) await dispatch("welcome", user, `${baseUrl}/onboarding`);
      } } },
    },
  };
}
