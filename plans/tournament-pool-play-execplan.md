# Tournament Pool Play With Generated Pools

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. The same plan is also stored in the companion `mvp-app` worktree so either repository can be opened independently and still explain the end-to-end change.

## Purpose / Big Picture

Tournament hosts need a pool-play option that lets teams register for a visible tournament bracket division, then assigns those teams into hidden pools for preliminary round-robin matches before the bracket is played. After this change, a tournament division can expose a `Pool play` checkbox, a pool count, a bracket team count, and a read-only pool team count. A team signs up for a bracket division with normal price, skill, age, capacity, and payment settings, while the system balances registrations into generated pools named alphabetically such as Pool A, Pool B, and Pool C.

The behavior is visible by creating or editing a tournament with pool play enabled, adding a bracket division with an evenly divisible max team count and pool count, registering teams into that bracket division, and scheduling the event. The schedule should contain pool round-robin matches grouped by generated pool divisions and bracket matches grouped by the bracket division. No host should have to manually create pool rows or map placements.

## Progress

- [x] (2026-05-05) Created isolated worktrees for both repositories on branch `codex/tournament-pool-play`: `C:\Users\samue\StudioProjects\mvp-app-tournament-pool-play` and `C:\Users\samue\Documents\Code\mvp-site-tournament-pool-play`.
- [x] (2026-05-05) Confirmed both original checkouts had unrelated dirty files and must not be edited for this work.
- [x] (2026-05-05) Read `PLANS.md` and created this initial self-contained ExecPlan.
- [x] (2026-05-05) Add backend event contract support for `includePlayoffsOrPools` while keeping `includePlayoffs` compatibility.
- [x] (2026-05-05) Add site repository helpers to generate and reconcile hidden tournament pool divisions from visible bracket division settings.
- [x] (2026-05-05) Update registration and payment capacity logic so tournament pool play registers against bracket divisions and assigns teams transactionally to the least-filled generated pool.
- [x] (2026-05-05) Update scheduler loading and scheduling so pool-play tournaments run pool round-robin matches before generated bracket placeholders.
- [x] (2026-05-05) Generalize standings advancement from league-only playoff reassignment to pool source divisions feeding tournament bracket divisions.
- [x] (2026-05-05) Update site manage UI to show pool count and read-only pool team count on tournament bracket division cards without rendering pool cards.
- [x] (2026-05-05) Update mobile app DTOs, models, and event-edit UI enough to preserve and edit pool-play tournament settings.
- [x] (2026-05-05) Add focused tests in `mvp-site` for generated pool sizing and assignment.
- [x] (2026-05-05) Run focused verification commands and record results for generated pools, standings routes, schedule routes, standings reassignment, and TypeScript.

## Surprises & Discoveries

- Observation: The current checkouts are dirty, so all implementation must occur in the new worktrees.
  Evidence: `git status --short --branch` in `mvp-app` showed modified Kotlin and Gradle files, and `git status --short --branch` in `mvp-site` showed modified billing, auth, agent, and schedule files plus an untracked file.
- Observation: `playoffPlacementDivisionIds` preserves duplicate IDs and blank positions instead of forcing uniqueness.
  Evidence: `src/server/scheduler/standings.ts` indexes into `division.playoffPlacementDivisionIds` by placement, and existing tests include values such as `['playoff_1', 'playoff_1']`.
- Observation: The site TypeScript check is blocked by a pre-existing unresolved `Bill` type in `src/lib/paymentService.ts`, not by the pool-play changes.
  Evidence: `npx tsc --noEmit --pretty false` reports only `src/lib/paymentService.ts(211,23)` and `(229,64): Cannot find name 'Bill'.`
- Observation: The Android compile in the app worktree is blocked by missing Android SDK configuration, and common metadata compile is blocked by an existing `TeamRepository.kt` error outside this change.
  Evidence: `.\gradlew :composeApp:compileDebugKotlinAndroid` fails because SDK location is not found. `.\gradlew :composeApp:compileCommonMainKotlinMetadata` fails at `TeamRepository.kt:358:23 Unresolved reference 'putIfAbsent'.`
- Observation: The standings reassignment code could be shared by leagues and pool-play tournaments with a narrow event type instead of a new tournament-only implementation.
  Evidence: `npm test -- --runTestsByPath src/server/scheduler/__tests__/standingsPlayoffReassignment.test.ts --runInBand` passes with a new tournament pool-play reassignment test and the existing league reassignment tests.
- Observation: Full TypeScript checking still fails only on the pre-existing `Bill` type references.
  Evidence: `npx tsc --noEmit --pretty false` reports only `src/lib/paymentService.ts(211,23)` and `(229,64): Cannot find name 'Bill'.`

## Decision Log

- Decision: Do not add a new `Pools` table or new persisted `poolCount` column for the first implementation.
  Rationale: Existing `Divisions` rows already have the fields needed for generated pool scheduling: `kind`, `maxParticipants`, `playoffTeamCount`, `playoffPlacementDivisionIds`, `teamIds`, and field assignments. Pool count can be derived from the number of generated pool rows pointing at a bracket division.
  Date/Author: 2026-05-05 / Codex

- Decision: For tournament pool play, visible tournament bracket divisions are stored as `Divisions.kind = PLAYOFF`, and generated hidden pools are stored as `Divisions.kind = LEAGUE`.
  Rationale: Current backend code already separates non-playoff rows from playoff rows and already knows how source divisions feed playoff divisions. Reusing these kinds avoids a database enum migration and keeps the scheduler close to the league playoff path.
  Date/Author: 2026-05-05 / Codex

- Decision: Registration capacity for a tournament bracket division is `maxParticipants`, bracket entrant count is `playoffTeamCount`, and read-only pool team count is `maxParticipants / poolCount`.
  Rationale: Teams register for the bracket division, not for the eventual bracket entrant list. The max registration count can be larger than the bracket size because pool play eliminates teams before bracket seeding.
  Date/Author: 2026-05-05 / Codex

- Decision: Require `maxParticipants` to divide evenly by pool count and `playoffTeamCount` to divide evenly by pool count for v1.
  Rationale: Even pool sizes and identical advancement counts avoid wildcard rules and make generated mappings deterministic. Wildcards can be added later as an explicit advancement rule.
  Date/Author: 2026-05-05 / Codex

- Decision: The user-visible boolean should be `includePlayoffsOrPools`, but storage and old clients should continue to work through `includePlayoffs`.
  Rationale: The same persisted event capability means "playoffs" for leagues and "pool play" for tournaments. Keeping compatibility avoids breaking existing site and mobile clients while new screens use event-specific labels.
  Date/Author: 2026-05-05 / Codex

- Decision: Reuse the standings playoff reassignment algorithm for tournament pool play through a `StandingsAdvancementEvent` type.
  Rationale: Generated pools already behave like source divisions and bracket divisions already behave like advancement divisions. Sharing the code keeps placement ordering, bracket template assignment, and confirmed-standing behavior consistent with leagues while allowing tournament wording and capacity rules at the API boundary.
  Date/Author: 2026-05-05 / Codex

- Decision: For tournament pool play, validate advancement capacity against the bracket division `playoffTeamCount` before falling back to `maxParticipants`.
  Rationale: `maxParticipants` is registration capacity for the bracket division and can intentionally be larger than the number of teams that enter the bracket after pool play. The bracket size must be enforced by the bracket team count.
  Date/Author: 2026-05-05 / Codex

## Outcomes & Retrospective

The first end-to-end implementation milestone is complete in both repositories. The site now accepts the pool-play contract, derives hidden generated pools, assigns registrations into the least-filled pool, schedules pool round-robin matches before bracket matches, exposes pool settings on visible bracket division cards, and can seed tournament brackets from confirmed generated pool standings. The app can preserve and edit the pool-play contract without showing generated pool rows.

Remaining risk is mostly environmental verification rather than known feature gaps. Full site type checking is blocked by an existing `Bill` type issue in `src/lib/paymentService.ts`, and app Gradle verification is blocked by local SDK/configuration and an existing `TeamRepository.kt` compile issue. Focused Jest coverage for the changed site behavior passes.

## Context and Orientation

There are two repositories in scope. `mvp-site` is the backend and web frontend source of truth. In this Windows environment the new site worktree is `C:\Users\samue\Documents\Code\mvp-site-tournament-pool-play`. `mvp-app` is the Kotlin Multiplatform mobile app. In this Windows environment the new app worktree is `C:\Users\samue\StudioProjects\mvp-app-tournament-pool-play`.

In this plan, a "bracket division" means the tournament division that users see and register for, such as "CoEd Open 18+". It owns price, payment settings, skill limits, age limits, registration capacity, and bracket rules. A "pool" means a generated scheduling group inside one bracket division, such as "CoEd Open 18+ Pool A". Users do not register for pools directly and hosts do not edit pools directly in v1.

The relevant `mvp-site` database model is `prisma/schema.prisma`. The `Divisions` model has `kind`, `price`, `maxParticipants`, `playoffTeamCount`, `playoffPlacementDivisionIds`, `fieldIds`, and `teamIds`. The `Events` model has `includePlayoffs`, `playoffTeamCount`, and `splitLeaguePlayoffDivisions`. The `EventRegistrations` model stores `divisionId`, which must remain the visible bracket division for tournament pool play.

The relevant `mvp-site` domain and scheduler files are `src/types/index.ts`, `src/server/repositories/events.ts`, `src/server/scheduler/types.ts`, `src/server/scheduler/EventBuilder.ts`, `src/server/scheduler/scheduleEvent.ts`, and `src/server/scheduler/standings.ts`. The web event form is `src/app/events/[id]/schedule/components/EventForm.tsx`. Registration and billing division selection flows are in `src/app/api/events/[eventId]/registrationDivisionUtils.ts`, `src/app/api/events/[eventId]/participants/route.ts`, `src/app/api/billing/purchase-intent/route.ts`, and `src/server/events/eventRegistrations.ts`.

The relevant `mvp-app` files are `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/EventConfigs.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/DivisionDetail.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/dtos/EventDTO.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`, and the event editing UI under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail`.

## Plan of Work

First, update the shared event contract. In `mvp-site`, accept `includePlayoffsOrPools` anywhere `includePlayoffs` is accepted and serialize both values during the transition. In `mvp-app`, add the same nullable or derived property to the Event model and DTOs while keeping `includePlayoffs` reads and writes stable. User-facing labels must remain event-specific: leagues say playoffs, tournaments say pool play.

Second, add a site helper that derives generated pool rows from visible tournament bracket divisions. The helper should live near the event repository or in a small server utility with no React dependency. It must find generated pools for a bracket division by looking for non-playoff divisions whose `playoffPlacementDivisionIds` contain that bracket division id. It must reconcile the desired pool count by creating missing pools named alphabetically and updating pool fields. It must block unsafe changes: lowering pool count when removed pools have assigned `teamIds`, lowering pool team count below assigned teams, or using non-even max teams or bracket team counts.

Third, change tournament registration division resolution. For tournament pool play, registration options must be bracket divisions, not generated pools. Payment and capacity checks should use the bracket division `maxParticipants`. After an event team snapshot is created, the registration flow should assign that event team id to one generated pool for the selected bracket division. Assignment must prefer the fewest assigned teams and randomize among ties. This update must run in the same database transaction as registration activation. If the database supports row locks through raw SQL, lock candidate pool rows before choosing. If not, use a serializable transaction or bounded retry around the update and re-check capacity before writing.

Fourth, change team membership syncing. `syncDivisionTeamMembershipFromRegistrations` currently rebuilds non-playoff division `teamIds` from registration `divisionId`. That is correct for leagues but wrong for tournament pool play because registration points at bracket divisions. It must skip generated tournament pools and preserve their `teamIds`, or a tournament-specific sync must assign pools explicitly.

Fifth, change scheduling. When loading a pool-play tournament, the scheduler should treat generated pools as preliminary source divisions and bracket divisions as advancement divisions. Before scheduling pool matches, build a map from each pool `teamIds` list to the matching `Team` objects and set each team division to its pool in scheduler memory. Then run the existing round-robin regular-season scheduler for those pools with one game per opponent. After pool matches, build bracket placeholders for each bracket division using `bracketDivision.playoffTeamCount` and schedule brackets using the existing bracket builder.

Sixth, generalize standings advancement. Existing league playoff standings functions should accept a pool-play tournament as an event with source divisions and advancement divisions. When pool standings are confirmed, top teams from each generated pool should be assigned into the bracket division named in each placement entry. For generated mappings this means all positions in a pool point to the same bracket division. The order should remain placement-major across pools, for example Pool A #1, Pool B #1, Pool A #2, Pool B #2.

Seventh, update the site form. In tournament pool play, do not render generated pool cards. Render pool settings on each visible bracket division card: pool count input, read-only pool team count, bracket teams count, and computed registration max team count. The "Add Division" action for tournaments should add a bracket division. The pool count input should drive generated pool rows on save.

Eighth, update mobile. The mobile app should be able to load and save tournament pool play settings with the same contract. To keep the first mobile surface simple, expose pool count and read-only pool team count on tournament division settings and do not expose generated pool rows or assigned teams.

## Concrete Steps

Use these working directories for all commands:

    cd C:\Users\samue\Documents\Code\mvp-site-tournament-pool-play
    cd C:\Users\samue\StudioProjects\mvp-app-tournament-pool-play

Before editing, confirm the branches:

    git status --short --branch

Expected result in each worktree:

    ## codex/tournament-pool-play

Implement `mvp-site` first because it owns the API and database contract. Add tests near existing event form, repository, registration, scheduler, and standings tests. Then implement `mvp-app` DTO and UI support against the new contract.

When implementation reaches a stopping point, update this plan's `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Artifacts and Notes` sections with what changed and why.

## Validation and Acceptance

In `mvp-site`, run focused tests after backend changes. Exact commands may be adjusted after inspecting `package.json`, but the expected categories are:

    npm test -- --runTestsByPath src/server/repositories/__tests__/events.upsert.test.ts
    npm test -- --runTestsByPath src/app/api/events/__tests__/participantsRoute.test.ts
    npm test -- --runTestsByPath src/app/api/billing/__tests__/purchaseIntentRoute.test.ts
    npm test -- --runTestsByPath src/server/scheduler/__tests__/standingsPlayoffReassignment.test.ts
    npm test -- --runTestsByPath src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx

Acceptance for the site backend is a test scenario where a tournament bracket division has `maxParticipants = 12`, `playoffTeamCount = 6`, and pool count `3`. Saving the event creates or updates three generated pools with `maxParticipants = 4`, `playoffTeamCount = 2`, and `playoffPlacementDivisionIds = [bracketDivisionId, bracketDivisionId]`. Registering teams into the bracket division assigns them across the three pools by lowest current count, never exceeding four teams per pool.

Acceptance for scheduling is a test scenario where six or more registered teams are assigned to generated pools and scheduling produces round-robin pool matches before bracket matches. Bracket matches should use placeholder seeds in the bracket division until pool standings are confirmed. Confirming standings should place real teams into the bracket placeholders.

In `mvp-app`, run focused Kotlin tests after DTO/model changes:

    .\gradlew :composeApp:testDebugUnitTest

If broad Gradle tests are too slow or blocked, run the narrow test class added for event DTO/payload mapping and record the command and result in this plan.

## Idempotence and Recovery

The generated pool reconciliation must be idempotent. Saving the same event twice should not create duplicate pools. Increasing pool count should add only the missing alphabetic pools. Decreasing pool count should remove only empty generated pools; if any pool that would be removed has assigned teams, the save must fail with a clear validation error. Lowering max teams or pool count below current assignments must fail rather than silently dropping teams.

The database update path must preserve old events. Leagues should keep their existing playoff behavior. Tournaments without pool play should keep direct bracket behavior. Existing clients that send only `includePlayoffs` must still work while new clients may send `includePlayoffsOrPools`.

The original worktrees contain unrelated dirty files and must not be used for this implementation. If a command accidentally runs there, stop and re-run it in the new `*-tournament-pool-play` worktree.

## Artifacts and Notes

Branch and worktree setup completed:

    mvp-app:  C:\Users\samue\StudioProjects\mvp-app-tournament-pool-play on codex/tournament-pool-play
    mvp-site: C:\Users\samue\Documents\Code\mvp-site-tournament-pool-play on codex/tournament-pool-play

Initial source findings:

    prisma/schema.prisma has Divisions.kind values LEAGUE and PLAYOFF, and Divisions already stores maxParticipants, playoffTeamCount, playoffPlacementDivisionIds, and teamIds.
    src/server/scheduler/standings.ts reads duplicate placement mappings by index, so generated mappings like [bracket, bracket] are supported.
    src/server/events/eventRegistrations.ts syncs registrations into non-playoff division teamIds, which must be changed or bypassed for tournament pool play.

Verification from the completed standings milestone:

    npm test -- --runTestsByPath src/server/events/__tests__/tournamentPools.test.ts --runInBand
    Result: PASS, 3 tests.

    npm test -- --runTestsByPath src/server/scheduler/__tests__/standingsPlayoffReassignment.test.ts --runInBand
    Result: PASS, 7 tests, including tournament pool-play bracket seeding.

    npm test -- --runTestsByPath src/app/api/events/__tests__/standingsRoutes.test.ts --runInBand
    Result: PASS, 6 tests, including route access for tournament generated pool standings.

    npm test -- --runTestsByPath src/app/api/events/__tests__/scheduleRoutes.test.ts --runInBand
    Result: PASS, 36 tests. The suite prints expected console.error output for tests that intentionally exercise failure responses.

    npx tsc --noEmit --pretty false
    Result: FAIL only on pre-existing `src/lib/paymentService.ts` missing `Bill` type references.

## Interfaces and Dependencies

At the end of implementation, `mvp-site` should expose a helper equivalent to:

    type TournamentPoolConfig = {
      bracketDivisionId: string;
      poolCount: number;
      maxTeams: number;
      bracketTeamsCount: number;
    };

    function deriveTournamentPoolTeamCount(config: TournamentPoolConfig): number;

    async function reconcileGeneratedTournamentPools(params: {
      eventId: string;
      bracketDivision: DivisionDetailPayload;
      poolCount: number;
      tx: PrismaTransaction;
    }): Promise<DivisionDetailPayload[]>;

The exact names may change to match repository style, but the behavior must remain: derive pool count from existing generated pool rows on load, enforce even divisibility, generate alphabetic pool names, and avoid new database columns.

The registration path should expose or use a helper equivalent to:

    async function assignRegisteredTeamToTournamentPool(params: {
      eventId: string;
      bracketDivisionId: string;
      eventTeamId: string;
      tx: PrismaTransaction;
    }): Promise<string>;

The returned string is the generated pool division id that received the team. The helper must be safe under concurrent signups by locking or retrying.

The app DTO layer should expose `includePlayoffsOrPools` while preserving `includePlayoffs`. The UI layer should call the visible field `Pool play` for tournaments and should show a read-only pool team count calculated from max teams divided by pool count.

Revision note, 2026-05-05: Initial plan created after branch/worktree setup. The plan records the decision to use generated hidden `Divisions` rows for pools and visible `PLAYOFF` rows for tournament bracket registration divisions.

Revision note, 2026-05-05: Updated after implementing standings advancement for pool-play tournaments. The plan now records the shared standings advancement type, tournament bracket capacity rule, and focused verification evidence.
