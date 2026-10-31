# Flat alternative to hill sessions implementation plan

**Goal:** Athletes without hills still get the stimulus of a hill session. When hills are excluded, the plan uses a flat session of short hard reps instead of an easy run.

**Problem today:** `allowHills: false` turns a hill session into an easy run (`personalize.ts:32`), so the athlete loses a quality session. The base phase always opens with hills (`generate.ts`, `qualityTypes`), so a no-hills athlete gets a weaker base phase.

Interval sessions are not changed. Their descriptions and steps do not assume a track: distances and paces work on any flat stretch with a watch.

**Architecture:** Keep the existing run types so stored plans, the validator and the UI stay compatible. No new run type, no new coaching rule, no migration. The substitute is an `intervals` workout.

- `flatPowerRun` builder: same rep count, work/recovery ratio and warm-up/cool-down as `hillRun`, with a description that needs no hill ("Run hard for 60 seconds on flat ground, then jog back to recover").
- `personalize.ts`: when `allowHills` is false, replace hills with this session instead of `easy`. Mandatory day types still win.
- `generate.ts`: use the same substitute on first generation, so both paths match.

**Constraints:** Existing plans change only through accepted proposals. Generation stays deterministic and passes the validator. `pnpm plan:matrix` must pass.

## Deliverables

- [x] `flatPowerRun` in `run-sessions.ts`, built from the same `HILLS` ladder as `hillRun`.
- [x] `generatePlan(input, { allowHills })` uses it at the correct progression index; `createPlanFromInput` passes the resolved rule. `personalize.ts` keeps its hills → easy fallback for the remaining cases (for example a preferred day type of hills). Tests in `personalize.test.ts` and `coaching-controls.test.ts`.
- [ ] `plan:matrix` cases for no-hills athletes across goals and experience levels.
- [ ] Check the `allowHills` rule text in the settings UI and `docs/mcp-connector.md`; mention the flat alternative.

## Verification contracts

- A no-hills athlete never receives a `hills` workout and never loses a quality slot because of that rule.
- Weekly hard-day spacing and volume checks still pass for every matrix case.
- Existing profiles and plans behave exactly as before.

## Later (separate plan)

- `get_weekly_review` MCP tool: structured facts (completion, missed key sessions, load change, consecutive hard days, recovery trend, active constraints) plus rule-derived `suggestedAdjustments`. Read-only; every write still goes through `propose_plan_changes`. Builds on `get_training_summary` and `get_workout_compliance`.
- Broader equipment profile (treadmill only, no gym, maximum session length).
