# Keep standings teams visible and make mobile point adjustments editable

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan is maintained in accordance with `PLANS.md` at the `mvp-site` repository root.

## Purpose / Big Picture

League and tournament organizers must always see the teams that belong to the selected standings division, even before any league or pool match exists and after every such match has been deleted. Match results contribute wins, losses, score totals, and base points, but matches must not decide whether a team exists in the table. On mobile, an authorized host or assistant host must also be able to enter standings-management mode, increment or decrement a team's final points, save those values through the existing web standings API, and see the authoritative values returned by the server.

## Progress

- [x] (2026-07-20 01:30Z) Audited both dirty worktrees, the standings API/calculator, web fallback rows, mobile standings presentation, and mobile repository/coordinator/UI flow.
- [x] (2026-07-20 01:45Z) Verified that the July web standings-integrity refactor already fixed blank-input-to-zero, missed-final-keystroke, unstable-row, and server-readback problems.
- [x] (2026-07-20 01:55Z) Added failing web/backend regressions for zero-match league membership and zero-match tournament parent-division fallback.
- [x] (2026-07-20 02:00Z) Implemented membership-first standings rows on the server and in the web fallback calculation.
- [x] (2026-07-20 02:03Z) Added mobile presentation regressions for teams with no matches and tournament parent-division fallback.
- [x] (2026-07-20 02:07Z) Implemented mobile standings PATCH support, draft editing, increment/decrement controls, save/cancel behavior, and authoritative readback.
- [x] (2026-07-20 02:10Z) Found and fixed a remaining tournament event-upsert path that reset generated-pool standings overrides to null; added a failing-first repository regression.
- [x] (2026-07-20 02:11Z) Ran focused web tests, TypeScript checking, focused mobile tests, and Kotlin compilation; all requested checks passed.

## Surprises & Discoveries

- Observation: The server standings calculator already creates zero-valued rows before it reads matches, but only for team IDs returned by `getLeagueDivisionTeamIds`.
  Evidence: `src/server/scheduler/standings.ts` calls `ensureRow` for every included event team before iterating regular-season matches.
- Observation: Generated tournament pools and registered tournament teams use two related division identities. Pool rows are league-kind `Divisions` records whose `playoffPlacementDivisionIds` point to the parent tournament bracket division; a team's canonical `division` may still be that parent division when no explicit pool membership is available.
  Evidence: `src/server/events/tournamentPools.ts` creates pool placement references to the bracket ID, while `src/server/repositories/events.ts` resolves team divisions from pool `teamIds` first and the persisted team division second.
- Observation: Mobile already declares standings PATCH DTOs but never exposes a repository method or UI action that uses them.
  Evidence: `core/network/.../StandingsDtos.kt` contains `StandingsPatchRequestDto`, while `EventRepositoryContract` currently exposes only GET and confirm operations.
- Observation: The mobile standings dock currently reuses match-edit callbacks, so its Manage button enters match editing rather than standings-point editing.
  Evidence: the `DetailTab.LEAGUES` branch in `EventDetailTabsHost.kt` passes `onStartEditingMatches`, `onCancelEditingMatches`, and `onCommitMatchChanges` into `BracketFloatingBar`.
- Observation: The shared mobile JSON configuration omits nullable properties, so a nullable `Double?` request property cannot send the explicit JSON `null` needed to clear a points override.
  Evidence: the first HTTP regression omitted `points` for the clear operation; representing the request value as non-null `JsonElement` with `JsonNull` produces the API's required `"points": null` payload.
- Observation: The July refactor fixed client draft/readback resets, but generated tournament pool details still supplied `standingsOverrides: null` during ordinary event upserts, which took precedence over the existing persisted value.
  Evidence: the new `events.upsert.test.ts` regression initially received `null` instead of `{ team_1: 7 }`; changing the generated field to `undefined` lets the existing-value branch in `resolveDivisionValue` preserve it while new pools still fall back to null.

## Decision Log

- Decision: Treat division membership as the source of row identity and matches only as statistics inputs.
  Rationale: Deleting a match must not mutate the set of registered teams visible in standings.
  Date/Author: 2026-07-20 / Codex
- Decision: Prefer explicit generated-pool `teamIds`; only when no explicit pool membership exists, fall back to teams assigned to the pool's parent tournament division.
  Rationale: Explicit pool assignments must remain isolated, while an unscheduled or matchless tournament still needs useful standings for its registered division teams.
  Date/Author: 2026-07-20 / Codex
- Decision: Keep the existing absolute-final-points API contract for mobile and clear an override when the draft equals the computed base points.
  Rationale: This matches the web behavior and prevents a value equal to today's base points from freezing future automatic scoring changes.
  Date/Author: 2026-07-20 / Codex
- Decision: Give the mobile standings tab its own edit state instead of reusing match-edit state.
  Rationale: Match drafts and standings-point drafts have different persistence endpoints and must not be saved or canceled together.
  Date/Author: 2026-07-20 / Codex
- Decision: Treat generated pool standings overrides as unspecified during general event upserts.
  Rationale: Pool generation owns pool shape and membership, while the standings PATCH endpoint owns organizer point overrides. An event edit must not silently erase that independently persisted state.
  Date/Author: 2026-07-20 / Codex

## Outcomes & Retrospective

The implementation is complete. Standings membership now comes from explicit division teams, or from the parent tournament division when a pool has neither explicit membership nor matches. Matches only contribute statistics. The web fallback follows the same rule, so teams do not flash away while authoritative rows load. Mobile follows the same membership hierarchy and gives authorized organizers a dedicated Manage mode with decrement, increment, Save, and Cancel behavior. Successful saves replace local rows with the server response, failed saves retain the draft, and saving a draft equal to base points sends an explicit `null` to clear the override.

The prior client-side zero-reset modes remain fixed in commit `1a3af5fb`. Its draft regression suite passed unchanged, covering blank input, explicit zero, final-keystroke snapshots, stable row identity, and authoritative readback. This audit also found and fixed the remaining server-side reset path in ordinary tournament event upserts. Web validation passed with the 4 standings suites and 35 tests plus the 55-test event-upsert suite, followed by `npx next typegen` and `npx tsc --noEmit`. Mobile validation passed with the focused membership, coordinator, and HTTP repository tests; the Gradle task also compiled the Android production and unit-test Kotlin sources. Scoped `git diff --check` reported no whitespace errors.

## Context and Orientation

The web/backend repository is `/Users/elesesy/StudioProjects/mvp-site`. The mobile Kotlin Multiplatform repository is `/Users/elesesy/StudioProjects/mvp-app`. Both are dirty and contain unrelated work, so every edit and validation command must remain limited to files named in this plan.

The backend loads events into scheduler models in `src/server/repositories/events.ts`. A `Division` has `teamIds`, which is the explicit membership list. `src/server/scheduler/standings.ts` selects division teams and then computes rows from non-playoff matches. The public and authenticated standings endpoint in `src/app/api/events/[eventId]/standings/` returns those rows. The web schedule page also computes temporary fallback rows in `src/app/events/[id]/schedule/page.tsx`, using helpers in `src/lib/standingsRows.ts` until authoritative server rows are available.

For tournament pool play, the parent tournament division is stored as a playoff-kind division and each generated pool is a league-kind division. A generated pool's `playoffPlacementDivisionIds` references its parent tournament division. Explicit pool `teamIds` are authoritative. When they are absent and no pool match can identify membership, teams whose canonical division equals the parent tournament division are the safe fallback requested by the product behavior.

On mobile, `EventDetailDivisionPresentation.kt` chooses teams and matches for the standings tab. `EventLeagueStandingsCoordinator.kt` owns remote standings state. `EventRepository.kt` calls the web API, and `EventDetailStandingsTab.kt` renders each row. The standings floating dock is assembled in `EventDetailTabsHost.kt` from state gathered in `EventDetailScreen.kt` and exposed by `EventDetailComponent.kt` and `DefaultEventDetailComponent.kt`.

An absolute final-points override is the organizer-selected total shown in the points column. It is stored per team on the selected division. Base points are automatically computed from match outcomes. Saving a draft equal to base points sends `null`, meaning automatic points should be used; any other finite draft sends that absolute number.

## Plan of Work

First add server calculator and route regressions that build divisions with teams but no matches. Prove a league returns every explicitly assigned team with zero games and zero points. Prove a tournament pool with no explicit pool membership or matches returns teams assigned to its referenced parent tournament division, while excluding teams from a different parent division. Update `getLeagueDivisionTeamIds` in `src/server/scheduler/standings.ts` to implement that hierarchy without using names or loose identifiers.

Second align the web fallback path. Extend `teamBelongsToSelectedStandingsDivision` so explicit selected-division IDs are authoritative and an optional parent-division ID is considered only when the explicit set is empty. Pass the selected tournament division as that parent while the selected data division is a generated pool. Keep server rows authoritative when they are available.

Third align the mobile presentation. Add a focused helper for standings team membership that prefers explicit pool IDs, then match participant IDs, then the parent tournament division only when the earlier sources are empty. Use canonical normalized IDs. Add `EventDetailStandingsMembershipTest` cases for a zero-match league and a zero-match tournament pool.

Fourth implement mobile editing end to end. Add an update model and default repository-contract method, implement PATCH in `EventRepository`, and test the request body and response mapping. Extend `EventLeagueStandingsCoordinator` with edit, draft, saving, cancel, and save state. Wire the lifecycle handler and component API. Give the LEAGUES dock its own Manage/Save/Cancel callbacks and display decrement/increment controls beside final points only while an authorized user is managing standings. A successful PATCH replaces coordinator rows with the server response before edit mode closes; a failure keeps the draft available and surfaces the error.

Finally run focused tests in each repository without concurrent Jest or Gradle tasks. Run TypeScript and Kotlin compile checks after focused regressions pass. Inspect `git diff --check` in each repository and verify unrelated dirty files were not modified.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, run:

    npm test -- --runInBand --runTestsByPath 'src/server/scheduler/__tests__/standingsPlayoffReassignment.test.ts' 'src/app/api/events/__tests__/standingsRoutes.test.ts' 'src/lib/__tests__/standingsRows.test.ts'
    npm test -- --runInBand --runTestsByPath 'src/app/events/[id]/schedule/schedulePage/__tests__/standingsOverrideDraft.test.ts'
    npm test -- --runInBand --runTestsByPath 'src/server/repositories/__tests__/events.upsert.test.ts'
    npx tsc --noEmit
    git diff --check -- docs/standings-team-membership-and-mobile-editing-execplan.md src/server/scheduler/standings.ts src/server/scheduler/__tests__/standingsPlayoffReassignment.test.ts src/app/api/events/__tests__/standingsRoutes.test.ts src/lib/standingsRows.ts src/lib/__tests__/standingsRows.test.ts 'src/app/events/[id]/schedule/page.tsx'

From `/Users/elesesy/StudioProjects/mvp-app`, run the focused tests serially with JDK 17:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.eventDetail.EventDetailStandingsMembershipTest' --tests 'com.razumly.mvp.eventDetail.EventLeagueStandingsCoordinatorTest' --tests 'com.razumly.mvp.core.data.repositories.EventRepositoryHttpTest' -Pmvp.startBackend=false
    ./gradlew :composeApp:compileDebugKotlinAndroid -Pmvp.startBackend=false
    git diff --check -- composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/StandingsDtos.kt core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories composeApp/src/commonTest/kotlin/com/razumly/mvp/eventDetail composeApp/src/commonTest/kotlin/com/razumly/mvp/core/data/repositories/EventRepositoryHttpTest.kt

## Validation and Acceptance

The web/backend change is accepted when GET standings returns every explicitly assigned league team with zero wins, losses, draws, games, goals, base points, and final points when there are no matches. For a tournament pool without pool membership or pool matches, it must return the registered teams assigned to that pool's parent tournament division and exclude teams from other tournament divisions. If explicit pool `teamIds` exist, those IDs remain authoritative.

The web page is accepted when the same teams remain visible during initial load or a recoverable standings API failure, including after all pool matches have been removed. Existing final-point overrides must survive ordinary match edits, and the July blank-input/final-keystroke/readback regression suite must remain green.

The mobile change is accepted when the same zero-match teams render, an unauthorized viewer sees no point controls, and a host or assistant host can enter standings Manage mode. Tapping increment changes only the selected team's draft by one. Save sends the selected event ID, division ID, and changed absolute points, replaces rows with the server response, and exits edit mode. Cancel discards the draft. A failed save keeps edit mode and the draft intact.

## Idempotence and Recovery

No schema migration or live-data write is required. Tests use fixtures and mock HTTP engines. Re-running the commands is safe. If a mobile or web file already has unrelated changes, preserve them and patch only the standings-specific hunk. Do not reset either repository. If a test fails because of an unrelated existing dirty-tree issue, capture the exact failure and run the smallest isolated suite that proves the touched behavior.

## Artifacts and Notes

The prior web reliability work is in `plans/event-officiating-standings-reliability-execplan.md` and commit `1a3af5fb`. Its regression helper `standingsOverrideDraft.ts` is the current source of truth for blank input, explicit zero, final-keystroke snapshots, and exact readback.

## Interfaces and Dependencies

In `src/server/scheduler/standings.ts`, `getLeagueDivisionTeamIds(event, divisionId)` remains the membership entry point. It must return explicit selected-division `teamIds` when present. For a generated tournament pool with none, it may use the pool's canonical `playoffPlacementDivisionIds` to select teams whose canonical division matches that parent. It must not match on display names.

In mobile repository models, define a small `LeagueStandingsPointUpdate(teamId: String, points: Double?)`. Add `updateLeagueDivisionStandings(eventId, divisionId, pointsOverrides): Result<LeagueDivisionStandings>` and implement it with `StandingsPatchRequestDto` and the existing `StandingsResponseDto`.

In `EventLeagueStandingsCoordinator`, expose read-only flows for whether standings are being edited, the draft points keyed by team ID, and whether a save is active. Expose methods to begin, adjust, cancel, and save. Saving must accept an injected repository function so coordinator tests remain pure and deterministic.

Revision note (2026-07-20): Created after tracing both current implementations and verifying that the earlier zero-reset issue was already fixed, while zero-match membership and mobile point editing remain incomplete.

Revision note (2026-07-20 02:11Z): Completed the cross-repository implementation and recorded passing web, TypeScript, mobile HTTP/coordinator/membership, and Kotlin compile evidence. The explicit-null serialization detail and remaining tournament event-upsert reset path were added after their regressions exposed the underlying behaviors.
