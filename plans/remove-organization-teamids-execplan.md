# Remove `Organizations.teamIds` And Backfill Canonical Team Ownership

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](C:\Users\samue\Documents\Code\mvp-site\PLANS.md).

## Purpose / Big Picture

After this change, an organization’s teams are defined by `CanonicalTeams.organizationId` only. Public embeds, organization pages, event-team pickers, and privacy checks will all load organization teams from the team table instead of a duplicated `Organizations.teamIds` array. The database migration will backfill missing `organizationId` values from the old array before dropping the array column, so existing Summit-style data keeps working after the cutover.

## Progress

- [x] (2026-04-21T09:56:54-07:00) Inspected `PLANS.md`, the Prisma schema, organization/team routes, and the public embed failure to confirm that `Organizations.teamIds` is a duplicate path while `CanonicalTeams.organizationId` is the intended ownership column.
- [x] (2026-04-21T11:29:00-07:00) Removed `teamIds` from the Prisma `Organizations` model and added `prisma/migrations/20260421110000_remove_organization_teamids/migration.sql` to backfill `CanonicalTeams.organizationId` from legacy organization arrays before dropping the column.
- [x] (2026-04-21T11:29:00-07:00) Replaced organization-team reads and writes in TypeScript with organization-scoped team queries, including the organization service, public catalog, team access checks, privacy logic, and the organization/event schedule pages.
- [x] (2026-04-21T11:45:00-07:00) Regenerated Prisma artifacts, updated focused tests, ran type-checking, applied the migration locally, and verified Summit teams now load through `organizationId` only.

## Surprises & Discoveries

- Observation: Team creation already writes `CanonicalTeams.organizationId`, but organization pages separately patch `Organizations.teamIds`, which is how the two sources drifted apart.
  Evidence: `src/app/api/teams/route.ts` writes `organizationId` into `tx.canonicalTeams.create`, while `src/app/organizations/[id]/page.tsx` later patches `organizationService.updateOrganization(id, { teamIds: nextTeamIds })`.
- Observation: The public organization teams widget had to be patched temporarily to read `organization.teamIds` because live Summit teams were missing `organizationId`.
  Evidence: local data inspection on 2026-04-21 showed `Organizations.teamIds` populated for Summit while the referenced canonical team rows still had `organizationId = null`.
- Observation: `src/server/userPrivacy.ts` was using organization-scoped team IDs to query the event-team table, so the current legacy path is not just duplicate state but also semantically mismatched.
  Evidence: the organization visibility branch selects `organization.teamIds` and then calls `client.teams.findMany(...)`, where `teams` is the event-team delegate in this repository.

## Decision Log

- Decision: Use `CanonicalTeams.organizationId` as the only persisted organization-to-team link and remove `Organizations.teamIds`.
  Rationale: this repository already writes `organizationId` during canonical team creation, and a many-teams-to-one-organization relationship belongs on the team rows instead of on a duplicated array.
  Date/Author: 2026-04-21 / Codex
- Decision: Add a database backfill inside the migration instead of a one-off script.
  Rationale: the backfill must run wherever the migration runs so the column can be dropped safely without requiring a separate manual recovery step.
  Date/Author: 2026-04-21 / Codex
- Decision: Replace organization-side reads with explicit team queries by `organizationId` instead of carrying a derived array on the `Organization` API payload.
  Rationale: keeping a derived array on the API would preserve the drift vector the refactor is meant to eliminate.
  Date/Author: 2026-04-21 / Codex

## Outcomes & Retrospective

The database and application now treat `CanonicalTeams.organizationId` as the only persisted organization-to-team relationship. `Organizations.teamIds` has been removed from the Prisma schema, from organization API payloads, from client-side organization state, and from server-side read paths.

The migration backfilled live Summit data successfully. After `npx prisma migrate deploy`, querying `summit-indoor-volleyball-facility` on the local database returned 5 canonical teams with `organizationId = 72eefa75-197e-4497-8f99-94b52d5e8e04`, including 2 open-registration teams, without consulting any organization array.

Focused validation passed with:

`npx prisma generate`

`npx tsc --noEmit`

`npx jest --runInBand --runTestsByPath "src/server/__tests__/publicOrganizationCatalog.test.ts" "src/lib/__tests__/organizationService.test.ts" "src/app/api/teams/[id]/invite-free-agents/__tests__/route.test.ts" "src/app/api/teams/[id]/__tests__/teamByIdCanonicalRoute.test.ts" "src/app/api/teams/[id]/__tests__/teamByIdRoute.test.ts"`

## Context and Orientation

Canonical teams are stored in the Prisma model `CanonicalTeams` in `prisma/schema.prisma`, which maps to the physical `"Teams"` table and already includes an optional `organizationId` column. Organizations are stored in the `Organizations` model in the same schema file and currently carry a `teamIds` string-array column. The duplication matters because both columns are used by application code today.

The organization-facing client model lives in `src/types/index.ts` and `src/lib/organizationService.ts`. Those files turn API rows into `Organization` objects and, when `includeRelations` is requested, currently hydrate teams from `organization.teamIds`.

The canonical team API lives in `src/app/api/teams/route.ts` and `src/app/api/teams/[id]/route.ts`, with shared canonical-team helpers in `src/server/teams/teamMembership.ts`. Team creation already writes `organizationId`, so these files are the right place to add a direct “list teams by organization” path.

The user-facing places that currently depend on `organization.teamIds` are the organization management page in `src/app/organizations/[id]/page.tsx`, the event schedule participant picker in `src/app/events/[id]/schedule/page.tsx`, the public organization catalog in `src/server/publicOrganizationCatalog.ts`, and organization visibility checks in `src/server/userPrivacy.ts`.

## Plan of Work

First, update the schema in `prisma/schema.prisma` so the `Organizations` model no longer declares `teamIds`. Add a new migration directory under `prisma/migrations` whose SQL performs three steps in order: extract legacy organization-to-team links from `Organizations.teamIds`, copy those links into `"Teams"."organizationId"` where the canonical team row exists and does not already point somewhere else, and then drop `"teamIds"` from `"Organizations"`.

Next, update the TypeScript surface area so organizations no longer expose or accept `teamIds`. Remove the field from `src/types/index.ts`. In `src/lib/organizationService.ts`, stop reading `row.teamIds`, stop sending `teamIds` in create/update payloads, and change relation hydration to fetch teams by organization id. In `src/app/api/organizations/route.ts` and `src/app/api/organizations/[id]/route.ts`, remove `teamIds` from the accepted organization payloads so callers cannot keep writing legacy data.

Then, add a direct organization-team query path on the team side. Extend the canonical team helper in `src/server/teams/teamMembership.ts` so `listCanonicalTeamsForUser` can also filter by `organizationId`, or add a dedicated helper if that is cleaner. Thread that through `src/app/api/teams/route.ts` as a new `organizationId` query parameter, and add a `teamService.getTeamsByOrganizationId` client helper in `src/lib/teamService.ts`.

Once the team query exists, switch all organization-scoped reads to it. In `src/lib/organizationService.ts`, hydrate `organization.teams` using `teamService.getTeamsByOrganizationId`. In `src/app/events/[id]/schedule/page.tsx`, replace both `org.teamIds` fallback branches with organization-id queries. In `src/app/organizations/[id]/page.tsx`, stop patching `organizationService.updateOrganization(..., { teamIds })` after team creation and stop mutating local `teamIds` state on add/delete. In `src/server/publicOrganizationCatalog.ts`, remove the fallback lookup through the organization row and query public teams by `organizationId` only. In `src/server/userPrivacy.ts`, replace the legacy org-array lookup with canonical-team + registration/staff-assignment queries keyed by `organizationId`.

Finally, update tests that still mention organization `teamIds`, regenerate Prisma artifacts, and run focused validation. The important proof is that Summit-style canonical teams with previously null `organizationId` values are backfilled by the migration and then returned through the new organization-id-only queries.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site`.

1. Edit `prisma/schema.prisma` to remove `teamIds` from the `Organizations` model.
2. Add a migration directory such as `prisma/migrations/20260421100000_remove_organization_teamids/` with a `migration.sql` file that:
   - unnests legacy organization `teamIds`,
   - updates `"Teams"."organizationId"` from those links,
   - drops `"teamIds"` from `"Organizations"`.
3. Edit the organization type/service and organization API files so `teamIds` is no longer part of the payload contract.
4. Add or extend a team-listing helper to support `organizationId`, then update the organization page, event schedule page, public catalog, and privacy code to use it.
5. Regenerate Prisma client output after the schema change.
6. Run focused tests and, if possible, a local database check that verifies teams now load for Summit without consulting an organization array.

## Validation and Acceptance

Acceptance is:

`npm test -- --runInBand src/server/__tests__/publicOrganizationCatalog.test.ts` passes with public organization teams loaded from `organizationId` only.

`npm test -- --runInBand src/lib/__tests__/organizationService.test.ts` passes after organization hydration stops depending on `teamIds`.

Any new or updated tests for the team listing helper and privacy/organization flows pass.

After loading environment variables and querying the local database, `CanonicalTeams.organizationId` is populated for the Summit teams that were previously linked only through the old organization array, and the public organization team query returns those teams without any fallback through `Organizations.teamIds`.

## Idempotence and Recovery

The migration must be safe to run once in a normal migration sequence. The backfill SQL should only overwrite a canonical team’s `organizationId` when it is null or already equal to the linked organization id, so rerunning equivalent logic during local recovery does not scramble ownership. If a migration fails before the column drop, it can be retried after fixing the SQL. If it fails after the column drop in a development database, restore from a backup or reset the local database and rerun migrations plus seed data.

## Artifacts and Notes

This plan will be updated with the migration SQL excerpt, test commands, and any live-data verification transcript as implementation proceeds.

## Interfaces and Dependencies

At the end of this work:

`src/types/index.ts` must define `Organization` without a `teamIds` field.

`src/server/teams/teamMembership.ts` must expose a canonical-team listing path that can return all teams for an organization id.

`src/app/api/teams/route.ts` must accept an `organizationId` query parameter and return canonical teams scoped to that organization.

`src/lib/teamService.ts` must provide a client helper for loading teams by organization id.

`src/lib/organizationService.ts` and all organization-scoped consumers must load teams from the team API rather than from an organization row array.

Revision note: created this ExecPlan on 2026-04-21 to capture the schema-cutover design before implementation began.
