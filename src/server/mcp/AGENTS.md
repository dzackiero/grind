# MCP server rules

The MCP server is how Claude coaches athletes. Real clients depend on its tool names and result shapes, so treat it as a public API. User-facing reference: `docs/mcp-connector.md`.

## Structure

- `server.ts` builds one server per request for one athlete: `buildMcpServer({ db, userId, scopes })`. The route is `src/app/api/mcp/route.ts`, with OAuth from Better Auth.
- Tools are grouped in `server.ts`, `coaching-tools.ts`, `habit-tools.ts` and `strength-tools.ts`.
- `result.ts` holds the result envelope: `mcpText`, `mcpFail` and `mcpGuard`.

## Invariants

- **Scopes gate registration.** `plan:read` tools only read; `plan:write` tools register only when the token has that scope. Register a new tool inside the matching `scopes.has(...)` block.
- **Use `userId` from the context only.** Never take a user or athlete id as tool input, and scope every query by it.
- **Writes go through proposals.** Tools that change a plan create a proposal (`proposeChanges`, `update_workout`, `bulk_update_workouts`). `apply_plan_changes` accepts a proposal only after the athlete clearly agreed, and the plan is re-validated first. Never write workouts directly.
- **Optimistic concurrency.** Plan edits take `expectedRevision` (from `planRevision`), and coaching profile edits take `expectedCoachingRevision`. A mismatch is a `CONFLICT` error, not a retry-and-overwrite.
- **Preferences warn, constraints block.** Validation failures return the validator's errors and warnings.
- **Result envelope.** Wrap handlers in `mcpGuard` and return `mcpText` / `mcpFail`. `structuredContent` always carries `success`, `data`, `warnings`, `errors`, plus `planRevision` when relevant. Keep the text `content` too, for older clients.
- **Backward compatibility.** Don't rename or remove tools or fields. Add optional fields or new tools instead.
- **Annotations.** Set `readOnlyHint`, `destructiveHint` and `idempotentHint` accurately on every tool.
- **Descriptions are prompts.** Tool and field descriptions tell Claude how to behave (when to call, what to confirm with the athlete). Write them with that in mind.
- **Units.** Workout distance in km, step distance in metres, pace in seconds/km, durations in seconds, `rir` 0–5.

## Verify

- `pnpm vitest run src/server/mcp src/server/plans` covers this area.
- `pnpm mcp:smoke` runs the OAuth flow and every tool end to end against a running app (`pnpm dev`).
- When you add or change a tool, update the tool list in `docs/mcp-connector.md`.
