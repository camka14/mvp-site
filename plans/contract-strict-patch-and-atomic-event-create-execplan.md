# Contract-Strict PATCH + Atomic Event Create Refactor (Site)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, update endpoints no longer accept broad full-object payloads and only allow strict partial patch contracts. Event creation becomes a command-style atomic transaction (`id`, `event`, optional `newFields`, optional `timeSlots`, optional `leagueScoringConfig`). Weekly parent joins can resolve/create child sessions in the participants route atomically. Field ownership becomes secure with immutable ownership keys and server-side ownership attribution (`createdBy`).

## Progress

- [x] (2026-04-01 22:06Z) Created consolidated ExecPlan for strict contracts + atomic create + weekly join + field ownership.
- [x] Implement strict PATCH schemas and immutable-key enforcement for: events, organizations, products, teams, time-slots, fields, chat groups, users.
- [x] Replace `POST /api/events` with strict command schema: `{ id, event, newFields?, timeSlots?, leagueScoringConfig? }`.
- [x] Implement weekly parent join session resolution/creation in participants route with idempotency.
- [x] Add `Fields.createdBy`, migration, and route authorization/immutability updates (legacy org-less ownership backfill is deterministic + lazy on update via earliest linked event host).
- [x] Update backend route/repository tests for strict contracts, immutability policy, atomic create, weekly join behavior, and ownership behavior.
- [x] Run targeted Jest suites for touched routes/repositories and record outcomes.

## Surprises & Discoveries

- Observation: Existing event patch and create paths intentionally accept permissive record payloads and sanitize at runtime, so strict schema conversion touches both routes and client serializers.
  Evidence: `src/app/api/events/[eventId]/route.ts` and `src/app/api/events/route.ts` use `z.record(...).passthrough()` contracts.

- Observation: Weekly session resolution logic currently lives only in weekly-sessions route and participants route currently blocks parent weekly join.
  Evidence: `src/app/api/events/[eventId]/weekly-sessions/route.ts` contains child resolution/build logic; participants route returns 403 for parent weekly registration.

## Decision Log

- Decision: Introduce strict envelope contracts per route while preserving current path/method shape.
  Rationale: Meets immediate enforcement without endpoint path churn.
  Date/Author: 2026-04-01 / Codex

- Decision: Reuse shared weekly child resolution helpers between weekly-sessions and participants routes.
  Rationale: Prevents divergent child-generation behavior and guarantees idempotency in one implementation.
  Date/Author: 2026-04-01 / Codex

- Decision: Enforce immutable key checks at route boundary with explicit forbidden key lists for non-admin users, with admin override.
  Rationale: Clear enforcement and predictable error shape for clients.
  Date/Author: 2026-04-01 / Codex

## Outcomes & Retrospective

Completed on branch `codex/strict-patch-atomic-event-create-site`.

Validation run summary:

- Targeted Jest suites:
  - `npm test -- src/app/api/events/__tests__/eventSaveRoute.test.ts src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts src/app/api/events/__tests__/participantsRoute.test.ts src/app/api/fields/\[id\]/__tests__/route.test.ts src/lib/__tests__/eventService.test.ts`
  - Result: `5 passed, 0 failed` (51 tests).
- Production build/typecheck:
  - `npm run build`
  - Result: successful.

Notable implementation details:

- Weekly parent participant joins now resolve/create child sessions and all downstream participant mutations use the resolved child `event.id`.
- Event PATCH fixed-window validation now enforces `end > start` when `noFixedEndDateTime=false` (no auto-coercion from equal boundaries).
- `Fields.createdBy` runtime compatibility guards were added for environments where Prisma client regeneration may lag migration application.

## Context and Orientation

The work spans API routes under `src/app/api/**`, event repository logic in `src/server/repositories/events.ts`, and Prisma schema/migrations in `prisma/`. The strict-contract goal is to reject unknown keys and hydrated objects in generic patch endpoints so relationship changes happen only through dedicated relationship routes. The atomic-create goal is to guarantee all event-create side effects commit/rollback together. Weekly join logic must move to participants route for user-facing flows that join specific sessions without pre-creating a child event manually.

## Plan of Work

First, implement shared strict patch utilities and route-level immutable key enforcement across scoped patch routes. Second, refactor event create route to strict command payload and transactional orchestration for event core + optional `newFields` + optional `timeSlots` + optional league scoring config. Third, extract weekly child-session resolution into a shared helper and consume it from participants route (and weekly-sessions route) for idempotent child retrieval/creation. Fourth, add `Fields.createdBy` with migration/backfill, then enforce org-less field mutation authorization and immutable ownership fields. Finally, update/add tests to lock the new contracts and behavior.

## Concrete Steps

From `mvp-site` root:

1. Edit patch routes:
   - `src/app/api/events/[eventId]/route.ts`
   - `src/app/api/organizations/[id]/route.ts`
   - `src/app/api/products/[id]/route.ts`
   - `src/app/api/teams/[id]/route.ts`
   - `src/app/api/time-slots/[id]/route.ts`
   - `src/app/api/fields/[id]/route.ts`
   - `src/app/api/chat/groups/[id]/route.ts`
   - `src/app/api/users/[id]/route.ts`
2. Edit event create route:
   - `src/app/api/events/route.ts`
3. Add shared weekly child resolver module and wire:
   - `src/app/api/events/[eventId]/participants/route.ts`
   - `src/app/api/events/[eventId]/weekly-sessions/route.ts`
4. Update Prisma model + migration for `Fields.createdBy`:
   - `prisma/schema.prisma`
   - `prisma/migrations/<timestamp>_add_fields_createdby/*`
5. Update/create tests for all affected flows.
6. Run targeted Jest commands for changed modules.

## Validation and Acceptance

Acceptance requires:

- Strict patch routes reject unknown keys (`400`) and reject non-admin immutable-key updates (`403`) with explicit field list.
- Admin immutable-key updates are accepted where allowed.
- `POST /api/events` accepts only command payload shape and performs atomic rollback on failure.
- Participants route can resolve/create weekly child event on join with session context and is idempotent.
- `Fields.createdBy` exists, is set on create, and org-less field updates require owner/admin; unresolved backfill rows are admin-only.
- Updated test suites pass for route contracts and repository behavior.

## Idempotence and Recovery

Code edits are idempotent. Migration runs once by design; rollback strategy is standard DB snapshot restore or migration rollback before deployment.

## Artifacts and Notes

Pending implementation outputs.

## Interfaces and Dependencies

No new runtime dependencies are required. Uses existing Next.js route handlers, Zod contracts, Prisma client, and Jest route/repository test stack.

Revision Note (2026-04-01): Initial comprehensive plan created for strict PATCH contracts, atomic event create, weekly join refactor, and field ownership immutability.
