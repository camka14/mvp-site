# Persist Organization Sports and Unify Discover Filters for Events, Organizations, and Rentals

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` from the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, organization owners can set which sports their organization covers during org edit, and that data persists in the backend. In Discover, Organizations and Rentals will use the same filter container layout and interaction style as Events, Rentals time range will live inside that container, and distance filtering will work consistently across all three tabs. The result is one predictable discovery filtering experience with shared behavior.

## Progress

- [x] (2026-02-20 00:00Z) Audited current discover tab implementations, org edit modal, org API routes, Prisma schema, and Organization type/service mapping.
- [x] (2026-02-20 00:00Z) Added and persisted `Organizations.sports` in Prisma schema, migration SQL, API payload handling, and client mapping.
- [x] (2026-02-20 00:00Z) Added org sports selection UI in organization create/edit modal and submit payload.
- [x] (2026-02-20 00:00Z) Updated discover Organizations tab to use event-style filter container/drawer and apply sports + distance filtering.
- [x] (2026-02-20 00:00Z) Updated discover Rentals tab to use event-style filter container/drawer, moved time range into container, and applied sports + distance filtering.
- [x] (2026-02-20 00:00Z) Ran validation checks and recorded outcomes.

## Surprises & Discoveries

- Observation: `src/app/discover/page.tsx` already computes event distance filtering but Organizations and Rentals only sort by distance; they do not filter by max distance.
  Evidence: Existing logic only compares/sorts `distanceKm` in memoized lists and never excludes by threshold.

- Observation: `npx tsc --noEmit` fails in this repository on pre-existing test typing issues unrelated to this feature.
  Evidence: Errors surfaced in `src/app/api/events/__tests__/templatePrivacyRoutes.test.ts`, `src/app/api/users/__tests__/*`, and `src/server/__tests__/socialGraph.test.ts` after Prisma regeneration removed the new `sports` typing issue.

## Decision Log

- Decision: Store organization sports as `string[]` on `Organizations` rather than ids.
  Rationale: Discover and existing event sport filtering are name-based, so this avoids additional join/mapping overhead and keeps compatibility with current UI filters.
  Date/Author: 2026-02-20 / Codex

- Decision: Keep event filtering behavior unchanged and layer analogous container behavior into Organizations/Rentals.
  Rationale: User explicitly requested preserving event filter behavior while matching look/feel/interaction patterns on other tabs.
  Date/Author: 2026-02-20 / Codex

- Decision: Reuse the shared `selectedSports` discover state across Events, Organizations, and Rentals.
  Rationale: This preserves event filter semantics while aligning cross-tab sports filtering behavior and reducing duplicate state drift.
  Date/Author: 2026-02-20 / Codex

## Outcomes & Retrospective

Implemented full stack support for organization sports and discover filter parity updates in one pass. Organization sports can now be selected in edit/create flow and persisted through API + DB schema. Organizations and Rentals now use the same filter container pattern as Events (desktop sidebar + mobile drawer + active chips + reset controls), Rentals time range moved into that container, and both tabs now apply distance and sports filtering. Events tab behavior remains intact.

Validation completed with one passing targeted Jest suite and lint passing on edited files. Repo-wide typecheck still reports unrelated pre-existing typing issues in existing test files.

## Context and Orientation

Key files for this work:

- `prisma/schema.prisma` defines `Organizations` DB shape.
- `prisma/migrations/*/migration.sql` contains SQL changes applied in deploys.
- `src/app/api/organizations/route.ts` handles org list/create and validates create payload.
- `src/app/api/organizations/[id]/route.ts` handles org read/update.
- `src/lib/organizationService.ts` maps API rows into `Organization` and sends create/update payloads.
- `src/types/index.ts` defines shared `Organization` type.
- `src/components/ui/CreateOrganizationModal.tsx` is the org edit/create UI entry point.
- `src/app/discover/page.tsx` contains all tab filter logic and tab content components.

## Plan of Work

Implement persistence first so org sports selection has storage. Add `sports` array to Prisma `Organizations`, add migration SQL, add API create acceptance/writes for `sports`, and ensure client mapping includes `sports` both for reads and writes.

Then update `CreateOrganizationModal` to load available sports via `useSports`, allow multi-selection, prefill on edit, and include selected sports in create/update payloads.

Then enhance `src/app/discover/page.tsx`:

1. Keep Events logic intact.
2. Apply sports and distance filtering to organizations results.
3. Apply sports, distance, and time-range filtering for rentals.
4. Rework Organizations and Rentals tab layouts to use the same filter container patterns used by Events (desktop sidebar + mobile drawer + active filter chips + reset behavior).

## Concrete Steps

From repo root (`/home/camka/Projects/MVP/mvp-site`):

1. Edit schema/types/services/routes/modal/discover page files listed above.
2. Add a new migration SQL folder for the organizations sports column.
3. Run `npx tsc --noEmit`.
4. Run a targeted test touching discover rental logic: `npm test -- src/app/discover/__tests__/rentals.utils.test.ts`.

## Validation and Acceptance

Acceptance criteria:

- Organization modal (edit mode) shows sports selection and saves selections.
- Reloading an edited organization preserves sports values.
- Discover Organizations tab shows event-style filter container UX and can filter by distance and selected sports.
- Discover Rentals tab shows event-style filter container UX, contains time range in that container, and supports distance filtering.
- Events tab still supports existing filters and distance filter behavior.
- Typecheck and targeted tests pass.

## Idempotence and Recovery

All edits are additive and repeatable. If migration SQL is applied twice in local workflows, it uses `ADD COLUMN IF NOT EXISTS` to avoid duplicate-column failures. If UI behavior regresses, each tab section can be validated independently by toggling tabs and checking filter chips and empty states.

## Artifacts and Notes

- `npx prisma generate` succeeded and updated generated Prisma types for the new `Organizations.sports` field.
- `npx tsc --noEmit` failed due existing test typing issues unrelated to this feature (`templatePrivacyRoutes.test.ts`, `socialRoutes.test.ts`, `usersRoute.test.ts`, `socialGraph.test.ts`).
- `npm test -- src/app/discover/__tests__/rentals.utils.test.ts` passed.
- `npx eslint src/app/discover/page.tsx src/components/ui/CreateOrganizationModal.tsx src/lib/organizationService.ts src/app/api/organizations/route.ts src/app/api/organizations/[id]/route.ts` passed.

## Interfaces and Dependencies

Expected interfaces after completion:

- `Organization` in `src/types/index.ts` includes optional `sports?: string[]`.
- `Organizations` in `prisma/schema.prisma` includes `sports String[] @default([])`.
- `organizationService.mapRowToOrganization` maps row `sports` to `Organization.sports`.
- Discover tab content components accept and apply distance/sport/time filter state via props and internal memoized filtering.

Revision Note (2026-02-20): Updated this ExecPlan from planning to implementation-complete status, marking completed milestones, recording validation outcomes, and documenting final design decisions made during coding.
