# Repair the mobile event-creation, scheduling, staffing, and scoring regressions

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `/Users/elesesy/StudioProjects/mvp-site/PLANS.md`. It spans the web/backend repository at `/Users/elesesy/StudioProjects/mvp-site` and the Kotlin Multiplatform mobile repository at `/Users/elesesy/StudioProjects/mvp-app`.

## Purpose / Big Picture

The mobile runtime audit found a cluster of failures around creating events, viewing a registered team’s schedule, staffing matches, and confirming scores. After this work, a normal one-time or weekly event can be created without a field, while leagues and tournaments still require schedulable field/time-slot resources. Mobile setup must hide team-only inputs when team registration is disabled, initialize required league scoring values when the user enters the league path, reject impossible schedules before or during submission with a visible actionable message, and keep the user’s Schedule and score screen synchronized with canonical server state. A malformed legacy sibling match must no longer crash official staffing during event save.

The visible proof is an Android emulator pass that creates a fieldless regular event, exercises league validation, opens the registered team’s Schedule, and confirms a set without leaving stale controls on screen. Backend tests prove the event-type field rule and null-safe official staffing independently of the emulator.

## Progress

- [x] (2026-07-16) Reproduced and audited the seven reported runtime findings across the local backend, mobile source, API payloads, database fixture, and emulator.
- [x] (2026-07-16) Identified the field requirement regression: the backend changed from organization-only field enforcement to all event types while mobile only creates scheduling resources for leagues and tournaments.
- [x] (2026-07-16) Confirmed that a fresh `/api/profile/schedule` response already includes the canonical team-registered fixture; the remaining Schedule work is a freshness verification, not an unproven participant-array rewrite.
- [x] (2026-07-16) Changed backend event upsert validation so fields are required only for leagues and tournaments, with regression tests for regular, weekly, league, and tournament events.
- [x] (2026-07-16) Made the advanced mobile registration controls remove team-size input when `teamSignup = false`; the simple component already had the correct condition.
- [x] (2026-07-16) Seeded required league scoring defaults exactly when entering the league path, without re-populating a value the user deliberately clears.
- [x] (2026-07-16) Verified backend schedule-capacity validation and made mobile create/save errors appear only after the loading overlay clears.
- [x] (2026-07-16) Made official staffing tolerate committed matches with missing or invalid end times while retaining a conservative conflict window.
- [x] (2026-07-16) Kept successful segment confirmation visible until the repository flow publishes the confirmed canonical state.
- [x] (2026-07-16) Revalidated the canonical team Schedule on a cold authenticated load and after leaving/returning; both paths fetched and displayed the team event with seven matches, so no lifecycle or legacy-fallback change was needed.
- [x] (2026-07-16) Ran focused tests, TypeScript and Android compilation checks, installed the repaired Android build, captured emulator evidence, and created scoped commits in both repositories.

## Surprises & Discoveries

- Observation: The mobile create flow has consistently limited local field/time-slot preparation to `LEAGUE` and `TOURNAMENT`, but backend commit `f5e1d9ff` made the field requirement unconditional for non-template, non-affiliate events.
  Evidence: `DefaultCreateEventComponent.syncLocalFieldsForEvent` follows the schedulable competition paths, while `src/server/repositories/events.ts` currently throws `EVENT_FIELDS_REQUIRED_MESSAGE` whenever the resolved field list is empty.

- Observation: The Schedule API already resolves canonical `TeamRegistrations` and `TeamStaffAssignments`, expands those teams to event-team slots, and returned the audited team event in a fresh local request.
  Evidence: `src/server/profile/scheduleScope.ts` and a local authenticated `GET /api/profile/schedule` response both included the fixture event and matches.

- Observation: The advanced registration component always renders `Team Size Limit`; the simple component already guards it with `teamSignup`.
  Evidence: `EventDetailsRegistrationSection.kt` renders event type and team size side by side without a condition, while `simple/SimpleEventDetailsRegistrationSection.kt` conditionally composes the team-size input.

- Observation: League scoring defaults are applied on sport changes, but not reliably when a sport was selected before changing the event type to League. Reapplying defaults on every validation/recomposition would violate the product requirement that deleting a value leaves it null and visibly invalid.
  Evidence: `DefaultCreateEventComponent.updateEventField` only updates `_leagueScoringConfig` when `sportChanged`.

- Observation: `OfficialStaffingPlanner` dereferences both `match.start` and `match.end` while sorting and recording committed assignments. Persisted legacy matches can have a null end even though the scheduler type declares `Date`.
  Evidence: `seedCommittedMatches` and `recordAssignments` call `match.end.getTime()` directly.

- Observation: Segment confirmation receives a persisted match and assigns it only to `_optimisticMatch`; the subsequent local persistence can clear `_optimisticMatch`, exposing the older `matchWithTeams` snapshot again.
  Evidence: `applyConfirmedMatchState` writes `_optimisticMatch`, then `persistMatchLocally(... clearOptimisticOnSuccess = true)` clears that state for a non-final set.

- Observation: Seven older mobile create-component assertions describe a repeating/date-only slot model that conflicts with the current product rule and implementation: one automatic non-repeating slot spans the event’s exact start/end until custom scheduling is enabled.
  Evidence: The failing assertions expect date-only end values, manual-slot preservation while automatic mode is active, and cleared field IDs while automatic field assignment is active. Focused tests for the new league-default and visible-error fixes pass.

- Observation: Android compilation succeeds, but the iOS simulator test target is currently blocked before tests run because `PaymentProcessor.ios.kt` does not implement the expected `emitPaymentResult` member.
  Evidence: `:composeApp:compileKotlinIosSimulatorArm64` fails in the pre-existing payment processor actual/expect contract; this plan does not modify that payment surface.

- Observation: Returning to the Schedule destination issued two fresh `/api/profile/schedule` requests and then restored the canonical team event with seven matches.
  Evidence: `artifacts/mobile-runtime-audit/schedule-return-logcat.txt`, `schedule-return.xml`, and `canonical-team-schedule.png` show the refresh traffic and rendered result.

- Observation: The installed advanced create form removes `Team Size Limit` immediately when `Team Event` is unchecked and expands `Event Type` from half width to the full row.
  Evidence: `artifacts/mobile-runtime-audit/team-signup-off.xml` records `Event Type` at `[32,980][688,1112]`, an unchecked Team Event control, and no team-size node.

## Decision Log

- Decision: Require fields only for `LEAGUE` and `TOURNAMENT`.
  Rationale: These are the event types that invoke automatic scheduling and whose mobile setup creates fields and time slots. Regular, weekly, and tryout events may still carry fields when the organizer supplies them, but absence is not invalid.
  Date/Author: 2026-07-16 / Codex with user direction.

- Decision: Preserve canonical relational registration as the Schedule source of truth and do not add a fallback to legacy `event.teamIds` or user/team arrays.
  Rationale: The current Schedule API already returns the canonical fixture. Adding legacy fallback would hide stale data and conflict with the ongoing legacy-array migrations.
  Date/Author: 2026-07-16 / Codex.

- Decision: Initialize league defaults on the transition into League, then treat explicit clearing as user intent.
  Rationale: Defaults are starting values, not permanent coercions. Validation must warn about null required values without silently restoring them.
  Date/Author: 2026-07-16 / Codex.

- Decision: Normalize malformed committed staffing windows at the planner boundary.
  Rationale: One bad sibling match must not crash saving or scheduling an otherwise valid event. The fallback window will use the event’s configured match duration from a valid start, keeping conflict handling conservative.
  Date/Author: 2026-07-16 / Codex.

- Decision: Publish confirmed match state through the repository-backed observable state before clearing temporary optimistic state.
  Rationale: The UI must not fall back to the pre-confirm snapshot after a successful response.
  Date/Author: 2026-07-16 / Codex.

- Decision: Keep the current automatic timeslot product contract and do not change production behavior merely to satisfy stale assertions.
  Rationale: The current behavior matches the user-approved design: leagues and tournaments receive one internal event-range slot by default, and only custom scheduling turns that into organizer-managed slots.
  Date/Author: 2026-07-16 / Codex.

- Decision: Keep schedule-capacity calculation authoritative on the backend and surface its detailed error in mobile.
  Rationale: The scheduler already accounts for match count, field capacity, dates, and time ranges. Reimplementing a partial estimator in mobile would create a second source of truth and could reject valid schedules differently.
  Date/Author: 2026-07-16 / Codex.

## Outcomes & Retrospective

Six reproducible defects were repaired:

1. Regular and weekly events no longer require fields; leagues and tournaments still do.
2. Advanced mobile creation removes team-size input when team registration is disabled.
3. Entering League initializes sport-based standings values once while preserving an explicitly cleared value.
4. Backend schedule-capacity errors remain authoritative and now become visible after the mobile loading overlay closes.
5. Official staffing normalizes malformed committed match windows instead of crashing on a null end.
6. Confirmed score state remains on screen until the repository publishes a canonical snapshot that contains the confirmation.

The reported missing team Schedule entry was reclassified rather than patched. The current canonical API tests pass, a cold installed-app load displayed `Manual Check-in Smoke 115526` with seven matches, and leaving/returning made fresh Schedule requests before displaying it again. No legacy participant-array fallback was introduced.

Backend commit `a8581c2f` contains the field and staffing fixes plus this ExecPlan. Mobile commit `69f44a6a` contains the create-state, registration UI, visible-error, and score-refresh fixes.

Validation completed:

- 77 focused Jest tests passed across event upsert, staffing, and canonical Schedule.
- `npx tsc --noEmit` passed.
- The new focused mobile component tests passed before final consolidation; Android main and unit-test Kotlin sources compiled after the final changes.
- `:composeApp:installDebug` built and installed successfully on the Pixel 9 Pro API 35 emulator.
- UI-tree-derived emulator checks verified the canonical Schedule load/return and the Team Event off state.
- The iOS simulator test target remains blocked by the unrelated pre-existing `PaymentProcessor.ios.kt` missing `emitPaymentResult` actual member.
- Seven older timeslot assertions remain inconsistent with the approved automatic event-range slot contract and were not used to rewrite production behavior.

## Context and Orientation

Backend event creation and updates converge in `src/server/repositories/events.ts`, where `upsertEventFromPayload` canonicalizes fields and time slots before writing Prisma rows. Its focused regression suite is `src/server/repositories/__tests__/events.upsert.test.ts`.

Backend automatic official assignment lives in `src/server/scheduler/officialStaffing.ts`. `OfficialStaffingPlanner.seedCommittedMatches` loads already assigned matches into conflict-tracking state before new scheduling decisions. Its mode and planner coverage is in `src/server/scheduler/__tests__/officialStaffingModes.test.ts`.

Mobile create state is owned by `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/DefaultCreateEventComponent.kt`. `newEventState`, `leagueScoringConfig`, local fields, and time slots are StateFlows consumed by simple and advanced Compose screens. Shared event-edit sections are under `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/`; simple copies are under its `simple/` directory.

Mobile match scoring is owned by `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`. `matchWithTeams` is the repository-derived snapshot, while `_optimisticMatch` temporarily overlays local edits. A successful confirmation must update the durable observable state before the optimistic overlay is cleared.

The backend Schedule scope is `src/server/profile/scheduleScope.ts` and its route is `src/app/api/profile/schedule/route.ts`. Mobile loads it through the profile repository and `ProfileMyScheduleScreen`. “Canonical team registration” means active rows in `TeamRegistrations` or `TeamStaffAssignments`, not denormalized historical ID arrays.

Both repositories contain unrelated local work. Every commit from this plan must stage explicit files or hunks, run a cached-diff whitespace check, and leave unrelated modifications and artifacts untouched.

## Plan of Work

Milestone 1 changes the backend field contract. Introduce a small predicate near the existing event-type helpers or at the field-validation site. The empty-field error applies only when the normalized payload type is League or Tournament, excluding templates and affiliate external events as today. Replace the current test that rejects a fieldless regular event with acceptance coverage, and add explicit rejection cases for League and Tournament. Add a weekly-event acceptance case because it is a separate mobile path.

Milestone 2 repairs mobile creation state. In the advanced registration section, conditionally render the team-size input and allow the event-type input to use the freed width. Verify that the simple review reads the current draft rather than a captured pre-toggle event. In `DefaultCreateEventComponent`, detect a transition into League and seed scoring defaults if the config has not been initialized for that path. Do not seed on ordinary edits or after the user clears a field. Add component tests for sport-first-then-league selection, explicit clearing, and team-signup state.

Milestone 3 makes schedule failure actionable. Reuse existing slot validation for missing dates, fields, and divisions. Add a focused capacity preflight only if the current mobile rules do not already detect the audited one-field, one-hour, twelve-team league. The message must identify that more field/time capacity or fewer teams are required. Ensure asynchronous create/update failures are emitted after the loading overlay is dismissed so the popup is visible and stable.

Milestone 4 repairs backend staffing. Add a helper that returns a valid start/end window for committed matches. A valid end is preserved. A missing or non-increasing end is replaced by `start + event.matchDurationMinutes`, with a safe positive default if configuration is absent. Use the normalized window for sorting, commitments, overlap checks, and last-assignment bookkeeping. Add a regression test with a committed assignment whose runtime `end` is null.

Milestone 5 repairs score confirmation. Update the successful response path so repository/local observable state contains the confirmed segment before temporary optimistic state can be cleared. The screen must advance to the next segment for an unfinished match and display the completed state for a finished match. Add tests for both outcomes.

Milestone 6 revalidates Schedule. Cold-start the Android app, authenticate with the local test user, open Schedule, and confirm the canonical team event and matches appear. Navigate away and back after a server-side fixture change to determine whether lifecycle refresh is missing. If stale behavior reproduces, refresh when the Schedule destination becomes active without adding legacy relationship fallbacks.

Milestone 7 validates and commits. Run focused Jest and Kotlin tests first, then TypeScript and Android compilation checks. Launch the backend release build used by the local app if emulator verification needs a server restart. Use `adb` UI hierarchy bounds for all automated taps, capture screenshots at the acceptance states, inspect filtered logcat for crashes and HTTP failures, update this ExecPlan and the audit tracker, and create scoped commits in `mvp-site` and `mvp-app`.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`:

    git status --short
    npx jest src/server/repositories/__tests__/events.upsert.test.ts src/server/scheduler/__tests__/officialStaffingModes.test.ts --runInBand
    npx tsc --noEmit
    git diff --check

From `/Users/elesesy/StudioProjects/mvp-app`:

    git status --short
    ./gradlew :composeApp:compileDebugKotlinAndroid
    git diff --check

The common Kotlin tests normally run through the iOS simulator target in this checkout. If that target is blocked by an unrelated platform `actual`/`expect` compile error, record the exact blocker and retain the focused Android compilation plus the most recent passing focused test evidence.

For emulator verification, first confirm the active device:

    adb devices
    adb shell wm size
    adb shell wm density
    adb shell uiautomator dump /sdcard/window.xml
    adb pull /sdcard/window.xml artifacts/mobile-runtime-audit/window.xml

Use bounds from the pulled XML for taps. Capture each acceptance state:

    adb exec-out screencap -p > artifacts/mobile-runtime-audit/fieldless-event-created.png
    adb exec-out screencap -p > artifacts/mobile-runtime-audit/league-validation.png
    adb exec-out screencap -p > artifacts/mobile-runtime-audit/canonical-team-schedule.png
    adb exec-out screencap -p > artifacts/mobile-runtime-audit/confirmed-set-state.png
    adb logcat -d -v threadtime > artifacts/mobile-runtime-audit/logcat.txt

Before each commit, stage only the intended files or hunks:

    git diff --cached --check
    git status --short

## Validation and Acceptance

The work is accepted when all of the following are true:

1. Posting a new `EVENT`, `WEEKLY_EVENT`, or `TRYOUT` with no fields succeeds, while posting a new `LEAGUE` or `TOURNAMENT` with no fields returns the existing actionable field error.
2. A regular event can still persist optional supplied fields; the change does not strip them.
3. Turning off team registration removes team-size controls and team-only review wording in both simple and advanced creation.
4. Selecting a sport and then changing the event type to League produces valid required scoring starting values. Deleting a required value leaves it null and shows validation rather than repopulating it.
5. An impossible league schedule is blocked with a visible message explaining whether to add/extend time slots or fields or reduce team count. A backend save error remains visible after the loading indicator disappears.
6. A committed sibling match with a null end does not throw during staffing or event save, and its inferred window still prevents double-booking an official.
7. After confirming a non-final set, the completed segment remains completed and the UI advances to the next set. After confirming the winning set, the match shows its completed state without reopening the confirm control.
8. A cold Schedule load displays an event reached through active canonical team registration. No new code reads legacy participant/team arrays as a fallback.
9. Focused tests, TypeScript checking, Android compilation, emulator screenshots, and filtered logcat contain no new failures attributable to this work.

## Idempotence and Recovery

All code and test edits are repeatable. The backend predicate changes validation only and does not migrate data. Staffing normalization does not write missing legacy end values back to the database; it makes the planner safe at runtime.

Emulator-created events should use a recognizable `Runtime Audit` prefix and may be deleted through the ordinary API or fixture cleanup after screenshots are captured. Do not clear or reseed the entire local database.

If a test or build fails because of unrelated dirty work, record the exact failing path and rerun the narrowest affected suite. Do not reset, checkout, or overwrite unrelated changes. If an overlapping file must be committed, stage only the remediation hunk and verify the cached diff before committing.

## Artifacts and Notes

Store emulator-only screenshots, UI hierarchy dumps, and filtered logcat under `mvp-app/artifacts/mobile-runtime-audit/`. These files are verification evidence and are not committed unless explicitly requested.

The existing runtime audit tracker is `/Users/elesesy/StudioProjects/mvp-site/docs/code-audit/README.md`. Update it after the final classification of the Schedule finding and after all fixes have verification evidence.

## Interfaces and Dependencies

No new external dependency is required.

The backend event-type predicate should accept the normalized event-type string and return true only for `LEAGUE` and `TOURNAMENT`.

The staffing window helper should accept a `Match` and the enclosing `Tournament | League`, and return concrete `Date` values with `end > start`.

The mobile league-default transition must continue using `LeagueScoringConfigDTO` and the existing sport rule resolver. It must not add a second source of sport defaults.

The score confirmation fix must preserve the existing repository operation and offline persistence contracts. It may add a focused repository refresh or local state publication method, but must not bypass the operation queue or write legacy score arrays as a new source of truth.

Revision note (2026-07-16): Initial plan created from the completed backend/mobile runtime audit and the user’s decision that regular events must not require fields.

Revision note (2026-07-16): Recorded the completed backend and mobile repairs, the automatic-timeslot test-contract drift, the authoritative backend capacity decision, and the unrelated iOS test-target compile blocker.

Revision note (2026-07-16): Closed the plan with scoped commit IDs, canonical Schedule emulator evidence, final build/test results, and the six-fixed/one-reclassified disposition.
