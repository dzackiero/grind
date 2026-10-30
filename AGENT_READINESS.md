# Agent readiness for Grind

How to make this repo fast and safe for coding agents (Claude Code, Codex, Copilot coding agent, Cursor, and so on). These are the patterns that held up for SaaS repos through 2026. Each item says what Grind already has and what to add next.

> Snapshot: 2026-10-30. Agent tools change monthly. Check action versions and pricing before adopting.

---

## 1. The core idea

An agent works fastest when the repo answers three questions without a human:

1. **How do I run, test and check this?** One command for each, documented in a file the agent reads automatically.
2. **Did my change work?** Fast, deterministic feedback: types, lint, unit tests, a real preview URL.
3. **What must I never do?** Guardrails enforced by tooling (hooks, CI, branch protection), not only by prose.

Everything below falls under one of these.

---

## 2. Current state

| Area                                                           | Status | Notes                                                      |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| One-command scripts (`lint`, `typecheck`, `test`, `build`)     | ✅     | `package.json`                                             |
| CI on every PR                                                 | ✅     | `.github/workflows/ci.yml`: lint, typecheck, build, vitest |
| Tests need no secrets                                          | ✅     | PGlite in memory, applies every migration                  |
| Local dev needs no secrets                                     | ✅     | PGlite fallback in `.data/`                                |
| Migrations on deploy                                           | ✅     | `migrate` job, gated on the `production` environment       |
| Dependency updates                                             | ✅     | Dependabot, weekly, grouped                                |
| Smoke scripts                                                  | ✅     | `smoke`, `mcp:smoke`, `intervals:check`                    |
| Plans and specs in repo                                        | ✅     | `docs/superpowers/plans/`                                  |
| **Agent instruction file** (`AGENTS.md` / `CLAUDE.md`)         | ❌     | Highest-value gap                                          |
| Shared agent settings (`.claude/settings.json`, hooks, skills) | ⚠️     | Only `launch.json`                                         |
| Per-PR preview environment with its own DB                     | ⚠️     | Vercel previews exist, no Neon branch per PR               |
| End-to-end / browser tests                                     | ❌     | No Playwright                                              |
| AI review and `@claude` on issues/PRs                          | ❌     |                                                            |
| PR / issue templates, CODEOWNERS                               | ❌     |                                                            |
| Supply-chain hardening (pinned actions, secret scanning)       | ⚠️     | Actions pinned to tags, not SHAs                           |
| Formatter                                                      | ❌     | No Prettier/Biome. Agents produce noisy diffs without one  |

---

## 3. Instruction files (do this first)

### `AGENTS.md` at the root

`AGENTS.md` is the cross-tool convention (read by Codex, Copilot, Cursor, Gemini CLI, Jules, Amp, and others). Claude Code reads `CLAUDE.md`, so keep one source of truth and make `CLAUDE.md` contain a single line: `@AGENTS.md`.

Keep it short (under about 150 lines). Agents load it into every session, so each line costs tokens. Contents:

- **Commands:** `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test -- path/to/file`, `pnpm db:generate`, `pnpm db:migrate`.
- **Definition of done:** "`pnpm lint && pnpm typecheck && pnpm test` passes; schema changes include a generated migration in `drizzle/`; UI changes use shadcn components and `grind-ds` tokens."
- **Architecture map:** `src/app` (routes), `src/server` (server-only logic, DB access), `src/lib` (pure logic plus colocated `*.test.ts`), `src/functions` (Neon functions), `drizzle/` (migrations, never hand-edit `meta/`), `grind-ds/` (design system).
- **Rules that bite:** never edit an applied migration, generate a new one; never prefix secrets with `NEXT_PUBLIC_`; MCP tool changes must keep the validator; the plan generator is rule-based, so changes need `pnpm plan:matrix`.
- **Workflow:** trunk-based, branch + PR to `main`, never push to `main`.

### Nested files

Add a small `AGENTS.md` in a directory only when it has rules of its own, for example `src/server/mcp/AGENTS.md` (tool schemas, OAuth scopes) or `drizzle/AGENTS.md` (migration rules). Agents load these only when they work in that directory.

### Keep it true

Instruction files rot. Add a CI check or a monthly scheduled agent that confirms every command in `AGENTS.md` still exists in `package.json`.

---

## 4. Shared agent config (`.claude/`)

Commit to the repo so every session and every teammate gets it:

- **`.claude/settings.json`:** allow the read-only and check commands (`pnpm lint`, `pnpm typecheck`, `pnpm test*`, `git diff*`, `git status`) so agents don't stop for permission. Deny `pnpm db:migrate` against production, reading `.env*`, and `git push --force`.
- **Hooks:**
  - `PostToolUse` on `Edit|Write`: run the formatter and `eslint --fix` on the touched file. Formatting stops being the agent's job.
  - `Stop`: run `pnpm typecheck` and the related tests; on failure, feed the error back so the agent keeps going instead of declaring victory.
  - `PreToolUse`: block writes to `.env*` and `drizzle/meta/*`.
- **Skills** (`.claude/skills/<name>/SKILL.md`): repeatable procedures loaded only when relevant. Good candidates here:
  - `add-migration`: edit schema → `db:generate` → review SQL → run tests.
  - `add-mcp-tool`: schema, validator, OAuth scope, `mcp:smoke`.
  - `ui-component`: shadcn add + `grind-ds` tokens + preview.
- **Subagents** (`.claude/agents/*.md`): a read-only `reviewer` and a `test-writer` with narrow tool access.
- **`.mcp.json`:** project MCP servers everyone needs: Neon (DB branches, schema diff), Linear (issues), Playwright or a browser MCP (verify UI), Vercel (deploy logs). Use OAuth, never commit tokens.
- **`.gitignore`:** keep `.claude/settings.local.json` and `CLAUDE.local.md` personal.

---

## 5. Fast, honest feedback loops

Agent speed is mostly the speed of the check loop.

1. **Formatter:** add Biome or Prettier plus a `format` script. Removes most review noise from agent diffs.
2. **Scoped checks:** document `pnpm vitest related <files>` and `pnpm vitest run <path>` so agents don't run the whole suite each iteration.
3. **E2E with Playwright:** a few critical flows (sign-in as guest, onboarding → plan, log a workout, approve an MCP change). Run against the Vercel preview URL in CI. Agents can also run them locally to verify UI work.
4. **Seed data:** `dev:seed` exists. Add a deterministic `pnpm db:seed` that any agent or preview branch can run.
5. **Typed env:** validate env with zod at startup so a missing variable fails loudly instead of at runtime deep in a request.
6. **Make failures readable:** short reporters in CI (`--reporter=github-actions` for vitest) so an agent reading logs finds the error quickly.

---

## 6. CI/CD for an app like this (GitHub Actions)

Target pipeline:

```
PR opened / pushed
 ├─ check        lint · typecheck · format check · unit tests (PGlite)      ~3 min
 ├─ build        next build (cached)
 ├─ db-branch    Neon branch "preview/pr-<n>" from production, run migrations
 ├─ preview      Vercel preview pointed at that branch (env var injected)
 ├─ e2e          Playwright against the preview URL
 ├─ schema-diff  Neon schema diff posted as PR comment
 ├─ security     CodeQL · dependency review · secret scan · zizmor (workflow lint)
 └─ ai-review    Claude review comment (advisory, not blocking)
merge to main (merge queue)
 ├─ check again on the merged result
 ├─ migrate      production (exists today)
 └─ Vercel production deploy + post-deploy smoke (pnpm smoke against prod URL)
PR closed
 └─ delete Neon branch
```

### Specific additions

| Workflow            | Use                                                                                                            | Notes                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `neon-preview.yml`  | `neondatabase/create-branch-action`, `delete-branch-action`, `schema-diff-action`                              | Every PR and every agent gets an isolated real Postgres. Alternatively use the Neon ↔ Vercel integration, which does this automatically. |
| `e2e.yml`           | Playwright, triggered on `deployment_status` success from Vercel                                               | Upload trace on failure so agents can read it.                                                                                           |
| `claude.yml`        | `anthropics/claude-code-action@v1`                                                                             | Responds to `@claude` in issues/PR comments: implements, opens a PR, answers questions. Reads `AGENTS.md`/`CLAUDE.md`.                   |
| `claude-review.yml` | same action, `pull_request` trigger with a review prompt                                                       | Automatic review. Keep it advisory; humans or required checks gate merges.                                                               |
| `security.yml`      | `github/codeql-action`, `actions/dependency-review-action`, gitleaks or GitHub secret scanning push protection |                                                                                                                                          |
| `post-deploy.yml`   | after production deploy: `pnpm smoke` and `pnpm mcp:smoke` against the live URL                                | Roll back via Vercel instant rollback on failure.                                                                                        |
| Scheduled agents    | cron workflows or Claude Code scheduled routines                                                               | Weekly: dependency PR triage, flaky-test hunt, `AGENTS.md` freshness, dead-code sweep.                                                   |

### Repo settings that make agent PRs safe

- Branch protection / rulesets on `main`: required checks (`check`, `e2e`), 1 approval, linear history.
- **Merge queue:** many agent PRs land in parallel; the queue retests each on top of the others.
- `CODEOWNERS`: `drizzle/`, `src/server/mcp/`, `.github/` need human review.
- Pin third-party actions to commit SHAs (Dependabot keeps them updated). Set `permissions:` per job, default `contents: read`.
- Use OIDC instead of long-lived cloud tokens where providers support it.
- `production` environment with required reviewers for the `migrate` job.

---

## 7. Parallel agents

Most of the 2026 speed-up comes from running several agents at once, not from one faster agent.

- **Git worktrees:** one worktree per task (Claude Code `--worktree`, Codex, Conductor, T3 Code). The PGlite fallback already lets each worktree run with no shared state; set a different port per worktree.
- **Neon branch per agent:** when a task needs real Postgres data, give each agent its own branch (instant copy-on-write). The Neon MCP can create and delete them.
- **Cloud agents:** Claude Code on the web, Codex cloud, and Copilot coding agent run in their own sandboxes from an issue. They need a setup script: add `.github/workflows/copilot-setup-steps.yml` for Copilot (and the equivalent environment config for other cloud agents) that runs `pnpm install --frozen-lockfile`.
- **Issue → PR loop:** write issues as small specs with acceptance criteria (Linear or GitHub), assign to an agent, review the PR. Templates in `.github/ISSUE_TEMPLATE/` that ask for "acceptance criteria" and "how to verify" improve agent output noticeably.
- **Plans in repo:** keep doing `docs/superpowers/plans/`. Larger tasks: plan → human approves → agent executes.

---

## 8. SaaS-specific best practices agents should follow

Encode these in `AGENTS.md` or CI so they don't depend on memory:

- **Multi-tenant safety:** every query on user data is scoped by `userId`. Add tests that user A cannot read user B's data, especially through MCP tools.
- **Migrations:** expand-then-contract (add column → backfill → switch code → drop later). Never a destructive change in the same deploy as the code that stops using it. The `migrate` job runs alongside the Vercel deploy, so old code briefly runs against the new schema.
- **Feature flags** for risky changes (Vercel Flags, or a simple DB flag) so agent work can merge dark.
- **Observability:** error tracking (Sentry or similar) and structured logs. Connect them through MCP so an agent can read the production error behind a bug report.
- **Rate limits and auth:** exist already (`0011_rate_limit`, Better Auth). Document where so new endpoints reuse them.
- **Secrets:** only in Vercel/GitHub environments. Agents get `.env.example`, never real values.
- **Emails and crons:** keep `email-check`-style dry-run scripts so agents can verify without sending real mail.

---

## 9. Suggested order

1. `AGENTS.md` + `CLAUDE.md` (`@AGENTS.md`). One hour, largest effect.
2. Formatter + `.claude/settings.json` with hooks and allowlist.
3. `claude.yml` (`@claude`) and an advisory review workflow.
4. Neon branch per PR + schema diff.
5. Playwright E2E against previews.
6. Rulesets, merge queue, CODEOWNERS, SHA-pinned actions, security workflow.
7. Skills for migrations, MCP tools, UI components.
8. Scheduled maintenance agents.
