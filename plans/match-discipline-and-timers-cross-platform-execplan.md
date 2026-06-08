# Add Match Discipline Rules and Timers Across Web and Mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, hosts can configure sport-specific match rules that include disciplinary actions such as yellow cards, red cards, technical fouls, misconduct penalties, and ejections. Officials can record those incidents during a match, and time-based sports can run a match clock from the match operations screen. Soccer-style added time is available only for sports that support it and is enabled by default for soccer templates. Score changes remain independent from the Start Match button, so an official can correct or enter scores without starting the timer.

The user-visible proof is straightforward: create or edit a soccer event, see yellow and red card actions selected by default, see added time enabled, set the half length, open a match, start the timer, add an incident with the minute prefilled from the running timer, reset the timer, start it again, and confirm that scores can still be adjusted even if Start Match was never pressed. For a sport that does not support added time, the added-time control is absent and the running timer stops at the configured period length with an audible alert.

## Progress

- [x] (2026-06-07 00:00Z) Inspected `mvp-site` match rules, score modal, match routes, default sports, and match persistence.
- [x] (2026-06-07 00:00Z) Inspected `mvp-app` KMP match detail component, match detail screen, match repository, DTOs, and mobile match rules helpers.
- [x] (2026-06-07 00:00Z) Confirmed the feature can mostly build on existing JSON match-rule fields, `MatchSegments.startedAt/endedAt`, `Matches.actualStart`, and `MatchIncidents.minute/clock/clockSeconds/metadata`.
- [x] (2026-06-07 00:00Z) Created this design ExecPlan.
- [x] (2026-06-07 00:00Z) Extended the shared match-rule contract with timekeeping and incident action definitions.
- [x] (2026-06-07 00:00Z) Updated backend rule resolution, default sport templates, event save sanitization, and match operation validation.
- [x] (2026-06-07 00:00Z) Updated web event rule editor and web match operations timer/incident UI.
- [x] (2026-06-07 00:00Z) Updated mobile DTOs, rule resolution, event editor, match detail component, and match detail timer/incident UI.
- [x] (2026-06-07 00:00Z) Added/updated focused Jest coverage and ran web type checks plus Android Kotlin compilation.
- [x] (2026-06-07 23:20Z) Fixed the web Match Rules incident selector so typed custom incidents such as "Blue card" become event override incident definitions instead of being ignored.
- [x] (2026-06-07 23:20Z) Tightened sport defaults across web and mobile fallback rules, including beach soccer as three 12-minute periods without added time, football as four 15-minute quarters, tennis default penalties, pickleball technical warnings/fouls, and richer volleyball, basketball, hockey, and football discipline actions.
- [x] (2026-06-07 23:23Z) Re-ran focused web tests, web type checking, Android Kotlin compilation, and browser verification of the custom incident tag input.

## Surprises & Discoveries

- Observation: The web app already has the core persistence needed for this feature.
  Evidence: `prisma/schema.prisma` has `Sports.matchRulesTemplate`, `Events.matchRulesOverride`, `Matches.matchRulesSnapshot`, `Matches.actualStart`, `Matches.actualEnd`, `MatchSegments.startedAt`, `MatchSegments.endedAt`, and `MatchIncidents.minute`, `clock`, `clockSeconds`, and `metadata`.

- Observation: The current web rule editor only supports result-path booleans and a flat list of incident type strings.
  Evidence: `src/app/events/[id]/schedule/components/MatchRulesSection.tsx` renders overtime, shootout, supported incident strings, and automatic point incident capture. It has no timer, added-time, card, or per-period duration controls.

- Observation: Web score entry is already independent from Start Match.
  Evidence: `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` allows score changes through `requestScore`, `updateScore`, and `addIncident` whenever `canManage` and the active segment is not complete. `startMatch` only calls `saveActualTimes` to write `actualStart` and `IN_PROGRESS`.

- Observation: The mobile app also keeps score entry independent from Start Match, but requires official check-in for score and incident actions.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt` gates `updateScore` and `recordMatchIncident` on `isOfficial`, `officialCheckedIn`, and `matchFinished`, not on `actualStart`.

- Observation: Mobile has a separate fallback sport-rules table that can drift from the backend.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchRules.kt` defines defaults for volleyball, basketball, soccer, tennis, pickleball, football, hockey, baseball, and other even when the backend `Sport.matchRulesTemplate` is missing.

- Observation: Existing default sport seeding only fills missing top-level rule keys.
  Evidence: `src/server/defaultSports.ts` uses `mergeMissingMatchRulesTemplate`, which adds missing keys but does not merge new action definitions into an existing array such as `supportedIncidentTypes`.

- Observation: The mobile schema did not need a Room version change for this work.
  Evidence: The new mobile fields are nested in already serialized match-rule JSON models, and `.\gradlew :composeApp:compileDebugKotlinAndroid` completed without schema copy output beyond `copyRoomSchemas NO-SOURCE`.

- Observation: Mantine `MultiSelect` in the current web stack is not suitable for arbitrary new incident creation.
  Evidence: Manual QA showed typing `Blue card` and pressing Enter left text in the search field without creating a chip. Replacing it with Mantine `TagsInput` allowed the same typed value to become a selected pill and event override.

- Observation: Local browser validation can exhaust the default Node heap when the large schedule page and several API routes cold-compile together.
  Evidence: The dev server crashed with `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`; restarting with `NODE_OPTIONS=--max-old-space-size=8192` allowed the rendered verification to complete.

## Decision Log

- Decision: Keep score entry independent from timer start.
  Rationale: The user explicitly requires officials to adjust scores without ever selecting Start Match, and the current web and mobile implementations already support that separation.
  Date/Author: 2026-06-07 / Codex

- Decision: Add richer incident action definitions while keeping `MatchIncident.incidentType` as a string.
  Rationale: The existing API, UI, and standings code already use a string incident type. A richer rule definition keyed by that same string adds labels, card colors, and requirements without rewriting persistence or breaking existing incidents.
  Date/Author: 2026-06-07 / Codex

- Decision: Store timekeeping rules in match rules JSON and use existing segment `startedAt` / `endedAt` fields for timer state.
  Rationale: Timekeeping is a rule-level behavior, while the running clock belongs to the current match segment. Existing fields can persist first start, period starts, period ends, resets, and incident timestamps without adding new Prisma tables.
  Date/Author: 2026-06-07 / Codex

- Decision: Treat soccer-style added time as a sport capability and event setting.
  Rationale: Soccer needs added time by default, but sports that do not allow added time should not show the option. Capability plus enabled-state prevents stale event overrides from enabling unsupported behavior.
  Date/Author: 2026-06-07 / Codex

- Decision: Let the backend remain the source of truth for sport defaults and update mobile fallback defaults only as a compatibility layer.
  Rationale: `mvp-app` is instructed to align API contracts with `mvp-site`. Updating mobile fallback logic is still necessary for stale cached sports, but the backend seeded `Sport.matchRulesTemplate` should define normal behavior.
  Date/Author: 2026-06-07 / Codex

- Decision: Use `TagsInput` for the web incident picker and store custom typed values as normalized incident codes plus custom event override definitions.
  Rationale: Hosts need to add arbitrary incident types while still selecting/removing sport defaults. `TagsInput` supports typed Enter-created values; normalizing to codes such as `BLUE_CARD` preserves backend compatibility while keeping the user-facing label.
  Date/Author: 2026-06-07 / Codex

- Decision: Treat beach soccer separately from field/indoor soccer defaults.
  Rationale: Beach soccer uses timed periods and should not expose soccer-style added time by default. Field and indoor soccer keep added time enabled because that is the requested soccer-style behavior.
  Date/Author: 2026-06-07 / Codex

## Outcomes & Retrospective

Implemented the feature across `mvp-site` and `mvp-app`. The backend now resolves sport/event incident definitions and timekeeping rules, default sport templates include sport-specific discipline actions and timer defaults, and existing sport rows are backfilled by merging missing definitions instead of replacing customized templates. The web event form can configure enabled incident actions, period/half length, and added time where supported. The web match operations modal can start/reset the active segment timer, keeps score controls independent from timer start, auto-populates incident minute/clock values from the running timer, shows added time with a plus indicator, and plays a Web Audio alert when a non-added-time clock reaches regulation.

Mobile now mirrors the JSON rule contract and fallback sport defaults, exposes timed match-rule editing, persists timer starts/resets through match operations, pre-fills incident minutes from the active clock, renders incident labels/cards from definitions, and plays a platform alert when regulation time expires without added time. Android compilation succeeds; iOS native sound actuals were added but could not be compiled on this Windows host because the project disables iOS targets with GoogleSignIn cinterop on non-macOS.

Verification completed:

- `npx tsc --noEmit --pretty false` in `C:\Users\samue\Documents\Code\mvp-site` passed.
- `npm test -- --runTestsByPath "src/server/matches/__tests__/matchOperations.test.ts" "src/app/api/sports/__tests__/route.test.ts" "src/app/events/[id]/schedule/components/__tests__/MatchRulesSection.test.tsx" "src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx" --runInBand` passed with 53 tests.
- `.\gradlew :composeApp:compileDebugKotlinAndroid` in `C:\Users\samue\StudioProjects\mvp-app` passed. Gradle reported existing project warnings and disabled iOS targets on Windows.
- After follow-up QA, the web event Match Rules custom incident selector was corrected and verified in browser on `http://localhost:3000/events/qa_soccer_official_timer_20260607223627/schedule?mode=edit&tab=details`: typing `Blue card` and pressing Enter created a selected pill and a visible selected incident badge, and the page moved to `Changes (1)` with Save enabled. The unsaved QA change was discarded afterward and the page returned to `Changes (0)`.
- Follow-up verification also passed: `npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/MatchRulesSection.test.tsx" "src/app/api/sports/__tests__/route.test.ts" --runInBand`, `npx tsc --noEmit --pretty false`, and `.\gradlew :composeApp:compileDebugKotlinAndroid`.

## Context and Orientation

`mvp-site` lives at `C:\Users\samue\Documents\Code\mvp-site`. It is the backend and web source of truth. The relevant backend files are `prisma/schema.prisma`, `src/types/index.ts`, `src/server/defaultSports.ts`, `src/server/matches/matchOperations.ts`, `src/server/repositories/events.ts`, `src/server/scheduler/serialize.ts`, and the match routes under `src/app/api/events/[eventId]/matches/[matchId]`. The relevant web UI files are `src/app/events/[id]/schedule/components/MatchRulesSection.tsx`, `src/app/events/[id]/schedule/components/EventForm.tsx`, and `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`.

`mvp-app` lives at `C:\Users\samue\StudioProjects\mvp-app`. It is the Kotlin Multiplatform mobile app. The relevant files are `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchRules.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt`, `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt`.

In this plan, a "segment" means one scoring unit in a match. Soccer halves, basketball quarters, hockey periods, baseball innings, volleyball sets, and a one-total-score match are all segments. A "time-based sport" means a sport whose resolved match rules use a match clock, usually with scoring model `PERIODS` or `POINTS_ONLY`. A "disciplinary action" means a structured incident option such as `YELLOW_CARD`, `RED_CARD`, `TECHNICAL_FOUL`, or `EJECTION`.

## Plan of Work

Begin in `mvp-site` by extending the shared match-rule types in `src/types/index.ts`. Keep existing fields such as `supportedIncidentTypes` and `autoCreatePointIncidentType` for backward compatibility. Add optional JSON-compatible fields to `MatchRulesConfig` and required normalized fields to `ResolvedMatchRules` for timekeeping and incident definitions. The names should be stable and mirrored exactly in Kotlin:

    export type MatchTimerMode = 'NONE' | 'COUNT_UP';
    export type MatchIncidentDefinitionKind = 'SCORING' | 'DISCIPLINE' | 'NOTE' | 'ADMIN';

    export interface MatchIncidentTypeDefinition {
      code: string;
      label: string;
      kind: MatchIncidentDefinitionKind;
      cardColor?: 'yellow' | 'red' | 'blue' | null;
      requiresTeam?: boolean;
      requiresParticipant?: boolean;
      defaultEnabled?: boolean;
      linkedPointDelta?: number | null;
      metadata?: Record<string, unknown> | null;
    }

    export interface MatchTimekeepingConfig {
      timerMode?: MatchTimerMode;
      segmentDurationMinutes?: number | null;
      segmentDurationMinutesBySequence?: number[];
      canUseAddedTime?: boolean;
      addedTimeEnabled?: boolean;
      stopAtRegulationEnd?: boolean;
    }

`ResolvedMatchRules` should expose a normalized `timekeeping` object with `timerMode`, `segmentDurationMinutes`, `segmentDurationMinutesBySequence`, `canUseAddedTime`, `addedTimeEnabled`, and `stopAtRegulationEnd`. It should also expose `incidentTypeDefinitions`. Existing callers that only read `supportedIncidentTypes` must continue to work.

Update `src/server/defaultSports.ts` so sport templates include timer defaults and discipline defaults. Soccer templates should have `timekeeping.timerMode = 'COUNT_UP'`, `segmentDurationMinutes` set to a product default for that soccer variant, `canUseAddedTime = true`, `addedTimeEnabled = true`, and `stopAtRegulationEnd = false`. Basketball, football, hockey, and other timed sports should have `COUNT_UP`, a period length, `canUseAddedTime = false`, `addedTimeEnabled = false`, and `stopAtRegulationEnd = true` unless the product chooses otherwise. Set-based sports such as volleyball, tennis, and pickleball should use `timerMode = 'NONE'` by default unless a timed set duration is explicitly configured for scheduling. Use product-owned defaults and verify exact sport-rule defaults before launch if a sanctioned ruleset matters.

Discipline definitions should be seeded per sport. Soccer should include at least `YELLOW_CARD` and `RED_CARD`. Basketball should include actions such as `PERSONAL_FOUL`, `TECHNICAL_FOUL`, `FLAGRANT_FOUL`, and `EJECTION`. Volleyball should include card and delay-related actions. Hockey should include minor, major, misconduct, and game misconduct actions. Football should include personal foul, unsportsmanlike conduct, and ejection. Baseball should include warning and ejection. Tennis and pickleball should include warning, point penalty, game penalty, and default. These are configurable product defaults, not a hard-coded claim that every league uses the same rulebook.

Update `mergeMissingMatchRulesTemplate` in `src/server/defaultSports.ts` so existing sport rows receive newly added timekeeping and incident definition keys. For arrays of objects keyed by `code`, merge missing default definitions into existing lists instead of replacing user-customized definitions. For legacy `supportedIncidentTypes`, preserve existing values but make sure newly seeded action codes are available through `incidentTypeDefinitions`.

Update `src/server/matches/matchOperations.ts` and web-local rule resolution in `MatchRulesSection.tsx` so sport templates and event overrides are merged consistently. Sanitization should ignore stale event overrides that try to enable added time when the sport template says `canUseAddedTime` is false, just like the existing overtime and shootout guards. Event overrides should be able to change `timekeeping.segmentDurationMinutes`, `timekeeping.addedTimeEnabled` only when supported, `timekeeping.stopAtRegulationEnd`, and enabled incident definitions. Event overrides should not be able to change the scoring model or segment label in the normal editor because those remain sport-owned.

Update `src/server/repositories/events.ts` and `src/app/api/events/[eventId]/route.ts` so event payloads can save and load the new match-rule override fields. For time-based sports, synchronize the older scheduling field `Events.matchDurationMinutes` with the resolved period length and segment count. For example, if the sport has two halves and the event overrides the half length to 35 minutes, store `matchDurationMinutes = 70` so the scheduler still blocks the correct total match duration. Avoid showing duplicate form controls for the same value; the match rules section should own period duration for timed sports, and the old total match-duration input should be hidden or read-only for those sports.

Update the match operation route in `src/app/api/events/[eventId]/matches/[matchId]/route.ts`. Starting the timer should be a normal `lifecycle` plus `segmentOperations` PATCH. For the first segment, it should set `Matches.actualStart` if it is empty, set match status to `IN_PROGRESS`, and set the active segment `startedAt`. For later segments, it should set the active segment `startedAt` without changing the original `actualStart`. Resetting the timer should clear the active segment `startedAt` and `endedAt`; if resetting the first segment before any earlier segment is complete, it should also clear `Matches.actualStart` and `Matches.actualEnd`. Resetting must not clear scores or existing incidents.

Do not require Start Match for score updates. The direct score endpoint `src/app/api/events/[eventId]/matches/[matchId]/score/route.ts`, segment operations, and incident operations should continue to work when `actualStart` is null. When creating an incident and the client sends `clockSeconds`, `clock`, or `minute`, validate that the fields are well-formed but do not require the match to have started. If the match has not started, the incident time remains optional.

Update web `src/app/events/[id]/schedule/components/MatchRulesSection.tsx`. Add a timekeeping subsection when the resolved sport rules have `timekeeping.timerMode !== 'NONE'`. The subsection should show a numeric period-length input labeled with the resolved segment label, such as "Half length", "Quarter length", or "Period length". Show an added-time switch only when `canUseAddedTime` is true. For soccer templates, it should be on by default. Add a discipline subsection that lists the sport's incident definitions with card-colored badges for yellow and red card types. Hosts can choose which actions officials can record and reset to sport defaults.

Update web `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`. Add a clock panel near the status and actual times controls for time-based sports. It should derive the active timer from the selected segment's `startedAt`, `endedAt`, the resolved segment duration, and the current client time. If added time is enabled and elapsed time passes the regulation duration, continue counting and show a plus indicator. If added time is not enabled and elapsed reaches the limit, clamp the display at the limit, stop the running state, and play a loud beep. Use the browser Web Audio API so the beep does not require an audio file. Guard against browsers blocking sound by starting audio from the user's Start button gesture.

Add timer actions to the web modal. If the active segment has no `startedAt`, show Start Match for the first segment and Start `<Segment Label>` for later segments. If the active segment is running, show Reset Timer. Reset should call the match PATCH route and should not mutate scores. The existing actual time editor remains available for manual corrections. The Start Match button must not wrap or gate score controls.

Update web incident entry. When opening the incident dialog or clicking a scoring incident button while the active timer has a known elapsed time, prefill the minute field. Use `clockSeconds` for exact elapsed seconds, `clock` for the display string, and `minute` for the user-facing minute. The recommended minute calculation is `max(0, ceil(elapsedSeconds / 60))`; this matches common match notation better than floor rounding, while `clockSeconds` preserves exact time. Existing manual minute edits remain allowed.

Update match log rendering on web. Show yellow and red cards as card-styled badges when the incident definition has `cardColor`. Show other disciplinary actions with their configured label. Continue to display legacy `DISCIPLINE`, `NOTE`, `ADMIN`, `POINT`, `GOAL`, and `RUN` incidents.

Mirror the same contract in `mvp-app`. Update `MatchRulesConfigMVP`, `ResolvedMatchRulesMVP`, and related DTOs in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt` and `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt`. Add Kotlin serializable equivalents for `MatchTimekeepingConfig` and `MatchIncidentTypeDefinition`. Because these values are nested in existing JSON-converted fields, a Room database version bump should only be needed if generated Room schema changes. Run schema generation to confirm; if the schema changes, increment `MVP_DATABASE_VERSION` in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/db/MVPDatabaseService.kt`.

Update mobile rule resolution in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchRules.kt`. Prefer backend `Sport.matchRulesTemplate`, merge mobile fallback defaults only when the backend template is absent, and add the same timekeeping and incident definitions used by web. Keep mobile fallback defaults intentionally simple and document that backend seeded sports are authoritative.

Update mobile event editing in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`. Add period-length and added-time controls in the existing Match Rules section, and add discipline action selection. Keep controls consistent with web: added time is hidden for unsupported sports, and period length is the single editable source for timed segment duration.

Update mobile match running in `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt` and `MatchDetailScreen.kt`. Add state and helpers for active timer display, start/reset timer actions, added-time presentation, and incident minute prefilling. The component should persist timer starts and resets through `matchRepository.updateMatchOperations` using `MatchLifecycleOperationDto` and `MatchSegmentOperationDto`. The screen should show the timer near the existing match number and segment label, without removing current score controls.

For mobile audio, add an expect/actual platform helper if no shared audio helper already exists. Android can use `ToneGenerator` or a short media tone, and iOS can use system sound APIs. If a platform cannot play audio in a test environment, the UI state should still show that regulation time ended.

## Concrete Steps

From `C:\Users\samue\Documents\Code\mvp-site`, implement backend and web changes in this order:

    npm test -- --runTestsByPath "src/server/matches/__tests__/matchOperations.test.ts"
    npm test -- --runTestsByPath "src/app/api/sports/__tests__/route.test.ts"
    npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/MatchRulesSection.test.tsx"
    npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx"
    npm test -- --runTestsByPath "src/app/api/events/__tests__/scheduleRoutes.test.ts"
    npx tsc --noEmit

From `C:\Users\samue\StudioProjects\mvp-app`, implement mobile changes after the backend contract is in place:

    .\gradlew :composeApp:testDebugUnitTest
    .\gradlew :composeApp:compileDebugKotlinAndroid

If mobile entity schema changes, run the repo's Room schema generation command. If `roomGenerateSchema` is not available, use the existing schema copy task documented by the current project state:

    .\gradlew :composeApp:roomGenerateSchema
    .\gradlew :composeApp:copyRoomSchemas

For browser verification after web implementation, start the web app from `C:\Users\samue\Documents\Code\mvp-site`:

    npm run dev

Then open a league or tournament match in the schedule UI. Verify a soccer match displays added time and card actions, a basketball match displays period length without added time, Start Match starts the timer, Reset Timer clears it without clearing score, and scoring still works before any timer start.

## Validation and Acceptance

Backend acceptance is met when sport responses include the new timekeeping and incident definition fields, event save/load preserves event overrides, stale added-time overrides are ignored for unsupported sports, and match PATCH can start/reset an active segment timer without affecting scores or existing incidents.

Web acceptance is met when the Match Rules editor can configure period length, added time for supported sports, and disciplinary actions. The match operations modal must show a timer for timed sports, start/reset the active timer, show a plus indicator in added time, beep and stop at regulation time when added time is disabled, and prefill new incident minute/clock fields from the timer. Score buttons must work when `actualStart` is null.

Mobile acceptance is met when the same event rules and match operations are available in the KMP app on the shared screen. The mobile match detail screen must keep score controls usable before Start Match, persist timer start/reset operations through the same backend endpoint, prefill incident minutes from the active clock, and render yellow/red card incidents distinctly.

Regression acceptance is met when existing legacy incidents still render, existing score-only matches without timekeeping rules still work, set-based sports do not show added-time controls, and league/tournament scheduling still uses the correct total match duration after period length changes.

## Idempotence and Recovery

This plan avoids mandatory Prisma schema changes by reusing existing JSON and segment/incident fields. If implementation discovers that a new top-level field is unavoidable, add it through a normal Prisma migration and keep it nullable with backward-compatible defaults.

Default sport updates are idempotent if they merge missing rule keys and action definitions by `code`. Do not replace existing customized sport templates wholesale. If a default action is accidentally seeded with the wrong label or metadata, fix the default and rerun `GET /api/sports` locally so `ensureDefaultSports` can merge missing entries; manual cleanup may be needed only for already customized entries.

Timer reset must be non-destructive. It may clear timer start/end fields, but it must not clear scores, set results, incidents, officials, or match assignments. If a timer operation fails remotely, clients should roll back optimistic timer state while leaving score state untouched.

Mobile Room recovery depends on whether schema changes. If generated schema is unchanged, do not bump the database version. If schema changes, bump `MVP_DATABASE_VERSION` once, regenerate schema files, and review the diff before committing.

## Artifacts and Notes

Important existing files found during research:

- Web rule editor: `src/app/events/[id]/schedule/components/MatchRulesSection.tsx`.
- Web match operations modal: `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`.
- Backend rule resolution: `src/server/matches/matchOperations.ts`.
- Backend default sport templates: `src/server/defaultSports.ts`.
- Backend match PATCH route: `src/app/api/events/[eventId]/matches/[matchId]/route.ts`.
- Backend score endpoint: `src/app/api/events/[eventId]/matches/[matchId]/score/route.ts`.
- Mobile rule models: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt`.
- Mobile rule resolution: `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchRules.kt`.
- Mobile match business logic: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`.
- Mobile match UI: `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchDetailScreen.kt`.

Implemented and verified as recorded in `Outcomes & Retrospective`.

## Interfaces and Dependencies

At completion, `mvp-site/src/types/index.ts` and `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt` must define equivalent timekeeping and incident definition structures. The backend JSON field names must match the Kotlin serialization names.

At completion, `resolveMatchRules` in `mvp-site/src/server/matches/matchOperations.ts` and `resolveEventMatchRules` in `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventMatchRules.kt` must produce equivalent resolved values for the same event and sport input.

At completion, match timer persistence must use the existing match PATCH route with `lifecycle` and `segmentOperations`. A first segment timer start sends `lifecycle.actualStart`, `lifecycle.status = IN_PROGRESS`, and the active segment `startedAt`. Later segment starts send only the active segment `startedAt` unless the match has no `actualStart`. Reset sends null `startedAt` and `endedAt` for the active segment and may clear match actual times only for a first-segment reset before prior segment completion.

At completion, incident creation must continue to use `incidentOperations` or the dedicated `/incidents` endpoint. Timer-aware clients should send `minute`, `clock`, and `clockSeconds` when available. The server should preserve all three fields and serialize them in match responses and realtime messages.

Revision note (2026-06-07 / Codex): Created the initial cross-platform design after auditing current web and mobile match rules, scoring, incident, and timer-adjacent code.

Revision note (2026-06-07 / Codex): Updated the plan after follow-up manual QA found that typed custom incidents were not being created by the web selector. The fix switched the web selector to `TagsInput`, expanded sport defaults, mirrored mobile fallback defaults, and recorded the new validation evidence.
