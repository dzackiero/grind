# Kilo

One training plan for running and strength. Kilo builds a plan for a 5K, 10K, half marathon or marathon, syncs what your watch recorded from [intervals.icu](https://intervals.icu), ticks off workouts automatically, and lets Claude act as your coach through an MCP connector.

- **Plans:** rule-based templates (paces from a recent race, phases, long-run progression, hard days spaced apart) with Runna-style strength sessions, checked by a validator.
- **intervals.icu:** reads runs, strength sessions, resting heart rate, HRV and sleep. Runs are matched to planned workouts.
- **Claude as coach:** an MCP server lets Claude read your plan and suggest changes. Nothing changes until you accept it in the app.

## Stack

Next.js 15 (App Router), TypeScript, Tailwind and shadcn/ui, Postgres on Neon with Drizzle, Better Auth (email sign-in and the OAuth server for MCP), the official MCP TypeScript SDK. The design system lives in [`kilo-ds/`](kilo-ds).

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

1. Deploy Kilo and set `BETTER_AUTH_URL` to its public https address.
2. In Claude, open **Settings → Connectors → Add custom connector** and paste `<your address>/api/mcp`.
3. Sign in to Kilo and choose what Claude can do. You can disconnect it any time in Kilo → Settings.

Claude can read your plan, workouts, activities and recovery, and suggest changes. Suggestions only apply after you accept them.

## Install as an app

Kilo includes a web app manifest, home-screen icons, and an install section in **Settings**. Chrome and Edge offer an install button when eligible; on iPhone and iPad, use Safari → Share → Add to Home Screen.

The service worker runs in production only, over HTTPS (or localhost). It caches static assets and a public offline page. Plans, signed-in pages, and API responses always use the network; viewing or editing training offline is not supported.

To check locally, run `pnpm build` followed by `pnpm start`. In browser DevTools, check Application → Manifest and Service Workers, open Settings to try installation, then enable offline mode and reload a page to check the fallback. Disable offline mode and use **Try again** to return. Mobile home-screen installation still needs a check on a real iOS or Android device.

Worker changes keep the `/sw.js` URL and revalidate on registration. Bump `VERSION` in `public/sw.js` when replacing precached content; activation removes obsolete Kilo caches.
