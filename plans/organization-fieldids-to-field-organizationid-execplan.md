# Migrate Organization-Field Ownership to Fields.organizationId

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This file follows the standards in `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, organization-to-field ownership is sourced from `Fields.organizationId` instead of `Organizations.fieldIds`. This prevents stale ownership arrays, fixes null field ownership drift, and ensures scheduler rental conflict behavior can correctly distinguish renting events from owning organizations. The observable result is that organization field membership and field creation/edit flows work without reading or writing `Organizations.fieldIds`.

## Progress

- [x] (2026-04-01 19:05Z) Audited current backend schema, routes, and services; confirmed `Organizations.fieldIds` is still persisted and mutated in field routes.
- [x] (2026-04-01 20:01Z) Updated field/organization routes and web organization hydration to use `Fields.organizationId` and removed organization-array mutation logic.
- [x] (2026-04-01 20:05Z) Added migration `20260401193000_remove_organizations_fieldids` to backfill `Fields.organizationId` and drop `Organizations.fieldIds`.
- [x] (2026-04-01 20:08Z) Regenerated Prisma client/types and removed `fieldIds` from organization schema/contracts in backend TypeScript.
- [x] (2026-04-01 20:14Z) Ran targeted backend validation suites and captured passing results.
- [x] (2026-04-01 20:47Z) Passed `npx tsc --noEmit` and event schedule page tests after removing remaining `Organization.fieldIds` frontend references.

## Surprises & Discoveries

- Observation: Event PATCH logic currently persists incoming local fields only when no organization is resolved, and that code hardcodes `organizationId: null`.
  Evidence: `src/app/api/events/[eventId]/route.ts` has `shouldPersistLocalFields = incomingFieldsById.size > 0 && !resolvedNextOrganizationId` with field upsert payload `organizationId: null`.
- Observation: Removing `Organization.fieldIds` from backend TypeScript contracts affected the organization rentals page merge logic.
  Evidence: `src/app/organizations/[id]/page.tsx` combined `org.fieldIds` and hydrated `org.fields`; this needed simplification to hydrated fields only.

## Decision Log

- Decision: Treat `Fields.organizationId` as the only persisted ownership source, and remove all `Organizations.fieldIds` persistence.
  Rationale: Ownership arrays duplicate state and drift from field documents; scheduler ownership checks require canonical per-field org IDs.
  Date/Author: 2026-04-01 / Codex

- Decision: Keep migration safe by backfilling field ownership before dropping the organization column.
  Rationale: Existing production data currently links many fields only via organization `fieldIds`; drop-first would lose ownership.
  Date/Author: 2026-04-01 / Codex

## Outcomes & Retrospective

Backend ownership migration is complete. `Organizations.fieldIds` is no longer in the Prisma schema, no backend routes mutate that array, organization-field hydration uses `Fields.organizationId`, and historical ownership is preserved via backfill migration SQL before column removal. Targeted route and repository suites passed:

- `src/app/api/fields/__tests__/fieldRoutes.test.ts`
- `src/app/api/organizations/__tests__/organizationUsersRoute.test.ts`
- `src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts`
- `src/server/repositories/__tests__/events.loadWithRelationsFieldConflicts.test.ts`

## Context and Orientation

Relevant ownership code currently spans:

- Prisma schema and migrations in `prisma/schema.prisma` and `prisma/migrations/*`.
- Organization API routes in `src/app/api/organizations/route.ts` and `src/app/api/organizations/[id]/route.ts`.
- Field API routes in `src/app/api/fields/route.ts` and `src/app/api/fields/[id]/route.ts`.
- Organization hydration in `src/lib/organizationService.ts`.
- Event PATCH local-field upsert logic in `src/app/api/events/[eventId]/route.ts`.

## Plan of Work

Implement the migration in three passes. First, switch route/service reads and writes so field ownership uses `Fields.organizationId` only, and remove transactional updates that append/remove field IDs on organizations. Second, add a migration that updates field rows by joining organization `fieldIds` and then drops `Organizations.fieldIds`; update Prisma schema accordingly. Third, regenerate Prisma client outputs and adjust tests that asserted organization field array mutations.

## Concrete Steps

From repository root `mvp-site`:

1. Edit route/service files to remove `Organizations.fieldIds` usage and derive fields by querying `Fields` with `organizationId`.
2. Edit `prisma/schema.prisma` to remove `Organizations.fieldIds`.
3. Add new SQL migration that:
   - updates `Fields.organizationId` from each `Organizations.fieldIds` membership,
   - handles null/empty arrays safely,
   - drops `Organizations.fieldIds`.
4. Run Prisma generation and targeted Jest suites.

## Validation and Acceptance

Acceptance criteria:

- Creating/updating/deleting fields no longer updates `Organizations.fieldIds`.
- Organization relation hydration still returns correct field collections via `Fields.organizationId`.
- Existing fields previously only linked via `Organizations.fieldIds` become owned fields via migration backfill.
- Prisma client builds without `Organizations.fieldIds`.
- Targeted route/service tests pass.

## Idempotence and Recovery

Code edits are idempotent. SQL migration runs once in normal Prisma migration flow. Recovery path is standard DB restore/rollback before applying migration in production.

## Artifacts and Notes

Pending implementation outputs.

## Interfaces and Dependencies

No new external dependencies are required. Existing Next.js route handlers, Prisma client, and service modules remain the implementation surface.

Revision Note (2026-04-01): Initial plan created before implementation to satisfy ExecPlan process for this cross-cutting ownership migration.
Revision Note (2026-04-01): Updated progress, discoveries, and outcomes after implementing backend route/service/schema migration and running targeted tests.
