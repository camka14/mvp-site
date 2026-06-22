# Split EventForm into focused modules and components

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: maintain this plan in accordance with `PLANS.md` in the repository root.

## Purpose / Big Picture

The schedule details form is currently concentrated in one very large file, `src/app/events/[id]/schedule/components/EventForm.tsx`. That makes event creation, event editing, rental-backed resource selection, official assignment, division setup, and scheduling rules harder to change safely because unrelated concerns live side by side. After this refactor, the same user-visible event form should behave the same way, but the implementation will be split into focused helper modules, small UI components, form sections, and state hooks that can be tested and edited independently.

The visible behavior should not change as a result of this plan. A manager or player should still be able to create and edit events, choose resources or rentals, configure divisions and schedules, and save changes exactly as before. The improvement is internal: future changes to resources, rentals, officials, divisions, or schedule rules should touch smaller files with clearer responsibilities.

## Progress

- [x] (2026-06-22T05:54Z) Reviewed the current `EventForm.tsx` size and responsibilities and created this ExecPlan.
- [x] (2026-06-22T06:16Z) Extracted the first pure-helper set without changing render behavior: shared normalizers/equality, rental resource mapping and locked slots, resource grouping and field pool helpers, staff invite helpers, official normalization, dirty tracking, slot normalization, and division helpers.
- [x] (2026-06-22T06:45Z) Ran the schema/default dependency pass and confirmed those helpers should remain inline for now because they are still coupled to form-local validation and normalization.
- [ ] Extract schema and default-building helpers after the local validation/default dependencies are separated.
- [x] (2026-06-22T07:02Z) Extracted leaf UI components that already existed inside `EventForm.tsx`: `FacilityResourceSelector`, `AnimatedSection`, and `AnimatedLayoutSection`.
- [ ] Add focused unit tests for the extracted pure helpers while keeping the existing `EventForm.test.tsx` integration coverage in place.
- [ ] Extract major JSX sections into section components with explicit props and no new shared context.
- [ ] Extract stateful hooks only after section props reveal stable boundaries.
- [ ] Run focused tests, TypeScript, and browser smoke checks after each milestone.
- [ ] Update this plan after each stopping point with completed work, discoveries, and any design decisions.

## Surprises & Discoveries

- Observation: `EventForm.tsx` is approximately 14,647 lines and contains both pure data helpers and large JSX sections.
  Evidence: `wc -l src/app/events/[id]/schedule/components/EventForm.tsx` reported 14,647 lines during planning.
- Observation: The existing `plans/event-form-execplan.md` tracks the original replacement of `EventCreationSheet` with `EventForm`, not this cleanup.
  Evidence: That plan is titled "Event form replace EventCreationSheet in schedule page" and its progress is already largely complete.
- Observation: Jest treats a bracketed Next.js path as a pattern unless the path is passed through `--runTestsByPath`.
  Evidence: `npm test -- 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' --runInBand` found zero tests, while `npm test -- --runTestsByPath 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' --runInBand` ran and passed 91 tests.
- Observation: The first helper extraction reduced `EventForm.tsx` from approximately 14,647 lines to 13,333 lines.
  Evidence: `wc -l src/app/events/[id]/schedule/components/EventForm.tsx` reported 13,333 lines after the extraction.
- Observation: Schema/default extraction is still too coupled for a safe one-shot move.
  Evidence: The schema calls local slot-conflict, rental mismatch, resource-count, and division coverage validation helpers. The event default builder also shares local normalization helpers that have not yet been separated.

## Decision Log

- Decision: Create a new focused ExecPlan instead of rewriting the older `plans/event-form-execplan.md`.
  Rationale: The older plan documents a completed feature replacement. This work is a follow-up refactor with different acceptance criteria and should have its own progress history.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract pure helpers and leaf components before extracting stateful hooks.
  Rationale: Moving pure functions and self-contained components is easier to validate and less likely to alter event form behavior. Hooks should be introduced only after the natural state boundaries are clear.
  Date/Author: 2026-06-22 / Codex
- Decision: Keep `EventForm.tsx` as the orchestrator until the end of the refactor.
  Rationale: The parent schedule page already depends on the `EventForm` API. Keeping the top-level component stable reduces integration risk while internals move into smaller files.
  Date/Author: 2026-06-22 / Codex
- Decision: Defer schema and default extraction from the first helper pass.
  Rationale: The schema currently depends on form-local slot validation, rental mismatch, resource-count, and division coverage helpers. The default builder still sits near event-normalization functions. Moving those now would create a larger behavior-change surface than the pure helper extraction needs.
  Date/Author: 2026-06-22 / Codex
- Decision: Move leaf UI components before schema/default helpers.
  Rationale: `FacilityResourceSelector` and the animation wrappers already had stable prop boundaries. Extracting them reduces the file size and creates reusable component homes while avoiding the higher-risk validation/default dependency knot.
  Date/Author: 2026-06-22 / Codex

## Outcomes & Retrospective

The first helper extraction landed with no TypeScript or focused EventForm test regression. The expected final outcome remains a much smaller `EventForm.tsx` that coordinates smaller modules, with no regression in event create/edit behavior.

## Context and Orientation

The main file for this work is `src/app/events/[id]/schedule/components/EventForm.tsx`. It exports the `EventForm` component used by the event schedule details page. The file currently includes several kinds of code:

Pure helpers are functions that transform data without rendering UI or reading React state. Examples include rental booking option mapping, resource grouping, time slot construction, staff invite normalization, division normalization, default value building, and validation schema construction.

Leaf UI components are small React components that can render from props without owning the whole form. `FacilityResourceSelector`, `AnimatedSection`, and `AnimatedLayoutSection` are examples already declared inside `EventForm.tsx`.

Sections are large visual chunks of the form, such as Basic Information, Event Details, Officials, Division Settings, Registration Questions, and Schedule Config. They should eventually live under `src/app/events/[id]/schedule/components/eventForm/sections/`.

Stateful hooks are reusable React hooks that own a specific state workflow. Examples that may emerge later are rental resource loading, registration question management, dirty draft tracking, staff assignment state, division editor state, and slot conflict checks.

The existing broad integration test file is `src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx`. It should continue to pass throughout the refactor. New helper tests should be added next to the existing tests or under an `eventForm/__tests__` folder when helper modules are created.

## Plan of Work

First, create an `eventForm` subfolder under `src/app/events/[id]/schedule/components/`. This folder will hold the extracted modules while the exported public component remains `src/app/events/[id]/schedule/components/EventForm.tsx`. This keeps imports from parent pages stable.

Move pure data helpers before moving UI. Create `eventForm/rentalResources.ts` for rental booking types and functions such as rental selector IDs, rental option labels, rental-backed time slot construction, locked rental slot checks, and rental locked time slot merging. Create `eventForm/resourceGroups.ts` for facility/resource grouping and selector labels if those helpers are shared by resource selection and schedule sections. Create `eventForm/staffInvites.ts` for staff invite types, labels, and normalization. Create `eventForm/slotForm.ts` for time slot form row construction and normalization. Create `eventForm/divisionForm.ts` for division keys, division mapping, and division-form row helpers. Create `eventForm/schema.ts` for the event form validation schema and validation helper functions. Create `eventForm/defaults.ts` only when default-building dependencies are clear enough to move safely.

After pure helpers are isolated, move leaf components. Create `eventForm/components/FacilityResourceSelector.tsx` and move the current selector component there with its props type. If it needs helper functions, import them from the newly extracted helper modules instead of keeping duplicate logic in the component. Create `eventForm/components/AnimatedSection.tsx` and move `AnimatedSection` and `AnimatedLayoutSection`. The main `EventForm.tsx` should import these components and render exactly the same DOM structure.

After helper and leaf component extraction, add focused unit tests. The tests should cover rental option mapping, rental locked time slot construction and merging, resource grouping, staff invite normalization, division helper behavior, and slot helper behavior. These tests should prove that the moved code behaves the same after extraction. Keep the existing `EventForm.test.tsx` as the higher-level safety net.

Next, extract visual sections one at a time. Start with the section that has the smallest prop surface. Good candidates are Registration Questions, Basic Information, Event Details, Officials, Division Settings, League Scoring Config, and Schedule Config. Place these under `eventForm/sections/`. Each section should receive explicit props at first. Do not introduce a large React context just to reduce prop counts during the first pass, because explicit props show which dependencies each section actually needs.

Finally, extract stateful hooks where repetition or prop pressure makes it worthwhile. Good candidates include `useEventFormDirtyDraft`, `useRentalResourceOptions`, `useRegistrationQuestions`, `useEventStaffAssignments`, `useDivisionEditor`, and `useSlotConflictChecks`. A hook should only be created when it owns a clear workflow and can be tested or reasoned about independently.

## Concrete Steps

Work from the repository root:

    cd /Users/elesesy/.codex/worktrees/ab2e/mvp-site

Before each milestone, confirm the worktree state:

    git status --short

Milestone 1: helper extraction.

Create the `eventForm` subfolder and move pure helpers into files with named exports. Update `EventForm.tsx` imports. Do not change JSX layout or user-facing copy in this milestone. After each helper file is moved, run the focused EventForm test:

    npm test -- --runTestsByPath 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' --runInBand

Milestone 2: leaf component extraction.

Move `FacilityResourceSelector`, `AnimatedSection`, and `AnimatedLayoutSection` into `eventForm/components/`. Preserve the existing props and call sites. Run the same focused EventForm test and then TypeScript:

    npm test -- --runTestsByPath 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' --runInBand
    npx tsc --noEmit

Milestone 3: focused helper tests.

Add tests for the extracted helper modules. Prefer small tests with plain inputs and outputs. The tests should not require a browser. Run the new helper tests and the existing EventForm test.

Milestone 4: section extraction.

Move one visual section at a time into `eventForm/sections/`. After each section extraction, run the EventForm test. If a section requires too many props, do not solve that by adding context immediately. Finish the section extraction with explicit props, then record the prop pressure in `Surprises & Discoveries` and decide whether a hook is appropriate.

Milestone 5: hook extraction.

Extract stateful hooks only after the section boundaries are stable. Each hook should have one reason to exist, such as loading rental resource options or managing division editor state. Keep the top-level `EventForm` component responsible for composing hooks and passing values into sections.

Milestone 6: browser verification.

Start the build version on port 3000, or use the existing project-local start command if the build already exists:

    npm run build
    npm start -- -p 3000

In the browser, verify at least these flows:

1. Open an existing event details page in edit mode.
2. Change a normal organization-owned resource selection.
3. Select a rental-backed resource and confirm rental locking behavior still matches the current product rules.
4. Edit basic event fields and confirm validation messages still appear in the same form context.
5. Edit division and schedule settings and save.
6. Confirm there are no console errors caused by missing imports or undefined props.

## Validation and Acceptance

The refactor is accepted when `EventForm.tsx` is materially smaller, focused modules exist under `src/app/events/[id]/schedule/components/eventForm/`, and the user-visible form behavior is unchanged. The existing EventForm integration test must pass. New helper tests must pass. `npx tsc --noEmit` must pass. Browser smoke testing must show that create/edit event flows, resource selection, rental-backed resource behavior, official/staff-related form behavior, division setup, and schedule settings still work.

The refactor must not change the public `EventForm` import path or the parent schedule page API unless that change is explicitly recorded as a decision in this plan.

## Idempotence and Recovery

Each milestone should be safe to commit independently. If a helper extraction fails, revert only the moved helper file and its imports, then retry with a smaller set of functions. If a section extraction creates too many props or unclear dependencies, keep the section in `EventForm.tsx`, record the issue in `Surprises & Discoveries`, and extract a smaller subsection instead. Do not combine broad UI edits with helper extraction in the same commit.

If tests fail after a move, compare the exported helper inputs and outputs against the original inline function behavior before changing product logic. This plan is a refactor, so behavior changes should be treated as regressions unless they are explicitly approved and documented.

## Artifacts and Notes

Important current files:

- `src/app/events/[id]/schedule/components/EventForm.tsx`
- `src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx`
- `src/app/events/[id]/schedule/components/LeagueFields.tsx`
- `src/app/events/[id]/schedule/components/TournamentFields.tsx`
- `src/app/events/[id]/schedule/components/leagueScoringConfigForm.ts`

Suggested final folder shape:

    src/app/events/[id]/schedule/components/
      EventForm.tsx
      eventForm/
        types.ts
        constants.ts
        schema.ts
        defaults.ts
        rentalResources.ts
        resourceGroups.ts
        staffInvites.ts
        slotForm.ts
        divisionForm.ts
        dirtyDraft.ts
        components/
          FacilityResourceSelector.tsx
          AnimatedSection.tsx
        sections/
          BasicInformationSection.tsx
          EventDetailsSection.tsx
          RegistrationQuestionsSection.tsx
          OfficialsSection.tsx
          DivisionSettingsSection.tsx
          ScheduleConfigSection.tsx

This folder shape is a target, not a requirement to create empty files. Only create files when moving real code into them.

## Interfaces and Dependencies

The top-level `EventForm` export should remain the default export from `src/app/events/[id]/schedule/components/EventForm.tsx`. Existing props such as the event being edited, organization, current user, immutable defaults, submit callback, draft callback, and cancel/close callbacks should remain compatible with the parent schedule page.

Helper modules should export named functions and types. Avoid default exports for helper modules because named exports make moved dependencies easier to audit. Component files may export named components or default components, but the import style should stay consistent within the new `eventForm` folder.

React, `react-hook-form`, zod validation, Mantine, and the existing event schedule components remain the only dependencies needed for this refactor. Do not introduce a new state management library or form library as part of this cleanup.

## Revision Notes

- 2026-06-22 / Codex: Created this ExecPlan to track the EventForm split as a behavior-preserving refactor. The plan starts with low-risk pure helper extraction and postpones hooks/context until module boundaries are clearer.
- 2026-06-22 / Codex: Completed the first helper extraction pass and updated the Jest command to use `--runTestsByPath` for the bracketed Next.js route path. Schema and default helper extraction remain as the next part of helper cleanup.
- 2026-06-22 / Codex: Deferred schema/default extraction after a dependency pass and completed the leaf component extraction milestone instead.
