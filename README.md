# Grind

One training plan for running and strength. Grind builds a plan for a 5K, 10K, half marathon or marathon, syncs what your watch recorded from [intervals.icu](https://intervals.icu), ticks off workouts automatically, and lets Claude act as your coach through an MCP connector.

- **Plans:** rule-based templates (paces from a recent race, phases, long-run progression, hard days spaced apart) with Runna-style strength sessions, checked by a validator.
- **intervals.icu:** reads runs, strength sessions, resting heart rate, HRV and sleep. Runs are matched to planned workouts.
- **Daily training:** Today and Calendar show recorded activities and manual sessions on their recorded local dates, including training outside the active plan. Activities already represented by a same-day plan card are not repeated. Additional training never completes another planned workout; plan progress and distance remain labeled separately.
- **Claude as coach:** an MCP server lets Claude read your training and propose validated workout changes, approved in the app or chat. It can also save coaching preferences and notes when asked.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind and shadcn/ui, Postgres on Neon with Drizzle, Better Auth (email sign-in and the OAuth server for MCP), the official MCP TypeScript SDK. The design system is described in [`DESIGN.md`](DESIGN.md).

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # fill in the values, see docs/deployment.md
pnpm db:migrate
pnpm dev
```

Without `DATABASE_URL` the app uses an embedded local Postgres (PGlite) stored in `.data/`.

See [docs/deployment.md](docs/deployment.md) for environment variables, CI/CD and production setup.

## Scripts

| Command                                | What it does                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm test`                            | Unit tests (plan engine, sync, matching, plan edits, auth).                  |
| `pnpm check`                           | Lint, format check and type check.                                           |
| `pnpm db:generate` / `pnpm db:migrate` | Create and apply Drizzle migrations.                                         |
| `pnpm plan:sample half`                | Print a generated plan.                                                      |
| `pnpm smoke`                           | End-to-end check of sign-up, plans and workouts against a running app.       |
| `pnpm mcp:smoke`                       | End-to-end check of the OAuth flow and every MCP tool against a running app. |

## Documentation

| Topic                                   | Where                                          |
| --------------------------------------- | ---------------------------------------------- |
| Architecture and data flow              | [docs/architecture.md](docs/architecture.md)   |
| Environment, CI/CD and deployment       | [docs/deployment.md](docs/deployment.md)       |
| Account and training emails, scheduler  | [docs/email.md](docs/email.md)                 |
| Connect Claude (MCP) and tool reference | [docs/mcp-connector.md](docs/mcp-connector.md) |
| Install as an app (PWA, service worker) | [docs/pwa.md](docs/pwa.md)                     |
| Working on this repo with coding agents | [AGENTS.md](AGENTS.md)                         |
