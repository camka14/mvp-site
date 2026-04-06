# Razumly Admin Organization Owner Override

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: follow `PLANS.md` in the repository root for mandatory ExecPlan structure and maintenance rules.

## Purpose / Big Picture

Verified Razumly administrators need to debug and support any organization without manually joining that organization as owner, host, or staff. After this change, a Razumly admin can open an organization and use the same management surfaces that an organization owner can use, and server routes that already rely on shared organization-management checks will authorize those requests automatically.

## Progress

- [x] (2026-04-06 21:19Z) Confirmed the existing mismatch: the organization page exposed the `Users` tab to outsiders while the backing route still enforced ordinary organization membership.
- [x] (2026-04-06 21:19Z) Added a shared organization-users access helper and used it for the `Users` tab and users route.
- [x] (2026-04-06 21:19Z) Decided to broaden scope from `Users` only to full organization-owner-equivalent access for verified Razumly admins.
- [x] (2026-04-06 21:19Z) Updated shared organization management access so Razumly admins pass the same checks as owners/hosts/staff.
- [x] (2026-04-06 21:19Z) Returned a server-computed `viewerCanManageOrganization` flag from organization payloads and used it in client pages that previously inferred ownership locally.
- [x] (2026-04-06 21:19Z) Replaced the remaining direct team-route organization-owner check with the shared organization access helper.
- [x] (2026-04-06 21:19Z) Added focused tests for shared access control and affected organization routes, then ran targeted Jest and `npx tsc --noEmit`.

## Surprises & Discoveries

- Observation: most server routes already flow through `canManageOrganization`, so the main remaining drift was in client pages and one team-route helper.
  Evidence: `rg -n "canManageOrganization\\(|isOwner\\b|ownerId\\s*===|activeOrganization.ownerId"` shows broad shared-helper usage plus a few local owner checks in `src/app/organizations/[id]/page.tsx`, `src/app/events/[id]/schedule/page.tsx`, and `src/app/api/teams/[id]/route.ts`.

- Observation: live data for the reported `CARRILLO` organization showed no membership link to either Razumly account, so the old `403` was expected under normal org access rules.
  Evidence: `dbhub-live` queries returned a different `ownerId`, no `StaffMembers`, and no org events or registrations for the Razumly user ids.

- Observation: a new server-side access-control test cannot import the real generated Prisma client under Jest in this repo because the generated client uses `import.meta`.
  Evidence: the first run of `src/server/__tests__/accessControl.test.ts` failed with `SyntaxError: Cannot use 'import.meta' outside a module` until the test mocked `@/lib/prisma`, matching the existing repo testing pattern.

## Decision Log

- Decision: treat verified Razumly admins as organization owners through shared access-control helpers instead of sprinkling route-specific overrides.
  Rationale: this keeps support/debug access consistent across route handlers and reduces the chance of new organization features forgetting the override.
  Date/Author: 2026-04-06 / Codex

- Decision: return client-facing capability flags such as `viewerCanManageOrganization` from the organization API rather than recomputing owner/staff logic in client components.
  Rationale: the server has the full authenticated context, including Razumly admin status; client guesses drifted from server authorization and caused the original bug.
  Date/Author: 2026-04-06 / Codex

- Decision: keep the new shared access-control test isolated from the generated Prisma client by mocking `@/lib/prisma`.
  Rationale: this repository’s generated Prisma client is not Jest-friendly in this environment, and the existing server tests already use module mocks for the same reason.
  Date/Author: 2026-04-06 / Codex

## Outcomes & Retrospective

Completed. Verified Razumly admins now pass the shared organization-management checks that most owner-only organization routes already use, organization payloads now expose both `viewerCanManageOrganization` and `viewerCanAccessUsers`, and the two client pages that locally inferred ownership now honor the server-computed management capability. The remaining gap is deployment and live verification after release; the code-level validation is complete.

## Context and Orientation

Organization access lives in a few layers. The central server helper is `src/server/accessControl.ts`, where `canManageOrganization` and `canOfficialOrganization` decide whether an authenticated session can manage or officiate an organization. Many route handlers already trust these helpers, including organization templates, staff, billing, fields, products, and event template flows.

Razumly admin status is currently defined in `src/server/razumlyAdmin.ts`. That file checks whether the authenticated user has a verified email on an allowed internal domain such as `razumly.com` or `bracket-iq.com`, with an optional email allow list. Before this plan, that status only granted access to the global admin area and the recently-added organization-users helper.

The organization detail UI is `src/app/organizations/[id]/page.tsx`. It currently renders owner-only tabs and actions from a local `isOwner` calculation based on `ownerId` and `staffMembers`. The event schedule page at `src/app/events/[id]/schedule/page.tsx` has a similar local `isOrganizationManager` calculation. These local checks do not know about Razumly admin status.

Organization payloads are fetched through `src/app/api/organizations/[id]/route.ts` and mapped in `src/lib/organizationService.ts` into the `Organization` type defined in `src/types/index.ts`. This route is the right place to publish viewer-specific capability flags because it already has access to the current session and already conditionally returns staff-private data based on organization-management permissions.

One notable server-side bypass is `src/app/api/teams/[id]/route.ts`, which has a local `hasOrganizationTeamManagementAccess` helper that manually checks `ownerId` and `StaffMembers` instead of calling the shared organization access helper.

## Plan of Work

First, update `src/server/accessControl.ts` so that verified Razumly admins pass `hasOrganizationStaffAccess` in the same way that owners and internal staff do. Keep the override inside the shared helper, not in every route. The helper should still preserve fast local exits for `session.isAdmin`, direct owners, and assigned host/official ids before consulting Razumly admin lookup.

Second, update `src/server/organizationUsersAccess.ts` so it relies on the shared access helper rather than re-checking Razumly admin state itself. That keeps the users-specific access rule aligned with the broader organization-management rule.

Third, update `src/app/api/organizations/[id]/route.ts` to return `viewerCanManageOrganization` alongside `viewerCanAccessUsers`, and wire that field through `src/lib/organizationService.ts` and `src/types/index.ts`. Once that payload flag exists, update `src/app/organizations/[id]/page.tsx` so owner-only tabs and actions use the server-computed capability, and update `src/app/events/[id]/schedule/page.tsx` so organization manager access also honors the same server-computed capability.

Fourth, replace the direct team-route ownership helper in `src/app/api/teams/[id]/route.ts` with `canManageOrganization` so team updates/deletes also honor the Razumly admin override.

Finally, add focused tests. Cover the shared access helper in a new server test, extend organization route tests to assert `viewerCanManageOrganization`, and keep the organization-users route tests passing for a verified Razumly admin path. Then run the targeted Jest suites and `npx tsc --noEmit`.

## Concrete Steps

From the repository root `/Users/elesesy/StudioProjects/mvp-site`:

1. Edit `src/server/accessControl.ts` to add a small helper that asks `evaluateRazumlyAdminAccess` whether the current session user is a verified Razumly admin. Call it from `hasOrganizationStaffAccess` after the simple local owner/host/official checks and before staff-member table lookups.

2. Edit `src/server/organizationUsersAccess.ts` to remove the route-specific Razumly admin shortcut and let `canManageOrganization` provide that behavior.

3. Edit `src/app/api/organizations/[id]/route.ts`, `src/lib/organizationService.ts`, and `src/types/index.ts` to add `viewerCanManageOrganization` to the organization payload and mapped type.

4. Edit `src/app/organizations/[id]/page.tsx` and `src/app/events/[id]/schedule/page.tsx` so their local owner/manager booleans accept the new server capability flag.

5. Edit `src/app/api/teams/[id]/route.ts` so its organization-management helper delegates to `canManageOrganization`.

6. Add or update tests in:
   `src/server/__tests__/accessControl.test.ts`
   `src/app/api/organizations/__tests__/organizationByIdRoute.test.ts`
   `src/app/api/organizations/__tests__/organizationUsersRoute.test.ts`

## Validation and Acceptance

Run the following from `/Users/elesesy/StudioProjects/mvp-site`:

    npm test -- --runTestsByPath \
      src/server/__tests__/accessControl.test.ts \
      src/app/api/organizations/__tests__/organizationByIdRoute.test.ts \
      src/app/api/organizations/__tests__/organizationUsersRoute.test.ts

Expect all targeted suites to pass.

Then run:

    npx tsc --noEmit

Expect no TypeScript errors.

Manual acceptance after deployment is:

1. Sign in with a verified Razumly admin email.
2. Open an organization where that account is not the stored `ownerId` and is not listed in `StaffMembers`.
3. Observe that owner-only organization controls are present.
4. Open the organization `Users` tab and observe that it loads instead of returning `Forbidden`.
5. Open an organization-backed event schedule page and observe that owner-level management controls are enabled there as well.

## Idempotence and Recovery

These edits are additive and safe to rerun. The targeted tests and `npx tsc --noEmit` can be rerun without cleanup. If a route test fails because a Prisma mock does not provide `authUser`, make the mocked client shape explicit in that test rather than removing the shared access override.

## Artifacts and Notes

Useful evidence gathered during investigation:

    SELECT id, name, "ownerId", "hostIds", "officialIds"
    FROM "Organizations"
    WHERE UPPER(name) = 'CARRILLO';

returned one row with a different owner and no host or official ids.

    SELECT sm."organizationId", sm."userId", sm.types
    FROM "StaffMembers" sm
    WHERE sm."organizationId" = '412836ee-2bcb-4b89-a9b8-d8e8a8ad17a6';

returned zero rows.

This confirmed the reported live behavior was caused by authorization drift, not by incorrect membership data.

## Interfaces and Dependencies

The final implementation must preserve these interfaces:

- `src/server/accessControl.ts`
  `canManageOrganization(session, organization, client?) -> Promise<boolean>`
  `canOfficialOrganization(session, organization, client?) -> Promise<boolean>`

- `src/app/api/organizations/[id]/route.ts`
  must return organization JSON that may include:
  `viewerCanManageOrganization: boolean`
  `viewerCanAccessUsers: boolean`

- `src/types/index.ts`
  `Organization` must include optional `viewerCanManageOrganization?: boolean` and `viewerCanAccessUsers?: boolean`

Change note: Created this ExecPlan to broaden the earlier `Users`-tab fix into a repository-wide Razumly-admin-as-organization-owner override for support and debugging (2026-04-06 / Codex).

Change note: Updated the ExecPlan after implementation to record completed work, the Jest/Prisma mocking discovery, and the final validation commands/results (2026-04-06 / Codex).
