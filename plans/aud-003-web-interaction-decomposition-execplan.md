# Decompose the web event detail and event form interaction owners

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

This plan continues the completed extraction history in `plans/event-form-split-execplan.md`, but it is self-contained for the remaining AUD-003 work. The earlier plan explains how `EventForm.tsx` fell from roughly 14,647 lines to its current size by moving helpers and visual sections. This plan starts from the current checkout and covers both remaining monoliths named by AUD-003.

## Purpose / Big Picture

The public event detail and event create/edit form currently work, but their top-level React components still own thousands of lines of unrelated state, effects, commands, and rendering. That makes a change to one registration dialog, one event-loading request, or one form synchronization rule unusually likely to affect another flow.

After this plan is complete, users must see the same event details, registration choices, authentication and signing dialogs, event form fields, validation, scheduling, staff, divisions, resources, and save behavior. The observable improvement is reliability: incompatible registration dialogs cannot be active together, stale requests cannot overwrite a newly selected event, and each major workflow has direct focused tests. The internal result is that `EventDetailSheet.tsx` and `EventForm.tsx` become compatibility facades that compose focused controllers and views rather than owning every behavior themselves.

## Progress

- [x] (2026-07-14 21:15Z) Reconciled AUD-003 against current source and measured `EventDetailSheet.tsx` at 7,219 lines, `EventForm.tsx` at 4,376 lines, `useDivisionEditorController.ts` at 843 lines, and `useStaffOfficialController.ts` at 892 lines.
- [x] (2026-07-14 21:20Z) Mapped cohesive responsibilities, current focused tests, and browser flows for both components.
- [x] (2026-07-14 21:25Z) Read the applicable React decomposition guidance: separate computations/effects by dependency, never define stateful components inside a component, and use lazy loading only for genuinely deferred heavy UI.
- [x] (2026-07-14 14:27Z) Milestone 1: characterized stale event loads, registration-step exclusivity, signing cancellation and in-flight poll cleanup, superseded slot-conflict requests, normalized division commits, and the complete `EventFormHandle` imperative contract.
- [x] (2026-07-14 14:14Z) Milestone 2: extracted weekly-session calculations, division/registration eligibility and payment-plan calculations, organization/schedule/display presentation helpers, and their direct tests without changing state ownership or markup.
- [x] (2026-07-14 14:39Z) Milestone 3: extracted event hydration, occurrence participants, host, family children, managed teams, registration questions, inline authentication, loading/error state, request identity, cancellation, and the single `reload` boundary.
- [x] (2026-07-14 14:31Z) Milestone 3a: moved inline login/signup, verification resend, Google entry, feedback, and request invalidation into `useInlineEventAuthController`; event-detail data loading remains for Milestone 3b.
- [x] (2026-07-14 14:39Z) Milestone 3b: moved all event-detail reads and their cancellation rules into `useEventDetailDataController`, with pure participant projection in `eventDetailData.ts`.
- [ ] Milestone 4: introduce one registration workflow reducer, then move event-detail views and dialogs behind typed view models and actions.
- [x] (2026-07-14 14:42Z) Milestone 4a: consolidated operation and signed-document polling into `useSigningStatusPoll`, including in-flight suppression, timeout/error handling, cleanup, and event-scope invalidation; the registration reducer and views remain.
- [x] (2026-07-14 15:19Z) Milestone 4b: replaced the independent questions, payment-plan preview, password, signing, checkout preview, billing address, payment, manual-proof, and confirmation visibility flags with one tested registration workflow phase. Stateless registration commands, the owning controller, and the dialog/view split remain.
- [x] (2026-07-14 15:39Z) Milestone 4c: extracted registration-question, payment-plan preview, password confirmation, signing, and checkout preview markup into typed render-only dialog components. Their actions remain facade-owned until the registration controller/command milestone.
- [x] (2026-07-14 16:06Z) Milestone 4d: extracted inline event authentication and free-agent action dialogs behind typed values/actions. The auth controller remains the sole state/service owner, and the dialog module has no service dependencies.
- [x] (2026-07-14 17:02Z) Milestone 4e: extracted the participant capacity summary, previews, and participant dropdowns behind typed render-only values/actions. Participant hydration remains controller-owned and the facade retains team-row commands pending the registration-controller milestone.
- [x] (2026-07-14 17:18Z) Milestone 4f: extracted the manual-payment proof dialog and its stateless upload/submission command. The dialog owns only local file/error presentation while the facade owns workflow completion and event refresh.
- [x] (2026-07-14 17:34Z) Milestone 4g: moved scoped registration-resume hydration, save, clear, and hold-expiry state into `useEventRegistrationProgress`, preserving React Hook Form-independent selection and answer ownership in their existing controllers.
- [x] (2026-07-14 17:51Z) Milestone 4h: moved discount-code editing, preview requests, applied-code validation, and error/loading state into `useEventDiscountPreview` with a typed pending-checkout contract.
- [x] (2026-07-14 18:14Z) Milestone 4i: composed registration-resume and discount ownership into `useEventCheckoutController`, which now owns pending checkout/payment state, billing-address routing, payment-intent creation, hold expiry, and checkout continuation.
- [x] (2026-07-14 18:32Z) Milestone 4j: extracted canonical bill creation, required-sign-link loading, intent classification, email normalization, and signer-step deduplication into stateless registration commands.
- [x] (2026-07-14 19:01Z) Milestone 4k: moved password confirmation, signing state, signature recording, BoldSign message handling, sequential signer advancement, status polling, cancellation, and inactive cleanup into `useEventSigningController`.
- [x] (2026-07-14 19:19Z) Milestone 4l: moved question-intent state, required-answer validation, draft persistence, minor approval routing, signing handoff, finalization, retry restoration, and cleanup into `useRegistrationQuestionsController`.
- [ ] Milestone 5: extract EventForm lifecycle, payment, resource, slot, division-synchronization, and submission controllers while keeping React Hook Form as the only persisted draft owner.
- [ ] Milestone 6: split the two oversized existing EventForm controllers and move the remaining section composition into a render-only component.
- [ ] Milestone 7: run focused Jest, TypeScript, production build, and browser acceptance at desktop and mobile widths; record exact evidence in this plan and the audit ledger.

## Surprises & Discoveries

- Observation: `EventForm.tsx` is no longer primarily a rendering monolith; the prior split already extracted most pure helpers and visual sections.
  Evidence: current source contains `eventForm/defaultValues.ts`, `eventStateMapping.ts`, `schema.ts`, `divisionForm.ts`, `slotForm.ts`, `slotValidation.ts`, `slotConflictHelpers.ts`, `resourceGroups.ts`, `rentalResources.ts`, focused section components, and seven extracted hooks. The remaining 4,376 lines are mostly orchestration and synchronization.

- Observation: two extracted EventForm hooks are themselves too broad to count as a completed ownership split.
  Evidence: `useDivisionEditorController.ts` is 843 lines and `useStaffOfficialController.ts` is 892 lines, each combining draft state, derived models, commands, and side effects.

- Observation: `EventDetailSheet.tsx` models a linear registration workflow with many independent booleans.
  Evidence: the component owns separate flags for registration questions, payment, manual proof, billing address, checkout preview, signing, password confirmation, authentication, team options, participant drawers, and more. Those flags allow impossible combinations unless every callback resets every sibling correctly.

- Observation: the current event-detail helper region is already a natural first safe extraction.
  Evidence: lines before the component contain pure weekly-session, division/pool, payment-plan, organization-label, schedule-formatting, and eligibility functions. They can move with input/output tests before state ownership changes.

- Observation: bracketed Next.js route paths should be passed to Jest through `--runTestsByPath`.
  Evidence: the earlier EventForm split established that treating `src/app/events/[id]/...` as a pattern can produce a false zero-test result.

- Observation: weekly-session generation depended implicitly on the wall clock even though the rest of the calculation was deterministic.
  Evidence: the inline helper called `new Date()` while deriving its anchor. The extracted `buildWeeklySessionOptions` accepts an optional reference date whose default preserves production behavior, allowing boundary tests without global fake timers.

- Observation: putting shared date parsing in either extracted domain module would create a cycle between weekly-session labeling and division-entry identity.
  Evidence: `weeklySessions.ts` resolves division labels through `getDivisionIdFromEventEntry`, while division option construction also needs date parsing for installment and age-cutoff inputs. The common parser now lives in dependency-neutral `dateValues.ts`; focused tests load both modules together and TypeScript resolves the graph cleanly.

- Observation: public division skill parsing greedily consumed part of the `_age_` suffix for composite IDs.
  Evidence: a direct `skill_premier_age_18plus` grouping regression initially rendered the skill row as `18+`. The extracted parser now stops at the first `_age_` separator, and the test proves `Premier` and `18+` remain distinct skill and age labels.

- Observation: event-detail request deduplication did not prevent an older event response from overwriting a newly selected event.
  Evidence: a deferred regression loaded event B first, then resolved event A; before the fix, the hero changed back to A. Each hydration now owns a generation token, validates the current event after every await, and only the active generation may publish data or clear loading state.

- Observation: closed Mantine dialogs do not have one uniform test-DOM lifetime.
  Evidence: the registration-questions dialog is removed before signing opens, while the password and signing dialogs may remain mounted but invisible during their exit transitions. Characterization therefore asserts that exactly the current phase is visible instead of requiring every previous dialog to remain in or leave the DOM.

- Observation: the existing signing status effect already rejects a deferred operation response after unmount.
  Evidence: the new in-flight poll test reaches text-waiver acceptance, observes the immediate operation-status request, unmounts, resolves the deferred response as confirmed, and proves cleanup clears the interval without finalizing registration or scheduling another request.

- Observation: inline authentication had no stale-result guard when its modal closed or the event detail unmounted.
  Evidence: the extracted controller now invalidates login, signup, resend, and Google request generations on close, mode change, and unmount. A deferred-login test proves session refresh and success callbacks cannot run after cleanup.

- Observation: weekly and non-weekly participant hydration independently normalized the same ids, ordering, capacity, and payment-failure state.
  Evidence: `buildParticipantEventData()` now projects both response shapes through one tested path, including temporary canonical fallback for an entity that still arrives with `id` but no `$id`; the controller then applies the existing league/tournament parent-team filter once.

- Observation: rejected stale participant requests could still enter their local catch blocks before the final publication guard.
  Evidence: every participant and legacy free-agent success/error path now checks the controller generation and event identity before logging or publishing fallback state. The deferred event-switch component regression remains green after the move.

- Observation: operation-backed and document-backed signing used separate effects with duplicated completion and failure transitions.
  Evidence: one poll hook now chooses the operation path when an operation id exists, otherwise uses the signed-document fallback, permits only one in-flight request, and calls one pair of typed completion/error actions. A scope-change test proves the same pending target is not restarted for a newly selected event.

- Observation: registration transitions often open the next dialog before closing the previous dialog.
  Evidence: callbacks such as checkout preparation and signing progression intentionally call `open(next)` and then `close(previous)`. The reducer treats a close for a no-longer-active phase as stale, so that cleanup cannot clear the newly opened phase. A direct reducer test locks this ordering rule down.

## Decision Log

- Decision: preserve `EventDetailSheet.tsx` and `EventForm.tsx` as stable public facades until the final milestone.
  Rationale: discover pages and schedule pages already import these paths and depend on their props and imperative API. Moving internals behind them keeps integration risk bounded and makes each milestone independently reversible.
  Date/Author: 2026-07-14 / Codex

- Decision: move pure calculations before changing state ownership.
  Rationale: direct input/output tests can prove a mechanical move without mixing it with workflow changes. This creates stable domain modules for later controllers.
  Date/Author: 2026-07-14 / Codex

- Decision: represent event registration as one discriminated workflow step rather than a collection of modal booleans.
  Rationale: questions, password confirmation, signing, checkout preview, billing address, payment, manual proof, and final confirmation are mutually exclusive phases of one workflow. One reducer makes invalid combinations unrepresentable and gives cancellation one explicit transition.
  Date/Author: 2026-07-14 / Codex

- Decision: keep stable boolean-shaped compatibility setters while converting the existing callbacks to the reducer.
  Rationale: the facade has many already-characterized transitions. Mapping those call sites through stable `open`/`close` actions makes phase exclusivity effective immediately without combining the state-model change with the larger command/controller extraction. The setters are temporary facade adapters and are not a second source of truth.
  Date/Author: 2026-07-14 / Codex

- Decision: extract dialog markup before moving service commands.
  Rationale: the five registration dialogs can consume immutable values and explicit actions without knowing how registration, signing, discounts, or checkout are performed. This creates a tested presentational boundary while leaving each existing command in place for a later ownership-only move.
  Date/Author: 2026-07-14 / Codex

- Decision: keep React Hook Form as the sole persisted `EventFormValues` owner.
  Rationale: a controller that copies the entire draft into separate React state would create the parallel source of truth AUD-003 warns about. Controllers may own transient request or editor state, but persisted event fields must be read and written through the existing form API.
  Date/Author: 2026-07-14 / Codex

- Decision: split controllers by dependency and command ownership, not merely by line count.
  Rationale: independent computations and effects should not rerun because another workflow changed. Each controller must have one reason to change and an explicit typed contract; no new catch-all hook is acceptable even if it shortens the facade.
  Date/Author: 2026-07-14 / Codex

- Decision: do not introduce SWR, another form library, global state, route changes, API changes, database changes, or storage changes in this refactor.
  Rationale: the existing service and React Hook Form boundaries are sufficient. A behavior-preserving decomposition should not combine dependency or contract migration with ownership cleanup.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

Planning and current-source mapping are complete. Milestone 2 moved weekly-session, division registration/eligibility, payment-plan, organization, schedule, and public-display calculations into focused modules. Milestone 3 moved event hydration and inline authentication behind request-safe controllers. Milestone 4 now has one mutually exclusive registration phase plus focused authentication, checkout, signing, registration-question, participant, and manual-payment owners backed by stateless bill/sign-link commands. `EventDetailSheet.tsx` currently measures 4,039 lines, down from 7,219; the remaining join/child orchestration and broader view extraction are still substantial. The prior EventForm extraction remains valuable and is incorporated rather than discarded. Completion requires both facades to meet the ownership and runtime acceptance criteria below; moving lines into equally broad hooks is not sufficient.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-site` on the existing audit branch. The repository is a Next.js App Router application using React, TypeScript, Mantine, React Hook Form, and service modules that call server routes. Do not stage or alter unrelated broadcast-overlay work already present in the worktree.

`src/app/discover/components/EventDetailSheet.tsx` is the public event-details and registration surface. It receives an event identifier or event data through `EventDetailSheetProps`, loads the canonical event and related people/teams/questions, computes weekly occurrences and eligible divisions, presents public details, and runs authentication, registration, billing, signing, checkout, manual-payment, waitlist, team, child, and free-agent workflows. Its public default export and props must remain compatible.

`src/app/events/[id]/schedule/components/EventForm.tsx` is the event create/edit form used by the schedule page. React Hook Form owns `EventFormValues`; the component exposes an `EventFormHandle` imperative API to its parent and composes sections under `src/app/events/[id]/schedule/components/eventForm/`. Its public import path, props, draft-change behavior, validation, and imperative handle must remain compatible.

A controller in this plan is a hook that owns one workflow's transient state, effects, and commands. A view model is immutable data prepared for rendering. A command is a function that performs one user action, usually by calling an existing service. A facade is the stable top-level component that composes controllers and views without reimplementing their internals.

The principal existing event-detail tests are:

    src/app/discover/components/__tests__/EventDetailSheetDetails.test.tsx
    src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanConflict.test.tsx
    src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanTeamJoin.test.tsx

The principal EventForm tests are:

    src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx
    src/app/events/[id]/schedule/components/__tests__/eventFormHelpers.test.ts

Existing end-to-end coverage includes event joining, event creation, rentals, and template parameters under `e2e/`. These tests remain the browser-level safety net after focused unit and component tests pass.

## Plan of Work

Milestone 1 adds characterization coverage before moving behavior. Add direct tests for the current event-load generation or request-token rule so a late response for event A cannot overwrite event B. Add tests proving only one registration phase is active, canceling signing stops its poll and returns to an intentional prior/idle state, and a manual-payment transition cannot leave checkout or payment dialogs active. For EventForm, add tests for cancellation or invalidation of superseded slot-conflict requests, the division-save transformation, opening/reset/dirty-baseline behavior, and every method on `EventFormHandle`. These tests should describe current intended behavior; if one exposes a real defect, document it in `Surprises & Discoveries` and fix it in the narrow controller milestone that owns it.

Milestone 2 creates `src/app/discover/components/eventDetail/` and moves pure functions without changing JSX or state. Put weekly date parsing and `buildWeeklySessionOptions`/`resolveSelectedWeeklySessionOption` in `weeklySessions.ts`. Put division aliasing, tournament-pool mapping, option building, payment-plan rows, and eligibility in `divisionRegistration.ts`. Put public organization labels, capacity/permission summaries, schedule groups, and display formatting in `eventDetailPresentation.ts`. Keep domain types beside the module that owns them or in a narrowly named `types.ts`; do not create a miscellaneous helper dump or a barrel export. Add direct tests for boundary dates, occurrence selection, tournament pool aliases, installment normalization, and age/eligibility cases.

Milestone 3 extracts loading and authentication. Create `hooks/useEventDetailDataController.ts` as the sole owner of event hydration, participants, host organization/user data, family children, managed teams, registration questions, loading/error state, request identity, cancellation, and `reload`. Its load result must be accepted only when the request key still matches the active event and selected weekly occurrence. Create `hooks/useInlineEventAuthController.ts` as the sole owner of login/signup mode, credentials, verification/resend feedback, Google sign-in entry, and reset. The facade may consume returned state and actions but must not retain duplicate flags or invoke the same services directly.

Milestone 4 extracts the registration workflow. Create `registrationCommands.ts` for stateless service orchestration that can be tested with dependency fakes; it should cover self, child, team, free-agent, waitlist, bill, signing-link, checkout, manual-payment, withdrawal, and confirmation operations without owning React state. Create `hooks/useEventRegistrationController.ts` around a reducer with exactly one active workflow phase. The initial phase vocabulary is `idle`, `questions`, `payment-plan-preview`, `password`, `signing`, `checkout-preview`, `billing-address`, `payment`, `manual-proof`, and `confirming`; add a phase only when a real reachable flow cannot be expressed by these names. Put signing polling in `hooks/useSigningStatusPoll.ts`, driven by the active signing state and exact registration/document identity. It must stop on cancellation, event change, completion, error, and unmount.

Once controllers are stable, move rendering into `EventDetailView.tsx`, `EventHero.tsx`, `EventOverviewSections.tsx`, `WeeklySessionPicker.tsx`, `EventParticipantsSection.tsx`, `EventRegistrationCard.tsx`, `ChildRegistrationPanel.tsx`, and `EventDetailDialogs.tsx`. These components receive typed values/actions and do not call services. Components must be declared at module scope so React does not remount them on every facade render. Heavy dialogs may use `next/dynamic` only if bundle evidence shows they are not needed for initial event display and loading them lazily does not alter focus or hydration behavior.

Milestone 5 extracts remaining EventForm orchestration behind existing form state. Create `useEventFormLifecycle.ts` for initial defaults, edit-event changes, reset, immutable defaults, dirty baseline, and draft notification. Create `useEventPaymentController.ts` for installments, manual-payment links, tax preview, automatic-refund availability, and Stripe onboarding. Create `useEventDivisionSynchronization.ts` for sport-derived, playoff, division, and scoring invariants that are currently spread across effects. Create `useDivisionCommitController.ts` and a pure `buildDivisionCommitPatch()` so a division save produces one tested patch before it updates React Hook Form. Create `useEventResourceController.ts` for organization/rental resources, local fields, selected resources, and derived options. Create `useEventSlotController.ts` for add/update/remove, schedule-mode changes, request cancellation, external conflicts, auto-resolution, and normalization. Create `useEventFormSubmissionController.ts` for draft construction, validation, staff snapshot application, error flattening, save notification, and dirty-baseline commit.

Controller dependencies must flow in one direction: React Hook Form draft, then lifecycle/catalog data, then payment/division/resource controllers, then slot/staff controllers, then submission, then render-only sections. A controller must not import a view. A pure helper must not import a service. No controller may retain a second complete `EventFormValues` value.

Milestone 6 splits the existing large controllers. Refactor `useDivisionEditorController.ts` into a small facade over a draft-state hook, pure normalization/commit helpers, and domain commands. Refactor `useStaffOfficialController.ts` into a small facade over `useStaffRosterController.ts` and `useOfficialAssignmentsController.ts`. Move remaining top-level section wiring into `EventFormSections.tsx`, which renders from explicit models and actions without services or form-wide state mutation. Keep direct module imports rather than adding a barrel file that can hide dependency cycles.

Milestone 7 validates the complete behavior. Run the focused suites after every milestone, then TypeScript and a production build. Start the release build locally and use the in-app browser at desktop and mobile widths. Verify `/discover`, an inline public event page, and the schedule create/edit page. Exercise weekly occurrence selection, free and paid registration, division/team selection, auth and signing dialogs, participant drawers, sticky join-card geometry, dirty-state reporting, division edits, organization and rental resources, timeslot conflicts, save, and reload. Check for console/page errors and ensure the rendered behavior matches the pre-refactor characterization tests.

## Concrete Steps

Before each milestone, inspect scope from the repository root:

    cd /Users/elesesy/StudioProjects/mvp-site
    git status --short
    git diff --check

Run the event-detail component safety net serially:

    npx jest --runInBand \
      src/app/discover/components/__tests__/EventDetailSheetDetails.test.tsx \
      src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanConflict.test.tsx \
      src/app/discover/components/__tests__/EventDetailSheetJoinPaymentPlanTeamJoin.test.tsx

Run the bracketed EventForm paths literally:

    npx jest --runInBand --runTestsByPath \
      'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' \
      'src/app/events/[id]/schedule/components/__tests__/eventFormHelpers.test.ts'

After each passing milestone, inspect the file-scoped diff, run `git diff --check`, stage only the milestone paths, run `git diff --cached --check`, and commit the milestone. Never stage unrelated broadcast-overlay files.

After all unit/component milestones:

    npx tsc --noEmit
    npm run build

Then run the browser suite against the configured local release server:

    npx playwright test \
      e2e/event-join.spec.ts \
      e2e/event-create.spec.ts \
      e2e/rental-purchase.spec.ts \
      e2e/event-template-parameters.spec.ts \
      --project=chromium

Record exact test counts, build result, local URLs, viewport sizes, and any unreachable authenticated path under `Artifacts and Notes` before marking the final progress item complete.

## Validation and Acceptance

Acceptance is behavioral first. Existing event-detail and event-form props and `EventFormHandle` remain compatible. A user can view an event, switch weekly occurrences, authenticate, choose a registrant/team/division, answer questions, sign required documents, preview and complete the appropriate payment path, withdraw, and inspect participants without stale data or contradictory dialogs. A host can create or edit an event, change resources, divisions, staff, scoring, and slots, see conflicts and validation, save, reload, and retain the same persisted values.

All existing focused suites plus new direct controller/helper tests must pass. TypeScript and the production build must pass. Browser acceptance must show no new console errors, page errors, hydration warnings, focus-loss loops, clipped dialogs, or mobile sticky-card regressions.

The structural acceptance targets are:

- `EventDetailSheet.tsx` is no more than about 600 lines and contains composition, facade props, and no direct service orchestration.
- `EventForm.tsx` is no more than about 700 lines and contains form creation plus controller/view composition, not workflow implementations.
- No new interaction hook or view exceeds about 600 lines; if one approaches that size, split by ownership before closure.
- Presentational components make no direct service/API calls.
- Each request-owning controller cancels or rejects superseded work.
- Registration has one active phase, not sibling modal booleans.
- React Hook Form remains the only persisted event-draft source.
- No route, API, database, storage, or user-facing copy change is introduced solely to satisfy line-count targets.

AUD-003 is not complete merely because code moved. It is complete only when ownership is singular, dependency direction is clear, focused tests cover transitions and stale work, and release-build browser behavior passes.

## Idempotence and Recovery

Every milestone is an additive move followed by removal of the old implementation and is safe to repeat after a failed test. Move one cohesive region at a time; do not combine event-detail state extraction with EventForm state extraction in one commit. If a moved pure function changes output, restore the original inline implementation and compare input/output fixtures before continuing. If a controller creates duplicate state, stop and redesign its contract rather than synchronizing two copies with another effect.

Request cancellation and reducer transitions must be deterministic under repeated calls. Tests should use deferred promises or fake timers and restore timers/mocks in teardown. Browser fixtures must be cleaned using their existing teardown paths. Do not reset the dirty worktree or discard unrelated user changes. Recovery is by reverting only the most recent scoped milestone commit or patching the moved symbols back through `apply_patch`.

## Artifacts and Notes

Planning measurements on 2026-07-14:

    7,219  src/app/discover/components/EventDetailSheet.tsx
    4,376  src/app/events/[id]/schedule/components/EventForm.tsx
      843  src/app/events/[id]/schedule/components/eventForm/hooks/useDivisionEditorController.ts
      892  src/app/events/[id]/schedule/components/eventForm/hooks/useStaffOfficialController.ts

Current source contains about 80 `useState` calls, 14 effects, and 36 callbacks in the event-detail facade. EventForm contains about 42 effects, 49 memos, 41 callbacks, and 12 refs. These counts are diagnostic, not acceptance criteria; the goal is explicit ownership and tested behavior.

First extraction evidence on 2026-07-14:

    PASS 4 suites / 22 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 7,219 -> 6,916 lines

The four new direct tests cover local date parsing, invalid/non-weekly slots, multi-day bounded occurrence generation with canonical division labels, and selected-occurrence validation outside the generated three-week window.

Second pure-calculation extraction evidence on 2026-07-14:

    PASS 5 suites / 26 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 6,916 -> 6,499 lines

The four new direct division-registration tests cover tournament pool-to-bracket registration, league playoff exclusion, event defaults versus division payment-plan overrides, and identifier/amount/date/relative-day/presentation normalization. The shared date parser was moved to `dateValues.ts` so the extracted weekly-session and division-registration modules do not form a circular dependency.

Final Milestone 2 evidence on 2026-07-14:

    PASS 6 suites / 33 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 6,499 -> 6,136 lines

Six direct presentation tests cover normalized lists, safe organization destinations, policy/staffing summaries, 12-hour time boundaries, ordered multi-day schedule groups, and gender/age/skill division grouping. The division-registration suite now also covers inactive family links plus event- and division-level age eligibility.

First Milestone 1 characterization evidence on 2026-07-14:

    PASS 6 suites / 34 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check

The deferred event-switch regression proves a late response for event A cannot replace already-rendered event B. The generation guard also suppresses stale participant/free-agent side effects and prevents an obsolete request from clearing the current request's loading state.

Completed Milestone 1 characterization evidence on 2026-07-14:

    PASS 8 suites / 168 tests
    PASS registration phase exclusivity and explicit signing cancellation
    PASS deferred signing-operation cleanup after unmount
    PASS latest-request-wins slot-conflict resolution
    PASS normalized division commit and all seven EventFormHandle methods

The characterization suite confirms that prior registration phases are not visible together, an in-flight signing response cannot finalize after cleanup, a late slot-conflict response cannot replace the current result, and division edits update the canonical form draft once. Existing dirty-baseline and same-id reload cases continue to cover form opening/reset behavior.

First Milestone 3 extraction evidence on 2026-07-14:

    PASS 2 suites / 14 tests
    PASS npx tsc --noEmit
    EventDetailSheet.tsx: 6,136 -> 6,088 lines
    useInlineEventAuthController.ts: 230 lines

Four direct controller tests cover signup validation, successful login/session refresh, unverified-email resend, and deferred-login cleanup after unmount. The existing guest-event component test continues to prove the inline auth modal opens without navigating away from event details.

Completed Milestone 3 evidence on 2026-07-14:

    PASS 10 suites / 176 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 6,088 -> 5,546 lines
    useEventDetailDataController.ts: 367 lines
    eventDetailData.ts: 208 lines

The four new pure data tests cover occurrence load keys, sport-scoped managed teams, canonical participant ordering/payment failures, and immutable empty-occurrence projections. Existing component tests continue to cover stale event replacement, guest auth, participant rendering, registration transitions, and payment-plan behavior through the extracted controller.

First Milestone 4 extraction evidence on 2026-07-14:

    PASS 2 suites / 10 tests
    PASS npx tsc --noEmit
    EventDetailSheet.tsx: 5,546 -> 5,452 lines
    useSigningStatusPoll.ts: 127 lines

Five direct polling tests cover confirmed operations, terminal failures, the document fallback, unmount cleanup, and event-scope changes. The registration component suite still proves explicit pre-poll cancellation and deferred operation cleanup through the public UI.

Registration workflow reducer evidence on 2026-07-14:

    PASS 12 suites / 190 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 5,452 -> 5,511 lines
    registrationWorkflow.ts: 47 lines

Four direct reducer cases cover exclusive transitions, stale close protection, all checkout/payment phases, and reset identity. The temporary facade adapters add 59 net lines while removing eight independent modal/confirmation booleans; every registration visibility read now derives from the single phase. The component suites retain questions, team-join/payment-plan, signing, and checkout behavior through the public UI. Payload and service orchestration remain in the facade until the owning registration controller milestone.

Registration dialog extraction evidence on 2026-07-14:

    PASS 13 suites / 195 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 5,511 -> 5,281 lines
    EventRegistrationDialogs.tsx: 446 lines

Five direct dialog tests prove question edits/submission, payment-plan presentation/continuation, password forwarding, text-waiver acceptance, and discount checkout actions. Existing facade tests continue to exercise the same titles, controls, phase transitions, and registration behaviors through the extracted views. The new dialog module imports no service and owns no workflow state.

Auxiliary event-detail dialog evidence on 2026-07-14:

    PASS 14 suites / 198 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 5,281 -> 5,172 lines
    EventDetailDialogs.tsx: 208 lines

Three direct dialog tests cover login field/action forwarding, signup/verification resend rendering, and free-agent invite/close actions. Inline authentication request invalidation and service ownership remain in `useInlineEventAuthController`; the new view module imports only Mantine, user display helpers, and controller types.

Participant-view extraction evidence on 2026-07-14:

    PASS 15 suites / 202 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 5,172 -> 5,028 lines
    EventParticipantsSection.tsx: 276 lines

Four direct participant-view tests cover capacity presentation, full/free-agent state, player/team/free-agent dropdown actions, and empty sections. Existing event-detail suites continue to exercise participant hydration, ordering, team rows, registration transitions, and payment-plan behavior through the extracted view. The new module imports no service and owns no participant state.

Manual-payment proof extraction evidence on 2026-07-14:

    PASS 17 suites / 209 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 5,028 -> 4,908 lines
    ManualPaymentProofDialog.tsx: 137 lines
    manualPaymentProof.ts: 46 lines

Seven direct tests cover pending-installment selection, invalid bills, canonical upload/submission ids, malformed upload responses, proof-dialog presentation, required file selection, and surfaced submission errors. The dialog imports no API or service; the command owns upload and proof submission, while the facade retains the workflow transition, progress cleanup, refresh, and success notice.

Registration-resume controller evidence on 2026-07-14:

    PASS 18 suites / 212 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 4,908 -> 4,849 lines
    useEventRegistrationProgress.ts: 155 lines

Three direct hook tests cover scoped draft hydration, latest-default plus explicit-patch persistence, and storage/hold cleanup. The controller derives its key from event, user, slot, and occurrence; stale hold state is hidden immediately when that key changes, and deferred hydration is cancelled during cleanup so an obsolete draft cannot update a new event scope.

Discount-preview controller evidence on 2026-07-14:

    PASS 19 suites / 216 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 4,849 -> 4,808 lines
    useEventDiscountPreview.ts: 112 lines

Four direct hook tests cover trimmed-code preparation and validation, canonical successful previews with complete checkout context, blank-code short-circuiting, and service-failure reset/error state. The facade now forwards typed checkout intent and consumes immutable preview state instead of owning discount request state and transitions.

Checkout-controller composition evidence on 2026-07-14:

    PASS 20 suites / 221 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 4,808 -> 4,616 lines
    useEventCheckoutController.ts: 277 lines

Five direct controller tests cover complete-address preview routing, incomplete-address collection, successful payment-intent and hold persistence, API-requested billing fallback with checkout-context retention, and hold-expiry cleanup. The controller composes the already-focused resume and discount hooks, owns one pending checkout and one payment-intent state, and publishes explicit phase actions without copying event registration data.

Stateless registration-command evidence on 2026-07-14:

    PASS 21 suites / 228 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 4,616 -> 4,494 lines
    eventRegistrationCommands.ts: 199 lines

Seven direct command tests cover every analytics intent, signer-context-preserving deduplication, canonical team bills with normalized due dates, weekly occurrence/relative-date validation, slot-scoped weekly bills, participant sign-link deduplication, and same-email parent/child signing. The facade now supplies immutable command inputs and retains only the surrounding workflow transitions.

Signing-controller evidence on 2026-07-14:

    PASS 22 suites / 234 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 4,494 -> 4,139 lines
    useEventSigningController.ts: 474 lines

Six direct controller tests cover no-template bypass, typed sign-link loading and password-phase entry, required-password validation, successful password-to-signing transition, final-intent continuation after polling, and complete cancellation reset. Existing poll tests retain confirmed/error/timeout/scope/in-flight coverage, while facade tests continue to prove cancellation and deferred-response cleanup through the public UI.

Registration-question controller evidence on 2026-07-14:

    PASS 23 suites / 240 tests
    PASS npx tsc --noEmit
    PASS targeted ESLint and git diff --check
    EventDetailSheet.tsx: 4,139 -> 4,039 lines
    useRegistrationQuestionsController.ts: 198 lines

Six direct controller tests cover supported-intent gating and answer persistence, required-answer blocking, answered signing/finalization handoff, signing-owned loading state, minor parent-approval routing, and failure restoration with the answered intent. The controller owns only question-step state and receives explicit signing/finalization actions; it does not copy event or participant state.

## Interfaces and Dependencies

Keep the default `EventDetailSheet` export and its existing `EventDetailSheetProps` compatible. Internal event-detail modules should export named types/functions. `useEventDetailDataController` must return immutable data/loading/error fields plus `reload`; its implementation owns request identity and service calls. `useInlineEventAuthController` owns authentication transient state and actions. `useEventRegistrationController` exposes a discriminated state object and intent/action functions; views never mutate its state directly. `useSigningStatusPoll` accepts the active signing identity and callbacks and owns only the polling lifecycle.

Keep the existing `EventForm` export, props, `EventFormValues`, and `EventFormHandle` compatible. Controller hooks accept narrow slices of the React Hook Form API such as `control`, `getValues`, `setValue`, `reset`, and `formState` only where needed. `buildDivisionCommitPatch()` is pure and returns the exact fields to apply; `useDivisionCommitController` owns applying that result atomically. `EventFormSections.tsx` receives explicit models/actions and imports no services.

Use existing React, React Hook Form, Mantine, service modules, Jest, Testing Library, Playwright, and Next.js build tooling. Do not add a state-management or data-fetching dependency. Prefer direct imports and module-scope components. Split independent effects and memo computations by their real dependencies so unrelated state changes do not retrigger other workflows.

Revision note (2026-07-14): Created the self-contained AUD-003 continuation after current-source mapping showed that the earlier EventForm helper/view extraction was complete but orchestration remained concentrated, while EventDetailSheet still combined loading, registration, payment, signing, authentication, and rendering.
Revision note (2026-07-14): Recorded the first partial pure-calculation milestone after extracting weekly-session generation and selection with 22 passing focused tests, TypeScript, targeted lint, and a 303-line net reduction in the facade.
Revision note (2026-07-14): Continued Milestone 2 by extracting division, tournament-pool, and installment calculations with 26 passing focused tests, TypeScript, targeted lint, and a further 417-line reduction in the event-detail facade.
Revision note (2026-07-14): Completed Milestone 2 by extracting public-detail presentation and eligibility rules with 33 passing focused tests, TypeScript, targeted lint, and a further 363-line reduction in the event-detail facade.
Revision note (2026-07-14): Added the first Milestone 1 deferred-response characterization and closed the stale event-hydration race it exposed with 34 passing focused tests, TypeScript, and targeted lint.
Revision note (2026-07-14): Completed Milestone 1 with registration-phase, signing-poll cleanup, slot-request invalidation, normalized division-commit, and full imperative-handle coverage; the combined safety net passes 168 tests across eight suites.
Revision note (2026-07-14): Began Milestone 3 by extracting the inline-auth controller with explicit request invalidation and 14 passing focused tests; event hydration remains the next ownership boundary.
Revision note (2026-07-14): Completed Milestone 3 by consolidating all event-detail reads and stale-result rejection into one 367-line controller; the ten-suite safety net passes 176 tests and the facade is now 5,546 lines.
Revision note (2026-07-14): Began Milestone 4 by extracting one event-scoped signing poll owner with five direct tests; the reducer and render-only dialog split remain.
Revision note (2026-07-14): Continued Milestone 4 by making registration visibility a single reducer-owned phase with stale-close protection; the 12-suite safety net passes 190 tests, while registration commands, controller payloads, and dialog views remain to be extracted.
Revision note (2026-07-14): Continued Milestone 4 by extracting five typed registration dialogs with no service dependencies; the 13-suite safety net passes 195 tests and the facade is now 5,281 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting typed inline-auth and free-agent action dialogs; authentication requests remain controller-owned and the facade is now 5,172 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting participant capacity, previews, and dropdown composition; the 15-suite safety net passes 202 tests and the facade is now 5,028 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting the manual-payment proof dialog and stateless submission command; the 17-suite safety net passes 209 tests and the facade is now 4,908 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting registration-resume hydration, persistence, and hold state; the 18-suite safety net passes 212 tests and the facade is now 4,849 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting discount preview state, requests, and applied-code validation; the 19-suite safety net passes 216 tests and the facade is now 4,808 lines.
Revision note (2026-07-14): Continued Milestone 4 by composing checkout, billing-address routing, payment-intent, hold-expiry, resume, and discount ownership; the 20-suite safety net passes 221 tests and the facade is now 4,616 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting stateless bill and signing-link commands plus intent helpers; the 21-suite safety net passes 228 tests and the facade is now 4,494 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting one signing controller for password, recording, messaging, sequential advancement, polling, and cancellation; the 22-suite safety net passes 234 tests and the facade is now 4,139 lines.
Revision note (2026-07-14): Continued Milestone 4 by extracting registration-question intent, validation, persistence, minor routing, and retry ownership; the 23-suite safety net passes 240 tests and the facade is now 4,039 lines.
