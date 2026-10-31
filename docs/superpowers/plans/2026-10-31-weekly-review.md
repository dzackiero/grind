# Weekly review tool implementation plan

**Goal:** A read-only MCP tool `get_weekly_review` (scope `plan:read`) that gives the athlete's own Claude trustworthy, deterministic facts about one training week, plus rule-derived suggested adjustments Claude can turn into a proposal.

**Principle:** Grind never calls an LLM. No API keys, no BYOK. The tool computes facts and applies fixed rules; Claude does the reasoning and the athlete approves any change. The tool never writes.

## Architecture

- `src/lib/weekly-review.ts` (pure, no DB): week selection, completion, missed key sessions, load change, hard days/weeks, recovery trend, and the suggestion rules. Takes plain rows in, returns plain data out. Lives outside `src/lib/plan`, which is not touched.
- `src/server/progress/weekly-review.ts` (`server-only`): loads data scoped by `userId`, reusing `getTrainingSummary` and `getWorkoutCompliance` (the services behind `get_training_summary` and `get_workout_compliance`), `listWellnessBetween`, `getCoachingProfile` and `getActivePlan`. Then dry-runs each suggestion through `previewPlanChanges` (read-only) so constraints and preferences come from the real validator.
- `src/server/mcp/coaching-tools.ts`: registers `get_weekly_review` in the `plan:read` block, wrapped in `mcpGuard`, returned with `mcpText`. No user id in the input.

## Definitions (all deterministic)

- **Week:** Monday to Sunday. Input `week` is any `YYYY-MM-DD` inside the wanted week. Default: last week if it had planned workouts, otherwise the current week. A week that starts after today is rejected.
- **Missed:** planned workout that is `skipped`, or still `planned` with a date before today.
- **Key session:** long run, or a tempo, intervals or hills run.
- **Hard day:** a completed long, tempo, intervals, hills or race run. Consecutive hard days are adjacent calendar days. A **hard week** has two or more hard days, or run km at least 10% above the week before. Streak counts back up to four weeks.
- **Load change:** actual run km this week vs the previous week from the training summary; `null` when the previous week has no distance.
- **Recovery:** wellness rows from intervals.icu; this week's averages vs the 21 days before. `null` when the week has no rows; each field `null` when missing. Strained when at least two of resting HR (+5 bpm), HRV (−15%), sleep (−1 h) are present and worse.

## Suggestions

Each has `code`, `reason`, `status` (`ready` | `blocked`), `changes` (valid `EditOp[]` for `propose_plan_changes`, or `[]` for advice-only), `warnings`, `blockedBy`.

1. `long_run_missed`, `quality_missed`: move the missed session to the next free day this week that respects rest days and run days and does not touch a hard day; advice-only when the week is over.
2. `hard_weeks_in_a_row` (2 or more), `load_spike` (over 15%), `recovery_strained`: ease next week by turning its first quality run into an easy run, or trimming the long run by 10%.
3. `hard_days_back_to_back`: upcoming back-to-back hard days; move the second to a free day.

Identical `changes` merge into one suggestion with joined reasons. Every suggestion with changes is dry-run via `previewPlanChanges`: validator errors (constraints) set `status: "blocked"` with the errors; warnings (preferences) are attached. Edits that cannot be built (locked or past) also come back blocked. Suggestions are not applied and are never stored.

## Deliverables

- [ ] Pure module with unit tests for every rule and edge (no data, null recovery, no previous week).
- [ ] Server service with DB tests, including user A cannot read user B's review.
- [ ] Tool registration with scope test and structured envelope test; read-only annotation.
- [ ] `docs/mcp-connector.md` tool list; instructions line in `server.ts`; `scripts/mcp-smoke.mts` expects and calls the tool.
- [ ] `pnpm check`, `pnpm test --maxWorkers=2`, `pnpm build`.
