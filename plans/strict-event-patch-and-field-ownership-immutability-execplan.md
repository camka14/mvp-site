# Enforce Event Patch Safety and Field Ownership Immutability

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, event update and scheduling flows will no longer be able to accidentally strip a field's owning organization when clients submit stale nested field objects. Field ownership (`Fields.organizationId`) becomes immutable during non-create updates, and both the event PATCH path and schedule upsert path preserve existing ownership for already-created fields. The user-visible effect is that rebuilding/rescheduling events cannot silently null out field ownership, and field updates that attempt to mutate ownership are rejected clearly.

## Progress

- [x] (2026-04-01 21:18Z) Audited all write paths that can mutate field ownership (`PATCH /api/events/[eventId]`, `POST /api/events/[eventId]/schedule` via repository upsert, and `PATCH /api/fields/[id]`).
- [x] (2026-04-01 21:29Z) Implemented ownership-preserving field upsert behavior in event PATCH route and repository upsert.
- [x] (2026-04-01 21:31Z) Enforced field PATCH immutability for `organizationId` and server-managed identity/timestamp keys.
- [x] (2026-04-01 21:35Z) Added/updated backend tests for ownership preservation and immutable-field patch rejection.
- [x] (2026-04-01 21:42Z) Ran targeted backend suites and confirmed passing results.

## Surprises & Discoveries

- Observation: The schedule route can mutate fields through `upsertEventFromPayload` when `eventDocument` is provided, so fixing only event PATCH is insufficient.
  Evidence: `src/app/api/events/[eventId]/schedule/route.ts` calls `upsertEventFromPayload(eventDocument, tx)`.

- Observation: Existing event PATCH tests currently validate nested `fields` and `timeSlots` persistence, so strict rejection of all nested relations would break current schedule-edit behavior unless client migration ships in lockstep.
  Evidence: `src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts` has assertions for `fieldsMock.upsert` and `timeSlotsMock.upsert`.

- Observation: Running Jest from the UNC workspace path fails in this environment because Windows `cmd` cannot execute from UNC and does not resolve `jest`.
  Evidence: `npm test` from `\\wsl.localhost\...` returned `UNC paths are not supported` and `'jest' is not recognized`; running via `wsl bash -lc` succeeded.

## Decision Log

- Decision: Preserve existing field ownership on update, even when incoming payload has null/mismatched field organization data.
  Rationale: This closes the production bug without breaking existing schedule-edit payload shape immediately.
  Date/Author: 2026-04-01 / Codex

- Decision: Enforce immutability on direct field PATCH for ownership/system columns instead of silently ignoring writes.
  Rationale: Explicit 400 responses make incorrect clients visible and easier to fix.
  Date/Author: 2026-04-01 / Codex

## Outcomes & Retrospective

Completed for this milestone. Event PATCH (`src/app/api/events/[eventId]/route.ts`) and repository upsert (`src/server/repositories/events.ts`) now preserve existing field ownership for already-created fields, even when nested payload fields omit or mismatch `organizationId`. Direct field PATCH (`src/app/api/fields/[id]/route.ts`) now rejects immutable key updates (`id`, `$id`, `organizationId`, `createdAt`, `updatedAt`) with a clear 400 response. New/updated tests passed:

- `src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts`
- `src/server/repositories/__tests__/events.upsert.test.ts`
- `src/app/api/fields/[id]/__tests__/route.test.ts`

## Context and Orientation

The affected backend paths are:

- `src/app/api/events/[eventId]/route.ts` (`PATCH`) where nested `fields` payloads are currently upserted and can overwrite `organizationId`.
- `src/server/repositories/events.ts` (`upsertEventFromPayload`) used by schedule and create flows; it also upserts fields and currently writes `organizationId` directly from payload values.
- `src/app/api/fields/[id]/route.ts` where field updates currently allow `organizationId` in patch payload.

Tests that must move with these changes:

- `src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts`
- `src/app/api/fields/__tests__/fieldRoutes.test.ts` and/or a new `[id]` patch test.

## Plan of Work

Implement ownership-safe upserts first by loading existing field ownership for incoming IDs and using that persisted ownership for updates. Only create operations may assign ownership from payload/event context. Then tighten `PATCH /api/fields/[id]` to reject ownership/system-field mutation attempts. Finally, update tests to assert preserved ownership and immutable-field patch rejection.

## Concrete Steps

From `mvp-site` root:

1. Edit `src/app/api/events/[eventId]/route.ts` to preserve existing field ownership during nested-field upsert.
2. Edit `src/server/repositories/events.ts` to preserve existing field ownership during `upsertEventFromPayload`.
3. Edit `src/app/api/fields/[id]/route.ts` to reject immutable field updates.
4. Update tests and run:
   - `npm test -- src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts`
   - `npm test -- src/app/api/fields/__tests__/fieldRoutes.test.ts`

## Validation and Acceptance

Acceptance is met when:

- Rebuilding/rescheduling an event cannot change an existing field's `organizationId` to null or another org via nested event payload.
- `PATCH /api/fields/[id]` returns `400` when `organizationId` (or server-managed identity/timestamp fields) is included.
- Targeted route tests pass with explicit assertions for the above behavior.

## Idempotence and Recovery

These are code-only changes and can be rerun safely. If regressions appear, revert the touched route/repository files and tests together to restore prior behavior.

## Artifacts and Notes

Validation commands executed:

- `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts src/server/repositories/__tests__/events.upsert.test.ts"`
- `wsl bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx jest --runTestsByPath src/app/api/fields/[id]/__tests__/route.test.ts"`

## Interfaces and Dependencies

No new external dependencies are required. The implementation uses existing Next.js route handlers, Prisma client interfaces, and current Jest test setup.

Revision Note (2026-04-01): Initial plan created before implementing ownership-preserving event/schedule writes and immutable field PATCH behavior.
Revision Note (2026-04-01): Updated with completed implementation details, environment-specific test execution notes, and passing validation evidence.
