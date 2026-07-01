# Team Check-In, Match Rosters, and Match Actions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root. Every future edit to this document must keep it self-contained so a contributor can restart from only this file and the current working tree.

## Purpose / Big Picture

After this work, BracketIQ hosts can configure team check-in and match roster behavior when creating or managing team events. Team managers and coaches, but not captains, can check their team into an event or an individual match shortly before start time. When match roster edits are enabled, those managers and coaches can confirm which players are available for the match, remove players from that specific match, add temporary match-only players, and later link a temporary player to an account by email. Officials can mark exceptional match outcomes such as forfeit, cancel, suspend, delay, and resume from match-day controls, while hosts can correct or set match results from match edit views.

The visible outcome is that a team event can be configured with "Event check-in" or "Match check-in" under event setup, managers/coaches see the appropriate check-in dialog at the right time, hosts and officials can see which teams are checked in from the right operational view, match rosters preserve historical truth after a match is completed, and official/host match actions produce finalized match lifecycle records that update schedules, standings, and brackets consistently.

## Progress

- [x] (2026-07-01 00:00Z) Captured product decisions from discussion: captains are excluded, match check-in opens roster immediately, host forfeit lives in edit view, official forfeit/cancel lives in match actions, temporary players are match-only, completed match roster edits are limited to account linking.
- [x] (2026-07-01 00:00Z) Located current web homes for event staff and official controls: `src/app/events/[id]/schedule/components/eventForm/sections/StaffManagementPanel.tsx` and `TeamOfficiatingControls.tsx`.
- [x] (2026-07-01 00:00Z) Located current mobile homes for matching controls: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsStaffSection.kt` and create/edit wiring in `eventCreate`.
- [x] (2026-07-01 08:00Z) Added `Events` settings, `TeamCheckIns`, `MatchRosterEntries`, and the Prisma migration/client regeneration in `mvp-site`.
- [x] (2026-07-01 08:00Z) Added server-side manager/coach checks for event-team manager, head coach, assistant coach, and active event-team staff assignments while excluding captain-only access.
- [x] (2026-07-01 08:00Z) Added web API routes for event check-ins, match check-ins, match roster edits/linking, explicit match actions, and canonical-player roster sync for accepted team invites.
- [x] (2026-07-01 09:00Z) Added web manager/coach event and match check-in prompts, match roster modal, and manager/coach `Edit roster` entry point in match details.
- [x] (2026-07-01 10:00Z) Added web host/admin match edit result controls for regulation, forfeit, no-contest/cancelled, and suspended outcomes.
- [x] (2026-07-01 08:00Z) Added web event create/manage controls under Staff / Officials plus web host/official event and match check-in indicators and match action buttons.
- [x] (2026-07-01 09:00Z) Started mobile parity by adding the new event option fields to `mvp-app` shared `Event` and `EventDTO`.
- [x] (2026-07-01 09:00Z) Added mobile match-action DTO/repository plumbing and official pre-start forfeit/cancel controls in match detail.
- [x] (2026-07-01 10:00Z) Added mobile shared event model/DTO/network event settings parity and create/edit controls in the shared Staff / Officials section.
- [x] (2026-07-01 10:00Z) Added mobile check-in and match roster DTOs plus repository calls for event check-in, match check-in, roster load, remove/restore, and temporary-player add/link.
- [x] (2026-07-01 11:00Z) Added mobile match-detail manager/coach match check-in prompt, match roster dialog, manager/coach `Edit roster`, and match check-in readiness badges.
- [x] (2026-07-01 11:00Z) Added mobile event-level manager/coach check-in prompt and host/official participant-list event check-in indicators.
- [ ] Add tests for schema serialization, API permissions, roster sync behavior, web UI behavior, mobile DTO/edit behavior, and match lifecycle actions.
- [x] (2026-07-01 09:00Z) Ran `npx prisma generate` and `npx tsc --noEmit` for `mvp-site`.
- [x] (2026-07-01 09:00Z) Ran `./gradlew :composeApp:compileDebugKotlinAndroid` for `mvp-app`.
- [ ] Run focused Jest/API suites and manual browser/mobile smoke tests.

## Surprises & Discoveries

- Observation: The existing `Matches` model already stores match lifecycle and result fields, including `status`, `resultStatus`, `resultType`, and `winnerEventTeamId`.
  Evidence: `prisma/schema.prisma` model `Matches` has those fields, and `src/types/index.ts` already includes `FORFEIT` in match lifecycle/result types.

- Observation: Existing helper logic named like "is user on team" includes players and captains, so it is too broad for team check-in and roster edits.
  Evidence: `src/app/api/events/[eventId]/matches/[matchId]/route.ts` adds `captainId`, `managerId`, `headCoachId`, `playerIds`, and `coachIds` when checking team membership.

- Observation: Mobile create and edit can share the same conceptual Staff / Officials placement because mobile event create reuses the event details UI, and `EventDetailsStaffSection.kt` already renders "Teams provide officials" and "Team officials may swap."
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` invokes `EventDetails`, and `EventDetailsStaffSection.kt` renders the existing team-officiating controls.

- Observation: The match check-in read route is intentionally useful for host/official indicators, but it does not authorize managers/coaches to read match check-ins.
  Evidence: `src/app/api/events/[eventId]/matches/[matchId]/team-check-ins/route.ts` gates GET through host/event-official checks, while POST delegates to `checkInTeam`, which requires team manager/head coach/assistant coach.

## Decision Log

- Decision: Add the check-in and roster settings under Staff / Officials, in a subsection named "Team check-in and match rosters."
  Rationale: These settings are event-day operational controls for managers/coaches and sit closest to team officiating, officials, and match actions. They are not scoring rules and should not be hidden inside match rules.
  Date/Author: 2026-07-01 / Codex

- Decision: Use a relational match roster table instead of storing loose JSON on `Matches`.
  Rationale: Match rosters need historical truth, queryability, unique constraints, account linking, and sync behavior when canonical team membership changes. A table is easier to reason about and test than JSON deltas.
  Date/Author: 2026-07-01 / Codex

- Decision: Captains are not allowed to team-check-in or edit match rosters for now.
  Rationale: The requested permission scope is team managers/coaches only. Captains can be revisited later without weakening the first implementation.
  Date/Author: 2026-07-01 / User and Codex

- Decision: Temporary players are match-only and never automatically mutate the canonical event team.
  Rationale: A manager may need a one-match substitute. Canonical team membership remains a separate explicit team-management operation.
  Date/Author: 2026-07-01 / User and Codex

- Decision: After match completion, manager/coach roster editing is limited to adding or updating an email to link an existing temporary player to an account.
  Rationale: Completed matches must preserve who was actually available for that match. Account linking improves identity without changing participation history.
  Date/Author: 2026-07-01 / User and Codex

- Decision: Officials can mark forfeit/cancel/suspend/resume from match-day controls, but hosts mark forfeit or corrections from match edit views.
  Rationale: Officials need fast event-day exception handling. Hosts need broader correction authority in the administrative edit surface, not another live match button.
  Date/Author: 2026-07-01 / User and Codex

- Decision: Event check-in state is displayed on participant/team lists, while match check-in state is displayed in match details.
  Rationale: Hosts and officials need check-in visibility where they are already doing the relevant work. Event check-in is about the team's overall event presence, so it belongs on participants screens. Match check-in is about readiness for a specific match, so it belongs in match detail.
  Date/Author: 2026-07-01 / User and Codex

## Outcomes & Retrospective

Implementation is partially complete across both clients. In `mvp-site`, schema, API, event settings, manager/coach check-in prompts, match roster modal, official/host indicators, host edit-result controls, match actions, and canonical-player roster sync are implemented and typechecked. In `mvp-app`, the shared event model/DTO fields, network update payload fields, create/edit event controls, check-in/roster repository calls, event-level and match-detail manager/coach check-in prompts, match roster dialog, event and match readiness badges, and official pre-start forfeit/cancel match actions are implemented and Android Kotlin compilation passes. The remaining work is targeted automated tests and manual browser/mobile smoke validation.

## Context and Orientation

This repository, `mvp-site`, is the Next.js web app and server API for BracketIQ. Event creation and management for the web app are mostly implemented under `src/app/events/[id]/schedule/components/EventForm.tsx` and its section components under `src/app/events/[id]/schedule/components/eventForm/sections`. The existing Staff section is `src/app/events/[id]/schedule/components/eventForm/sections/StaffManagementPanel.tsx`. It currently renders `TeamOfficiatingControls.tsx`, which contains the settings "Teams provide officials" and "Team officials may swap."

The mobile app lives in `/Users/elesesy/StudioProjects/mvp-app`. It is a Kotlin Multiplatform app. The event detail edit UI includes `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsStaffSection.kt`, which already renders the matching team-officiating controls. Mobile event creation uses `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/CreateEventScreen.kt` and `DefaultCreateEventComponent.kt`; creation reuses the event details UI, so adding settings in the mobile Staff section gives the same placement in create and edit.

The current database schema is `prisma/schema.prisma`. `Events` stores event settings such as `doTeamsOfficiate`, `teamOfficialsMaySwap`, and `officialSchedulingMode`. `Matches` stores match lifecycle and result state such as `status`, `resultStatus`, `resultType`, `winnerEventTeamId`, and official check-in fields. `Teams` is mapped to the database table `"EventTeams"` and contains `managerId`, `headCoachId`, `coachIds`, `captainId`, and `playerIds`.

In this plan, "canonical team" means the normal event team row in the `Teams` model. "Match roster" means the list of players who are considered active or removed for one specific match. "Temporary player" means a match roster entry created only for one match and not automatically added to the canonical team. "Historical truth" means completed matches must continue to show the roster as it was for that match, even if the canonical team changes later.

## Data Model

Add event-level settings to `Events`:

- `teamCheckInMode String @default("OFF")`
- `teamCheckInOpenMinutesBefore Int @default(60)`
- `allowMatchRosterEdits Boolean @default(false)`
- `allowTemporaryMatchPlayers Boolean @default(false)`

Use string values for `teamCheckInMode` initially unless this codebase strongly prefers Prisma enums for new constrained fields at implementation time. Allowed values are `OFF`, `EVENT`, and `MATCH`. The API must reject unknown values even if the database column is a string.

Add a team check-in table:

- `TeamCheckIns`
- `id String @id`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`
- `eventId String`
- `matchId String?`
- `eventTeamId String`
- `checkedInAt DateTime`
- `checkedInByUserId String`
- `scope String`, with values `EVENT` or `MATCH`
- `status String @default("CHECKED_IN")`

Add unique constraints so a team can only have one active check-in per event scope and one active check-in per match scope. If Prisma cannot express the partial uniqueness needed cleanly, enforce uniqueness in service code inside a transaction and add practical indexes: `[eventId, eventTeamId, scope]`, `[eventId, matchId, eventTeamId]`, and `[checkedInByUserId]`.

Add a match roster table:

- `MatchRosterEntries`
- `id String @id`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`
- `eventId String`
- `matchId String`
- `eventTeamId String`
- `source String`, with values `BASE` or `ADDED`
- `status String`, with values `ACTIVE` or `REMOVED`
- `userId String?`
- `firstName String?`
- `lastName String?`
- `email String?`
- `linkedAt DateTime?`
- `linkedByUserId String?`
- `createdByUserId String`
- `removedAt DateTime?`
- `removedByUserId String?`
- `metadata Json @default("{}")`

For `BASE` entries, `userId` points to a canonical team player. `status=REMOVED` means the player is disabled for that match. The absence of a `BASE` row for a canonical player means they are active by default for not-yet-completed matches unless the roster materialization service chooses to write explicit active rows. For completed matches, the service should materialize rows so later team changes do not alter the match roster.

For `ADDED` entries, `firstName` and `lastName` are required, `email` is optional, and `userId` is set only when linked by email. When no account is linked, clients display a "No account" badge.

## Backend Services and APIs

Create server helpers under `src/server/matchRosters` or a similarly focused directory.

Add a permission helper, for example `canManageTeamCheckInForEventTeam(session, team)`, that returns true only when the session user is the team `managerId`, `headCoachId`, or is included in `coachIds`. It must not include `captainId` or `playerIds`. Hosts and admins have override authority where explicitly stated, but the manager/coach path must stay narrow.

Add a roster resolver that returns the effective roster for a match and team:

1. Start from canonical `Teams.playerIds` and hydrated `UserData` names.
2. Apply `BASE` rows with `status=REMOVED` to disable canonical players for that match.
3. Add `ADDED` rows with `status=ACTIVE`.
4. Include removed entries in the response with enough state for the UI to show a disabled card and an Add button.
5. Include account state for temporary players so the UI can show "No account" when `userId` is null.

Add check-in endpoints. A reasonable shape is:

- `GET /api/events/[eventId]/team-check-ins/eligibility`
- `GET /api/events/[eventId]/team-check-ins`
- `POST /api/events/[eventId]/team-check-ins`
- `GET /api/events/[eventId]/matches/[matchId]/team-check-ins`
- `GET /api/events/[eventId]/matches/[matchId]/rosters`
- `POST /api/events/[eventId]/matches/[matchId]/rosters/[eventTeamId]/remove-player`
- `POST /api/events/[eventId]/matches/[matchId]/rosters/[eventTeamId]/add-player`
- `POST /api/events/[eventId]/matches/[matchId]/rosters/[eventTeamId]/link-player`

The implementation can collapse or rename these routes if an existing route style in `src/app/api/events` suggests a better local convention, but the operations and permissions must remain explicit.

The check-in service must enforce time windows. If `teamCheckInMode=EVENT`, managers/coaches can check in when current time is within `teamCheckInOpenMinutesBefore` minutes of `event.start`. If `teamCheckInMode=MATCH`, managers/coaches can check in for a specific match when current time is within `teamCheckInOpenMinutesBefore` minutes of `match.start`. Use event time zone only for display; compare actual instants for authorization.

Check-in read APIs and event detail bootstrap responses must expose enough state for host and official indicators without forcing the client to fetch every roster. For event check-in mode, return check-in status by `eventTeamId` with `checkedInAt` and an optional checked-in-by display name. For match check-in mode, return check-in status for both match teams by `matchId` and `eventTeamId`. Do not expose private email data in these indicator payloads.

The roster edit service must enforce match state. Before a match is complete, managers/coaches may remove base players, add removed base players back, add temporary players when `allowTemporaryMatchPlayers=true`, and link temporary players by email. After a match is complete, managers/coaches may only add or update an email for an existing temporary player and link it to an account. Hosts may have broader correction powers in administrative views if needed, but that is separate from the team manager/coach flow.

When a temporary player is linked by email, reuse `src/server/inviteUsers.ts` function `ensureAuthUserAndUserDataByEmail` so account creation/linking follows the existing invite convention. After linking, check whether that user is now on the canonical team. If yes, collapse duplicate match roster state according to the sync rules below.

Add roster sync service `syncMatchRostersForTeamRosterChange(eventId, teamId, change)` and call it anywhere canonical event team membership is changed. Search for team mutation paths before implementation; likely relevant areas include `src/app/api/teams`, `src/server/teams/teamMembership.ts`, `src/server/teams/teamInviteEventSync.ts`, and event participant routes.

Roster sync rules:

When a user is added to the canonical team, future or not-yet-completed matches should treat the user as a normal base player. If the user appears in those matches as an active `ADDED` temporary player, remove or deactivate that added row so the base player is not duplicated. Completed matches must preserve history. If the newly added user did not exist in a completed match, add a `BASE` row with `status=REMOVED` for that completed match. If the user existed as an `ADDED` temporary player in a completed match, preserve the fact that they played in that match by converting or retaining a single entry that remains visible and linked; do not create a duplicate removed base row for the same person in that match.

When a user is removed from the canonical team, future matches should either remove their implicit base presence or write `BASE status=REMOVED` rows if needed to make the effective roster unambiguous. Completed matches must not lose the player from historical rosters if they were active in that match.

## Match Actions and Lifecycle

Add a shared server helper for exceptional match actions so official match view and host edit view do not diverge.

Supported actions:

- `DELAY`: before start, no winner, status should become `DELAYED`.
- `SUSPEND`: after start, no winner, status should become `SUSPENDED`.
- `RESUME`: only from suspended, status should become `IN_PROGRESS` or the previous playable state.
- `CANCEL`: before or during match, no winner, status should become `CANCELLED`, `resultType` should become `NO_CONTEST`, `winnerEventTeamId` should be null, and `resultStatus` should become `OFFICIAL`.
- `FORFEIT`: before or during match, requires selecting the forfeiting `eventTeamId`; status should become `FORFEIT`, `resultType` should become `FORFEIT`, `winnerEventTeamId` should be the opposing team, and `resultStatus` should become `OFFICIAL`.

Officials can use match actions when they are assigned to the match or are event officials allowed for the match. Hosts/admins can set the same final states in match edit, but hosts do not need a live match-view Forfeit button.

Completed, cancelled, or forfeited matches should not expose official destructive match actions. Hosts can still correct results in match edit view.

Forfeit and cancel must integrate with existing finalization behavior in `src/server/scheduler/updateMatch.ts` so standings and brackets update consistently. If existing `finalizeMatch` assumes normal scores, add a narrow helper that handles non-regulation results and add tests proving bracket advancement and standings behavior.

## Web UI Plan

Add event settings types in `src/types/index.ts`, `src/app/events/[id]/schedule/components/eventForm/formTypes.ts`, `schema.ts`, `eventStateMapping.ts`, `buildEventDraft.ts`, and any default value helpers.

Create `src/app/events/[id]/schedule/components/eventForm/sections/TeamCheckInControls.tsx`. Render it from `StaffManagementPanel.tsx` directly after `TeamOfficiatingControls` and before official scheduling/positions. The subsection should be titled "Team check-in and match rosters."

Controls:

- Team check-in mode: segmented control or select with Off, Event check-in, Match check-in.
- Opens before start: number input in minutes, default 60, visible only when mode is not Off.
- Allow match roster edits: switch, visible/enabled only for team events.
- Allow temporary match players: switch, visible only when roster edits are enabled.

Dependency behavior:

- If `teamSignup` is false, hide or disable these controls and store `teamCheckInMode=OFF`, `allowMatchRosterEdits=false`, and `allowTemporaryMatchPlayers=false`.
- If `teamCheckInMode=OFF`, roster edits can remain configurable only if the product wants roster editing without check-in. The current decision is to keep roster edits available for match detail but not auto-open unless check-in is match-scoped.
- If `allowMatchRosterEdits=false`, force `allowTemporaryMatchPlayers=false`.
- If `teamCheckInMode=MATCH`, successful check-in opens the match roster modal immediately when roster edits are enabled.

Add web client service methods in `src/lib/eventService.ts` or a new route-specific service module to fetch eligibility, submit check-ins, fetch rosters, edit rosters, link temporary players, and submit match actions.

Add a team check-in prompt in the event detail/schedule client flow. The prompt should only appear for managers/head coaches/assistant coaches, not captains. It should appear once per eligible event/match while open unless the user completes it. It should not spam if dismissed; store dismissed state in component state for the current page session, not server state.

Add a `MatchRosterModal` or dialog under the schedule page components. It should show the effective roster for one match and one team. Each base player row has a Remove button when active and an Add button when removed. Removed players render disabled. Temporary players show first name, last name, optional email/account status, and a "No account" badge when unlinked. The Add player control reveals first name, last name, and optional email fields. After match completion, only email/link controls remain enabled for unlinked temporary players.

Add an `Edit roster` button to match details for managers/coaches when `allowMatchRosterEdits=true` and the viewer manages one of the match teams. Hosts may see roster correction controls in the administrative match edit path if needed, but the manager/coach modal must follow the completed-match lock rules.

Add host/official visual indicators for check-in state. For event check-in mode, render a compact checked-in badge on the web participants/team management page or panel for each team that has completed event check-in. Teams without event check-in should either show no badge or a subdued "Not checked in" indicator only when the host/official is in a management context; avoid cluttering public participant views. For match check-in mode, render team-specific check-in badges in match details next to each team name or in the match readiness/status area. The indicator should be visible to hosts and assigned/event officials, and it can also be visible to the team's own manager/coach. It should not expose check-in controls to captains or players.

Add a `Match actions` menu in match view for officials. Before match start, show Delay plus Forfeit and Cancel. After match start, show Suspend, Forfeit, and Cancel. When suspended, show Resume and keep Forfeit and Cancel available. Put Forfeit and Cancel behind confirmation dialogs. Confirmation for Forfeit must require choosing the forfeiting team and show the derived winner before submission. Confirmation for Cancel must allow an optional reason and show that no winner will be recorded.

For hosts, extend match edit UI/result controls so a host can set winner, result type, and forfeit/no-contest state. If result type is Forfeit, show a forfeiting team selector and derive winner. If result type is No contest/cancelled, clear winner and allow a reason. Do not add a host-only Forfeit button to live match view.

## Mobile App Plan

In `/Users/elesesy/StudioProjects/mvp-app`, add event settings to:

- `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`
- `core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt`
- `core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
- Room migrations under `core/database/src/androidMain/kotlin/com/razumly/mvp/core/data/RoomMigrations.android.kt`
- DTO tests under `core/network/src/commonTest/kotlin/com/razumly/mvp/core/network/dto/EventDtosTest.kt`

Add update methods to create/edit components similar to `updateDoTeamsOfficiate` and `updateTeamOfficialsMaySwap` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt` and the event detail component.

In `EventDetailsStaffSection.kt`, add the same "Team check-in and match rosters" controls directly under "Teams provide officials" / "Team officials may swap" and before "Official scheduling." Since create uses `EventDetails`, this gives matching placement in mobile create and edit.

Add mobile network calls for team check-in, roster load/edit/link, and match actions. The repository layer likely belongs near existing match operations in `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` and event repository calls in `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/EventRepository.kt`.

Add mobile UI in match detail for check-in prompts, match roster dialog, `Edit roster`, and `Match actions`. Reuse existing match detail patterns where possible. Keep host forfeit/cancel correction inside edit result controls, not live match view.

Add mobile host/official visual indicators matching web placement. For event check-in mode, render a checked-in badge in the participants screen/team list for checked-in teams. For match check-in mode, render checked-in badges in match detail near each team or in the readiness/status block. The mobile indicators should use the same server payloads as web so both clients agree on state and timing.

Consider watch app support later. This plan does not require watch roster editing. If watch match actions already support official check-in/timer only, leave watch unchanged unless API DTO changes require tolerant parsing.

## Concrete Steps

Start from `/Users/elesesy/StudioProjects/mvp-site`.

1. Inspect current dirty state.

       git status --short

   Preserve unrelated changes. Do not revert user changes in `AGENTS.md` or e2e auth files unless explicitly asked.

2. Add Prisma schema fields and tables in `prisma/schema.prisma`. Create a migration with a name like:

       npx prisma migrate dev --name team_check_in_match_rosters

   If local database setup is not available, create the migration SQL manually using the repo's existing migration style and run Prisma generation only if supported.

3. Update server serializers, event payload mapping, and generated client use sites so the new event settings round-trip through event create, update, detail bootstrap, and mobile DTOs.

4. Implement server services and API routes for eligibility, check-in, roster edits, roster account linking, roster sync, and match actions.

5. Add focused backend tests first. New tests should fail before the implementation and pass after it. Cover manager/coach allowed, captain denied, player denied, host override, completed-match roster lock, account linking, canonical team add sync, forfeit winner derivation, cancel no-winner behavior, and official vs host permissions.

6. Implement web event settings controls under Staff / Officials, then implement check-in prompt, roster modal, event participant check-in badges, match detail check-in indicators, match actions menu, and host edit result controls.

7. Add web component tests for the controls and modal states, and route tests for API behavior.

8. Implement mobile model/DTO/create/edit UI parity in `/Users/elesesy/StudioProjects/mvp-app`. Add DTO and edit-payload tests before wiring UI where possible.

9. Add mobile participant check-in badges, match detail check-in indicators, match detail check-in, roster, and match actions UI. Add focused unit tests for permission/state rendering and repository payloads.

10. Run validation commands and update this plan's Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective.

## Validation and Acceptance

Backend validation in `mvp-site`:

- Run focused API tests, adding exact test names as they are created.

       npm test -- src/app/api/events/__tests__/scheduleRoutes.test.ts

- Run focused service tests for the new roster service.

       npm test -- src/server/matchRosters

- Run event form and match component tests.

       npm test -- src/app/events/[id]/schedule/components

- Run type checking.

       npx tsc --noEmit

Manual web acceptance:

1. Start the web app.

       npm run dev

2. Create or edit a team league/tournament. In Staff / Officials, verify "Team check-in and match rosters" appears after team officiating controls. Set Team check-in to Match, opens before start to 60, enable roster edits, and enable temporary players. Save and reload. The settings persist.

3. Sign in as a team manager or coach whose team has a match within the open window. Open the event. A check-in modal appears for the match. Complete check-in. The match roster modal opens immediately.

4. In the roster modal, remove a base player. The row becomes disabled and shows an Add button. Add the player back. Add a temporary player without email. The player appears with a "No account" badge. Add a temporary player with email. The user is linked or created through the existing account helper.

5. Complete the match. Reopen the roster as manager/coach. Remove/add controls are disabled, but an unlinked temporary player can still receive an email for account linking.

6. Add a new player to the canonical team after the match is completed. Reopen the completed match roster and verify the new player is marked removed for that completed match. Reopen a future match roster and verify the new player is available as a base player.

7. As an official before match start, open Match actions and verify Delay, Forfeit, and Cancel are available. Forfeit requires selecting the forfeiting team and shows the derived winner. Cancel records no winner. After match start, verify Suspend, Forfeit, and Cancel are available. When suspended, Resume is available.

8. As a host, verify the live match view does not add a host-only Forfeit button. Open match edit and verify winner/result type controls can mark Forfeit or No contest/cancelled.

Mobile validation in `mvp-app`:

- Run DTO tests after adding fields.

       ./gradlew :core:network:allTests

- Run focused event detail/create tests, using the actual module task names available in the repo.

       ./gradlew :composeApp:allTests

Manual mobile acceptance:

1. In mobile create/edit, open Staff / Officials and verify the same "Team check-in and match rosters" placement and options.

2. Save an event with match check-in and roster edits enabled. Reload from API and verify the values persist.

3. As a manager/coach, open an eligible event/match and verify the check-in prompt and roster dialog behavior matches web.

4. As a host or official, verify event-level check-ins show on the participants screen and match-level check-ins show in match detail.

5. As an official, verify Match actions show the correct options by match state. As host, verify forfeit/cancel correction is available from edit controls rather than live match view.

## Idempotence and Recovery

Most changes are additive. The Prisma migration should add nullable/defaulted fields and new tables, so it can be applied without modifying existing event or match data. If a migration fails locally because the database is unavailable, do not edit production data manually. Keep the migration file checked in and validate SQL shape with Prisma or a local database when available.

Roster sync must be safe to run more than once. It should use stable unique keys or lookup logic to avoid duplicate match roster rows when the same team membership update is retried.

If a new route partially succeeds during development, retrying the same request should not create duplicate check-ins or duplicate roster entries. Use transactions and upserts where practical.

If mobile Room migration fails during local testing, increment the Room schema migration carefully and add a migration test or a cold-install fallback only if the project already uses that pattern.

## Interfaces and Dependencies

Web/server types should end with these stable concepts:

- `TeamCheckInMode = 'OFF' | 'EVENT' | 'MATCH'`
- Event fields: `teamCheckInMode`, `teamCheckInOpenMinutesBefore`, `allowMatchRosterEdits`, `allowTemporaryMatchPlayers`
- Roster entry fields: `source`, `status`, `userId`, `firstName`, `lastName`, `email`, account-link metadata, and removal metadata
- Match action input: action type, optional `forfeitingEventTeamId`, optional reason

Server services should expose functions equivalent to:

    canManageTeamRoster(team, sessionUserId): boolean
    resolveEffectiveMatchRoster(eventId, matchId, eventTeamId): Promise<EffectiveMatchRoster>
    checkInTeamForEventOrMatch(input): Promise<TeamCheckIn>
    removePlayerFromMatchRoster(input): Promise<EffectiveMatchRoster>
    addTemporaryPlayerToMatchRoster(input): Promise<EffectiveMatchRoster>
    linkTemporaryMatchPlayer(input): Promise<EffectiveMatchRoster>
    syncMatchRostersForTeamRosterChange(input): Promise<void>
    applyExceptionalMatchAction(input): Promise<Match>

Use `ensureAuthUserAndUserDataByEmail` from `src/server/inviteUsers.ts` for email account linking. Do not create a second account-linking convention.

## Artifacts and Notes

Important current files:

- `prisma/schema.prisma`
- `src/types/index.ts`
- `src/server/repositories/events.ts`
- `src/server/scheduler/serialize.ts`
- `src/app/api/events/[eventId]/matches/[matchId]/route.ts`
- `src/app/events/[id]/schedule/components/eventForm/sections/StaffManagementPanel.tsx`
- `src/app/events/[id]/schedule/components/eventForm/sections/TeamOfficiatingControls.tsx`
- `src/app/events/[id]/schedule/schedulePage/ParticipantsPanel.tsx`
- `src/app/events/[id]/schedule/components/MatchCard.tsx`
- `/Users/elesesy/StudioProjects/mvp-app/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`
- `/Users/elesesy/StudioProjects/mvp-app/core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`
- `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsStaffSection.kt`
- `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`
- `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/ParticipantsVeiw.kt`
- `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`

Current pre-plan dirty state observed in `mvp-site`:

    M AGENTS.md
    M e2e/.auth/host.json
    M e2e/.auth/participant.json

Those files are unrelated to this plan and should not be reverted or staged as part of this work unless the user explicitly asks.

## Revision Notes

- 2026-07-01 / Codex: Created the initial ExecPlan from the product discussion. The plan records placement, permissions, schema direction, roster historical behavior, forfeit/cancel action placement, and cross-repo web/mobile implementation scope.
- 2026-07-01 / Codex: Added host/official check-in visibility requirements. Event check-ins must show as badges in participant/team views, and match check-ins must show in match details for both web and mobile.
