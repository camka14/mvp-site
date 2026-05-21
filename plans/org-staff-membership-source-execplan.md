# Make Organization Staff Memberships the Authoritative Source

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Organization host and official eligibility should come from the `StaffMembers` table, not from legacy `Organizations.hostIds` and `Organizations.officialIds` arrays. After this change, scheduling an organization event will only allow the organization owner, active `HOST` staff members, and active `OFFICIAL` staff members in the relevant places. Legacy organization arrays can still exist in the database during compatibility cleanup, but they must not grant permissions or scheduling eligibility.

## Progress

- [x] (2026-05-21 13:40-07:00) Confirmed `Organizations.hostIds` and `Organizations.officialIds` still exist in `prisma/schema.prisma`.
- [x] (2026-05-21 13:40-07:00) Confirmed `StaffMembers` stores `organizationId`, `userId`, `types`, and `roleId`.
- [x] (2026-05-21 13:45-07:00) Added and applied `20260521214500_backfill_org_arrays_to_staff_members`.
- [x] (2026-05-21 13:50-07:00) Updated server authorization and organization-event sanitization to ignore legacy arrays.
- [x] (2026-05-21 13:55-07:00) Updated the organization event form so Host assignment uses active `HOST` staff and Official assignment uses active `OFFICIAL` staff.
- [x] (2026-05-21 14:05-07:00) Added regression tests proving legacy arrays no longer grant access or scheduling eligibility.
- [x] (2026-05-21 14:10-07:00) Ran targeted Jest tests, TypeScript, and migration status successfully.
- [ ] Remove `Organizations.hostIds` and `Organizations.officialIds` from the web Prisma schema and generated client.
- [ ] Remove organization-level `hostIds` and `officialIds` from mvp-site TypeScript models, API routes, and tests.
- [ ] Remove organization-level `hostIds` and `officialIds` from mvp-app Kotlin models and permission checks.
- [ ] Re-run validation for both repositories after the physical field removal.

## Surprises & Discoveries

- Observation: `src/lib/organizationEventAccess.ts` already derives hosts and officials from `StaffMembers`, but it still falls back to legacy arrays and hydrated `officials`.
  Evidence: `collectOrganizationHostIds` adds `organization.hostIds`, and `collectOrganizationOfficialIds` adds `organization.officialIds`.
- Observation: `src/server/accessControl.ts` still lets legacy `hostIds` grant management access and legacy `officialIds` grant official access.
  Evidence: `hasOrgPermission` checks `assignedHostIds.includes(session.userId)`, and `hasOrganizationStaffAccess` checks `assignedOfficialIds.includes(session.userId)`.
- Observation: the organization event form had broadened assignable organization staff to all staff IDs for both host and official assignment.
  Evidence: `organizationAllowedHostIds` and `organizationAllowedOfficialIds` both came from `organizationAssignableStaffIds`.
- Observation: one event-form sanitizer still passed `hostIds` into `sanitizeOrganizationEventAssignments`, which became ineffective after the helper stopped reading legacy arrays.
  Evidence: the `organization primary host changes` test failed until that sanitizer passed `staffMembers` and `staffInvites`.

## Decision Log

- Decision: Keep event-level `Events.officialIds`, `EventOfficials`, and match-level official assignment fields unchanged.
  Rationale: Those fields represent assignments to a specific event or match, not organization membership. The user request is about organization host/official membership.
  Date/Author: 2026-05-21 / Codex
- Decision: Keep legacy organization columns in the Prisma schema for now, but stop using them as an authoritative source.
  Rationale: Removing columns immediately would widen the blast radius across web and possible mobile/API consumers. Ignoring the columns in security and scheduling paths delivers the behavioral cutover safely while preserving compatibility during cleanup.
  Date/Author: 2026-05-21 / Codex
- Decision: Supersede the compatibility decision and remove the columns entirely from both web and mobile.
  Rationale: The user explicitly said no legacy behavior is needed and asked to remove these fields from `mvp-site` and `mvp-app`.
  Date/Author: 2026-05-21 / Codex
- Decision: Backfill legacy arrays into `StaffMembers` before ignoring them.
  Rationale: Existing organizations that still have array data should not lose active host/official eligibility when the code switches to membership-only reads.
  Date/Author: 2026-05-21 / Codex

## Outcomes & Retrospective

The first phase is complete: organization host/official eligibility now comes from `StaffMembers` in the server access helper, organization event assignment sanitizer, organization service mapping, and organization event form. A second phase is now in progress to physically remove the legacy organization fields from both repositories.

## Context and Orientation

`StaffMembers` is the organization membership table. Each row links one user to one organization and has `types`, an array containing values such as `HOST`, `OFFICIAL`, or `STAFF`. Custom organization roles live in `OrganizationRoles`, and `StaffMembers.roleId` points at the selected role.

`Organizations.hostIds` and `Organizations.officialIds` are older array fields on the organization row. They were previously used to grant host/official behavior directly. This plan makes those arrays legacy data only.

The key files are:

- `prisma/schema.prisma`, which still defines the legacy columns and the `StaffMembers` table.
- `src/lib/organizationEventAccess.ts`, which sanitizes host and official assignments for organization events.
- `src/server/accessControl.ts`, which authorizes organization management and official access.
- `src/app/events/[id]/schedule/components/EventForm.tsx`, which renders the organization staff picker for event setup.
- `src/app/api/events/[eventId]/route.ts`, which sanitizes org event assignments on save.

## Plan of Work

First, add a migration that reads any values still present in `Organizations.hostIds` and `Organizations.officialIds` and upserts them into `StaffMembers.types`. Existing staff rows will keep their current types and gain any missing `HOST` or `OFFICIAL` type. New rows will get the matching default system role when it exists.

Second, change `src/lib/organizationEventAccess.ts` so `collectOrganizationHostIds` returns the owner plus active `HOST` staff members, and `collectOrganizationOfficialIds` returns active `OFFICIAL` staff members. The helper should ignore legacy organization arrays.

Third, change `src/server/accessControl.ts` so organization management and official access are granted through owner/admin, role permissions, or `StaffMembers.types`, not through legacy arrays.

Fourth, update `EventForm.tsx` so the organization staff roster only enables "Set as host" and "Add as assistant" for active host-type staff and only enables "Add as official" for active official-type staff. The event form should pass `staffMembers` and `staffInvites` to `sanitizeOrganizationEventAssignments`.

Fifth, update tests to prove legacy arrays no longer grant access or scheduling eligibility, and run targeted validation.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site`.

Run the migration locally after adding it:

    npx prisma migrate deploy

Run targeted tests:

    npm test -- --runInBand src/lib/__tests__/organizationEventAccess.test.ts src/server/__tests__/accessControl.test.ts src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts
    npm test -- --runInBand --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx"
    npx tsc --noEmit
    npx prisma migrate status

## Validation and Acceptance

The key acceptance behavior is that an organization row containing `hostIds` or `officialIds` does not by itself grant scheduling or access. A user must be the owner or have an active `StaffMembers` row with the appropriate type or permission. An org event save that submits an official outside active `OFFICIAL` staff must filter that official out.

## Idempotence and Recovery

The backfill migration must be idempotent by using `ON CONFLICT ("organizationId", "userId") DO UPDATE` and by merging types with `DISTINCT`. Re-running tests should not require database cleanup. The legacy columns are not dropped in this plan, so rollback risk is limited to application logic and the additive backfill migration.

## Artifacts and Notes

Artifacts will be recorded after tests run.

Validation completed from `C:\Users\samue\Documents\Code\mvp-site`:

    npx prisma migrate deploy
    npm test -- --runInBand src/lib/__tests__/organizationEventAccess.test.ts src/server/__tests__/accessControl.test.ts src/app/api/events/__tests__/eventPatchSanitizeRoutes.test.ts
    npm test -- --runInBand --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx"
    npm test -- --runInBand src/app/api/organizations/__tests__/organizationByIdRoute.test.ts src/app/api/organizations/__tests__/organizationPublicSlugRoute.test.ts src/app/api/users/__tests__/userByIdRoute.test.ts
    npx tsc --noEmit
    npx prisma migrate status

All listed commands completed successfully.

## Interfaces and Dependencies

Use existing helpers from `src/lib/staff.ts`: `deriveOrganizationRoleIds`, `hasStaffMemberType`, and invite-blocking behavior. No new external dependency is needed.
