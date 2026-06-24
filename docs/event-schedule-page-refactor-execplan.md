# Split the event schedule page into maintainable components

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root. It must remain self-contained enough for a contributor with only this checkout and this file to continue the work.

## Purpose / Big Picture

The event schedule route at `src/app/events/[id]/schedule/page.tsx` is the main operational surface for event managers. It loads an event, renders the event setup form, participants, schedule, standings, bracket, finance, modals, and many save flows. The file is currently large enough that small behavior changes are difficult to reason about and risky to review.

After this refactor, the page should still behave the same to users, but the implementation should be easier to change safely. The route file should remain the visible owner of the schedule workflow rather than becoming an empty shell, while major visual sections, modal layers, pure helpers, and independent hook clusters move into focused files.

## Progress

- [x] (2026-06-23 23:53Z) Created this ExecPlan to guide and track the schedule page split.
- [x] (2026-06-23 23:55Z) Ran the initial baseline checks and recorded current file size plus focused test surface.
- [x] (2026-06-24 00:00Z) Extracted the first pure helper/type slice into `src/app/events/[id]/schedule/schedulePage/locationDefaults.ts`.
- [x] (2026-06-24 00:01Z) Ran focused validation after the first extraction and recorded the result.
- [x] (2026-06-24 00:01Z) Extracted the first page shell component, `EventSchedulePendingChangesPopover`, while keeping all state and handlers in `EventScheduleContent`.
- [x] (2026-06-24 00:01Z) Ran focused validation after the first shell extraction and recorded the result.
- [x] (2026-06-24 00:23Z) Extracted the participant management modal layer (`AddParticipantModal`, `AddTeamModal`, and participant team detail modal) with local modal UI logic moved into module-scope components.
- [x] (2026-06-24 01:24Z) Moved participant management state, hydration effects, picker loading, and mutation handlers into `useEventParticipants`.
- [x] (2026-06-24 00:34Z) Extracted billing and refund UI into a billing modal layer (`RefundTeamModal`, `CreateBillModal`) with local modal UI logic moved into module-scope components.
- [x] (2026-06-24 01:09Z) Moved refund/create-bill state, API calls, defaults, fee preview, and submit handlers into `useEventBilling`.
- [x] (2026-06-24 00:45Z) Extracted the team compliance detail modal into `EventComplianceModal`, including its expanded-row UI state and payment label formatting.
- [x] (2026-06-24 01:02Z) Extracted the reusable rental checkout/signing modal layer into `RentalCheckoutModals` and used it from both create and normal event views.
- [x] (2026-06-24 01:06Z) Extracted the create-mode view into `CreateEventScheduleView`, including the create header, template prompt, create form wrapper, alert stack, and rental checkout placement.
- [x] (2026-06-24 01:47Z) Moved create/template draft setup and rental checkout/signing orchestration into `useCreateEventFlow` / `useRentalCheckoutFlow`.
- [x] (2026-06-24 02:03Z) Extracted the normal event header/action/status shell (`EventScheduleHeader`, action bar, and alert stack) while preserving top-level save/edit decisions in `EventScheduleContent`.
- [x] (2026-06-24 02:33Z) Extracted the match edit/score modal boundary into `EventMatchModals` and moved staged match operations plus score-update state/handlers into `useEventMatchOperations`.
- [x] (2026-06-24 02:55Z) Extracted match conflict alert state into `useMatchConflictAlerts` and match realtime socket/merge logic into `useEventMatchRealtime`.
- [ ] Reassess remaining tab-section and hook boundaries only after the vertical slices above are complete.
- [ ] Reassess the final size and shape of `page.tsx`, then document remaining worthwhile follow-up work.

## Surprises & Discoveries

- Observation: The route already has a `schedulePage` folder with extracted tab panels and helpers, so this refactor should extend that structure instead of creating a parallel component namespace.
  Evidence: `src/app/events/[id]/schedule/schedulePage/BracketTabPanel.tsx`, `DetailsTabPanel.tsx`, `FinanceTabPanel.tsx`, `ParticipantsPanel.tsx`, `ScheduleTabPanel.tsx`, `StandingsTabPanel.tsx`, and `helpers.ts` already exist.

- Observation: The initial helper and small popover extraction reduced risk but was too small to materially improve the route. The next work should follow vertical UI slices where modal/view code and its local UI logic move together.
  Evidence: `src/app/events/[id]/schedule/page.tsx` remained above 10,000 lines after the initial two extractions.

## Decision Log

- Decision: Preserve `EventScheduleContent` as the top-level workflow owner and avoid reducing `page.tsx` to a tiny wrapper.
  Rationale: The user explicitly wants the form/page structure to remain understandable in the owner file. Moving every section behind opaque abstractions would reduce line count but make behavior harder to follow.
  Date/Author: 2026-06-23 / Codex

- Decision: Use explicit props for extracted components before introducing new shared context.
  Rationale: The current page has many related state values and handlers. Explicit props make dependencies visible during extraction. A new context can be added later only if prop groups become stable and clearly excessive.
  Date/Author: 2026-06-23 / Codex

- Decision: Reuse `src/app/events/[id]/schedule/schedulePage/` for new page-specific modules.
  Rationale: The route already imports tab panels and helpers from that folder, so adding more page-specific code there keeps ownership consistent.
  Date/Author: 2026-06-23 / Codex

- Decision: Pivot from helper-first extraction to vertical UI slices.
  Rationale: The user correctly called out that helper-only movement was not enough. Large user-facing slices such as participant modals, billing modals, create-mode view, and match operation modals are better modular boundaries because each can eventually own its local state and handlers.
  Date/Author: 2026-06-24 / Codex

## Outcomes & Retrospective

First helper extraction completed. `page.tsx` now imports pure location helper functions from `src/app/events/[id]/schedule/schedulePage/locationDefaults.ts`. The route still owns all state and workflow decisions. Validation passed after the extraction.

First shell extraction completed. The pending changes popover now lives in `src/app/events/[id]/schedule/schedulePage/EventSchedulePendingChangesPopover.tsx`. The route still owns `isPendingChangesPopoverOpen`, `pendingSaveChanges`, and `setIsPendingChangesPopoverOpen`; the extracted component only renders the popover and forwards the open-state callback. Validation passed after the extraction.

Participant modal extraction completed. The add-participant modal, add-team modal, and participant team detail modal now live in `src/app/events/[id]/schedule/schedulePage/EventParticipantModals.tsx`. The extracted components own modal-local UI behavior such as invite-mode switching, invite row editing, add/remove row actions, add-team close cleanup, and roster availability display. The route still owns API mutation handlers and broader participant state until `useEventParticipants` is extracted.

Billing modal extraction completed. The refund modal and create-bill modal now live in `src/app/events/[id]/schedule/schedulePage/EventBillingModals.tsx`. The extracted components own modal-local UI behavior such as refund amount input normalization, payment action rendering, bill amount/tax normalization, split-bill toggling, owner controls, and bill preview rendering. The route still owns API mutation handlers and broader billing state until `useEventBilling` is extracted.

Compliance modal extraction completed. The team compliance detail modal now lives in `src/app/events/[id]/schedule/schedulePage/EventComplianceModal.tsx`. The extracted component owns modal-local expanded-row state and payment label formatting. The route still owns loading/fetching compliance snapshots and the selected team id.

Create/rental flow extraction completed. The rental checkout and rental signing modals now live in `src/app/events/[id]/schedule/schedulePage/RentalCheckoutModals.tsx` and are reused in both create mode and the normal event page, removing duplicated checkout JSX. The create-mode page layout now lives in `src/app/events/[id]/schedule/schedulePage/CreateEventScheduleView.tsx`, including the create header, pending changes control, alert stack, template prompt, `EventForm` wrapper, and checkout modal placement. The route still owns publish/apply-template/rental-signing state and handlers until those are moved into focused hooks.

Billing workflow hook extraction completed. Refund/create-bill state, API calls, default owner selection, refund defaults, fee/tax preview calculations, and submit handlers now live in `src/app/events/[id]/schedule/schedulePage/useEventBilling.ts`. The route consumes the hook result for participant billing action buttons and the extracted billing modals.

Participant workflow hook extraction completed. Participant teams, users, officials, snapshot hydration, organization/team picker loading, add/remove/move mutations, invite/search state, and modal open/reset helpers now live in `src/app/events/[id]/schedule/schedulePage/useEventParticipants.ts`. The route still owns the visible participant panel rendering, compliance lookups, and participant card rendering so the schedule page remains the workflow owner.

Create workflow hook extraction completed. Create-mode organization loading, rental immutable defaults, rental purchase context, template prompt state, template seeding, create-form seed baseline, rental checkout locks, payment modal state, signing modal state, and signature polling now live in `src/app/events/[id]/schedule/schedulePage/useCreateEventFlow.ts`. The route still owns the publish branch, schedule preview/save callbacks, and visible create view wiring.

Normal event header extraction completed. The normal event title/action bar, selected occurrence badge, pending changes popover placement, lifecycle select, QR modal, More menu, and top alert stack now live in `src/app/events/[id]/schedule/schedulePage/EventScheduleHeader.tsx`. `EventScheduleContent` still owns action availability booleans, save/edit/delete/reschedule callbacks, and alert dismissal state.

Match operation extraction completed. The match edit and score modal render boundary now lives in `src/app/events/[id]/schedule/schedulePage/EventMatchModals.tsx`. The staged match create/delete state, match editor open/current-match state, score modal state, draft match add/edit/delete/move/lock handlers, bracket draft normalization calls, and score update persistence callbacks now live in `src/app/events/[id]/schedule/schedulePage/useEventMatchOperations.ts`. The route still owns the broader save pipeline, assistant draft action handler, match conflict alert state, and realtime socket connection because those still coordinate with page-level event and unsaved-change behavior.

Match conflict and realtime extraction completed. Conflict detection, dismissal, override-message state, and visible conflict messaging now live in `src/app/events/[id]/schedule/schedulePage/useMatchConflictAlerts.ts`. Match websocket connection, refresh-after-disconnect, reconnect handling, realtime snapshot merging, and focused match synchronization now live in `src/app/events/[id]/schedule/schedulePage/useEventMatchRealtime.ts`. The route still owns `hasUnsavedChangesRef` because hydrate, load, save, discard, and realtime all need the same current unsaved-change signal.

## Context and Orientation

This repository is a Next.js App Router application. The route `src/app/events/[id]/schedule/page.tsx` is a client component, which means it runs in the browser and can use React state, effects, and browser-only hooks. The route renders the event schedule management experience for both viewing and editing events.

The important local files are:

- `src/app/events/[id]/schedule/page.tsx`: the current large route file. It defines `EventScheduleContent` and the default exported `EventSchedulePage`.
- `src/app/events/[id]/schedule/schedulePage/helpers.ts`: existing page-specific constants, types, and pure helper functions imported by `page.tsx`.
- `src/app/events/[id]/schedule/schedulePage/*.tsx`: existing extracted tab panels used by `page.tsx`.
- `src/app/events/[id]/schedule/components/EventForm.tsx`: the event form component rendered by the schedule page.
- `src/app/events/[id]/schedule/__tests__/page.test.tsx`: focused page test coverage that mocks several child components and verifies route-level behavior.

The phrase "pure helper" means a function that receives inputs and returns a value without reading React state, mutating external data, calling APIs, or rendering JSX. Pure helpers are safest to move first because imports can be updated without changing runtime behavior.

The phrase "page shell component" means a component that renders a visible chunk of the page but does not own business logic. For example, a header component may render title text and action buttons while receiving all button callbacks from `EventScheduleContent`.

The phrase "hook cluster" means a custom React hook that owns related state, memoized values, and callbacks. Hook clusters should be split by dependency boundaries so unrelated work does not recompute or rerun effects when only one domain changes.

## Plan of Work

Start by proving the current baseline. In `/Users/elesesy/.codex/worktrees/ab2e/mvp-site`, run a line count for `src/app/events/[id]/schedule/page.tsx`, run `npx tsc --noEmit`, and run the focused schedule page test file if it is stable in the local environment. Record the commands and outcomes in this ExecPlan.

Next, move only top-level pure code from `page.tsx` into `src/app/events/[id]/schedule/schedulePage/helpers.ts` or into new sibling files under `schedulePage/` if `helpers.ts` becomes too broad. This first slice should avoid JSX and avoid changing state ownership. Import paths should remain direct and explicit.

The next phase should prioritize vertical UI slices. A vertical UI slice means a large visible part of the page and its local UI logic move together into module-scope components. The first target is participant management because the participants tab already has `ParticipantsPanel`, but the add-participant modal, add-team modal, and team-detail modal still live in `page.tsx`. Extract those modals into `src/app/events/[id]/schedule/schedulePage/EventParticipantModals.tsx`. Move local UI logic such as segmented invite-mode switching, invite row editing, add-row/remove-row actions, and add-team modal close cleanup into those components. Keep server/API mutations in `page.tsx` for the first extraction, then move participant state and handlers into `useEventParticipants` in a later step after the component boundary is stable.

After participant modals, extract billing and refund modals into a billing modal layer. That slice should own refund list rendering, refund draft amount inputs, create-bill preview rendering, and create-bill form controls. Once stable, move refund and bill state plus handlers into `useEventBilling`.

After billing, extract create-mode view. This includes the create event header, template prompt, EventForm wrapper, rental payment modal, and rental signing modal. Once the view is stable, create/template/rental checkout state should move out of `EventScheduleContent` into focused hooks.

After those vertical slices, extract the normal event header/action/status shell and the schedule/match operation slice. Do not make a single giant `EventScheduleModalLayer` with every modal if that produces one opaque prop bag. Prefer domain-specific modal files that can later absorb their logic.

## Concrete Steps

All commands in this plan run from `/Users/elesesy/.codex/worktrees/ab2e/mvp-site`.

Baseline commands:

    wc -l 'src/app/events/[id]/schedule/page.tsx'
    npx tsc --noEmit
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand

First extraction commands:

    rg -n "^(type |interface |const |function )" 'src/app/events/[id]/schedule/page.tsx'
    sed -n '1,260p' 'src/app/events/[id]/schedule/page.tsx'
    sed -n '1,260p' 'src/app/events/[id]/schedule/schedulePage/helpers.ts'

Participant modal extraction commands:

    sed -n '9310,9635p' 'src/app/events/[id]/schedule/page.tsx'
    rg -n "isAddParticipantModalOpen|isAddTeamModalOpen|selectedParticipantTeam|participantInviteMode|participantInviteRows|teamSearchQuery" 'src/app/events/[id]/schedule/page.tsx'

After each extraction:

    npx tsc --noEmit
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand
    git diff --check
    wc -l 'src/app/events/[id]/schedule/page.tsx'

The direct `npm test -- src/app/events/[id]/schedule/__tests__/page.test.tsx --runInBand` form treats the bracketed path as a Jest pattern and does not find the test file. Use `npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand` for this path.

## Validation and Acceptance

The refactor is acceptable only if the schedule page keeps the same user-visible behavior. A user should still be able to load an event schedule page, switch between details, participants, schedule, standings, bracket, and finance tabs, edit where permitted, save changes, and open relevant modals.

For each implementation slice, acceptance requires:

- TypeScript completes without errors through `npx tsc --noEmit`, unless the command exposes pre-existing unrelated failures that are recorded here.
- The focused page test runs, or any failure is recorded with the failing test name and whether it is pre-existing.
- `git diff --check` reports no whitespace errors.
- The line count of `src/app/events/[id]/schedule/page.tsx` is recorded so progress can be measured without making line count the only goal.

For UI-affecting slices, start a production-style local build server if practical and smoke the schedule page in a browser. Use an existing local event URL and verify that tabs, edit mode, modal open/close behavior, and save/discard controls still render.

## Idempotence and Recovery

This refactor is additive and incremental. Each extraction should be small enough to revert independently if validation fails. If a moved helper causes import cycles or unclear ownership, move it back to `page.tsx` or split it into a more specific `schedulePage` module before proceeding.

Do not use destructive git commands. If unrelated local changes appear, leave them alone and stage only files touched by this plan.

## Artifacts and Notes

Current known baseline before implementation:

    src/app/events/[id]/schedule/page.tsx has 10,350 lines.
    The file contains one large `EventScheduleContent` function and the default `EventSchedulePage` wrapper.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand passed with 67 tests.

After extracting `schedulePage/locationDefaults.ts`:

    src/app/events/[id]/schedule/page.tsx has 10,281 lines.
    src/app/events/[id]/schedule/schedulePage/locationDefaults.ts has 111 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand passed with 67 tests.

After extracting `schedulePage/EventSchedulePendingChangesPopover.tsx`:

    src/app/events/[id]/schedule/page.tsx has 10,250 lines.
    src/app/events/[id]/schedule/schedulePage/EventSchedulePendingChangesPopover.tsx has 60 lines.
    src/app/events/[id]/schedule/schedulePage/locationDefaults.ts has 111 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand passed with 67 tests.

After extracting `schedulePage/EventParticipantModals.tsx`:

    src/app/events/[id]/schedule/page.tsx has 9,984 lines.
    src/app/events/[id]/schedule/schedulePage/EventParticipantModals.tsx has 457 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand passed with 67 tests.

After extracting `schedulePage/EventBillingModals.tsx`:

    src/app/events/[id]/schedule/page.tsx has 9,749 lines.
    src/app/events/[id]/schedule/schedulePage/EventBillingModals.tsx has 381 lines.
    src/app/events/[id]/schedule/schedulePage/EventParticipantModals.tsx has 457 lines.
    src/app/events/[id]/schedule/schedulePage/EventSchedulePendingChangesPopover.tsx has 60 lines.
    src/app/events/[id]/schedule/schedulePage/locationDefaults.ts has 111 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

After extracting `schedulePage/EventComplianceModal.tsx`:

    src/app/events/[id]/schedule/page.tsx has 9,548 lines.
    src/app/events/[id]/schedule/schedulePage/EventComplianceModal.tsx has 248 lines.
    src/app/events/[id]/schedule/schedulePage/EventBillingModals.tsx has 381 lines.
    src/app/events/[id]/schedule/schedulePage/EventParticipantModals.tsx has 457 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

After extracting `schedulePage/RentalCheckoutModals.tsx`, `schedulePage/CreateEventScheduleView.tsx`, and `schedulePage/useEventBilling.ts`:

    src/app/events/[id]/schedule/page.tsx has 8,945 lines.
    src/app/events/[id]/schedule/schedulePage/CreateEventScheduleView.tsx has 280 lines.
    src/app/events/[id]/schedule/schedulePage/RentalCheckoutModals.tsx has 164 lines.
    src/app/events/[id]/schedule/schedulePage/useEventBilling.ts has 439 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

After extracting `schedulePage/useEventParticipants.ts`:

    src/app/events/[id]/schedule/page.tsx has 7,820 lines.
    src/app/events/[id]/schedule/schedulePage/useEventParticipants.ts has 1,372 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

After extracting `schedulePage/useCreateEventFlow.ts`:

    src/app/events/[id]/schedule/page.tsx has 6,705 lines.
    src/app/events/[id]/schedule/schedulePage/useCreateEventFlow.ts has 1,422 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

After extracting `schedulePage/EventScheduleHeader.tsx`:

    src/app/events/[id]/schedule/page.tsx has 6,526 lines.
    src/app/events/[id]/schedule/schedulePage/EventScheduleHeader.tsx has 417 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

After extracting `schedulePage/EventMatchModals.tsx`, `schedulePage/useEventMatchOperations.ts`, and pure bracket helpers in `schedulePage/helpers.ts`:

    src/app/events/[id]/schedule/page.tsx has 6,051 lines.
    src/app/events/[id]/schedule/schedulePage/EventMatchModals.tsx has 105 lines.
    src/app/events/[id]/schedule/schedulePage/useEventMatchOperations.ts has 562 lines.
    src/app/events/[id]/schedule/schedulePage/helpers.ts has 1,168 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

After extracting `schedulePage/useMatchConflictAlerts.ts` and `schedulePage/useEventMatchRealtime.ts`:

    src/app/events/[id]/schedule/page.tsx has 5,808 lines.
    src/app/events/[id]/schedule/schedulePage/useMatchConflictAlerts.ts has 105 lines.
    src/app/events/[id]/schedule/schedulePage/useEventMatchRealtime.ts has 235 lines.
    npx tsc --noEmit passed.
    git diff --check passed.
    npx jest --runTestsByPath 'src/app/events/[id]/schedule/__tests__/page.test.tsx' --runInBand --silent passed with 67 tests.

This section should be updated with concise transcripts after validation runs.

## Interfaces and Dependencies

New modules should live under `src/app/events/[id]/schedule/schedulePage/` unless a more specific existing folder already owns the extracted logic. Components should be named with the `EventSchedule` or `SchedulePage` prefix when the name would otherwise be ambiguous.

Extracted components should use ordinary TypeScript prop types exported from their file only when another file needs to refer to the prop type. Helper types shared by multiple extracted modules should live in `schedulePage/helpers.ts` or a future `schedulePage/types.ts`.

React components must be defined at module scope, not inside `EventScheduleContent`, so React does not remount them on every render. Hooks should be split by dependency boundary rather than combining unrelated effects or memoized computations into a single large hook.
