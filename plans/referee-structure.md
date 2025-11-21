# Referee structure support across schedule, organizations, and events

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with PLANS.md at /home/camka/MVP/mvp-site/PLANS.md.

## Purpose / Big Picture

Event organizers need to manage referees as individual users instead of only assigning teams. The updated Appwrite schema adds `refereeIds` and `doTeamsRef` to events, a dedicated `teamRefereeId` on matches alongside the existing `refereeId` (now a user ref), and stores organization referee rosters on `refIds`. After this change, organizations can manage referees from their detail page, new events created under an organization start with that roster but allow edits, schedule pages hydrate and display both user and team referees, and match cards show whichever refs are present.

## Progress

- [x] (2025-03-01 00:00Z) Created initial ExecPlan with scope, schema notes, and work breakdown.
- [x] (2025-03-01 01:00Z) Updated domain types and services to map refereeIds/doTeamsRef, hydrate user and team referees on matches/events/organizations.
- [x] (2025-03-01 02:00Z) Revised schedule UI (page.tsx, MatchEditModal, MatchCard) to surface both team and user referees and persist edits to the correct fields.
- [x] (2025-03-01 02:30Z) Added organization referees tab plus overview summary, wired referee search/add/remove, and prepopulated event creation with organization referees while keeping refs mutable.
- [x] (2025-03-01 03:00Z) Ran jest suite (`npm test -- --runInBand --testPathPattern=.`); existing console warnings from mocked failures remain.

## Surprises & Discoveries

- Observation: none yet.
  Evidence: n/a.

## Decision Log

- Decision: none yet.
  Rationale: n/a.
  Date/Author: n/a.

## Outcomes & Retrospective

To be filled after implementation to summarize what shipped, remaining gaps, and lessons learned.

## Context and Orientation

Relevant schema (from /home/camka/MVP/database/appwrite.config.json):
- Matches table columns: `refereeId` (now an individual ref user), new `teamRefereeId` (team acting as ref), `refereeCheckedIn`.
- Events table columns: `refereeIds` (array of user referee IDs) and `doTeamsRef` (boolean flag for team-ref model).
- Organizations table columns: `refIds` (array of referee user IDs).

Key files to touch:
- src/types/index.ts defines Event, Match, Organization shapes and payload helpers.
- src/lib/eventService.ts hydrates events/matches and builds payloads.
- src/lib/organizationService.ts maps org rows and fetches related data.
- src/lib/tournamentService.ts updates matches and computes permissions.
- UI: src/app/discover/[id]/schedule/page.tsx, src/app/discover/[id]/schedule/components/MatchEditModal.tsx, src/app/discover/[id]/schedule/components/MatchCard.tsx.
- UI: src/app/organizations/[id]/page.tsx for org detail tabs and overview.
- Event creation: src/app/discover/components/EventCreationSheet.tsx (and any helper components) to seed refereeIds and let creators edit them.
- Player search pattern to reuse: src/app/teams/components/InvitePlayersModal.tsx.

Assumptions:
- Referee user objects come from the existing UserData model and can be fetched via userService methods (searchUsers/getUserById/getUsersByIds).
- Team refs remain supported for tournaments/leagues when `doTeamsRef` is true; otherwise `refereeIds`/`refereeId` carry user refs.

## Plan of Work

Update data models and services first so UI can rely on hydrated refs. Extend Match to hold both `referee` (UserData) and `teamReferee` (Team) with corresponding IDs; extend Event with `refereeIds`, `referees`, and `doTeamsRef`; extend Organization with `refIds`/`referees`. Adjust eventService mapping/hydration to resolve referee users and team referees on matches, and propagate the correct IDs in payloads. Update tournamentService permission logic and match updates to write the right fields. Refresh schedule UI to display both refs: MatchCard shows user and team refs when present; MatchEditModal allows selecting either user ref (from event.referees/search) or team ref depending on `doTeamsRef`, and persists to `refereeId` vs `teamRefereeId`. In the schedule page, ensure event data pulls referees and caches correctly. Add an Organization “Referees” tab: list current refs with avatars/names, allow search/add (reuse player search) and remove, persist updates via organizationService, and surface a summary list on the overview tab. In EventCreationSheet, fetch organization referees when an org is selected, prefill `refereeIds` with that list for new events, allow adding/removing refs with the search UX, and include `doTeamsRef` toggle plus refereeIds in the submit payload. Keep new UI responsive and consistent with Mantine styles.

## Concrete Steps

Work in /home/camka/MVP/mvp-site.
1) Update types and services:
   - Modify src/types/index.ts to add refereeIds/referees/doTeamsRef on Event; refIds/referees on Organization; teamRefereeId/teamReferee plus refereeId for UserData on Match; adjust payload helpers.
   - In src/lib/eventService.ts map new fields from rows, hydrate referees via userService, handle match teamRefereeId/refereeId in mapMatchRecord, include refereeIds/doTeamsRef in create/update payloads and relation hydration.
   - In src/lib/organizationService.ts hydrate referees via userService, adjust withRelations to fetch refs, and add helpers to update refIds if needed.
   - In src/lib/tournamentService.ts update permission checks and updateMatch payload handling for user vs team refs.
2) Schedule UI updates:
   - Update src/app/discover/[id]/schedule/page.tsx to store referees on event, pass options into MatchEditModal (including doTeamsRef and referee lists), and ensure match updates carry correct ref fields.
   - Enhance MatchEditModal to edit refereeId (user) and teamRefereeId separately, using search/select sourced from event refs/teams; preserve existing set editing.
   - Update MatchCard to render both user ref and team ref badges when available.
3) Organization referees management:
   - Extend src/app/organizations/[id]/page.tsx with a “Referees” tab showing current refs, search/add via userService.searchUsers, and remove actions (persisting back to organizationService).
   - Show a summary of current referees on the overview tab.
4) Event creation integration:
   - In src/app/discover/components/EventCreationSheet.tsx, when an organization is selected, preload its referees into event form state, allow editing (list + search/add/remove), include refereeIds and doTeamsRef toggle in validation and submit payload, and surface refs in preview/hydration paths.
5) Validation:
   - Run targeted type check if feasible (e.g., npm run lint or tsc) and jest tests if time permits; at minimum ensure build/type safety for touched areas.

## Validation and Acceptance

Acceptance scenario:
- Organization detail page shows current referees on the overview and provides a “Referees” tab where you can search for a user, add them, and remove existing refs; changes persist after reload.
- Creating a new event while an organization is selected prepopulates the referee list with the org’s refs. The creator can add/remove refs using player search; submitted event stores `refereeIds` and respects the `doTeamsRef` toggle.
- Schedule page for an event loads and displays both team referees and user referees on match cards (showing both when set). Editing a match lets you set a user ref and a team ref (following doTeamsRef expectations) and the saved match reflects those fields.
- Jest/type checks run without errors (or any skipped commands are called out explicitly).

## Idempotence and Recovery

Changes are additive to types/services and UI components; rerunning steps is safe. If data mapping fails, revert the specific payload mapping or hydration change rather than broader resets. UI additions rely on existing services; if a search call fails, fall back to displaying an error message without mutating state. Event creation prefill should guard against missing organization refs and allow manual edits.

## Artifacts and Notes

Keep screenshots/diffs small; verify new fields appear in serialized event/match objects when logging during development if needed. Persisted updates should only touch referee-related arrays/IDs.

## Interfaces and Dependencies

- userService: use `searchUsers(query: string)`, `getUserById(id)`, and `getUsersByIds(ids: string[])` to load referees.
- organizationService updates must write `refIds` array; exposes `updateOrganization(id, data)` to persist changes.
- eventService create/update payloads accept `refereeIds?: string[]` and `doTeamsRef?: boolean`; matches carry `refereeId?: string | null` (user) and `teamRefereeId?: string | null` (team acting as ref).
- UI components use Mantine inputs (Select, Button, List) and existing avatar helpers to render user/team refs.

---

Revision notes:
- 2025-03-01: Initial plan drafted to cover new referee schema, UI, and service updates. Reason: align frontend with updated Appwrite config.
- 2025-03-01: Progress updated after type/service hydration changes.
