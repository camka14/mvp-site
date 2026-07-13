# Move Mobile Navigation to Stable IDs

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. It is maintained according to `PLANS.md` in the `mvp-site` repository root.

## Purpose / Big Picture

The mobile app currently puts complete event, match, user, and chat objects into Decompose navigation configurations. Decompose serializes those configurations so it can restore the back stack after Android recreates the app process. That means an old copy of a database record can be restored as if it were current. After this change, every persisted navigation destination contains only stable identifiers and small presentation arguments. A restored Event, Match, Chat, or Teams screen will subscribe to the current Room-backed repository data and refresh from the server instead of displaying the stale object that happened to be on the old back stack.

The user-visible proof is that navigating to a detail destination and restoring the navigation configuration requires only IDs; the destination hydrates its display from the owning repository flow. Unit tests will serialize and deserialize all affected configurations and prove that no mutable domain snapshot appears in the serialized payload.

## Progress

- [x] (2026-07-13 08:45 PDT) Located the affected serialized configurations in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/AppConfig.kt` and the object-shaped navigation interface in `INavigationHandler.kt`.
- [x] (2026-07-13 08:45 PDT) Mapped child construction in `composeApp/src/commonMain/kotlin/com/razumly/mvp/app/RootComponent.kt`, Koin factories in `composeApp/src/commonMain/kotlin/com/razumly/mvp/di/ComponentModule.kt`, and existing repository flows for events, matches, and chats.
- [x] (2026-07-13 09:32 PDT) Replaced the serialized `AppConfig` fields and `INavigationHandler` methods with IDs and primitive presentation arguments.
- [x] (2026-07-13 09:32 PDT) Made Event Detail, Match Detail, Chat, and Teams hydrate their initial state from IDs through their repositories.
- [x] (2026-07-13 09:32 PDT) Updated call sites, test navigation fakes, and Koin parameter factories.
- [x] (2026-07-13 09:32 PDT) Added serialization and hydration regressions, ran the targeted mobile test batch, built and installed the debug APK, and completed a clean launcher/relaunch smoke test. Authenticated destination navigation is recorded as an environment limitation below because the supplied account was rejected by the backend.

## Surprises & Discoveries

- Observation: `DefaultEventDetailComponent` already maintains a current `EventWithRelations` flow and calls a detail hydration routine when the selected event ID changes. It can use `Event(id = eventId)` only as a temporary loading fallback while the repository flow supplies current data.
  Evidence: `DefaultEventDetailComponent.kt` constructs `eventRelations` from the event repository and its `init` block calls `hydrateEventDetailForMobile` when the selected ID changes.

- Observation: `DefaultMatchContentComponent` already observes `IMatchRepository.getMatchFlow(selectedMatch.match.id)` and `IEventRepository.getEventWithRelationsFlow(selectedMatch.match.eventId)`. It can accept IDs and create only a minimal loading placeholder, rather than preserving a whole navigation snapshot.
  Evidence: `MatchContentComponent.kt` uses those repository flows after constructing the component.

- Observation: Teams is the one affected component that exposed a fixed `Event?` value rather than a flow. Its public component contract must become a `StateFlow<Event?>` so Compose can recompose when the event row is hydrated.
  Evidence: `TeamManagementScreen.kt` reads `component.selectedEvent` once, while `CreateOrEditTeamScreen.kt` uses its sport and division data.

- Observation: `getEventWithRelationsFlow` and the corresponding match flows can throw `NoSuchElementException` while a newly restored ID is absent from an empty Room cache before its remote refresh completes. This is an expected loading state, not an application failure.
  Evidence: the changed Event Detail, Match Detail, and Teams components initially subscribe by ID; each now suppresses that transient cache-miss exception while retaining ordinary error reporting and waiting for the current repository emission.

- Observation: the initial plan described Chat as constructing a minimal direct-message user or chat placeholder before asking its repository for data. The cleaner boundary is to make `IChatGroupRepository.getChatGroupFlow` itself accept `messageUserId` and `chatId`, so Chat never creates a navigation-derived domain snapshot at all.
  Evidence: the repository implementation and all test fakes now resolve chat data directly from the two navigation IDs.

- Observation: the wider affected Android test batch has three existing failures unrelated to this migration: `EventDetailMobileJoinFlowTest.startTeamRegistration_forPaidOpenTeam_createsTeamRegistrationPurchaseIntent` and two organization-checkout duplicate-intent tests. The same three failures reproduced in a detached clean worktree at the pre-change commit `728e63c3`.
  Evidence: `/private/tmp/mvp-app-data016-baseline` was created from `728e63c3`; the failures match the audit worktree by class and test name after supplying only the local debug manifest placeholder needed to start Android tests.

## Decision Log

- Decision: Use ID-only `AppConfig` fields for Event Detail, Match Detail, Chat, and Teams, while retaining only identifiers, the event-detail tab, selected free-agent ID, and free-agent ID list as navigation arguments.
  Rationale: IDs remain valid across Room and server refreshes and do not duplicate mutable domain truth in the serialized Decompose back stack. The small arguments describe navigation intent rather than a record snapshot.
  Date/Author: 2026-07-13 / Codex.

- Decision: Do not add a second in-memory navigation cache as a fallback for restored objects.
  Rationale: An in-memory cache would reintroduce a second mutable source of truth. Existing repository flows already provide cache-first display and remote refresh behavior.
  Date/Author: 2026-07-13 / Codex.

- Decision: Keep `SeededEventTemplateDraft` out of this DATA-016 migration because this audit finding specifically concerns persisted event, match, user, and chat domain records. The existing `pendingCreateSeed` handoff will remain separately scoped.
  Rationale: This keeps the remediation focused while removing every object cited by the audit finding.
  Date/Author: 2026-07-13 / Codex.

- Decision: Change `IChatGroupRepository.getChatGroupFlow` to accept stable direct-message user and chat IDs instead of a temporary `UserData` or `ChatGroupWithRelations` object.
  Rationale: The repository is the owner of current chat data. Taking IDs removes the final navigation-created domain snapshot and makes restored Chat destinations follow the same source-of-truth rule as Event Detail and Match Detail.
  Date/Author: 2026-07-13 / Codex.

- Decision: Treat an empty-Room `NoSuchElementException` during first ID hydration as an expected transient state instead of surfacing it as a user-visible component error.
  Rationale: Process restoration can occur before the local cache has refreshed. Suppressing only this known cache-miss leaves the destination available for the current repository value without hiding other errors.
  Date/Author: 2026-07-13 / Codex.

## Outcomes & Retrospective

Implementation landed in mobile commit `a9267179` (`fix: use id-only mobile navigation`). `AppConfig` and `INavigationHandler` now carry stable identifiers only for Event Detail, Match Detail, Chat, and Teams. `RootComponent`, Koin construction, all production call sites, and navigation test fakes pass those IDs. Event Detail, Match Detail, and Teams subscribe to their repository flows by ID; Teams exposes a `StateFlow<Event?>` for Compose; Chat resolves both direct-message and group data through the new ID-shaped repository flow.

The targeted Android batch passed with 73 tests and zero failures/errors: one serialization test, one ID-hydration event-detail regression, 57 Match Content tests, two Chat List tests, nine Chat Terms/lifecycle tests, and three Team Management selection tests. The command was:

    ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home ./gradlew --no-daemon :composeApp:testDebugUnitTest --tests AppConfigSerializationTest --tests EventDetailMobileJoinFlowTest.id_only_event_detail_hydrates_current_event_relations_by_id --tests MatchContentComponentTest --tests ChatListComponentTest --tests ChatTermsGatingTest --tests TeamManagementSelectionTest --console=plain --warning-mode=none --quiet

The debug application was installed on `emulator-5554`. After clearing test state and accepting its normal location/notification permission prompts, it reached the login UI and launched again cleanly after a force-stop/relaunch. Crash-buffer and app log inspection showed no app crash. The supplied account returned the visible backend response `Invalid credentials`, so the authenticated Event Detail, Match Detail, Chat, and Teams screens could not be navigated without creating or altering account data; the focused hydration tests remain the validation evidence for those routes. A wider relevant test batch was not counted as clean because its three failures were reproduced unchanged from detached clean baseline `728e63c3`, as documented above.

## Context and Orientation

The implementation target is the audit branch at `/private/tmp/mvp-app-critical-audit`, whose project root is `mvp-app`. The canonical product repository also has an `mvp-app` checkout, but edits for this audit must remain in the audit worktree until they are deliberately merged. The documentation ledger is in `/Users/elesesy/StudioProjects/mvp-site/docs/code-audit/README.md` and must be updated only after a focused test run passes.

Decompose is the app’s navigation library. `AppConfig` is a sealed group of destination configurations. Decompose serializes each configuration to preserve Android navigation state after process recreation. A repository flow is a Kotlin stream that emits the latest Room database value and may trigger a server refresh. In this project the owning repository is the source of truth; navigation may hold an ID to locate a row, but not a copied row.

`AppConfig.kt` currently serializes `Event`, `MatchWithRelations`, `UserData`, `ChatGroupWithRelations`, and an optional `Event` in Teams. `INavigationHandler.kt` accepts those same mutable objects. `RootComponent.kt` is the only implementation of that interface and constructs Decompose children. `ComponentModule.kt` maps RootComponent’s parameters to the concrete feature components. Event Detail, Match Detail, Chat, and Team Management already own the repository dependencies needed for hydration, but their constructor arguments must become IDs.

## Plan of Work

First, change `AppConfig` so Event Detail stores `eventId`, Match Detail stores `matchId` and `eventId`, Chat stores an optional direct-message user ID and optional chat ID, and Teams stores an optional `eventId` plus the existing list of free-agent IDs and selected ID. Keep `EventDetailInitialTab` and `OrganizationDetailTab` because they are immutable presentation choices. Update `INavigationHandler` to accept the same IDs; remove imports of domain objects from that contract.

Next, update `RootComponent` to create ID-only configurations in deep links, center shortcuts, post-create navigation, and interface overrides. It should preserve the existing behavior of validating deep links before navigating, but after validation it must pass the IDs, not the fetched objects. In `createChild`, pass IDs through Koin instead of snapshots. Remove the private conversion that turns a `MatchMVP` into a `MatchWithRelations` solely for navigation.

Then update Koin factories and feature component constructors. `DefaultEventDetailComponent` will accept `eventId`, define `Event(id = eventId)` as its loading fallback, and use `IEventRepository.getEventWithRelationsFlow(eventId)` so a restored screen requests current data. `DefaultMatchContentComponent` will accept `matchId` and `eventId`, build a minimal non-persisted loading relation from those IDs, and continue to replace it through the existing match and event repository flows. `DefaultChatGroupComponent` will accept IDs and construct minimal direct-message or chat placeholders only to seed the already-existing chat-group repository flow. `DefaultTeamManagementComponent` will accept an event ID, expose `StateFlow<Event?>`, and observe the event repository so the existing Compose screen receives the current sport and division data. Update `TeamManagementScreen` to collect that new state flow.

Finally, update every feature call site and test fake implementing `INavigationHandler`. Add a common test that serializes and restores each changed `AppConfig` case and asserts the JSON includes only ID-shaped fields, not mutable record properties such as an event name or match relation graph. Run the appropriate Compose unit-test task and the full affected mobile test batch. Build and install a debug Android APK on an emulator, navigate through Event Detail, Match Detail, Chat, and Teams, then verify that the destinations render after a relaunch using their IDs.

## Concrete Steps

Work from `/private/tmp/mvp-app-critical-audit`.

1. Edit `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/AppConfig.kt` and `INavigationHandler.kt` as described above. Search the project with:

       rg -n "AppConfig\\.(EventDetail|MatchDetail|Chat|Teams)|navigateTo(Match|MatchFromSchedule|Teams|Chat|Event)\\(" composeApp core -g '*.kt'

   The search must no longer show an AppConfig constructor that receives an `Event`, `MatchWithRelations`, `UserData`, or `ChatGroupWithRelations`.

2. Update RootComponent, ComponentModule, component constructors, and call sites in one compileable change. Preserve child-stack tab behavior and existing deep-link validation.

3. Add the common serialization test under `composeApp/src/commonTest/kotlin/com/razumly/mvp/core/presentation/`. Its pre-change failure should be a compile or assertion failure because the old configurations serialize domain fields; its post-change assertions should show only the IDs and presentation arguments.

4. Run focused tests and compilation with the Android SDK and JetBrains Runtime configured:

       cd /private/tmp/mvp-app-critical-audit
       ANDROID_HOME=/Users/elesesy/Library/Android/sdk ANDROID_SDK_ROOT=/Users/elesesy/Library/Android/sdk JAVA_HOME=/Users/elesesy/Library/Java/JavaVirtualMachines/jbr-21.0.6/Contents/Home ./gradlew --no-daemon :composeApp:testDebugUnitTest --console=plain

   Expect `BUILD SUCCESSFUL` with no test failures. If the project exposes a narrower common-test task, run it first and record the exact task name and result here.

5. Build the debug application and launch it on the existing Android emulator. Confirm that opening Event Detail, Match Detail, Chat, and Teams reaches a rendered screen rather than a configuration-deserialization or missing-row crash. If a screen has no fixture data, record that limitation and retain the unit-test evidence rather than fabricating domain data.

6. Stage only the touched audit-branch mobile files, run `git diff --cached --check`, commit the mobile implementation, then update and separately commit `docs/code-audit/README.md` in the canonical `mvp-site` audit branch with the exact commit hash and test evidence.

## Validation and Acceptance

Acceptance requires all of the following:

- Serializing and restoring Event Detail, Match Detail, Chat, and Teams configurations preserves their IDs and presentation arguments without serializing a mutable Event, MatchWithRelations, UserData, or ChatGroupWithRelations.
- Event Detail and Match Detail subscribe to repository flows keyed by the navigation IDs, so a newer Room or server row replaces the loading fallback.
- Chat resolves the direct-message user or existing chat group by ID through `IChatGroupRepository`.
- Teams displays the latest event context through a collected `StateFlow<Event?>`, including sport and division data after hydration.
- The full Compose Android unit-test task reports `BUILD SUCCESSFUL` with zero failures.
- A debug emulator smoke test opens the changed destinations after a normal relaunch with no navigation restoration crash.

## Idempotence and Recovery

The code changes are source-only and can be rerun safely. If a build fails midway, use `git status --short` to identify only the audit-branch changes, repair the compiler errors, and rerun the same Gradle command. Do not reset or discard unrelated changes in either canonical repository. The test and emulator steps do not change production data.

## Artifacts and Notes

The current source map is:

    AppConfig -> RootComponent.createChild -> ComponentModule -> feature component -> repository flow

The key repository flows already available are:

    IEventRepository.getEventWithRelationsFlow(eventId)
    IMatchRepository.getMatchFlow(matchId)
    IChatGroupRepository.getChatGroupFlow(user, chatGroup)

The Teams feature requires the additional interface change because it currently receives a fixed `Event?` instead of a flow.

## Interfaces and Dependencies

At completion, `AppConfig` must expose ID-shaped configurations equivalent to:

    EventDetail(eventId: String, initialTab: EventDetailInitialTab)
    MatchDetail(matchId: String, eventId: String)
    Chat(messageUserId: String?, chatId: String?)
    Teams(freeAgentIds: List<String>, eventId: String?, selectedFreeAgentId: String?)

At completion, `INavigationHandler` must navigate with these stable identifiers rather than domain instances. `DefaultTeamManagementComponent.selectedEvent` must be a `StateFlow<Event?>` sourced from `IEventRepository` and `TeamManagementScreen` must collect it.

Revision note (2026-07-13): Created after source mapping because DATA-016 spans the serialized navigation model, RootComponent, dependency injection, four feature components, and test fakes. The plan records the ID-only boundary and the existing repository flows that make the migration safe.
