# Coaching controls implementation plan

**Goal:** Support common strength patterns and make the existing proposal-based MCP coaching flow editable and verifiable at workout level.

**Architecture:** Keep one validated plan model and the existing propose/accept lifecycle. Expand strength templates and pure edit operations; store coaching preferences separately from mandatory constraints. Both proposing and accepting validate the full resulting plan and current coaching rules. Expose structured data alongside existing human-readable responses.

**Constraints:** Existing plans and MCP tool names remain compatible. No example coaching preferences are saved to real accounts. Completed, skipped, race, and past workouts remain protected. A proposal never applies itself. Database migrations are verified and applied to production before the application rollout.

## Deliverables

- [x] Common strength focus values, real templates, and centralized lower-body classification; test each equipment/phase combination and placement warnings.
- [x] Granular workout patch and bulk filtered edit operations with atomic before/after output; test locked/race/date/field validation and step-distance consistency.
- [x] Structured preferences versus constraints with separate warning/error evaluation; test future dates, weekdays, focus, progression and quality windows.
- [x] Persist coaching profiles and revision snapshots through Drizzle migrations; preserve defaults for existing athletes.
- [x] Shared preview/validation/diff services, revision checks, accept-time progress protection, and transactional write locking; integration tests cover stale proposals and concurrent edits.
- [x] MCP tools for coaching context, preferences, granular/bulk proposals, validation, diff, training summary and compliance. Existing tools gain structured workout and validation output without removing legacy fields.
- [x] Run unit/integration tests, lint, typecheck, production build and MCP smoke flow. Review changes and migrate production before rollout.

Validation: 472 tests passed; lint, TypeScript, production build and the OAuth/MCP smoke flow passed. Production migrations 0004 and 0005 applied and verified before release. Generated-plan personalization preserves selected calendar slots. Detailed proposal review exposes before/after steps, exercises, notes and RIR.

## Verification contracts

- An edit from a stale plan or coaching revision cannot be accepted.
- Mandatory constraints block changes; preferences return warnings.
- Custom steps and declared distance must agree; templates recalculate derived fields.
- New focus values work in the schema, builder, edits, validator and MCP output.
- Read-only OAuth clients cannot access mutation tools.
- Summary/compliance dates use the athlete timezone; missing measurements remain null and include units/source.
