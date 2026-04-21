# Remove User Profile Team ID Duplication

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](C:/Users/samue/Documents/Code/mvp-site/PLANS.md).

## Purpose / Big Picture

Users should be able to join, leave, and be removed from teams without any second write to their profile row. After this change, team membership will come from the canonical membership tables in `prisma/schema.prisma` (`TeamRegistrations` for players and `TeamStaffAssignments` for staff), and `userData.teamIds` will stop acting as a second source of truth. The immediate proof is that removing a player from an organization team no longer triggers `PATCH /api/users/[id]` for the removed player, and profile/team lookups still behave the same because team IDs are derived from canonical membership instead of stored on the user row.

## Progress

- [x] (2026-04-21 18:05Z) Audited the current membership model and confirmed that canonical team membership already lives in `CanonicalTeams`, `TeamRegistrations`, and `TeamStaffAssignments`.
- [x] (2026-04-21 18:10Z) Identified duplicate `userData.teamIds` writes in `src/lib/teamService.ts`, `src/server/teams/teamMembership.ts`, and `src/server/teams/teamOpenRegistration.ts`.
- [ ] Remove client-side `userService.updateUser(...teamIds...)` calls from team membership flows and add regressions for remove-player behavior.
- [ ] Introduce a shared server helper that derives canonical team IDs for one or more users from active registrations and staff assignments.
- [ ] Switch user/profile/team membership readers to the derived helper while preserving the existing response shape that includes `teamIds`.
- [ ] Stop server-side synchronization into `userData.teamIds` and lock down the user patch route so `teamIds` is no longer writable.
- [ ] Run targeted Jest coverage for the changed routes and services, then record the results here.

## Surprises & Discoveries

- Observation: The client-side 403 is only the visible symptom. The server already mirrors canonical roster changes back into `userData.teamIds` inside `syncCanonicalTeamRoster`.
  Evidence: `src/server/teams/teamMembership.ts` contains `syncUserTeamIds(...)` and calls it at the end of roster sync.

- Observation: `/api/teams` already queries canonical membership directly and does not need `userData.teamIds` to list a user’s teams.
  Evidence: `src/app/api/teams/route.ts` calls `listCanonicalTeamsForUser(...)`, and `src/server/teams/teamMembership.ts` resolves `playerId` through `teamRegistrations` and `managerId` through `teamStaffAssignments`.

- Observation: The existing `/api/users/[id]` route test mocked `assertUserAccess`, which hid the exact cross-user 403 that broke remove-player in production.
  Evidence: `src/app/api/users/__tests__/userByIdRoute.test.ts` replaces `assertUserAccess` with `jest.fn()`.

## Decision Log

- Decision: Keep the `teamIds` field in API responses for this pass, but derive it from canonical membership instead of persisting it as writable profile state.
  Rationale: This removes the duplicate source of truth without forcing a same-turn rewrite of every UI component and profile route that still expects `user.teamIds`.
  Date/Author: 2026-04-21 / Codex

- Decision: Fix the immediate remove-player regression first, then remove server-side mirroring.
  Rationale: The bug is user-facing now, and the client-side second write is both incorrect and easy to stop while the deeper migration proceeds.
  Date/Author: 2026-04-21 / Codex

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

Canonical teams live in `prisma/schema.prisma` as `CanonicalTeams`. Active and invited player membership lives in `TeamRegistrations`, and active staff roles live in `TeamStaffAssignments`. Those tables are already serialized back into the legacy team shape in `src/server/teams/teamMembership.ts`.

The old profile field `UserData.teamIds` also exists in `prisma/schema.prisma`. It is currently written in two places:

1. Client-side service flows in `src/lib/teamService.ts`, where team create/accept/remove/delete call `userService.updateUser(..., { teamIds })`.
2. Server-side canonical membership sync in `src/server/teams/teamMembership.ts` and open-registration flows in `src/server/teams/teamOpenRegistration.ts`.

Several readers still expect `user.teamIds` to exist. The important ones for this migration are `src/app/api/users/route.ts`, `src/app/api/users/[id]/route.ts`, `src/app/api/profile/schedule/route.ts`, `src/app/api/profile/registrations/route.ts`, `src/app/api/profile/documents/route.ts`, and UI consumers such as `src/app/discover/components/EventDetailSheet.tsx`. Those readers should keep seeing a `teamIds` array, but the array should be derived from canonical membership tables instead of read from `userData`.

## Plan of Work

First, remove the client-side profile updates from `src/lib/teamService.ts`. Those updates are not authoritative, and they cause the current 403 when a captain or manager removes another player. Add service-level regressions that verify create/remove/delete flows no longer call `userService.updateUser` for `teamIds`.

Next, add a small server helper in `src/server/teams/teamMembership.ts` or a nearby module that accepts one or more user IDs and returns canonical team IDs for each user by reading active `TeamRegistrations` plus active `TeamStaffAssignments`. It should deduplicate IDs and return only canonical team IDs, not child event slot teams.

Then, update the user and profile readers to call that helper. `GET /api/users` and `GET /api/users/[id]` should overwrite any selected `teamIds` with the derived IDs before applying privacy formatting. The profile routes should stop reading `userData.teamIds` directly and instead resolve team IDs through the helper for the current user and any linked child users.

After the derived read path is in place, remove the server-side mirror writes in `src/server/teams/teamMembership.ts` and `src/server/teams/teamOpenRegistration.ts`. At the same time, make `teamIds` non-writable in `src/app/api/users/[id]/route.ts` so future callers cannot reintroduce the duplicate source of truth through profile patching.

Finally, extend and run targeted Jest suites for the affected code paths. The new tests must prove that the remove-player flow does not attempt a forbidden user patch and that user/profile endpoints still expose the correct derived team IDs.

## Concrete Steps

From `C:\Users\samue\Documents\Code\mvp-site`:

1. Update `src/lib/teamService.ts` and `src/lib/__tests__/teamService.test.ts`.
2. Update the user and profile routes plus their tests.
3. Update `src/server/teams/teamMembership.ts` and `src/server/teams/teamOpenRegistration.ts`.
4. Run:

    npm test -- --runInBand src/lib/__tests__/teamService.test.ts src/app/api/users/__tests__/userByIdRoute.test.ts src/app/api/profile/schedule/__tests__/route.test.ts

5. If profile documents or registrations tests fail after the reader swap, add those suites to the command and fix them before considering the plan complete.

## Validation and Acceptance

Acceptance is:

1. Removing a player from a team no longer performs `PATCH /api/users/<other-user-id>` and therefore no longer fails with a 403 from `assertUserAccess`.
2. `GET /api/users/[id]` and `GET /api/users?ids=...` still return a `teamIds` array, but it is derived from active canonical team memberships.
3. Profile schedule, registrations, and documents routes still find team-linked data for the signed-in user and linked children without reading `userData.teamIds`.
4. The user patch route rejects attempts to update `teamIds` directly.

## Idempotence and Recovery

These edits are safe to repeat because they only replace duplicate reads and writes with derived queries. No destructive database migration is included in this pass. If a route still depends on stored `userData.teamIds`, the safe recovery path is to reintroduce a derived `teamIds` field at the route boundary rather than restoring the mirror writes.

## Artifacts and Notes

Expected failing behavior before the fix:

    PATCH /api/users/seed_20260218192431062_18 500
    Failed to remove player from team: Error: Request failed

Expected behavior after the fix:

    PATCH /api/teams/<team-id> 200
    no PATCH /api/users/<removed-player-id> request is issued

## Interfaces and Dependencies

The end state must include a server helper with a stable interface that can answer “which canonical teams belong to these users?” from canonical membership rows. A suitable shape is:

    getCanonicalTeamIdsByUserIds(userIds: string[], client?: PrismaLike): Promise<Map<string, string[]>>

This helper must query `teamRegistrations` for `status = ACTIVE` and `teamStaffAssignments` for `status = ACTIVE`, deduplicate team IDs, and return normalized string arrays keyed by user ID.

Revision note: created this plan to guide the removal of `userData.teamIds` as an active source of truth while fixing the player-removal 403 regression.
