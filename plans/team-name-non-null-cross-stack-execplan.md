# Enforce Non-Nullable Team Names Across API and Persistence

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

PLANS.md is checked in at `PLANS.md` in this repository root and this document is maintained in accordance with it.

## Purpose / Big Picture

After this change, team names will be mandatory in API and database layers. Team create and team update calls will reject blank names, and existing null/blank records will be backfilled during migration so a strict non-null DB constraint can be enabled.

## Progress

- [x] (2026-04-02 21:36Z) Audited nullable team-name sources in API and Prisma schema.
- [x] (2026-04-02 21:36Z) Created ExecPlan.
- [x] (2026-04-02 21:43Z) Enforced non-null `Teams.name` in Prisma schema and migration.
- [x] (2026-04-02 21:45Z) Tightened team create/update route validation and normalization.
- [x] (2026-04-02 21:47Z) Added/updated route tests for blank-name rejection.
- [x] (2026-04-02 21:49Z) Ran targeted route tests and recorded outputs.

## Surprises & Discoveries

- Observation: TypeScript `Team` interface already uses `name: string`, but route schemas and DB allow `null`, creating a runtime/type mismatch.
  Evidence: `src/types/index.ts` vs `src/app/api/teams/route.ts` and `prisma/schema.prisma`.
- Observation: Jest invocation from UNC working directory fails under Windows command shell.
  Evidence: `UNC paths are not supported`; rerunning with `wsl -d Ubuntu --cd /home/camka/Projects/MVP/mvp-site ...` succeeded.

## Decision Log

- Decision: Fix source-of-truth backend contract first, then align clients.
  Rationale: Backend is authoritative for all consumers, including mobile.
  Date/Author: 2026-04-02 / Codex

## Outcomes & Retrospective

API and persistence now enforce required team names, and explicit tests verify blank names are rejected on create and patch flows. Legacy nullable rows are handled by migration backfill prior to NOT NULL enforcement.

## Context and Orientation

Team create route is `src/app/api/teams/route.ts`, team patch route is `src/app/api/teams/[id]/route.ts`, and persistence model is Prisma `Teams` in `prisma/schema.prisma` (mapped to `VolleyBallTeams`). Tests for these routes are in `src/app/api/teams/__tests__/teamsRoute.test.ts` and `src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts`.

## Plan of Work

Update Prisma `Teams.name` to required and add a migration that backfills null/blank names before setting NOT NULL. Tighten zod schemas for create and patch team routes to disallow blank strings. Keep deterministic fallback logic as a guardrail for unexpected legacy rows in patch merge logic. Update Jest tests to assert 400 responses for blank names and success for valid names.

## Concrete Steps

From repo root:

    npm test -- --runInBand src/app/api/teams/__tests__/teamsRoute.test.ts src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts

## Validation and Acceptance

Acceptance is met when:

1. Prisma schema requires non-null team name.
2. Migration backfills existing null/blank names then applies NOT NULL.
3. Team create/update APIs reject blank names.
4. Team route tests pass with explicit coverage for this behavior.

## Idempotence and Recovery

Code edits are repeatable. Migration is one-time; if it fails due to unexpected row data, patch rows and rerun migration.

## Artifacts and Notes

Backfill SQL pattern:

    UPDATE "VolleyBallTeams"
    SET "name" = CONCAT('Team ', SUBSTRING("id" FROM 1 FOR 8))
    WHERE "name" IS NULL OR BTRIM("name") = '';

    ALTER TABLE "VolleyBallTeams"
    ALTER COLUMN "name" SET NOT NULL;

## Interfaces and Dependencies

Required end state:

- `prisma/schema.prisma`: `Teams.name String`
- `src/app/api/teams/route.ts`: create schema requires non-empty `name`
- `src/app/api/teams/[id]/route.ts`: patch schema rejects blank `name`

Revision note (2026-04-02): Initial plan created for enforcing non-null team names.
Revision note (2026-04-02): Updated progress/discoveries/outcomes after implementing schema and route validations with passing Jest tests.
