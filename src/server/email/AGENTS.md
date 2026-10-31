# Email rules

Email sends real mail to real people, and retries happen unattended. Full behavior and the scheduler runbook: `docs/email.md`.

## Structure

- `outbox.ts`: `enqueueEmail` persists a message, and `deliverPendingEmails` leases and sends due messages.
- `transport.ts`: Resend client (`emailConfigured`, `sendEmail`). Server-only.
- `auth.ts`: verification, password reset and welcome emails. `weekly.ts`: recaps and previews. `templates.ts`: content.
- `preferences.ts` and `unsubscribe.ts`: per-type opt-in and signed unsubscribe tokens.
- The trigger is `src/app/api/cron/email/route.ts` (bearer `CRON_SECRET`), called every 15 minutes by the Neon function in `src/functions/email-cron.ts`.

## Invariants

- **Persist before sending.** Every email goes through `enqueueEmail`. Never call `sendEmail` directly from a feature.
- **Idempotent delivery.** Each message uses a stable Resend idempotency key. Rows are leased atomically so concurrent runs can't double-send.
- **Bounded retries.** At most 6 attempts with exponential backoff, and every retry ends within 23 hours of enqueueing, inside Resend's 24-hour idempotency window. Auth links are never sent after they expire (1 hour).
- **Recheck at delivery.** Delivery re-reads the recipient, verification status and weekly preferences, so unsubscribing cancels queued mail. Keep that check when adding new email types.
- **Weekly emails are opt-in**, use the athlete's IANA time zone, and carry a signed unsubscribe link (GET confirms, POST disables only that type).
- **Graceful without config.** Without `RESEND_API_KEY` and `EMAIL_FROM`, email flows are skipped and auth still works.
- **No Vercel cron.** Scheduling stays in the Neon trigger.

## Verify

- `pnpm vitest run src/server/email src/functions` runs isolated tests and never sends mail.
- Never hit the cron endpoint without `?check=1` outside tests: it can send real emails to opted-in users.
- `node --conditions=react-server --import=tsx scripts/email-check.mts` sends only to Resend's simulator, and only when a human asks for it.
