# Grind

One training plan for running and strength. Grind builds a plan for a 5K, 10K, half marathon or marathon, syncs what your watch recorded from [intervals.icu](https://intervals.icu), ticks off workouts automatically, and lets Claude act as your coach through an MCP connector.

- **Plans:** rule-based templates (paces from a recent race, phases, long-run progression, hard days spaced apart) with Runna-style strength sessions, checked by a validator.
- **intervals.icu:** reads runs, strength sessions, resting heart rate, HRV and sleep. Runs are matched to planned workouts.
- **Claude as coach:** an MCP server lets Claude read your training and propose validated workout changes, approved in the app or chat. It can also save coaching preferences and notes when asked.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind and shadcn/ui, Postgres on Neon with Drizzle, Better Auth (email sign-in and the OAuth server for MCP), the official MCP TypeScript SDK. The design system lives in [`grind-ds/`](grind-ds).

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # fill in the values, see below
pnpm db:migrate
pnpm dev
```

Without `DATABASE_URL` the app uses an embedded local Postgres (PGlite) stored in `.data/`.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Pooled Postgres URL (Neon). Used by the app. |
| `DATABASE_URL_UNPOOLED` | Direct Postgres URL. Used by migrations. |
| `BETTER_AUTH_SECRET` | Random secret, `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | The address the app is served from. It is also the OAuth issuer and the base of the MCP address. |
| `ENCRYPTION_KEY` | 32 random bytes, base64. Encrypts stored intervals.icu API keys. |
| `RESEND_API_KEY` | Server-only Resend key. Never use a `NEXT_PUBLIC_` prefix. |
| `EMAIL_FROM` | Sender on a verified Resend domain, e.g. `Grind <noreply@example.com>`. |
| `CRON_SECRET` | Random secret (at least 32 bytes) authorizing the email cron endpoint. |

## Account and training emails

Setting both `RESEND_API_KEY` and `EMAIL_FROM` enables email verification (including resend), password reset, reset confirmation and welcome emails. Email/password sign-in requires verification when delivery is configured. Existing unverified accounts can request a link from the sign-in flow or Settings. Existing sessions remain active until expiry; a password reset revokes all sessions. Google accounts verified by the provider receive a welcome email on signup. Auth links expire after one hour. Without email configuration, local email/password authentication keeps working without these flows.

**Settings → Account** has separate, initially off switches for weekly training recaps and upcoming-week previews. The recap covers the previous complete Monday–Sunday: synced run distance, completed plan workouts, strength sessions and scheduled habit adherence. The preview uses the next Monday–Sunday of the active plan, including phase, focus and sessions still planned. Unverified recipients are excluded; previews with no upcoming sessions are skipped. Each weekly email includes a signed unsubscribe link; GET shows confirmation and POST disables only that email type. Email clients can also use one-click unsubscribe.

Schedules use each athlete's saved IANA time zone, captured during onboarding and editable in email Settings: Monday at **07:00** for recaps and Sunday at **17:00** for previews. This app targets Vercel Hobby, so `vercel.json` deliberately has no built-in cron: Hobby rejects schedules more frequent than daily. A **Neon Function Trigger** runs `emailcron` every 15 minutes instead. The function accepts authenticated Neon scheduled invocations and calls the app's secured email endpoint, with a 270-second timeout and redirects disabled. It does not need Resend or database secrets of its own. No external scheduler is required.

With the Neon trigger enabled, DST and fractional UTC offsets are handled by `Intl`. Delivery normally begins within 15 minutes of the local scheduled time. A missed poll can catch up later on the same local scheduled day. Public callers cannot impersonate Neon triggers: Neon's deployed proxy strips client-supplied `x-neon-*` headers and the SDK validates the delivery. Unsuccessful app responses become failed Neon invocations; the existing outbox owns retry and deduplication.

To deploy the scheduler, copy `.env.neon-email.example` to the gitignored `.env.neon-email`. Set `CRON_TARGET_URL` to the canonical production HTTPS origin (no path), and `CRON_SECRET` to exactly the value set in Vercel. Leave `EMAIL_CRON_ENABLED=false` initially. Using an authenticated Neon CLI, run `npx neon deploy --branch production --env .env.neon-email --no-env-pull`; use the actual production branch name if different. This applies the function and a disabled trigger without replacing local database env values. Deploy the updated Vercel app and apply database migrations, then run `node --import=tsx scripts/check-email-cron.mts`. The authenticated readiness probe checks configuration and email tables without sending mail. Only after it passes, set `EMAIL_CRON_ENABLED=true` and rerun the same Neon deploy command. Confirm the enabled trigger and next run with `npx neon triggers list --branch production`. Scheduler secrets and enablement are never read from the local dev env implicitly; local and preview config defaults to a disabled trigger.

Outgoing mail is persisted before delivery, leased atomically, and sent using a stable Resend idempotency key. Failed messages get exponential retries (at most six attempts); auth links are never sent after expiry, and all delivery retries expire within 23 hours to stay inside Resend's idempotency window. Each cron run processes up to 40 messages with rate spacing. Delivery rechecks the recipient and weekly preferences, so unsubscribing also cancels queued weekly emails. Provider acceptance is recorded as sent; this does not guarantee inbox delivery. Check Resend's dashboard for delivery/bounce status.

Run the full suite with `pnpm test --maxWorkers=2` on memory-constrained machines. The lint config resolves Next's lint plugins from its own package so pnpm's isolated dependency layout works without a `NODE_PATH` override.

Run `pnpm db:migrate` against the intended database before starting the updated app. Set the three email variables plus the correct public `BETTER_AUTH_URL` in Vercel before deploying. They are **not** copied automatically from `.env.local`. The Neon function sends `Authorization: Bearer <CRON_SECRET>` on every app request. Local development has no automatic cron: invoke that endpoint with the same authorization header from an HTTP client to dispatch retries and due weekly emails, or simulate the Neon trigger through `neon dev`. The normal endpoint can send real emails to opted-in users; use `?check=1` for smoke tests.

To check the sender/key/template safely, run `node --conditions=react-server --import=tsx scripts/email-check.mts`. This sends to Resend's delivery simulator (`delivered@resend.dev`), not a user's inbox. Run `pnpm test src/server/email` for isolated account-flow, scheduling, outbox and security tests.

## Scripts

| Command | What it does |
|---|---|
| `pnpm test` | Unit tests (plan engine, sync, matching, plan edits, auth). |
| `pnpm typecheck` / `pnpm lint` | Type check and lint. |
| `pnpm db:generate` / `pnpm db:migrate` | Create and apply Drizzle migrations. |
| `pnpm plan:sample half` | Print a generated plan. |
| `pnpm smoke` | End-to-end check of sign-up, plans and workouts against a running app. |
| `pnpm mcp:smoke` | End-to-end check of the OAuth flow and every MCP tool against a running app. |

## Connect Claude

1. Deploy Grind and set `BETTER_AUTH_URL` to its public https address.
2. In Claude, open **Settings → Connectors → Add custom connector** and paste `<your address>/api/mcp`.
3. Sign in to Grind and choose what Claude can do. You can disconnect it any time in Grind → Settings.

Claude can read your plan, workouts, activities and recovery, and suggest changes. Suggestions only apply after you accept them.

The MCP connector also supports structured coaching:

- `get_athlete_context` returns preferences, mandatory constraints, reported limitations, revisions and supported strength focuses.
- `update_workout` and `bulk_update_workouts` create proposals for granular edits. Read `planRevision` first and pass it as `expectedRevision`.
- `validate_plan` previews without saving; `get_plan_diff` returns the saved before/after and weekly volume changes. The app's suggestion card also shows detailed changes.
- `set_coaching_preferences` replaces the complete profile using `expectedCoachingRevision`. Preferences produce warnings; constraints block changes. Saving rules does not rewrite existing workouts.
- `get_training_summary` and `get_workout_compliance` compare recorded training with the active plan, including activities that did not match a planned workout.
- `get_habits` shows the habits you track (schedule, this week, streak, recent adherence). Claude can read them but not tick them off.
- `get_strength_log` shows the sets you logged in strength workouts (kg, reps, volume, estimated one-rep max). Claude can read the log but not change it.

Machine-readable MCP results use `structuredContent` with `success`, `data`, `warnings`, `errors` and, when applicable, `planRevision`. Existing text results and tool names remain available. Workout details include the raw `workout` object alongside readable steps and exercises. Distances use km at workout level and metres in steps; pace is seconds/km, step and rest durations are seconds. Strength exercises support optional numeric `rir` (0–5).

Strength focus values include `push`, `pull`, `legs`, `upper`, `lower`, `full`, `core`, `posterior_chain`, `chest_back`, `shoulders_arms` and the existing `legs_core`. A focus change rebuilds its template unless custom exercises are supplied. Granular run edits recalculate distance and duration from steps, including explicit target paces.

New plans use saved coaching rules to personalize generated session types, day-specific strength focuses and long-run variants. The selected calendar days remain explicit form inputs; incompatible mandatory schedule rules are reported instead of silently moving sessions. Existing plans only change through accepted proposals.

## Install as an app

Grind includes a web app manifest, home-screen icons, and an install section in **Settings**. Chrome and Edge offer an install button when eligible; on iPhone and iPad, use Safari → Share → Add to Home Screen.

The service worker runs in production only, over HTTPS (or localhost). It caches static assets and a public offline page. Plans, signed-in pages, and API responses always use the network; viewing or editing training offline is not supported.

To check locally, run `pnpm build` followed by `pnpm start`. In browser DevTools, check Application → Manifest and Service Workers, open Settings to try installation, then enable offline mode and reload a page to check the fallback. Disable offline mode and use **Try again** to return. Mobile home-screen installation still needs a check on a real iOS or Android device.

Worker changes keep the `/sw.js` URL and revalidate on registration. Bump `VERSION` in `public/sw.js` when replacing precached content; activation removes obsolete Grind caches.
