# Connect Claude (MCP)

Agent rules for this area: [`src/server/mcp/AGENTS.md`](../src/server/mcp/AGENTS.md).

## Setup

1. Deploy Grind and set `BETTER_AUTH_URL` to its public https address.
2. In Claude, open **Settings → Connectors → Add custom connector** and paste `<your address>/api/mcp`.
3. Sign in to Grind and choose what Claude can do. You can disconnect it any time in Grind → Settings.

Claude can read your plan, workouts, activities and recovery, and suggest changes. Suggestions only apply after you accept them.

## Scopes

- `plan:read`: look at the plan, workouts, runs, recovery, habits and strength log.
- `plan:write`: suggest changes (applied only after the athlete accepts), apply accepted suggestions, set coaching preferences and write coach notes.

## Tools

- `get_plan`, `get_week`, `get_workout`, `get_recent_activities` and `get_recovery` read the plan, recorded training and wellness.
- `get_athlete_context` returns preferences, mandatory constraints, reported limitations, revisions and supported strength focuses.
- `propose_plan_changes` suggests changes; `apply_plan_changes` applies one after the athlete clearly agrees, and `discard_plan_changes` drops it.
- `update_workout` and `bulk_update_workouts` create proposals for granular edits. Read `planRevision` first and pass it as `expectedRevision`.
- `validate_plan` previews without saving; `get_plan_diff` returns the saved before/after and weekly volume changes. The app's suggestion card also shows detailed changes.
- `set_coaching_preferences` replaces the complete profile using `expectedCoachingRevision`. Preferences produce warnings; constraints block changes. Saving rules does not rewrite existing workouts.
- `write_coach_notes` saves notes when asked.
- `get_weekly_review` reviews one Monday-to-Sunday week (default: last week if it had planned workouts, else this week; pass any date to pick another). It is computed by fixed rules, with no AI inside Grind: completion, missed key sessions (long run, quality), run-km change against the week before, consecutive hard days and hard weeks, recovery trend (`null` when the watch sent nothing, with units and source), extra activities that matched no workout, your coaching rules, and `suggestedAdjustments`. Each suggestion has a `reason`, a `status` (`ready` or `blocked` by one of your constraints), validator `warnings` for preferences, and `changes` that can be passed as-is to `propose_plan_changes`. It changes nothing; the plan only changes when you accept a proposal.
- `get_training_summary` and `get_workout_compliance` compare recorded training with the active plan, including activities that did not match a planned workout.
- `get_habits` shows the habits you track (schedule, this week, streak, recent adherence). Claude can read them but not tick them off.
- `get_strength_log` shows the sets you logged in strength workouts (kg, reps, volume, estimated one-rep max). Claude can read the log but not change it.

## Result format

Machine-readable MCP results use `structuredContent` with `success`, `data`, `warnings`, `errors` and, when applicable, `planRevision`. Existing text results and tool names remain available. Workout details include the raw `workout` object alongside readable steps and exercises. Distances use km at workout level and metres in steps; pace is seconds/km, step and rest durations are seconds. Strength exercises support optional numeric `rir` (0–5).

Strength focus values include `push`, `pull`, `legs`, `upper`, `lower`, `full`, `core`, `posterior_chain`, `chest_back`, `shoulders_arms` and the existing `legs_core`. A focus change rebuilds its template unless custom exercises are supplied. Granular run edits recalculate distance and duration from steps, including explicit target paces.

New plans use saved coaching rules to personalize generated session types, day-specific strength focuses and long-run variants. The selected calendar days remain explicit form inputs; incompatible mandatory schedule rules are reported instead of silently moving sessions. Existing plans only change through accepted proposals.

## Testing

`pnpm mcp:smoke` runs the OAuth flow and every MCP tool end to end against a running app.
