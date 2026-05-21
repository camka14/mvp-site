# Organization Staff Role Permissions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](../PLANS.md).

## Purpose / Big Picture

Organization staff access is currently controlled by broad staff type labels such as `HOST`, `OFFICIAL`, and `STAFF`. That makes it hard for an organization to create practical roles like Front Desk, Tournament Manager, or Rentals Coordinator without giving everyone the same broad access. After this change, each organization can have named roles with permissions attached to those roles, and staff members can be assigned one of those roles while still keeping the existing Host and Official behavior used by scheduling.

The user-visible proof is in the organization staff roster. A manager can assign a custom role to a staff member, and server routes that used to allow any `HOST` or `STAFF` member now allow only staff whose assigned role includes the required permission. Host and Official remain special scheduling flags, so officials still appear in official scheduling workflows even though authorization is permission-based.

## Progress

- [x] (2026-05-21 18:13Z) Confirmed the existing repository uses `StaffMembers` as the organization membership table and stores special behavior labels in `StaffMembers.types`.
- [x] (2026-05-21 18:13Z) Recorded the user decisions: reuse `StaffMembers`, add role-based permissions, keep Host and Official special behavior, use a separate permissions table, seed defaults, backfill, and migrate authorization checks.
- [x] (2026-05-21 18:25Z) Added Prisma schema models, generated client output, and an additive migration for organization roles, role permissions, and `StaffMembers.roleId`.
- [x] (2026-05-21 18:25Z) Added the permission catalog, default role helpers, and permission-based `canManageOrganization` behavior.
- [x] (2026-05-21 18:25Z) Updated organization GET, organization create, staff PATCH, invite staff creation, and client organization mapping to carry roles and role assignments.
- [x] (2026-05-21 18:25Z) Updated the organization roster UI so role assignment is separate from Host, Official, and Staff behavior flags, and added simple role creation/editing controls.
- [x] (2026-05-21 18:25Z) Replaced the broad management authorization path with `organization.manage` role permission checks while preserving Official type checks for official-specific access.
- [x] (2026-05-21 18:29Z) Added API regression tests for staff role assignment and role permission updates.
- [x] (2026-05-21 18:29Z) Ran targeted Jest tests and TypeScript checks successfully.
- [x] (2026-05-21 20:38Z) Removed the redundant Admin default role from the default role catalog, added a migration that moves existing Admin role assignments to Staff, and applied that migration locally.

## Surprises & Discoveries

- Observation: `StaffMembers.types` is already used as a multi-value behavior flag set rather than a single role, so it can preserve Host and Official scheduling behavior while `roleId` becomes the authorization role assignment.
  Evidence: `src/lib/staff.ts` defines `StaffMemberType = HOST | OFFICIAL | STAFF` normalization helpers, and `src/lib/organizationService.ts` derives `hostIds` and `officialIds` from staff members and invites.
- Observation: existing access helpers still grant broad management access to organization `hostIds` and staff rows with `HOST` or `STAFF`.
  Evidence: `src/server/accessControl.ts` contains `hasOrganizationStaffAccess` and `canManageOrganization`, which check `STAFF_ACCESS_TYPES` and assigned host IDs before consulting `StaffMembers`.
- Observation: there are uncommitted user edits in organization and invite files before this implementation starts.
  Evidence: `git status --short` showed modified files including `src/app/organizations/[id]/RoleRosterManager.tsx`, `src/app/organizations/[id]/page.tsx`, and `src/app/api/invites/route.ts`.
- Observation: Prisma client generation succeeds with the new models and field.
  Evidence: `npx prisma generate` completed successfully and generated Prisma Client 7.7.0 to `src/generated/prisma`.
- Observation: the focused authorization and API tests pass with the new role-permission model.
  Evidence: `npm test -- --runInBand src/server/__tests__/accessControl.test.ts`, `npm test -- --runInBand src/app/api/organizations/__tests__/organizationByIdRoute.test.ts`, `npm test -- --runInBand src/app/api/organizations/__tests__/organizationStaffRoute.test.ts`, `npm test -- --runInBand src/app/api/organizations/__tests__/organizationRoleRoutes.test.ts`, and `npm test -- --runInBand src/app/api/invites/__tests__/inviteRoutes.test.ts` all passed.
- Observation: rendered Browser validation could not be completed in this session.
  Evidence: the in-app Browser reported `localhost refused to connect` for `http://localhost:3000` and then blocked further local-page inspection under its URL policy. TypeScript and Jest validation still passed.

## Decision Log

- Decision: reuse `StaffMembers` instead of creating a new organization membership table.
  Rationale: `StaffMembers` already has the correct uniqueness contract, indexes, and API usage for organization membership. A second membership table would duplicate behavior and create migration ambiguity.
  Date/Author: 2026-05-21 / Codex
- Decision: keep `StaffMembers.types` as special behavior flags and add `StaffMembers.roleId` for the authorization role.
  Rationale: Host and Official are not just permissions; they control scheduling eligibility and assignment UI. Keeping them as behavior flags lets scheduling continue to work while access control becomes permission-based.
  Date/Author: 2026-05-21 / Codex
- Decision: store permissions in a separate `OrganizationRolePermission` table instead of a string array or JSON field.
  Rationale: a relational table gives uniqueness, queryability, incremental updates, and room for audit metadata later.
  Date/Author: 2026-05-21 / Codex
- Decision: keep organization owner authority based on `Organizations.ownerId`.
  Rationale: ownership is an account recovery and final-control concept. The owner may be displayed through a system role, but authorization must still allow the owner even if staff role data is missing.
  Date/Author: 2026-05-21 / Codex
- Decision: seed default roles per organization and backfill existing staff members from current `types`.
  Rationale: existing organizations must continue working after migration without requiring manual role setup.
  Date/Author: 2026-05-21 / Codex
- Decision: remove the Admin default organization role and keep Staff, Host, and Official as the seeded defaults.
  Rationale: Admin duplicated the Staff default permissions and added an unnecessary role option. Existing Admin assignments are reassigned to Staff before Admin is deleted so access is preserved.
  Date/Author: 2026-05-21 / Codex

## Outcomes & Retrospective

The implemented feature now has a complete first pass: schema, migration, generated Prisma client output, permission helpers, default role seeding, route enforcement, staff role assignment, role permission editing, organization service mapping, and roster UI. TypeScript validation passes. Remaining product hardening can include a richer role-management screen, audit logging for role changes, and replacing broad `canManageOrganization` callers with narrower permission-specific checks such as `billing.manage` or `events.manage`.

The default role set is now Staff, Host, and Official. The previous Admin default has been removed because it duplicated Staff, and the cleanup migration preserves existing Admin assignees by moving them to Staff before deleting Admin.

Rendered UI validation remains unverified because the in-app Browser could not reach the local server in this session. The code-level and route-level validation passed, but a human or a later agent should still open an organization staff tab with seeded data to visually confirm the role selector and role editor layout.

## Context and Orientation

This is a Next.js App Router application using Prisma and Postgres. Prisma schema lives in `prisma/schema.prisma`, and generated Prisma client files live under `src/generated/prisma`. The staff membership table is named `StaffMembers`. Each row currently has `organizationId`, `userId`, and `types`. The `types` array stores labels like `HOST`, `OFFICIAL`, and `STAFF`.

In this plan, a permission is a stable string used by server code to decide whether an action is allowed, such as `organization.manage`, `staff.manage`, or `events.manage`. A role is a named organization-specific bundle of permissions, such as Admin or Front Desk. A behavior flag is a non-authorization label stored in `StaffMembers.types`; Host and Official remain behavior flags because other parts of the product use them to decide who can be assigned as event hosts or officials.

Server authorization currently lives in `src/server/accessControl.ts`. Organization staff helpers live in `src/lib/staff.ts`. Organization data loading and mapping lives in `src/app/api/organizations/[id]/route.ts` and `src/lib/organizationService.ts`. The organization staff roster UI lives in `src/app/organizations/[id]/RoleRosterManager.tsx` and is wired from `src/app/organizations/[id]/page.tsx`.

Tests for the core access helper live in `src/server/__tests__/accessControl.test.ts`. Staff normalization tests live in `src/lib/__tests__/staff.test.ts`. API tests for staff invites and organization users live under `src/app/api`.

## Plan of Work

First, add schema and migration support. Add `roleId` to `StaffMembers`, create `OrganizationRoles`, and create `OrganizationRolePermissions`. The migration must add the tables idempotently, seed default roles for every existing organization, insert default permissions, and assign a role to existing staff members based on their current `types`. A staff member with `STAFF` should get the Admin or Staff role depending on the most conservative mapping chosen during implementation. A staff member with `HOST` and no `STAFF` should get the Host role. A staff member with `OFFICIAL` and no `HOST` or `STAFF` should get the Official role. If several flags exist, choose the role that preserves the broadest current management access.

Next, add application-level permission helpers. Create a permission catalog in `src/lib/organizationPermissions.ts` with typed permission constants and default role definitions. Extend `src/server/accessControl.ts` so `canManageOrganization` delegates to a new permission check while still allowing platform admins, Razumly admins, and `Organizations.ownerId`. Keep `hasOrganizationStaffAccess` available for compatibility, but make it prefer permissions for management checks and retain type checks only for official-specific checks.

Then, expose roles through APIs and services. Update `src/app/api/organizations/[id]/route.ts` to fetch organization roles and their permissions along with staff members. Update the staff route `src/app/api/organizations/[id]/staff/route.ts` so a manager can update both `types` and `roleId` for a staff member, with validation that the role belongs to the same organization. Update `src/lib/organizationService.ts` and `src/types/index.ts` so the client can read roles, permissions, and each staff member's role.

After that, update the organization staff roster UI. Change `RoleRosterManager` from a types-only editor into a roster where the assigned role is selected separately from behavior flags. The UI must still let managers mark a user as Host or Official for scheduling workflows. The role selector should use the organization's roles. Keep the current interaction style and avoid a large visual redesign because this is a functional permission change, not a marketing page.

Finally, add tests and validation. Unit tests should prove that role permissions allow and deny `canManageOrganization` correctly, owner/admin bypasses still work, and pending staff invites still block active staff access. API tests should prove the staff route rejects a role from another organization and accepts a valid same-organization role. Existing tests that mock staff rows may need `roleId` and role permission mocks added.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site`.

Create or update these files:

- `prisma/schema.prisma` for the new models and `StaffMembers.roleId`.
- `prisma/migrations/<timestamp>_add_organization_staff_roles/migration.sql` for the database migration.
- `src/lib/organizationPermissions.ts` for permission constants and default role definitions.
- `src/server/accessControl.ts` for permission-based authorization.
- `src/types/index.ts` for client-facing role and staff member types.
- `src/app/api/organizations/[id]/route.ts` to include roles.
- `src/app/api/organizations/[id]/staff/route.ts` to update staff role assignments.
- `src/lib/organizationService.ts` to map roles and send role assignment updates.
- `src/app/organizations/[id]/RoleRosterManager.tsx` and `src/app/organizations/[id]/page.tsx` for the role UI.
- Targeted tests in `src/server/__tests__/accessControl.test.ts` and staff route tests.

Run generation and validation commands from the repository root:

    npx prisma generate
    npm test -- --runInBand src/server/__tests__/accessControl.test.ts
    npm test -- --runInBand src/app/api/organizations/__tests__/organizationByIdRoute.test.ts
    npm test -- --runInBand src/app/api/invites/__tests__/inviteRoutes.test.ts
    npx tsc --noEmit

If Prisma generation fails because a local database URL is missing, do not run migrations. Record the failure and keep the hand-written schema and SQL migration in place.

## Validation and Acceptance

Acceptance is behavioral. An organization owner should still manage the organization even if no staff role exists. A non-owner staff member should manage the organization only when their assigned organization role contains the management permission. A staff member with `OFFICIAL` behavior but without the management permission should remain eligible for official scheduling but should not be able to manage organization settings.

In tests, the access-control suite must include at least these cases:

1. owner bypass allows management;
2. role permission allows management;
3. missing role permission denies management;
4. official behavior alone does not grant management;
5. existing pending staff invites still block staff-derived access.

For UI acceptance, the organization roster should show a role selector for active staff rows and preserve the behavior flag editor for Host, Official, and Staff. Updating either control should persist and reload through the existing organization service.

## Idempotence and Recovery

The database migration must be additive. It may create roles and backfill `roleId`, but it must not delete existing `StaffMembers.types` or legacy organization host/official ID fields. Re-running the migration statements manually should not duplicate default roles or permissions because unique indexes and conflict handling should be used.

Because there are existing user edits in several files, do not run destructive Git commands. Before editing a file with existing local changes, read the relevant section and make targeted patches that preserve unrelated work. If a generated Prisma file changes substantially after `npx prisma generate`, inspect the generated diff but do not manually edit generated client output.

## Artifacts and Notes

Initial repository evidence:

    prisma/schema.prisma contains model StaffMembers with id, createdAt, updatedAt, organizationId, userId, and types.
    src/lib/staff.ts normalizes HOST, OFFICIAL, and STAFF and derives organization host and official IDs.
    src/server/accessControl.ts currently grants management to owner, platform admin, Razumly admin, assigned host IDs, and staff rows with HOST or STAFF.

Expected final high-level data shape:

    StaffMembers.roleId points at OrganizationRoles.id.
    OrganizationRoles stores organizationId, name, kind, systemKey, isSystem, and isDefault.
    OrganizationRolePermissions stores one permission string per role.

Validation evidence from 2026-05-21:

    npx prisma generate
    PASS generated Prisma Client 7.7.0 to src/generated/prisma

    npm test -- --runInBand src/server/__tests__/accessControl.test.ts
    PASS 5 tests

    npm test -- --runInBand src/app/api/organizations/__tests__/organizationByIdRoute.test.ts
    PASS 9 tests

    npm test -- --runInBand src/app/api/organizations/__tests__/organizationStaffRoute.test.ts
    PASS 2 tests

    npm test -- --runInBand src/app/api/organizations/__tests__/organizationRoleRoutes.test.ts
    PASS 2 tests

    npm test -- --runInBand src/app/api/invites/__tests__/inviteRoutes.test.ts
    PASS 12 tests

    npx tsc --noEmit
    PASS with no TypeScript errors

## Interfaces and Dependencies

At the end of this plan, `src/lib/organizationPermissions.ts` must export stable permission constants and default role definitions. `src/server/accessControl.ts` must expose a permission helper such as `hasOrgPermission` or `requireOrgPermission` and keep existing exported helpers working for callers. `src/types/index.ts` must define client-facing organization role and permission types. `src/lib/organizationService.ts` must expose a staff update method that accepts both `types` and `roleId`.

The code must continue using Prisma through `src/lib/prisma.ts` and generated client output under `src/generated/prisma`. The frontend must continue using Mantine components already used in `RoleRosterManager`.

Plan created on 2026-05-21 to implement organization-specific staff roles with role permissions while preserving Host and Official scheduling behavior.

Updated on 2026-05-21 after implementing the schema, migration, server helpers, API wiring, roster UI, route tests, and validation. The plan now records the passing test commands and remaining hardening ideas.
