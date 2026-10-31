# AGENTS.md

Instructions for coding agents working on Grind. Keep this file short: every line is loaded into every session.

## Product

Grind is one training plan for running and strength. An athlete picks a goal (5K, 10K, half, marathon), Grind generates a rule-based plan, syncs what their watch recorded from intervals.icu, matches runs to planned workouts, and lets Claude act as a coach through an MCP connector.

The principle behind most design decisions: **the athlete stays in control.** Claude reads training data and _proposes_ changes; nothing in an existing plan changes until the athlete accepts a proposal. Every plan change passes the validator.

## Glossary

- **Plan:** a generated block of weeks for one goal, built from templates in `src/lib/plan`. One active plan per athlete.
- **Phase / week / workout:** a plan has phases (base, build, peak, taper), weeks, and workouts (run or strength) on calendar days.
- **Activity:** something recorded, synced from intervals.icu or logged manually. Not the same as a workout.
- **Match:** linking an activity to a planned workout, which marks it done (`src/lib/matching.ts`). Extra training never completes a different planned workout.
- **Proposal / plan change:** a pending edit to the plan, created by MCP tools or the app, applied only when accepted (`src/server/plans/changes.ts`).
- **`planRevision`:** optimistic-concurrency counter on the plan. Writers pass it as `expectedRevision`; a stale value is a conflict, not a silent overwrite.
- **Coaching profile:** athlete preferences (produce warnings) and constraints (block changes), with its own `coachingRevision`.
- **Strength focus:** `push`, `pull`, `legs`, `upper`, `lower`, `full`, `core`, `posterior_chain`, `chest_back`, `shoulders_arms`, `legs_core`.
- **Habit:** a recurring non-workout check-in with a schedule and streak.

## Commands

```bash
pnpm dev                    # http://localhost:3000; no env needed (embedded PGlite in .data/)
pnpm check                  # lint + format:check + typecheck
pnpm format                 # oxfmt, fixes formatting
pnpm test --maxWorkers=2    # vitest; DB tests use in-memory PGlite with every migration
pnpm vitest run <path>      # one file or directory while iterating
pnpm build                  # CI runs this too; needs no secrets
pnpm db:generate            # after editing src/server/db/schema
pnpm plan:matrix            # after changing plan templates or the validator
pnpm smoke / mcp:smoke      # end-to-end, against a running app
```

**Done means:** `pnpm check`, `pnpm test --maxWorkers=2` and `pnpm build` pass. Schema changes include a generated migration. Add or update colocated tests for behavior changes.

## Code map

- `src/app`: Next.js 15 App Router. `(app)/` is the signed-in app, `api/` the route handlers.
- `src/server`: server-only logic (`import "server-only"`), one folder per domain: `plans`, `intervals`, `mcp`, `email`, `habits`, `strength`, `history`, `progress`, `profile`, `account`, `auth`, `db`.
- `src/lib`: pure logic shared by client and server. `src/lib/plan` is the plan engine (generate, validate, edit, personalize).
- `src/components/ui`: shadcn components. `src/components/kilo`: app components.
- `src/functions`: Neon functions (the email cron trigger).
- `drizzle/`: generated SQL migrations. `grind-ds/`: design system reference.
- `docs/`: runbooks and architecture. `docs/superpowers/plans/`: implementation plans.

## Conventions

- Tests live next to source as `*.test.ts`.
- UI uses shadcn components and their variants (`@shadcn/lint` rules are errors). Add a variant rather than restyling at the call site.
- Every query on user data is scoped by `userId`. MCP tools get `userId` and `scopes` from the token; never accept a user id from tool input.
- Server code that touches the DB or secrets imports `"server-only"`.
- Units: workout distance in km, step distance in metres, pace in seconds/km, durations in seconds.

## Workflow

- Trunk-based: create a branch, open a PR to `main`. Never push to `main`.
- CI (`.github/workflows/ci.yml`) must pass. Merging to `main` deploys to Vercel and applies migrations to production.

## Boundaries

- Never read, print or commit `.env*` files other than the `.example` ones.
- Never run `db:migrate`, `neon deploy` or anything else against production. CI does that.
- Migrations are forward-only and run against production on merge: never edit an applied migration or `drizzle/meta/`; generate a new one. Prefer expand-then-contract, because old code briefly runs against the new schema.
- Never prefix secrets with `NEXT_PUBLIC_`.
- Don't add Vercel crons: the Hobby plan rejects them. Scheduling runs through a Neon Function Trigger.
- Don't bypass the plan validator or the proposal flow to change an existing plan.
- Bump `VERSION` in `public/sw.js` when changing precached content.

## Read more

- `docs/architecture.md`: how data flows from intervals.icu to plans and MCP.
- `docs/deployment.md`: environments, CI/CD, production setup.
- `docs/email.md`: email flows and the Neon scheduler runbook.
- `docs/mcp-connector.md`: connecting Claude and the tool reference.
- `docs/pwa.md`: install and service worker.
- `docs/agent-readiness.md`: roadmap for agent tooling.
- Nested rules: `src/server/mcp/AGENTS.md`, `src/server/email/AGENTS.md`.
