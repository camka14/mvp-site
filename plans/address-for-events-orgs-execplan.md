# Add Address Storage For Events and Organizations

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows [PLANS.md](../PLANS.md) from the repository root and must be maintained in accordance with that standard.

## Purpose / Big Picture

After this change, event and organization records in `mvp-site` will persist a separate `address` string in addition to `location` and coordinates. Web location selection will send place name as `location`, send formatted address as `address` when available, and always keep coordinates.

## Progress

- [x] (2026-03-25 02:20Z) Identified Prisma, API, service, and form touchpoints for event/org address support.
- [ ] Add nullable `address` columns to Prisma models and create a migration.
- [ ] Thread `address` through event/org API payload allowlists and repository persistence.
- [ ] Update shared web types/services and location selector callback to include `address`.
- [ ] Update event and organization forms to populate and submit `address`.
- [ ] Run targeted typecheck and capture outcomes.

## Surprises & Discoveries

- Observation: Event upsert logic already supports unknown Prisma fields via fallback retries, but organization routes use direct typed Prisma writes.
  Evidence: `src/server/repositories/events.ts` uses `upsertEventWithUnknownArgFallback`; `src/app/api/organizations/route.ts` uses direct `prisma.organizations.create`.

## Decision Log

- Decision: Keep `location` as place display name and introduce `address` as a new sibling optional field.
  Rationale: Product requirement needs both values retained independently.
  Date/Author: 2026-03-25 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

The database contract lives in `prisma/schema.prisma`. Event persistence is in `src/server/repositories/events.ts` and event patch allowlisting is in `src/app/api/events/[eventId]/route.ts`. Organization create/update endpoints are in `src/app/api/organizations/route.ts` and `src/app/api/organizations/[id]/route.ts`.

Frontend location flow is shared by `src/components/location/LocationSelector.tsx`, then consumed by event form (`src/app/events/[id]/schedule/components/EventForm.tsx`) and org modal (`src/components/ui/CreateOrganizationModal.tsx`). Shared data contracts are in `src/types/index.ts` with mappers in `src/lib/eventService.ts` and `src/lib/organizationService.ts`.

## Plan of Work

Add `address` to Prisma `Events` and `Organizations`, create a SQL migration that adds nullable columns, and update API write paths to accept and persist the new field. Then add `address` to shared TS interfaces and service mappers so reads round-trip the value. Update `LocationSelector` callback to return `(location, lat, lng, address?)` while preserving existing callers. Update event and organization forms to store and submit `address` when selection APIs provide it.

## Concrete Steps

From `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`:

1. Edit schema + migration files.
2. Edit API/repository/type/service/form files for `address`.
3. Run `npm run typecheck`.

## Validation and Acceptance

Acceptance is met when event/org create and edit payloads include `address`, persisted DB rows include `address`, API responses include `address`, and web forms keep showing place names in `location` while preserving formatted addresses in `address`.

## Idempotence and Recovery

All code changes are additive. Migration only adds nullable columns; if rollback is needed, revert code and create a down migration before deployment.

## Artifacts and Notes

Capture final `git diff` snippets and typecheck output summary in the implementation response.

## Interfaces and Dependencies

Post-change interfaces:

- `Event` and `Organization` in `src/types/index.ts` include `address?: string`.
- `LocationSelector` callback accepts optional `address` as a fourth parameter.
- Prisma models `Events` and `Organizations` include nullable `address` columns.

## Plan Revision Notes

- 2026-03-25: Created plan before implementation to satisfy repository ExecPlan requirements.
