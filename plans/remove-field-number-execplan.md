# Remove `fieldNumber` and Sort Fields by Creation Time

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This file follows the standards in `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, fields are identified and displayed without any persisted `fieldNumber`. The product should use field IDs for relationships, field names for labels, and field `createdAt` timestamps for ordering anywhere the old numeric sort was used. The observable result is that creating, editing, scheduling, renting, and rendering fields continues to work after removing the `Fields.fieldNumber` column and all TypeScript references to it.

## Progress

- [x] (2026-04-21 23:41Z) Audited `fieldNumber` usage across Prisma schema, route handlers, scheduler models, UI components, tests, and E2E fixtures.
- [x] (2026-04-21 23:41Z) Reviewed overlapping dirty-worktree diffs in event scheduling and organization files to avoid reverting unrelated in-progress changes.
- [x] (2026-04-22 01:29Z) Removed `fieldNumber` from the Prisma schema, generated Prisma outputs, scheduler/runtime types, API contracts, and persisted field create/update flows.
- [x] (2026-04-22 01:29Z) Replaced `fieldNumber` ordering with `createdAt` ordering and switched field labels to name/ID-safe fallbacks via shared field helper utilities.
- [x] (2026-04-22 01:29Z) Updated route, scheduler, service, UI, Jest, fixture, and E2E code so `git grep -n "fieldNumber"` only returns the original init migration history.
- [x] (2026-04-22 01:29Z) Ran `npx prisma generate`, `npx tsc --noEmit`, and focused Jest coverage for fields, scheduler, event patching, and the event form.

## Surprises & Discoveries

- Observation: `fieldNumber` is not used as the canonical relational key anywhere active; field identity flows through `fieldId` / `fieldIds`.
  Evidence: `src/app/api/events/[eventId]/matches/route.ts` resolves fields by `entry.fieldId`, and `src/server/scheduler/serialize.ts` persists `fieldId` for matches.
- Observation: The field model still makes `fieldNumber` a required persisted Prisma column, so removal requires a schema migration and Prisma regeneration rather than TypeScript-only cleanup.
  Evidence: `prisma/schema.prisma` currently defines `model Fields { fieldNumber Int }`.
- Observation: Several files needed for this refactor already contain user edits unrelated to `fieldNumber`, especially in event creation and bracket rendering.
  Evidence: `git diff -- src/app/events/[id]/schedule/page.tsx src/server/publicWidgetBracket.ts src/server/repositories/events.ts` shows unrelated uncommitted changes that must be preserved while layering this refactor on top.

## Decision Log

- Decision: Treat `fieldNumber` removal as a schema-and-contract migration, not a cosmetic cleanup.
  Rationale: The column exists in Prisma, generated client types, API contracts, scheduler types, and tests; partial removal would leave broken persistence and type generation.
  Date/Author: 2026-04-21 / Codex

- Decision: Replace old `fieldNumber` sorting with `createdAt` ascending order, with a stable `name`/`id` tiebreaker where query builders need deterministic ordering.
  Rationale: The user explicitly requested creation-time ordering, and ties should remain deterministic for tests and repeatable UI rendering.
  Date/Author: 2026-04-21 / Codex

- Decision: Replace `Field N` fallback labels with field name first, then ID- or context-based generic fallbacks instead of synthesizing numbers.
  Rationale: Once numeric persistence is removed, fallback labels must not silently recreate the deleted concept.
  Date/Author: 2026-04-21 / Codex

## Outcomes & Retrospective

Completed. `fieldNumber` is gone from the active schema, generated Prisma client, runtime models, route handlers, React components, tests, fixtures, and E2E flows. Field ordering now uses `createdAt` ascending with deterministic `name`/`id` tiebreakers where needed. Field display now relies on `name`, then ID/context fallbacks, without recreating numeric labels.

Validation passed with:

- `npx prisma generate`
- `npx tsc --noEmit`
- `npm test -- --runTestsByPath "src/app/api/fields/__tests__/fieldRoutes.test.ts" "src/lib/__tests__/fieldService.test.ts" "src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx" "src/server/scheduler/__tests__/officialStaffingModes.test.ts" "src/app/api/events/__tests__/scheduleRoutes.test.ts" "src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts"`

The only remaining `fieldNumber` reference is the original historical migration that created the column. That file remains intentionally untouched to preserve migration history.

## Context and Orientation

The relevant field flow spans the database, API routes, shared services, and the scheduler. The database source of truth is `prisma/schema.prisma`, which currently defines `Fields.fieldNumber`. HTTP routes for field CRUD live in `src/app/api/fields/route.ts` and `src/app/api/fields/[id]/route.ts`. Event persistence and hydration touch fields in `src/app/api/events/[eventId]/route.ts`, `src/server/repositories/events.ts`, `src/lib/eventService.ts`, and `src/lib/fieldService.ts`. The scheduler copies field metadata into `src/server/scheduler/types.ts`, `src/server/scheduler/EventBuilder.ts`, and `src/server/scheduler/serialize.ts`. User-facing field labels and ordering live in organization pages, event forms, match cards, discover views, and rental flows across `src/app/**` and `src/components/ui/**`.

This repo already has uncommitted edits in several files this refactor must touch. Any implementation step in those files must preserve the existing diffs while removing only `fieldNumber`-related behavior.

## Plan of Work

First, update the schema and field-facing contracts so `fieldNumber` disappears from Prisma, API validators, service types, and shared TypeScript models. Second, replace all persistence and UI behavior that previously set, normalized, sorted, or displayed `fieldNumber`, using `createdAt` ordering and name-based labels instead. Third, update scheduler and event serialization code so field metadata no longer carries a numeric field attribute. Finally, refresh generated Prisma outputs, fix fixtures and tests, and validate the changed flows with targeted Jest and type checks.

## Concrete Steps

From repository root `mvp-site`:

1. Edit `prisma/schema.prisma` to remove `Fields.fieldNumber`, and add a new migration that drops the `fieldNumber` column from `Fields`.
2. Update field CRUD routes, event routes, repositories, services, shared types, and scheduler types so field payloads no longer read or write `fieldNumber`.
3. Replace all field list ordering that currently uses `fieldNumber` with `createdAt: 'asc'`, adding deterministic secondary ordering where needed.
4. Update UI labels and form logic so fields display `name`, then a generic field fallback, without recreating numeric labels from stored data.
5. Regenerate Prisma outputs and update tests and fixtures until `git grep -n "fieldNumber"` returns only historical migration references that must remain untouched.
6. Run targeted validation commands and record the results in this document.

## Validation and Acceptance

Acceptance criteria:

- `git grep -n "fieldNumber" -- prisma src test e2e` returns no active source references outside historical migrations that intentionally preserve past schema state.
- Creating and updating fields works without sending `fieldNumber`.
- Organization and event pages list fields in creation order rather than numeric order.
- Scheduler, match rendering, rental flows, and public widgets still render field labels from names or generic fallbacks without depending on `fieldNumber`.
- Prisma generation, targeted Jest suites, and at least one repo-wide static validation command pass.

## Idempotence and Recovery

Code edits are idempotent. Re-running Prisma generation is safe. The schema migration is destructive because it drops a column, so the safe recovery path before production rollout is standard database backup or restore before applying the migration. Historical migration files must not be edited except to add a new forward migration.

## Artifacts and Notes

- Added forward migration `prisma/migrations/20260421235500_remove_fields_fieldnumber/migration.sql` to drop `Fields.fieldNumber`.
- Added `src/lib/fieldUtils.ts` for field ID, label, and creation-time sorting helpers shared across UI and server code.

## Interfaces and Dependencies

No new dependencies are required. The implementation surface is the existing Next.js route handlers, Prisma schema and generated client, React/Mantine components, scheduler classes, and Jest/E2E fixtures already in the repository.

Revision Note (2026-04-21): Initial plan created before implementation for the cross-cutting `fieldNumber` removal and field ordering migration.
