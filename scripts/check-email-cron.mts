// Authenticated read-only check: never queues or delivers mail.
// Run: node --import=tsx scripts/check-email-cron.mts
import { config } from "dotenv";
import { createRequire } from "node:module";
// This repo's .ts modules use CommonJS when run through tsx outside the bundler.
const { emailCronTarget } = createRequire(import.meta.url)(
  "../src/functions/email-cron.ts",
) as typeof import("../src/functions/email-cron");
config({ path: ".env.neon-email", quiet: true });
const target = emailCronTarget(process.env.CRON_TARGET_URL);
const secret = process.env.CRON_SECRET?.trim();
if (!target || !secret)
  throw new Error(
    "Set a public HTTPS CRON_TARGET_URL and matching CRON_SECRET in .env.neon-email.",
  );
target.searchParams.set("check", "1");
const response = await fetch(target, {
  headers: { Authorization: `Bearer ${secret}` },
  redirect: "manual",
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok)
  throw new Error(
    `Production email readiness check failed: HTTP ${response.status}. Check deployment, env and migrations before enabling the trigger.`,
  );
const data = (await response.json()) as { ready?: boolean };
if (data.ready !== true)
  throw new Error(
    "Endpoint did not confirm readiness. Deploy the updated email route before enabling the trigger.",
  );
console.log(`Email endpoint ready at ${target.origin}; no emails were sent.`);
