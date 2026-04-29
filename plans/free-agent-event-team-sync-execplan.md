# Free-Agent Invites With Event-Team Sync

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. It covers the `mvp-site` backend and web UI plus the related mobile repository at `C:\Users\samue\StudioProjects\mvp-app`.

## Purpose / Big Picture

Managers can invite or add a user to a canonical team, then choose which future event-team snapshots should also receive that user. A canonical team is the long-lived team record in the `Teams` table through Prisma model `CanonicalTeams`; an event-team snapshot is the event-specific team record in the `EventTeams` table through Prisma model `Teams`. After this work, a pending player invite reserves the user as pending on selected event-team snapshots and creates or refreshes that user's event registration. Accepting the invite promotes those event-team rows to active; declining or canceling restores the previous event registration and removes only the pending event-team changes created by the invite.

## Progress

- [x] (2026-04-29 11:09-07:00) Created `codex/free-agent-event-team-sync` branches in both `mvp-site` and `mvp-app`.
- [x] (2026-04-29 11:09-07:00) Reviewed existing invite-free-agents, invite lifecycle, canonical team membership, event registration, and mobile team-management code paths.
- [x] (2026-04-29 11:25-07:00) Added Prisma schema and migration for invite/event-team sync rollback state.
- [x] (2026-04-29 12:10-07:00) Implemented `mvp-site` backend API and invite lifecycle reconciliation.
- [x] (2026-04-29 12:32-07:00) Updated `mvp-site` web service and `TeamDetailModal` player invite UI.
- [x] (2026-04-29 12:45-07:00) Added and ran targeted `mvp-site` tests and typecheck.
- [ ] Implement `mvp-app` DTOs, repository methods, and team-scoped invite dialog.
- [ ] Add and run targeted `mvp-app` tests and Android build validation where feasible.

## Surprises & Discoveries

- Observation: `GET /api/teams/[id]/invite-free-agents` already had a working-tree fix to support canonical team IDs, but it only returned legacy event `freeAgentIds` and no future event-team options.
  Evidence: The route returns `{ users, eventIds, freeAgentIds }` and queries `Events.freeAgentIds`, while `src/server/events/eventRegistrations.ts` also models free agents as `EventRegistrations` rows.
- Observation: The shared mobile `SearchPlayerDialog` is used outside team management, so team-specific event-team checkbox behavior should live in a new dialog rather than changing the shared dialog.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/SearchPlayerDialog.kt` is shared, while Team Management invokes it from `CreateOrEditTeamScreen.kt`.

## Decision Log

- Decision: Store a sync row per invite, event team, and user, including a JSON snapshot of the previous event registration.
  Rationale: Accept, decline, and cancel may happen from different routes; the database row is the durable memory needed to reconcile event-team state without guessing.
  Date/Author: 2026-04-29 / Codex
- Decision: Keep the existing invite-free-agents response fields and add new fields instead of replacing the response.
  Rationale: Existing web and mobile clients parse `users`, `eventIds`, and `freeAgentIds`; additive fields preserve compatibility.
  Date/Author: 2026-04-29 / Codex
- Decision: Use a new mobile team-scoped invite dialog and preserve `SearchPlayerDialog` for chat and other generic user-search flows.
  Rationale: The new dialog has team/event synchronization concepts that should not appear in generic search contexts.
  Date/Author: 2026-04-29 / Codex

## Outcomes & Retrospective

No implementation outcome has been recorded yet. This section will be updated after backend, web, and mobile validation.

Site milestone outcome, 2026-04-29: `mvp-site` now has the database model, API endpoint, invite lifecycle reconciliation, web service types, modal tabs, event-team checkbox prompt, and regression coverage for the site portion. Mobile parity remains to be implemented.

## Context and Orientation

The `mvp-site` backend is a Next.js App Router application with Prisma and Postgres. Route handlers live in `src/app/api`. The canonical team helpers live in `src/server/teams/teamMembership.ts`; they load the long-lived team, maintain `TeamRegistrations`, and can create event-team snapshots. Event registrations are maintained by `src/server/events/eventRegistrations.ts`; a self registration uses deterministic IDs shaped like `<eventId>__self__<userId>`.

The current web invite panel is in `src/components/ui/TeamDetailModal.tsx`. Its service layer is `src/lib/teamService.ts`. The mobile app lives in `C:\Users\samue\StudioProjects\mvp-app`; Team Management state is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/TeamManagementComponent.kt`, and UI is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/screens/CreateOrEditTeamScreen.kt`.

## Plan of Work

First add the database model `TeamInviteEventSyncs` and a migration. Then add a server helper under `src/server/teams/` to apply accepted sync rows and roll back pending rows. Extend `GET /api/teams/[id]/invite-free-agents` to include future event-team options and free-agent source event mappings while preserving the existing fields. Add `POST /api/teams/[id]/member-invites` so web and mobile call one source-of-truth endpoint for player invites, selected event-team IDs, and email-created placeholder users. Patch accept, decline, and delete invite routes to use the shared reconciliation helper.

After the backend contract exists, update `src/lib/teamService.ts` and `TeamDetailModal.tsx` to render Free Agents, Invite User, and Invite by Email tabs and to show event-team checkboxes after a target is selected. Then add mobile DTOs and repository functions for the extended response and member-invite API, and replace Team Management's team-invite usage of `SearchPlayerDialog` with a new dialog that has the same three tabs and checkbox prompt.

## Concrete Steps

Work in `C:\Users\samue\Documents\Code\mvp-site` for backend and web changes, and `C:\Users\samue\StudioProjects\mvp-app` for mobile changes. The branch in both repositories is `codex/free-agent-event-team-sync`.

Run targeted site validation from `mvp-site`:

    npm test -- --runInBand --runTestsByPath "src/app/api/teams/[id]/invite-free-agents/__tests__/route.test.ts"
    npm test -- --runInBand --runTestsByPath "src/components/ui/__tests__/TeamDetailModal.test.tsx"
    npx tsc --noEmit

The current site validation was run as:

    npm test -- --runInBand --runTestsByPath "src/app/api/teams/[id]/invite-free-agents/__tests__/route.test.ts" "src/app/api/teams/[id]/member-invites/__tests__/route.test.ts" "src/app/api/invites/[id]/__tests__/teamInviteEventSyncLifecycle.test.ts" "src/components/ui/__tests__/TeamDetailModal.test.tsx"
    npx tsc --noEmit

Both commands completed successfully on 2026-04-29.

Run mobile validation from `mvp-app`:

    .\gradlew :composeApp:testDebugUnitTest
    .\gradlew :composeApp:assembleDebug

## Validation and Acceptance

A manager opening a canonical team invite panel should see future linked event teams as checkbox options. Choosing a free agent should precheck the event teams tied to that free agent's future events. Submitting a player invite should leave the canonical team membership pending, leave selected event-team membership pending, and create a `SELF` event registration with role `PARTICIPANT` and status `STARTED`. Accepting the invite should make the canonical player active and move selected event-team pending IDs into active player IDs with event registrations set to `ACTIVE`. Declining or deleting should remove the pending canonical membership and restore the event registrations recorded in `TeamInviteEventSyncs`.

## Idempotence and Recovery

The API should upsert invites and sync rows so repeat submissions refresh the same pending invite rather than duplicating event-team pending entries. If a decline or delete runs after a partial invite, rollback checks the recorded row status and only mutates pending rows. If a migration fails locally, rerun the Prisma migration after fixing the SQL; the migration uses `IF NOT EXISTS` where possible for safe retries.

## Artifacts and Notes

The branch setup succeeded in both repositories:

    mvp-site: git switch -c codex/free-agent-event-team-sync
    mvp-app:  git switch -c codex/free-agent-event-team-sync

## Interfaces and Dependencies

The extended invite-free-agents response must keep:

    users: UserData[]
    eventIds: string[]
    freeAgentIds: string[]

It must add:

    eventTeams: Array<{ eventId: string; eventTeamId: string; eventName: string; eventStart: string | null; eventEnd: string | null; teamName: string }>
    freeAgentEventsByUserId: Record<string, string[]>
    freeAgentEventTeamIdsByUserId: Record<string, string[]>

The new member-invite request must accept:

    { userId?: string; email?: string; role: "player" | "team_manager" | "team_head_coach" | "team_assistant_coach"; eventTeamIds?: string[] }

The new server helper must support:

    acceptTeamInviteEventSyncs(tx, invite, now)
    rollbackTeamInviteEventSyncs(tx, invite, "DECLINED" | "CANCELLED", now)

Revision note, 2026-04-29: Created the ExecPlan from the user-provided implementation plan after reading the active backend, web, and mobile code paths.

Revision note, 2026-04-29: Updated progress and validation after completing and testing the `mvp-site` portion.
