# Prevent officiating incomplete matches and finish event-flow verification

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

An official must not be able to check in, start scoring, confirm a set or half, or finalize a match until both participants have resolved to real event teams. Hosts must still be able to edit an incomplete schedule so they can assign those teams. The surrounding simple event flows must also save and reload reliably: weekly edits must not send database-only dollar-prefixed properties, a newly created event must not make a premature team-check-in request, and the tournament end-date choice must display and serialize consistently.

The result is observable in two ways. Focused Jest tests prove that the API rejects incomplete-match officiating operations and that the UI presents a clear read-only warning. A browser walkthrough then creates weekly, league, and tournament events, joins as a second user, checks in as an official only after teams are assigned, confirms the configured periods or sets, and finishes the match successfully.

## Progress

- [x] (2026-07-19 13:43 PDT) Reproduced and catalogued the event-route and incomplete-match officiating failures from the prior browser walkthrough.
- [x] (2026-07-19 13:43 PDT) Located the schedule click path, score modal lifecycle operations, match PATCH route, and focused test suites.
- [x] (2026-07-19 14:12 PDT) Added UI, schedule-page, match PATCH, and dedicated score-route regressions for incomplete participant assignments.
- [x] (2026-07-19 14:12 PDT) Implemented a shared participant-readiness rule at the score modal and API mutation boundaries while preserving host schedule edits.
- [x] (2026-07-19 14:12 PDT) Added regressions and fixes for weekly update serialization, premature team-check-in loading, and tournament end-date consistency.
- [x] (2026-07-19 14:24 PDT) Ran the focused Jest suites, TypeScript typecheck, and the first production build; 304 focused tests passed and the release build completed with only the existing optional `undici` warning.
- [x] (2026-07-19 14:39 PDT) Reran the final seven focused suites in an isolated release checkout; all 312 tests passed, including the scheduler fallback regression.
- [x] (2026-07-19 14:39 PDT) Verified the browser lifecycle as Riley Referee: an unresolved match was read-only, both halves of an assigned match confirmed, finalization persisted, and a reload retained the completed official result and winner.
- [x] (2026-07-19 14:41 PDT) Reviewed and staged only the 23 files owned by this plan; unrelated shared-worktree edits remain unstaged.

## Surprises & Discoveries

- Observation: The score modal already avoids emitting score mutations when an event-team identifier is absent, but official check-in and match-start mutations have no equivalent participant guard.
  Evidence: `src/components/events/ScoreUpdateModal.tsx` derives `team1Id` and `team2Id`; score changes use those identifiers, while `checkIn` and `startMatch` can call the mutation callback independently.

- Observation: Existing component tests prove that confirming a deciding segment requests finalization, but the previous browser run stopped after match start and one score update.
  Evidence: `src/components/events/__tests__/ScoreUpdateModal.test.tsx` covers the deciding-segment payload, while the prior manual run recorded only check-in, start, and a 1-0 score.

- Observation: Several pre-existing API success fixtures started, timed, or checked in a match without participant teams, even though a real saved match hydrates both participant objects.
  Evidence: The first guarded route run produced four failures in older success tests; adding `team1` and `team2` made all 64 route tests pass without changing their intended assertions.

- Observation: The create-mode event state is populated with the newly scheduled event before the URL loses `create=1`, which lets dependent effects race against the route transition.
  Evidence: The create regression returns an event with `teamCheckInMode: EVENT` and verifies no `/team-check-ins` request occurs while create mode remains active.

- Observation: The assigned official could confirm Half 1 and start Half 2, but confirming Half 2 rolled the result back because tournament finalization also attempted to auto-reschedule the future bracket and found no field eligible for the division.
  Evidence: The production server logged `Unable to schedule event because no fields are available for divisions: qa-indoor-soccer-tournament__division__c_skill_rec_age_18plus.` after Riley Referee clicked `Confirm Half 2`.

- Observation: An unrelated, actively edited `MatchEditModal.tsx` refactor began failing typecheck after the first successful production build.
  Evidence: The file's modification time and size changed during verification, and the next typecheck reported missing transitional names such as `operationsMatch` and `policyMatchMinutes`. This plan does not own or overwrite that refactor.

## Decision Log

- Decision: Enforce participant readiness in both the browser UI and the server route.
  Rationale: The UI provides immediate, understandable feedback, while the API is the authorization boundary and must remain safe against stale or non-browser clients.
  Date/Author: 2026-07-19 / Codex

- Decision: Determine readiness from hydrated participant objects on the server, not only raw participant identifiers.
  Rationale: Generated brackets can contain placeholder identifiers whose participants are still unresolved. A real team object is the reliable proof that an official has two competitors to score.
  Date/Author: 2026-07-19 / Codex

- Decision: Preserve host schedule editing and participant assignment for incomplete matches.
  Rationale: Incomplete matches are a legitimate scheduling state. Only officiating lifecycle actions should be blocked.
  Date/Author: 2026-07-19 / Codex

- Decision: Keep the request parser's rejection of dollar-prefixed properties and sanitize outgoing event updates instead.
  Rationale: Rejecting database-driver metadata at the API boundary is a useful safety property. Browser state should be converted into the public event payload before transmission.
  Date/Author: 2026-07-19 / Codex

- Decision: Treat the open-ended schedule checkbox as a user choice after its event-type default is applied, rather than a continuously enforced invariant.
  Rationale: The previous effect immediately changed `false` back to `true`, so an explicit uncheck could never survive long enough to validate or save a fixed end date.
  Date/Author: 2026-07-19 / Codex

- Decision: Preserve a confirmed result and bracket advancement when only the optional automatic rebuild cannot find an eligible field, just as the scheduler already does when it cannot staff a future team-official slot.
  Rationale: A valid on-court result must not be rolled back by an independent future-schedule configuration problem. The existing schedule remains intact for host correction while the official result persists.
  Date/Author: 2026-07-19 / Codex

## Outcomes & Retrospective

The incomplete-participant gap is closed at both UI and API boundaries. A `TBD vs TBD` match now shows a `Teams required` warning and exposes no check-in, start, score, confirmation, or finalization controls; representative direct lifecycle writes return HTTP 409. Hosts can still assign participants and edit the incomplete schedule.

The assigned-official browser walkthrough also found and fixed a separate finalization rollback. Riley Referee confirmed Half 1, started Half 2, and confirmed Half 2. The match became `COMPLETE`, retained an `OFFICIAL` result with the winning event team and two completed segments after reload, and persisted those values in the database. If the optional future-bracket rebuild lacks an eligible field, the valid result and bracket advancement now remain committed while the existing future schedule is left for host correction.

The final focused run passed 312 tests across seven suites. The scoped production build succeeded in an isolated release checkout with only the existing optional `undici` warning. The isolated checkout was necessary because an unrelated in-progress match-edit-modal refactor began failing typecheck in the shared canonical tree after the first successful build.

## Context and Orientation

The repository is a Next.js application using TypeScript, Mantine, Prisma, and Postgres. An event's schedule page is implemented in `src/app/events/[id]/schedule/page.tsx`. It decides what happens when a user clicks a match, including whether an assigned official is invited to check in, and it opens `src/components/events/ScoreUpdateModal.tsx` for scoring controls.

A resolved participant is a real event team loaded into the match's `team1` or `team2` property. Generated schedules may temporarily contain a slot or placeholder identifier without a resolved team object. Those matches should remain visible and editable by a host but cannot yet be officiated.

Match mutations are handled by `src/app/api/events/[eventId]/matches/[matchId]/route.ts`. This route authorizes hosts, assigned users, and assigned teams, applies official check-in, starts and ends matches, changes scores, applies segment operations, and finalizes a winner. The separate score endpoint is `src/app/api/events/[eventId]/matches/[matchId]/score/route.ts`. The primary API regression suite is `src/app/api/events/__tests__/scheduleRoutes.test.ts`.

The score modal tests are in `src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx`, and schedule page interaction tests are in `src/app/events/[id]/schedule/__tests__/page.test.tsx`. Event payload serialization is implemented by `src/lib/eventService.ts` with tests in `src/lib/__tests__/eventService.test.ts`. Simple event timing controls and review summaries live below `src/app/events/[id]/schedule/components/eventForm/simpleSetup/` and share event form state with the advanced event editor.

## Plan of Work

First, add regression tests. The component test will construct an unresolved match, assert a clear warning, and assert that check-in, start, score, segment-confirmation, and finish actions are unavailable. The route test will submit representative official mutations against a match with a missing resolved participant and expect HTTP 409 with a stable message. A paired resolved-team test will prove that the guard does not block the supported lifecycle.

Next, change `ScoreUpdateModal.tsx` to calculate participant readiness once and use it for the interactive controls. The modal will remain useful as a read-only match summary and explain that both teams must be assigned. Change the schedule click path so it does not offer official check-in for an unresolved match. At the server boundary, add a small predicate that distinguishes officiating lifecycle writes from host-only schedule edits and reject those lifecycle writes before applying any mutation when either hydrated participant is absent. Add the same explicit check to the score route for a consistent response.

Then, isolate the three adjacent event-flow defects with focused tests. Update event serialization so no nested property beginning with `$` reaches the API. Gate the team-check-in query until the requested event has been loaded authoritatively after creation. Align the no-fixed-end toggle, disabled end-date field, review text, and outgoing value so the tournament flow cannot display contradictory states.

Finally, run focused tests and broad static verification. Start the production-mode local server, use a fresh browser session for the joining official, and exercise all three event types. For the scored match, assign two real teams, check in within the permitted window, start it, record a legal set or period result, confirm that unit, complete the deciding unit if required, and verify the match is finalized with a winner. Also inspect the incomplete state and confirm that officiating controls are absent and the server rejects a direct mutation.

## Concrete Steps

Run all commands from `/Users/elesesy/StudioProjects/mvp-site`.

Inspect the focused files and current diffs before editing:

    git status --short
    git diff -- src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx src/app/events/[id]/schedule/page.tsx src/app/api/events/[eventId]/matches/[matchId]/route.ts

Run the focused tests after adding each regression and after implementation:

    npx jest src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx --runInBand
    npx jest src/app/events/[id]/schedule/__tests__/page.test.tsx --runInBand
    npx jest src/app/api/events/__tests__/scheduleRoutes.test.ts --runInBand
    npx jest src/lib/__tests__/eventService.test.ts --runInBand

Run static and production-build verification:

    npx tsc --noEmit
    npm run build

The expected transcript is a zero exit status for every command, all focused tests passing, and a successful Next.js production build.

## Validation and Acceptance

An unresolved match must remain visible to a host for schedule editing. When an official opens it, the UI must say that both teams need to be assigned and must not offer official check-in, start, score, confirm, or finish actions. A direct API request for any of those operations must return HTTP 409 and must not change the persisted match.

After two real event teams are assigned, an eligible official must be able to check in during the allowed window and start the match. For a set-based sport, legal scores must enable confirmation, confirmation must persist the set result, and completing the deciding set must finalize the match with an end time, final status, and winner. For a timed structure, the corresponding period confirmation and finish operation must persist. Refreshing the browser must retain the completed state.

Weekly, league, and tournament event creation must finish without a team-check-in 404. Editing and publishing the weekly event must not produce `Dollar-prefixed fields are not supported.` The tournament no-fixed-end choice must show the same meaning in its control, its end-date editability, its review summary, and its saved event.

## Idempotence and Recovery

Tests and builds are safe to rerun. Browser QA data should use distinctive local-only names and can be deleted through existing event controls if cleanup is necessary. No database migration or destructive command is planned. Because the checkout contains unrelated work, stage files explicitly and never use a blanket reset, checkout, or add command. If a focused file becomes modified by another task, stop and reconcile its diff rather than overwriting it.

## Artifacts and Notes

- Automated: 7 suites and 312 tests passed in 41.532 seconds.
- Release build: `next build --webpack` completed in `/tmp/mvp-site-officiating-build`; the server is running there with `npm run start` on `http://localhost:3000`.
- Incomplete match: the browser showed `Teams required` and `Both teams must be assigned before officials can check in or operate this match.` without lifecycle controls; route regressions expect HTTP 409.
- Completed match: the browser and database both showed `COMPLETE`, `OFFICIAL`, two completed segments, and the persisted winning event-team identifier after reload.

## Interfaces and Dependencies

No new external package is required. Use the existing `EventTeam`, `Match`, and segment operation types already consumed by `ScoreUpdateModal.tsx` and the match PATCH route. The server-side readiness helper should accept the hydrated target match and return a boolean. The lifecycle-write predicate should accept the parsed request body and return true only when the request attempts official check-in, starting or ending, scoring, segment or incident operations, finalization, or another officiating action; participant assignment and host metadata edits remain allowed.

The client must use the existing event and match service callbacks. The API must continue to use existing session and event permission checks before applying match state. Tests must use the repository's current Jest and Testing Library setup without adding a new harness.

Revision note (2026-07-19 13:43 PDT): Created this plan after the all-routes browser walkthrough exposed that unresolved generated matches could enter the officiating lifecycle and that full set confirmation/finalization had not yet been exercised.

Revision note (2026-07-19 14:12 PDT): Recorded completed guardrails and adjacent event-flow fixes, plus the test-fixture and create-mode race discoveries from the first regression run.

Revision note (2026-07-19 14:33 PDT): Recorded the production browser discovery that future-bracket field eligibility could roll back an official's final confirmation, and added the scheduler fallback decision and regression status.

Revision note (2026-07-19 14:39 PDT): Recorded the successful end-to-end official finalization, reload/database persistence evidence, final 312-test run, and isolated release-build result.

Revision note (2026-07-19 14:41 PDT): Marked the scoped review complete after `git diff --cached --check` passed for the 23-file change set.
