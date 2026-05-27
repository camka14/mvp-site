# Minor Team Registration Guardian Flow

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root.

## Purpose / Big Picture

After this change, a child account can ask to join an open-registration team without consuming a team roster slot. The request appears to linked parents or guardians, and only a parent or guardian accepting the request creates the real team registration and starts the existing document or payment flow. A child can still see team invites addressed to them, but accepting is blocked on the server and the client explains that a parent or guardian must accept.

## Progress

- [x] (2026-05-26 00:00Z) Read the existing team registration, invite, family request, and UI flows.
- [x] (2026-05-26 00:00Z) Decided to use the existing `Invites` table for pending child open-team join requests so no schema migration is needed.
- [x] (2026-05-26 00:00Z) Implemented server-side request creation and guardian-only team invite acceptance.
- [x] (2026-05-26 00:00Z) Expanded parent family join requests to include child team invites and open team join requests.
- [x] (2026-05-26 00:00Z) Updated client UI for child self-registration requests and child team invites.
- [x] (2026-05-26 00:00Z) Added focused Jest coverage and ran targeted tests plus TypeScript.

## Surprises & Discoveries

- Observation: Manager-created team player invites already create or update a `TeamRegistrations` row with status `INVITED` through `syncCanonicalTeamRoster`.
  Evidence: `src/app/api/teams/[id]/member-invites/route.ts` calls `syncCanonicalTeamRoster` with `pendingPlayerIds`, and `src/server/teams/teamMembership.ts` persists those as `INVITED`.
- Observation: Open team registration for minors currently reserves a real registration immediately when a parent link exists.
  Evidence: `src/app/api/teams/[id]/registrations/self/route.ts` changes `registrantType` to `CHILD` and calls `reserveTeamRegistrationSlot`.

## Decision Log

- Decision: Represent a child open-registration join request as a pending `Invites` row with `type = TEAM`, `teamId`, `userId` equal to the child, and `createdBy` equal to the child.
  Rationale: The existing table already supports pending team actions, can be listed for the child and parent, and does not count toward team capacity unless a `TeamRegistrations` row is created.
  Date/Author: 2026-05-26 / Codex
- Decision: Do not create `TeamRegistrations` for child open-registration requests until a linked parent or guardian accepts.
  Rationale: A pending child request should not hold a team slot indefinitely if the parent never responds.
  Date/Author: 2026-05-26 / Codex
- Decision: Keep manager-created player invites as `INVITED` registrations.
  Rationale: That is existing behavior and a different workflow: a team manager intentionally reserves a pending invite slot.
  Date/Author: 2026-05-26 / Codex

## Outcomes & Retrospective

Implemented the guardian flow without a database migration. A minor self-registering for an open team now receives a parent-approval response and a pending `Invites` row; linked parents can see that request alongside child team invites; accepting as the parent creates the `TeamRegistrations` row through the same reservation helper used by parent-initiated child registration. Child self-acceptance of team invites is blocked with a parent-required message. Validation passed with targeted Jest and TypeScript.

## Context and Orientation

Team membership is stored in `TeamRegistrations`; rows with `ACTIVE`, `PENDING`, `STARTED`, or `INVITED` count toward capacity. The helper `reserveTeamRegistrationSlot` in `src/server/teams/teamOpenRegistration.ts` creates or updates those rows and enforces capacity. Team invites are stored in `Invites`; manager-created player invites are created in `src/app/api/teams/[id]/member-invites/route.ts` and are accepted in `src/app/api/invites/[id]/accept/route.ts`.

The parent dashboard lists child event requests through `src/app/api/family/join-requests/route.ts` and resolves them through `src/app/api/family/join-requests/[registrationId]/route.ts`. The client renders those requests in `src/app/profile/page.tsx`. Open team registration is initiated by `src/components/ui/TeamRegistrationFlow.tsx` through `teamService.registerSelfForTeam`.

## Plan of Work

First, change child self open-team registration so it creates or refreshes a pending team invite/request instead of calling `reserveTeamRegistrationSlot`. Then add guardian-aware team invite accept and decline helpers that let a linked parent act on a child invite while blocking child self-acceptance with clear messages. Next, expand the family join request API and profile UI to include pending child team invites and requests. Finally, update the team invite UI to disable child self-acceptance and add focused tests for the new behavior.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site`.

Run targeted tests after implementation:

    npm test -- --runTestsByPath src/app/api/invites/__tests__/acceptInviteRoute.test.ts src/app/api/family/__tests__/joinRequestsRoute.test.ts src/lib/__tests__/teamService.test.ts

Run TypeScript after tests:

    npx tsc --noEmit --pretty false

## Validation and Acceptance

The change is accepted when a minor calling `/api/teams/:id/registrations/self` receives a parent-approval response and no team registration is reserved; a linked parent sees that request in family join requests and approval creates the team registration; a child attempting to accept a team invite receives a 403 with the parent-required message; and the client disables direct child invite acceptance.

## Idempotence and Recovery

The request creation path upserts an existing pending invite for the same child and team instead of creating duplicates. Re-running tests is safe. If a parent approves a request after the team is full, `reserveTeamRegistrationSlot` rejects the approval without deleting the request so the family can retry after capacity changes.

## Artifacts and Notes

Validation output:

    npm test -- --runTestsByPath src/app/api/teams/[id]/__tests__/teamRegistrationAuthRoutes.test.ts src/app/api/invites/__tests__/acceptInviteRoute.test.ts src/app/api/invites/[id]/__tests__/teamInviteEventSyncLifecycle.test.ts src/app/api/family/__tests__/joinRequestsRoute.test.ts src/app/api/invites/__tests__/inviteRoutes.test.ts src/lib/__tests__/teamService.test.ts
    Test Suites: 6 passed, 6 total
    Tests: 53 passed, 53 total

    npx tsc --noEmit --pretty false
    Completed without TypeScript errors.

## Interfaces and Dependencies

New helper code should stay under `src/server/teams/` and use existing Prisma delegates, `loadCanonicalTeamById`, `reserveTeamRegistrationSlot`, `syncCanonicalTeamRoster`, and `withLegacyFields`. Public client types should extend the existing `Invite`, `FamilyJoinRequest`, and `TeamRegistrationResult` shapes without requiring a database migration.
