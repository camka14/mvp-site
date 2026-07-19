# Refactor the host match editor into one coherent draft form

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Event hosts currently see the normal official scoring interface embedded below administrative match fields. That creates duplicate status controls and forces hosts to use score increment buttons even when they need to correct an existing result. After this change, the host can edit assignment, schedule, rules, match state, segment scores, and segment completion in one local draft, then save the entire draft once. The following segment becomes available as soon as the preceding segment is confirmed in the open modal. A read-only match preview beneath the fields shows what the saved state will look like without exposing official-operation controls.

The editor must use the match's resolved sports rules instead of assuming volleyball. A match may use sets, halves, quarters, periods, innings, or a single total. The singular segment label controls all visible labels and pluralization, while a per-match count override controls how many segment rows are present. Timed segment formats also expose `Segment length (min)` as a numeric stepper.

## Progress

- [x] (2026-07-19) Audited the existing modal, focused tests, bulk match-save payload, segment model, and dirty worktree.
- [x] (2026-07-19) Recorded the implementation and validation plan without modifying adjacent in-progress scoring/API work.
- [x] (2026-07-19) Refactored `MatchEditModal.tsx` into admin fields, direct segment score/state controls, and a read-only preview.
- [x] (2026-07-19) Added officiating-team and assignment check-in editing.
- [x] (2026-07-19) Added per-match segment label, count, timed length, and set target controls with sports-aware labels.
- [x] (2026-07-19) Replaced embedded official scoring regression tests with host-draft behavior tests.
- [x] (2026-07-19) Ran focused Jest suites, the lock/reschedule integration regression, ESLint, and TypeScript validation.
- [x] (2026-07-19) Exercised the rendered modal at 1200x762 desktop and 390x844 mobile sizes, including same-draft segment unlocking.

## Surprises & Discoveries

- Observation: The checkout already contains unrelated changes in match API routes, `ScoreUpdateModal.tsx`, `page.tsx`, and many other files, but `MatchEditModal.tsx` and its focused test file were clean at the start.
  Evidence: `git status --short` on 2026-07-19 showed those adjacent modifications and no entry for the two focused modal files.

- Observation: Match saves are staged locally by `useEventMatchOperations.ts` and later serialized by `page.tsx` into the bulk `/api/events/[eventId]/matches` PATCH request. The bulk payload already accepts `segments`, legacy score arrays, `officialCheckedIn`, `officialIds`, `division`, and `matchRulesSnapshot`.
  Evidence: `toBulkMatchUpdatePayload` in `src/app/events/[id]/schedule/page.tsx` includes those fields, and the route schema accepts them.

- Observation: The current editor already mutates segment confirmation locally, so the save-and-reopen bug is a presentation/state-composition problem rather than a backend requirement. The next checkbox is enabled from the local `statusSegmentsValue` array.
  Evidence: `handleSegmentConfirmedChange` updates the local array and the existing focused test observes the next half becoming enabled before `onSave` fires.

- Observation: The old disabled expression also required the *next* set to have a valid final score before enabling its checkbox. That contradicted the intended progression even though the click handler already performs final-score validation.
  Evidence: The first focused test run left `Set 2 confirmed` disabled after confirming Set 1. Removing only the premature `validFinalScore` enablement condition made the same-draft test pass while retaining validation on the actual check action.

- Observation: Three equal admin columns made official names unreadable inside the modal's fixed 1120px width at a normal 1200px viewport.
  Evidence: The first desktop render clipped `Harbor Strikers` and `Official: Jordan Lee`. The final two-column render shows setup/schedule on the left and readable official/rules panels stacked on the right.

- Observation: A temporary local visual-QA route left one generated `.next/dev/types` stub after the route was removed.
  Evidence: The first final typecheck referenced only the deleted preview route. Deleting that generated cache stub made `npx tsc --noEmit` pass.

## Decision Log

- Decision: Remove the embedded `ScoreUpdateModal` from the host editor and keep the standalone official-scoring modal unchanged.
  Rationale: Hosts need an atomic administrative draft, while officials still need live increment, timer, incident, roster, and match-log workflows. Combining them produced duplicate controls and asynchronous writes inside an otherwise unsaved form.
  Date/Author: 2026-07-19 / Codex

- Decision: Keep sport naming data-driven through `ResolvedMatchRules.segmentLabel`, with explicit handling for irregular `Half` to `halves` pluralization and safe generic pluralization for custom labels.
  Rationale: The rules snapshot already carries the correct sport term, so the modal should not infer labels from a hard-coded sport list.
  Date/Author: 2026-07-19 / Codex

- Decision: Store per-match segment count, label, score targets, and timed segment length in `matchRulesSnapshot` and mirror it to `resolvedMatchRules` in the staged match.
  Rationale: A match-level snapshot is the existing override boundary and is already persisted by the bulk match endpoint.
  Date/Author: 2026-07-19 / Codex

- Decision: Treat score edits as draft corrections. Editing a completed segment clears completion for that segment and every later segment, requiring the host to reconfirm the corrected sequence before saving.
  Rationale: This avoids preserving winners and downstream completion states that may no longer agree with corrected scores.
  Date/Author: 2026-07-19 / Codex

- Decision: Preserve unrelated dirty-tree work and avoid changing the standalone scoring modal or match API routes.
  Rationale: Those files contain user work that is not necessary to implement the host form.
  Date/Author: 2026-07-19 / Codex

- Decision: Use a two-column desktop admin layout and a single-column mobile layout.
  Rationale: It keeps schedule fields readable while giving officiating assignments and rule overrides enough horizontal room for names, check-ins, and numeric controls.
  Date/Author: 2026-07-19 / Codex

- Decision: Keep `Lock match` as a checkbox rather than converting it to a switch during the visual cleanup.
  Rationale: The existing schedule integration and accessibility contract query it as a checkbox, and its persisted lock/reschedule behavior must remain unchanged.
  Date/Author: 2026-07-19 / Codex

## Outcomes & Retrospective

The host editor is now one atomic draft form. Hosts can edit teams, division, field, scheduled and actual times, officiating team, individual assignments, check-ins, bracket links, per-match segment rules, result state, scores, and completion. The embedded official-operation modal has been removed, while the standalone official scoring modal is unchanged.

Set, half, quarter, period, inning, game, round, and custom singular labels flow through count labels, score rows, confirmation labels, plural section titles, and the preview. A per-match count immediately resizes the segment rows. Timed rules show `Segment length (min)` as a numeric stepper and save it to the match rules snapshot. Direct score edits clear stale completion for that segment and all later segments.

Final automated evidence:

    npx jest --runInBand --runTestsByPath '<MatchEditModal.test.tsx>' '<ScoreUpdateModal.test.tsx>'
    PASS: 2 suites, 54 tests

    npx jest --runInBand --runTestsByPath '<page.test.tsx>' --testNamePattern='persists match lock edits before triggering reschedule'
    PASS: 1 focused integration test

    npx tsc --noEmit
    PASS

    node_modules/.bin/eslint '<MatchEditModal.tsx>' '<MatchEditModal.test.tsx>' '<EventMatchModals.tsx>'
    PASS with one pre-existing exhaustive-deps warning at the modal initialization effect and zero errors

Rendered evidence used a temporary local-only fixture that was removed immediately afterward. At 1200x762, confirming Set 1 enabled Set 2 without saving; editing Set 2 updated the preview; saving returned three segments. A timed quarter match changed from four to five quarters, changed its numeric duration from 10 to 12 minutes, rendered Quarter 5 immediately, and saved five segments. The final 390x844 pass kept admin sections readable and actions sticky. Browser console errors and warnings were empty, and no framework error overlay was present.

## Context and Orientation

`src/app/events/[id]/schedule/components/MatchEditModal.tsx` is the host editor. It owns local values for teams, field, dates, bracket links, match rules, segment state, and official assignments. Its `onSave` callback returns one updated `Match` object; it does not persist immediately.

`src/app/events/[id]/schedule/schedulePage/useEventMatchOperations.ts` receives that updated object and puts it into the page's unsaved match list. The page-level Save Changes action later serializes the whole list in `src/app/events/[id]/schedule/page.tsx` and sends it to `src/app/api/events/[eventId]/matches/route.ts`.

A segment is one sport-specific scoring unit represented by `MatchSegment` in `src/types/index.ts`. Its `sequence` is one-based, `scores` maps team identifiers to numeric values, and `status` records whether the unit has not started, is in progress, or is complete. `ResolvedMatchRules` supplies the scoring model, segment count, singular segment label, score targets, and timekeeping configuration. Examples are `Set`, `Half`, `Quarter`, and `Inning`.

The standalone `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` remains the live official workflow. It contains increment buttons, incident logging, timer actions, and other operational controls. It will no longer be rendered inside the host editor.

Focused regression coverage belongs in `src/app/events/[id]/schedule/components/__tests__/MatchEditModal.test.tsx`. Tests use React Testing Library through `renderWithMantine`.

## Plan of Work

First, add small pure helpers in `MatchEditModal.tsx` for label normalization and pluralization, resizing segment arrays, formatting the preview, and deriving totals. Keep those helpers outside the React component so they are stable and easy to test through visible behavior.

Next, expand the modal's local rule state to include the singular segment label, segment count, and per-segment duration. Initialize them from the match snapshot or event rules. When the host changes the count, resize `statusSegmentsValue` immediately: preserve rows that remain, append clean rows when the count grows, and drop trailing rows when it shrinks. Mark the policy dirty so Save Changes writes a per-match snapshot.

Replace the embedded official scoring section with direct score number inputs. Each row contains the sport-aware segment name, one score field per team, and its confirmation checkbox. Confirmation remains ordered. Checking one row updates the local draft immediately, allowing the next row to become enabled without persistence. Editing a confirmed score clears that row and later confirmations.

Move the team-official selector from Match Setup into Official Assignments and label it `Officiating team`. Pair it with the legacy team-official check-in flag. Pair configured individual assignments with their own `checkedIn` flags. Keep the existing uniqueness validation.

Recompose the visible layout around `Admin edit`, using responsive field panels for setup and schedule, officials, rules and bracket, and match state. Keep exceptional result inputs conditional. Add a read-only `Match details preview` after the fields. The preview uses the current draft, not the persisted match, and contains no buttons or editable controls.

Update focused tests to remove expectations for embedded incident controls. Add coverage for direct score persistence, same-draft confirmation unlocking, sports-aware labels for halves, quarters, innings, and sets, per-match segment resizing, segment-duration numeric input, and officiating-team/check-in persistence.

Finally, run focused Jest, TypeScript, and rendered browser validation. The rendered flow is: open an event schedule in Manage/Edit mode, open an existing match, edit a score and confirm the current segment, observe the next segment enable without closing, inspect the read-only preview, and save the draft.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Edit only these implementation surfaces unless a discovered compile error requires a narrowly related adjustment:

    docs/host-match-edit-modal-execplan.md
    src/app/events/[id]/schedule/components/MatchEditModal.tsx
    src/app/events/[id]/schedule/components/__tests__/MatchEditModal.test.tsx
    src/app/events/[id]/schedule/schedulePage/EventMatchModals.tsx

Run the focused test suite:

    npx jest --runInBand --runTestsByPath '/Users/elesesy/StudioProjects/mvp-site/src/app/events/[id]/schedule/components/__tests__/MatchEditModal.test.tsx'

Expect the suite to pass with direct-field and local-draft assertions. Then run:

    npx tsc --noEmit

If the repository-wide typecheck reports pre-existing dirty-tree failures, distinguish them from errors in the files above and record the exact evidence here.

For rendered QA, use the available Browser integration after reading its skill instructions. Start or reuse the local application, navigate to the schedule Manage/Edit flow, open the modal, and capture desktop plus mobile-width evidence. Confirm there is no framework overlay and no relevant console error.

## Validation and Acceptance

The feature is accepted when all of the following behavior is observable.

An existing set-based match shows direct numeric score inputs and a confirmation checkbox in the same row for each set. After Set 1 has a valid final score, checking its confirmation enables Set 2 immediately. The host can continue through the match and press Save changes only once.

Changing a set count from three to five adds Set 4 and Set 5 rows in the open modal and saves a `matchRulesSnapshot.segmentCount` of five. Changing it back to three removes the trailing rows from the staged match.

A match whose rules say `Half` shows `Half count`, `Half 1`, and `Half 2`; `Quarter` shows quarter labels; `Inning` shows inning labels; and `Set` shows set labels. Timed formats show a `Segment length (min)` numeric stepper and save the duration to `matchRulesSnapshot.timekeeping.segmentDurationMinutes`.

Team-officiated events show `Officiating team` in Official Assignments with its check-in control. Configured individual official slots show their own check-in controls. Saved assignments preserve those booleans.

The bottom preview updates from the unsaved team, schedule, score, and segment state. It is read-only and does not contain increment buttons, timer actions, incident forms, or duplicated status cards.

The focused Jest suite passes, TypeScript reports no new errors, and browser QA demonstrates the primary interaction without a framework overlay or relevant console failure.

## Idempotence and Recovery

The edits are local React and test changes and can be reapplied safely. Tests do not write production data. If a rendered test requires a local fixture, use existing development data and do not alter live data. Do not reset or discard unrelated changes in the dirty checkout. If adjacent user edits create a conflict, stop and inspect the exact overlapping hunk before proceeding.

## Artifacts and Notes

The accepted design references are preview-only generated images outside the repository:

    /Users/elesesy/.codex/generated_images/019f7c20-9418-7201-b2ea-89bc7507249c/exec-0d598bae-ebee-435a-9542-8142db23e7ad.png
    /Users/elesesy/.codex/generated_images/019f7c20-9418-7201-b2ea-89bc7507249c/exec-e9098b34-c7c0-459a-a767-45d76063fe94.png

The implementation should match their information architecture rather than reproduce generated pixels exactly.

## Interfaces and Dependencies

Continue using Mantine `Modal`, `Paper`, `Select`, `NumberInput`, `Checkbox`, `Switch`, and date controls. Do not add dependencies.

`MatchEditModal` continues to accept `match`, `tournament`, match/field/team/official collections, creation metadata, and `onSave(updated: Match)`. It now receives event divisions as an optional prop so the Division field can save the selected relation. Embedded score-operation callbacks were removed from the host modal boundary; `EventMatchModals` still sends them only to the standalone `ScoreUpdateModal`.

The staged `Match` returned by `onSave` must contain synchronized `segments`, `team1Points`, `team2Points`, and `setResults`, plus a `matchRulesSnapshot` that reflects match-specific rule fields. `resolvedMatchRules` should mirror that snapshot locally so the staged preview and subsequent reopening use the override before server hydration.

Plan revision note: Created on 2026-07-19 after auditing the current modal, save pipeline, focused tests, and dirty worktree. Updated after implementation to record the final two-column information architecture, same-draft confirmation fix, direct score semantics, sport-aware per-match controls, automated results, and desktop/mobile browser evidence.
