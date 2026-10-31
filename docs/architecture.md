# Architecture

How Grind's pieces fit together. For setup and commands see the [README](../README.md); for agent rules see [`AGENTS.md`](../AGENTS.md).

## Stack

Next.js 15 (App Router), TypeScript, Tailwind and shadcn/ui, Postgres on Neon with Drizzle, Better Auth (email and Google sign-in, plus the OAuth server for MCP), and the official MCP TypeScript SDK. Locally, and in tests, the database is embedded PGlite. Hosting is Vercel; email goes through Resend, scheduled by a Neon Function Trigger.

## Data flow

```
onboarding form ──► src/lib/plan (generate → personalize → validate) ──► plans/service.savePlan ──► Postgres
                                                                                 ▲
intervals.icu ──► intervals/sync.syncIntervals ──► activities, wellness ──► matchActivePlan (src/lib/matching)
                                                                                 │ marks workouts done
app UI (Today, Calendar, History) ◄── server queries ◄───────────────────────────┘

Claude ──► /api/mcp (OAuth, scopes) ──► mcp/server ──► reads, or plans/changes.proposeChanges
                                                                │
athlete accepts in app or chat ──► resolveChange ──► validate again ──► savePlan (revision + 1)
```

## Modules

| Area           | Where                                     | Responsibility                                                                                                           |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Plan engine    | `src/lib/plan`                            | Pure functions: templates, paces from a recent race, phases (base, build, peak, taper), strength sessions, edits, validator. |
| Plans          | `src/server/plans`                        | Persisting plans, workout status, proposals (`changes.ts`), previews.                                                    |
| intervals.icu  | `src/server/intervals`                    | Encrypted API key, sync of activities and wellness, best efforts, activity detail.                                       |
| Matching       | `src/lib/matching.ts`                     | Links recorded activities to planned workouts. Extra training never completes a different workout.                       |
| Auto-sync      | `src/lib/auto-sync.ts`                    | Client timer that syncs when the app is in the foreground and online.                                                    |
| Coaching       | `src/server/profile`, `src/lib/coaching.ts` | Coaching preferences and constraints, with their own revision.                                                         |
| MCP            | `src/server/mcp`                          | Claude-facing tools. See its [`AGENTS.md`](../src/server/mcp/AGENTS.md).                                                 |
| Email          | `src/server/email`, `src/functions`       | Outbox, auth and weekly emails, Neon cron function. See its [`AGENTS.md`](../src/server/email/AGENTS.md).                |
| Habits, strength, history, progress | `src/server/*`         | Feature-specific queries and services.                                                                                   |
| Auth           | `src/server/auth`                         | Better Auth setup, rate limits, guest accounts.                                                                          |
| DB             | `src/server/db`, `drizzle/`               | Drizzle schema (`schema/app.ts`, `auth.ts`, `email.ts`) and generated migrations.                                        |

## Key design choices

- **Rule-based plans, checked by a validator.** Plans come from templates and rules, not a model. Any change (generated, edited or proposed) must pass `validatePlan`. `pnpm plan:matrix` counts validator warnings across every template combination.
- **Proposals, not writes.** Claude and other automated edits create pending changes. Applying one re-validates against the current plan and bumps its revision, so stale proposals fail instead of overwriting.
- **Optimistic concurrency.** Plans and coaching profiles carry revisions; writers send the revision they read.
- **No secrets needed for dev or CI.** PGlite stands in for Postgres, and email is skipped when Resend isn't configured.
