# Account and training emails

Agent rules for this area: [`src/server/email/AGENTS.md`](../src/server/email/AGENTS.md).

## Flows

Setting both `RESEND_API_KEY` and `EMAIL_FROM` enables email verification (including resend), password reset, reset confirmation and welcome emails. Email/password sign-in requires verification when delivery is configured. Existing unverified accounts can request a link from the sign-in flow or Settings. Existing sessions remain active until expiry; a password reset revokes all sessions. Google accounts verified by the provider receive a welcome email on signup. Auth links expire after one hour. Without email configuration, local email/password authentication keeps working without these flows.

**Settings → Account** has separate, initially off switches for weekly training recaps and upcoming-week previews. The recap covers the previous complete Monday–Sunday: synced run distance, completed plan workouts, strength sessions and scheduled habit adherence. The preview uses the next Monday–Sunday of the active plan, including phase, focus and sessions still planned. Unverified recipients are excluded; previews with no upcoming sessions are skipped. Each weekly email includes a signed unsubscribe link; GET shows confirmation and POST disables only that email type. Email clients can also use one-click unsubscribe.

## Scheduling

Schedules use each athlete's saved IANA time zone, captured during onboarding and editable in email Settings: Monday at **07:00** for recaps and Sunday at **17:00** for previews. This app targets Vercel Hobby, so `vercel.json` deliberately has no built-in cron: Hobby rejects schedules more frequent than daily. A **Neon Function Trigger** runs `emailcron` every 15 minutes instead. The function accepts authenticated Neon scheduled invocations and calls the app's secured email endpoint, with a 270-second timeout and redirects disabled. It does not need Resend or database secrets of its own. No external scheduler is required.

With the Neon trigger enabled, DST and fractional UTC offsets are handled by `Intl`. Delivery normally begins within 15 minutes of the local scheduled time. A missed poll can catch up later on the same local scheduled day. Public callers cannot impersonate Neon triggers: Neon's deployed proxy strips client-supplied `x-neon-*` headers and the SDK validates the delivery. Unsuccessful app responses become failed Neon invocations; the existing outbox owns retry and deduplication.

## Deploying the scheduler

Copy `.env.neon-email.example` to the gitignored `.env.neon-email`. Set `CRON_TARGET_URL` to the canonical production HTTPS origin (no path), and `CRON_SECRET` to exactly the value set in Vercel. Leave `EMAIL_CRON_ENABLED=false` initially. Using an authenticated Neon CLI, run `npx neon deploy --branch production --env .env.neon-email --no-env-pull`; use the actual production branch name if different. This applies the function and a disabled trigger without replacing local database env values. Deploy the updated Vercel app and apply database migrations, then run `node --import=tsx scripts/check-email-cron.mts`. The authenticated readiness probe checks configuration and email tables without sending mail. Only after it passes, set `EMAIL_CRON_ENABLED=true` and rerun the same Neon deploy command. Confirm the enabled trigger and next run with `npx neon triggers list --branch production`. Scheduler secrets and enablement are never read from the local dev env implicitly; local and preview config defaults to a disabled trigger.

## Delivery

Outgoing mail is persisted before delivery, leased atomically, and sent using a stable Resend idempotency key. Failed messages get exponential retries (at most six attempts); auth links are never sent after expiry, and all delivery retries expire within 23 hours to stay inside Resend's idempotency window. Each cron run processes up to 40 messages with rate spacing. Delivery rechecks the recipient and weekly preferences, so unsubscribing also cancels queued weekly emails. Provider acceptance is recorded as sent; this does not guarantee inbox delivery. Check Resend's dashboard for delivery/bounce status.

## Local development and checks

The Neon function sends `Authorization: Bearer <CRON_SECRET>` on every app request. Local development has no automatic cron: invoke that endpoint with the same authorization header from an HTTP client to dispatch retries and due weekly emails, or simulate the Neon trigger through `neon dev`. The normal endpoint can send real emails to opted-in users; use `?check=1` for smoke tests.

To check the sender/key/template safely, run `node --conditions=react-server --import=tsx scripts/email-check.mts`. This sends to Resend's delivery simulator (`delivered@resend.dev`), not a user's inbox. Run `pnpm test src/server/email` for isolated account-flow, scheduling, outbox and security tests.
