# Deployment and CI/CD

## Environment variables

Copy `.env.example` to `.env.local`. Without `DATABASE_URL` the app uses an embedded local Postgres (PGlite) stored in `.data/`.

| Variable                | What it is                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`          | Pooled Postgres URL (Neon). Used by the app.                                                     |
| `DATABASE_URL_UNPOOLED` | Direct Postgres URL. Used by migrations.                                                         |
| `BETTER_AUTH_SECRET`    | Random secret, `openssl rand -base64 32`.                                                        |
| `BETTER_AUTH_URL`       | The address the app is served from. It is also the OAuth issuer and the base of the MCP address. |
| `ENCRYPTION_KEY`        | 32 random bytes, base64. Encrypts stored intervals.icu API keys.                                 |
| `RESEND_API_KEY`        | Server-only Resend key. Never use a `NEXT_PUBLIC_` prefix.                                       |
| `EMAIL_FROM`            | Sender on a verified Resend domain, e.g. `Grind <noreply@example.com>`.                          |
| `CRON_SECRET`           | Random secret (at least 32 bytes) authorizing the email cron endpoint.                           |

Set the email variables plus the correct public `BETTER_AUTH_URL` in Vercel before deploying. They are **not** copied automatically from `.env.local`.

## CI/CD

`.github/workflows/ci.yml` runs on every pull request and push to `main`: lint, format check, typecheck, build and the test suite (database tests use in-memory PGlite and apply every migration in `drizzle/`). On push to `main`, after those pass, a `migrate` job runs `pnpm db:migrate` against the production Neon database. Vercel's Git integration builds and deploys the app.

Because the migration and the deploy run at the same time, old code briefly runs against the new schema. Write migrations expand-then-contract.

One-time setup: in the GitHub repo, create an environment named `production` and add the secret `DATABASE_URL_UNPOOLED` (the direct, non-pooler Neon connection string for the production branch). Optionally add required reviewers to that environment to gate migrations. The pnpm version is pinned once, in `package.json` (`packageManager`); CI reads it from there. Overrides live in `pnpm-workspace.yaml`.

## Migrations

Run `pnpm db:migrate` against the intended database before starting the updated app. Generate migrations with `pnpm db:generate` after editing `src/server/db/schema`; never edit an applied migration.

## Tooling notes

Run the full suite with `pnpm test --maxWorkers=2` on memory-constrained machines. Lint is Oxlint and formatting is Oxfmt (`pnpm format`, `pnpm format:check`).

## Email scheduler

See [email.md](email.md#deploying-the-scheduler).
