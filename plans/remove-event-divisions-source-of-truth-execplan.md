# Remove Events.divisions as the Division Source of Truth

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It is written so a contributor can continue from only this file and the working tree.

## Purpose / Big Picture

Events currently store division membership in two places: `Events.divisions`, which is a string array on the event row, and `Divisions.eventId`, which links each division row back to its event. That duplicate ownership caused real production risk: playoff match rows could be rewritten under the wrong league division when code looked only at `Events.divisions` and ignored `playoffDivisions`.

After this change, the canonical relationship will be the `Divisions` table: a division belongs to an event because its `eventId` is the event id. API responses may still expose a derived `divisions` array temporarily for old clients, but backend loading, validation, filtering, and saving must not depend on `Events.divisions`. A human can see the change working by running tests that load events from division rows even when the event row has stale or empty `divisions`, and by verifying bulk match updates preserve explicit playoff division ids.

## Progress

- [x] (2026-05-24 23:18-07:00) Created this ExecPlan after the user approved removing the duplicate event-level division source.
- [x] (2026-05-24 23:21-07:00) Inspected dirty repository changes before editing shared files.
- [x] (2026-05-24 23:28-07:00) Added `Divisions.sortOrder` and created a migration that backfills order from `Events.divisions`.
- [x] (2026-05-25 00:00-07:00) Made the migration deploy-safe by keeping the physical `Events.divisions` column for one release while removing it from Prisma/code usage; a later cleanup migration can drop it after rollout.
- [x] (2026-05-24 23:33-07:00) Updated repository loaders and event saves to derive divisions from `Divisions.eventId`.
- [x] (2026-05-24 23:37-07:00) Updated API routes that filter, validate, or serialize divisions from event rows.
- [x] (2026-05-24 23:39-07:00) Kept web and mobile compatibility by continuing to emit derived `divisions` arrays in API responses; no mobile schema change was required in this pass.
- [x] (2026-05-24 23:41-07:00) Ran Prisma validation, TypeScript, diff check, and focused backend route/repository tests.

## Surprises & Discoveries

- Observation: The working tree already has unrelated dirty changes, including backend scheduler/repository files and mobile rental loader files.
  Evidence: `git status --short` in `mvp-site` and `mvp-app` showed modified files before this plan was created.

- Observation: Some route tests still use legacy event objects that include `divisions` even though the generated Prisma `Events` type no longer does.
  Evidence: The first focused Jest run failed in `purchaseIntentRoute.test.ts` because the transaction mock did not expose `tx.divisions.findMany`; the code now falls back to legacy in-memory `event.divisions` only when a test/mock transaction lacks the divisions delegate.

- Observation: Removing `Events.divisions` from event upsert payloads required updating repository tests that asserted the old duplicate write.
  Evidence: `events.upsert.test.ts` expected `eventUpsertArg.create.divisions`; after the change, those assertions now verify the event upsert data does not have a `divisions` property.

## Decision Log

- Decision: Keep `divisions` in API/client models during the first implementation pass as a derived compatibility field instead of deleting every client property immediately.
  Rationale: Mobile persists `Event.divisions` locally and removing it outright would require a broader Room migration and client contract change. The production bug is solved by removing `Events.divisions` as authoritative backend state and rejecting unknown match division ids.
  Date/Author: 2026-05-24 / Codex

- Decision: Treat `Divisions.eventId` plus a stable ordering field as the canonical model.
  Rationale: `Divisions.eventId` already expresses ownership. A row-level order preserves current UI behavior without needing an event-level id array.
  Date/Author: 2026-05-24 / Codex

## Outcomes & Retrospective

Implemented the first removal pass. The Prisma schema no longer has `Events.divisions`; `Divisions.sortOrder` preserves display/order semantics; repository loading and event save paths derive league/playoff divisions from division rows; API list/search/detail/registration/billing paths no longer depend on an event-row division array. Current API responses still include a derived `divisions` array so existing web and mobile clients continue to render and submit forms without an immediate mobile Room migration.

The match bulk update resolver now resolves explicit match division ids against all event divisions, including playoff divisions, and rejects unknown explicit ids instead of silently using the first league division.

## Context and Orientation

The backend lives in this repository, `C:\Users\samue\Documents\Code\mvp-site`. The mobile Kotlin Multiplatform app lives in `C:\Users\samue\StudioProjects\mvp-app`, and its repository guidelines say backend API and database contracts are defined here first.

The relevant database models are in `prisma/schema.prisma`. `Divisions` has `eventId`, meaning each division row can identify the event it belongs to. `Events` also has `divisions String[]`, which stores division ids on the event row. In plain terms, this is two sources of truth: the division row says "I belong to this event", while the event row says "these divisions belong to me." When either side becomes stale, routes may load the wrong divisions.

The main backend event loader is `src/server/repositories/events.ts`. It converts database rows into scheduler domain objects used by API routes, bracket building, standings, billing, and schedule pages. The loader currently reads `Events.divisions` before falling back to division rows. The central writer is `syncEventDivisions` in the same file.

The immediate production bug was traced to `src/app/api/events/[eventId]/matches/route.ts`, where `resolveDivisionForMatch` checks only league divisions from the event object and falls back to the first division. With split league/playoff divisions, a valid playoff division id can be treated as unknown and rewritten to the first league division.

## Plan of Work

First, inspect existing dirty diffs in files that this task must edit. Do not revert user changes. When a dirty file must be edited, preserve its current changes and make a minimal patch around them.

Second, update the database contract. If `Divisions` lacks a row-order field, add one such as `sortOrder Int?` with an index on `(eventId, kind, sortOrder)`. Add a migration that backfills `sortOrder` from the existing `Events.divisions` array for league divisions and assigns deterministic order for playoff divisions. Do not drop `Events.divisions` until all API and mobile contracts no longer need it; instead stop using it as authoritative state in backend code.

Third, update `src/server/repositories/events.ts`. `loadEventWithRelations` must query division rows by `eventId`, order them by kind and row order, and build league and playoff domain divisions from those rows. `syncEventDivisions` must upsert/delete division rows and maintain row order on `Divisions`; it may return derived league ids for compatibility, but callers must not rely on the event row as the canonical store. Event upsert code should treat incoming `payload.divisions` as a legacy ordering hint only when details do not supply order.

Fourth, update API routes that directly read `event.divisions` from Prisma event rows. Event list, search, registration, participants, billing, and event detail patch routes should fetch division rows by `eventId`. Search filtering by division must become a division-row lookup rather than `where.divisions hasSome`.

Fifth, fix match updates independently. `resolveDivisionForMatch` must resolve explicit ids against all event-scoped divisions, including playoff divisions, and must reject unknown explicit ids instead of falling back to the first division. Web and mobile broad match update payloads should avoid sending `division` unless the user actually changes a match division, or the backend should safely accept explicit valid ids without rewriting.

Sixth, keep client compatibility. Web and mobile can continue to receive a derived `divisions` array for now, but event form payload builders should prefer `divisionDetails` and `playoffDivisionDetails` as the real data. Mobile local persistence can keep `Event.divisions` as derived cached data in this pass.

## Concrete Steps

Run these commands from `C:\Users\samue\Documents\Code\mvp-site` unless a step names the mobile repository.

1. Inspect dirty changes:

       git status --short
       git diff -- src/server/repositories/events.ts src/app/api/events/[eventId]/matches/route.ts prisma/schema.prisma

   Completed. There were unrelated dirty changes before this work, including scheduler/repository changes and blog content.

2. Search for backend dependencies:

       rg -n "event\\.divisions|Events\\.divisions|where\\.divisions|data:\\s*\\{[^}]*divisions|divisions:\\s*syncedDivisionIds" src prisma

3. After edits, run focused backend tests:

       npm test -- src/server/repositories/__tests__/events.upsert.test.ts src/server/repositories/__tests__/saveMatches.test.ts

   Actual focused run:

       npm test -- --runInBand src/server/repositories/__tests__/events.upsert.test.ts src/server/repositories/__tests__/events.matchMutationLoad.test.ts src/app/api/events/__tests__/eventSaveRoute.test.ts src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts src/app/api/events/__tests__/eventSearchRoute.test.ts src/app/api/events/__tests__/selfRegistrationRoute.test.ts src/app/api/events/__tests__/participantsRoute.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/billing/__tests__/billsRoute.test.ts src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/events/__tests__/freeAgentsRoute.test.ts

   Result: 11 test suites passed, 148 tests passed.

4. Run route or mapper tests touched by the changes:

       npm test -- src/app/api/events src/types/__tests__/eventPayload.test.ts

   Covered by the focused route test command above.

5. From `C:\Users\samue\StudioProjects\mvp-app`, run focused mobile tests if Kotlin DTO or formatter files change:

       .\gradlew :composeApp:testDebugUnitTest

   Not run because this pass did not change mobile files or mobile Room schema.

Additional validation:

       npx prisma validate

   Result: schema is valid.

       npx prisma generate

   Result: Prisma Client 7.7.0 generated successfully to `src/generated/prisma`.

       npx tsc --noEmit --pretty false

   Result: passed.

       git diff --check

   Result: passed with line-ending warnings only.

## Validation and Acceptance

Acceptance requires these observable behaviors:

An event with empty or stale `Events.divisions` but valid `Divisions` rows still loads league and playoff divisions correctly through the repository loader.

Bulk match update accepts a valid playoff division id when the event uses split league/playoff divisions and does not rewrite that match to the first league division.

Search and registration flows no longer depend on `Events.divisions` being populated on the event row.

Existing API responses still contain enough division data for current web and mobile clients to render division names, fields, registration choices, and bracket divisions.

## Idempotence and Recovery

Repository code edits are safe to repeat. Prisma migration creation is not idempotent once generated, so if a migration is created with the wrong name or content, create a corrective migration rather than editing applied production history. Because this working tree has unrelated dirty changes, do not use `git reset --hard`, `git checkout --`, or other destructive cleanup commands.

If tests fail because unrelated dirty changes have already altered scheduler behavior, record the failure and isolate whether the changed files overlap this work before editing them.

## Artifacts and Notes

Initial dirty status showed many unrelated modified files in `mvp-site`, including `src/server/repositories/events.ts`, scheduler files, EventForm tests, and blog content. The mobile repo also had unrelated rental availability loader changes. These must be preserved.

## Interfaces and Dependencies

At the end of the implementation, backend event loading must expose these effective interfaces:

`loadEventWithRelations(eventId)` returns an event whose `divisions` are derived from `Divisions` rows where `eventId` equals the event id and `kind` is league or unspecified league-compatible, and whose `playoffDivisions` are derived from `Divisions` rows where `kind` is playoff.

`syncEventDivisions` accepts league and playoff division details, writes `Divisions` rows with `eventId`, `kind`, and stable order, and returns derived ids only for compatibility.

`resolveDivisionForMatch` accepts an explicit division id only when it belongs to the event through the loaded division rows. It does not silently substitute the first league division for an unknown explicit id.
