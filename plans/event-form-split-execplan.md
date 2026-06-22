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
  - [x] (2026-06-22T19:40Z) Extracted event-type rule predicates and coordinate helpers into shared pure modules as a prerequisite to schema extraction.
  - [x] (2026-06-22T19:45Z) Extracted slot overlap validation into `slotValidation.ts` so schema extraction can import slot errors without depending on `EventForm`.
  - [x] (2026-06-22T19:51Z) Extracted the Zod event form schema into `eventForm/schema.ts` while leaving default construction in `EventForm`.
  - [x] (2026-06-22T19:55Z) Extracted reusable field sanitization and event-location default helpers into `eventForm/fieldDefaults.ts`.
  - [x] (2026-06-22T20:00Z) Extracted default resource/field selection state into `buildDefaultFieldState`.
  - [x] (2026-06-22T20:05Z) Extracted default schedule slot construction into `buildDefaultSlotForms`.
  - [x] (2026-06-22T20:16Z) Extracted reusable league and tournament config default helpers into `eventForm/configDefaults.ts`.
  - [x] (2026-06-22T20:19Z) Extracted default league, tournament, and playoff config calculation calls from `buildDefaultFormValues`.
  - [x] (2026-06-22T20:24Z) Extracted payment-plan and installment normalization helpers into `eventForm/paymentPlanHelpers.ts`.
  - [x] (2026-06-22T20:28Z) Extracted boolean normalization plus staff user label/search helpers into existing shared modules.
  - [x] (2026-06-22T20:30Z) Extracted match-rules override sanitization into `eventForm/matchRulesHelpers.ts`.
  - [x] (2026-06-22T20:34Z) Extracted flattened validation error helpers into `eventForm/validationErrors.ts`.
  - [x] (2026-06-22T20:38Z) Extracted league/tournament config and league-slot equality helpers into `eventForm/formEquality.ts`.
  - [x] (2026-06-22T20:42Z) Extracted form datetime formatting and pool-team count helpers.
  - [x] (2026-06-22T20:48Z) Extracted external slot-conflict detection and auto-resolve helpers into `eventForm/slotConflictHelpers.ts`.
  - [x] (2026-06-22T20:55Z) Extracted persisted division and playoff-division entry normalization into `eventForm/divisionForm.ts`.
  - [x] (2026-06-22T21:10Z) Extracted shared `EventFormState` and `EventFormValues` types into `eventForm/formTypes.ts` and pointed section props at that type module.
  - [x] (2026-06-22T21:21Z) Extracted event payload-to-form-state hydration into `eventForm/eventStateMapping.ts`.
  - [x] (2026-06-22T21:32Z) Extracted immutable event default overlays into `eventForm/immutableDefaults.ts`.
  - [x] (2026-06-22T21:40Z) Moved league slot form construction into `eventForm/slotForm.ts`.
  - [x] (2026-06-22T21:50Z) Extracted create/edit default value assembly into `eventForm/defaultValues.ts`.
- [x] (2026-06-22T07:02Z) Extracted leaf UI components that already existed inside `EventForm.tsx`: `FacilityResourceSelector`, `AnimatedSection`, and `AnimatedLayoutSection`.
- [x] (2026-06-22T07:25Z) Added focused unit tests for extracted pure helpers while keeping the existing `EventForm.test.tsx` integration coverage in place.
- [x] Extract major JSX sections into section components with explicit props and no new shared context.
  - [x] (2026-06-22T07:48Z) Extracted `LeagueScoringConfigSection` as the first section component.
  - [x] (2026-06-22T08:14Z) Extracted `MatchRulesConfigSection` while keeping match-rules mutation logic in `EventForm`.
  - [x] (2026-06-22T08:34Z) Extracted `RegistrationQuestionsSection` with explicit draft update callbacks.
  - [x] (2026-06-22T09:02Z) Extracted `BasicInformationSection` with typed form props.
  - [x] (2026-06-22T09:24Z) Extracted the repeated desktop/mobile section navigation into `SectionNavigation`.
  - [x] (2026-06-22T09:46Z) Extracted the Event Details resource selector and local resource names block into `EventDetailsResourceControls`.
  - [x] (2026-06-22T10:08Z) Extracted the Event Details location, documents, age, registration questions slot, and capacity warning block into `EventDetailsLocationControls`.
  - [x] (2026-06-22T10:31Z) Extracted the Event Details start/end, cutoff, and refund timing controls into `EventDetailsTimingControls`.
  - [x] (2026-06-22T10:52Z) Extracted the Event Details event type, playoff/pool toggle, team size, and team mode controls into `EventDetailsTypeControls`.
  - [x] (2026-06-22T11:08Z) Extracted the Event Details section shell into `EventDetailsSection`.
  - [x] (2026-06-22T11:25Z) Extracted the Staff section shell into `StaffSection`.
  - [x] (2026-06-22T11:44Z) Extracted the Divisions section shell into `DivisionSettingsSection`.
  - [x] (2026-06-22T12:03Z) Extracted the Schedule section shell into `ScheduleConfigSection`.
  - [x] (2026-06-22T17:24Z) Extracted the Schedule section body into `ScheduleConfigBody`.
  - [x] (2026-06-22T17:30Z) Extracted the Divisions mode switches into `DivisionModeControls`.
  - [x] (2026-06-22T17:36Z) Extracted single-division tournament pool controls into `SingleDivisionPoolControls`.
  - [x] (2026-06-22T17:45Z) Extracted single-division pricing and tax controls into `SingleDivisionPricingControls`.
  - [x] (2026-06-22T17:57Z) Extracted single-division payment plan controls into `SingleDivisionPaymentPlanControls`.
  - [x] (2026-06-22T18:03Z) Extracted division-editor payment plan controls into `DivisionEditorPaymentPlanControls`.
  - [x] (2026-06-22T18:08Z) Extracted division-editor core fields into `DivisionEditorCoreControls`.
  - [x] (2026-06-22T18:13Z) Extracted division-editor tournament pool controls into `DivisionEditorTournamentPoolControls`.
  - [x] (2026-06-22T18:18Z) Extracted division-editor league/playoff config controls into `DivisionEditorLeagueConfigControls`.
  - [x] (2026-06-22T18:24Z) Extracted division-editor playoff placement mapping into `DivisionEditorPlayoffPlacementControls`.
  - [x] (2026-06-22T18:32Z) Extracted division-editor tournament config controls into `DivisionEditorTournamentConfigControls`.
  - [x] (2026-06-22T18:34Z) Extracted playoff-division editor controls into `DivisionEditorPlayoffDivisionControls`.
  - [x] (2026-06-22T18:36Z) Extracted division-editor actions and errors into `DivisionEditorActionsAndErrors`.
  - [x] (2026-06-22T18:38Z) Extracted division summary cards into `DivisionSummaryList`.
  - [x] (2026-06-22T18:42Z) Extracted staff official-position editor into `StaffOfficialPositionEditor`.
  - [x] (2026-06-22T18:45Z) Extracted organization staff roster picker into `StaffOrganizationRosterPicker`.
  - [x] (2026-06-22T18:49Z) Extracted non-organization staff search and invite UI into `StaffNonOrganizationInvitePanel`.
  - [x] (2026-06-22T18:52Z) Extracted assigned officials list into `StaffAssignedOfficialsList`.
  - [x] (2026-06-22T18:59Z) Extracted assigned host-side staff list into `StaffAssignedHostsList`.
- [x] Extract stateful hooks only after section props reveal stable boundaries.
  - [x] (2026-06-22T19:08Z) Extracted registration question draft loading into `useRegistrationQuestionDrafts`.
  - [x] (2026-06-22T19:12Z) Extracted section navigation and collapse state into `useEventFormSectionNavigation`.
  - [x] (2026-06-22T19:16Z) Extracted template document loading and row normalization into `useTemplateDocuments`.
  - [x] (2026-06-22T19:21Z) Extracted rental booking resource loading and rental-field merging into `useRentalBookingResources`.
  - [x] (2026-06-22T19:26Z) Extracted organization field hydration and loading state into `useOrganizationFieldHydration`.
- [x] (2026-06-22T19:30Z) Completed the stable hook extraction pass. Larger form-state hooks remain intentionally deferred until schema/default helpers are separated further.
- [x] (2026-06-22T22:04Z) Extracted organization staff roster and assignment ID derivation into `eventForm/staffInvites.ts`.
- [x] (2026-06-22T22:08Z) Extracted assigned staff display card assembly into `eventForm/staffInvites.ts`.
- [x] (2026-06-22T22:14Z) Extracted staff invite submission payload construction into `eventForm/staffInvites.ts`.
- [x] (2026-06-22T22:20Z) Extracted staff invite lookup and assigned-staff ID derivation into `eventForm/staffInvites.ts`.
- [x] (2026-06-22T22:25Z) Extracted official staffing coverage counts and error-message construction into `eventForm/officials.ts`.
- [x] (2026-06-22T22:31Z) Extracted mobile edit unsupported reason and warning construction into `eventForm/paymentPlanHelpers.ts`.
- [x] (2026-06-22T22:40Z) Extracted organization staff user maps and host staff ID derivation into `eventForm/staffInvites.ts`.
- [x] (2026-06-22T22:45Z) Extracted schedule warning/error message construction into `eventForm/scheduleMessages.ts`.
- [x] (2026-06-22T22:50Z) Extracted EventForm section navigation item construction into `eventForm/components/SectionNavigation.tsx`.
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
- Observation: Rental slot helper tests should use local datetime strings when asserting local slot minute math.
  Evidence: A first fixture used a `Z` timestamp and correctly flowed through `parseLocalDateTime` as UTC before local conversion, which shifted the expected start/end minutes.
- Observation: Schema/default extraction is still coupled after the first stable hook pass.
  Evidence: `buildEventFormSchema` still validates through slot conflicts, rental mismatch errors, organization/local resource counts, division coverage, and playoff/pool placement rules. `buildDefaultFormValues` still depends on active event state, immutable defaults, sports hydration, organization/rental fields, and local field sanitization.
- Observation: Moving the schema module drops `EventForm.tsx` below 10,000 lines before default extraction.
  Evidence: `wc -l src/app/events/[id]/schedule/components/EventForm.tsx` reported 9,908 lines after the schema move.

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
- Decision: Start section extraction with League Scoring Config.
  Rationale: It is a complete visual section with a small explicit prop surface, which makes it a low-risk first section move before tackling Event Details, Officials, Divisions, or Schedule.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract Match Rules as a wrapper section but keep update logic in `EventForm`.
  Rationale: The card shell and `MatchRulesSection` render path have a stable prop surface, while the update logic still coordinates league/tournament timing side effects that belong with the form state for now.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract Registration Questions with callbacks instead of passing the state setter through.
  Rationale: Explicit add, prompt, required, and remove callbacks keep mutation rules in `EventForm` while allowing the repeated editor UI to move into a section component.
  Date/Author: 2026-06-22 / Codex
- Decision: Export `EventFormValues` as a type-only contract for section components.
  Rationale: Basic Information needs `react-hook-form` control, errors, and `setValue` types. Exporting the type keeps the section typed without moving schema/default logic prematurely.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract section navigation before another large form body section.
  Rationale: The remaining Event Details, Officials, Division Settings, and Schedule sections have large prop surfaces. The section navigation had stable props, duplicated desktop/mobile item mapping, and could be moved without altering form state ownership.
  Date/Author: 2026-06-22 / Codex
- Decision: Split the Event Details resource controls before extracting the whole Event Details section.
  Rationale: Event Details still coordinates event type, dates, documents, location, age limits, organization resources, rental-backed resources, and local resource names. Moving the resource block first keeps resource/rental behavior isolated while avoiding a single oversized section extraction.
  Date/Author: 2026-06-22 / Codex
- Decision: Continue splitting Event Details by cohesive lower-page subsections.
  Rationale: The location, required documents, age limits, registration question editor slot, and capacity warning share layout but do not own event type or schedule mutation rules. Extracting them keeps the parent in charge of form state while reducing the remaining Event Details JSX.
  Date/Author: 2026-06-22 / Codex
- Decision: Keep timing mutation side effects in `EventForm` while extracting the timing controls.
  Rationale: The start/end and no-fixed-end controls need to update multiple form fields and enforce minimum end behavior. Passing explicit callbacks lets the UI move out while the parent remains responsible for form-wide date side effects.
  Date/Author: 2026-06-22 / Codex
- Decision: Keep event-type transition side effects in `EventForm` while extracting the event type/team controls.
  Rationale: Changing event type resets slot errors and toggles team, division, no-fixed-end, and minimum-end state. The extracted control component owns rendering, while `EventForm` still owns those form-wide side effects through callbacks.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract the Event Details shell after its subsections were isolated.
  Rationale: Moving only the Paper, header, collapse behavior, and content slot keeps the section component small while avoiding another broad prop pass. `EventForm` still composes the Event Details subsections and owns their side effects.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract the Staff section shell before splitting staff workflows.
  Rationale: The staff body still contains several intertwined workflows for official staffing, organization roster assignment, invite staging, and assigned staff cards. Moving only the repeated section wrapper reduces `EventForm` without changing staff state boundaries.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract the Divisions section shell before splitting the division editor.
  Rationale: The division body is still the largest nested editor surface and coordinates single/multi division, playoff split, division forms, payment settings, and slot controls. Moving only the wrapper keeps the behavior surface unchanged while reducing repeated section chrome.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract the Schedule section shell before splitting schedule controls.
  Rationale: The schedule body still coordinates rental-only messaging, weekly-child resources, and editable league slots. Moving the repeated visible/collapsible section chrome keeps scheduling behavior in place while making the wrapper reusable.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract the Schedule body before moving scheduling state.
  Rationale: The body has a stable prop boundary around rental schedule messaging, weekly child resource selection, and `LeagueFields`. Keeping slot mutation callbacks in `EventForm` preserves the existing scheduling state ownership while removing the repeated JSX from the parent.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division mode switches before the larger division editor.
  Rationale: The single-division, registration-by-division-type, and split-playoff switches have a compact form-control boundary and repeat no editor-specific state. Moving them first reduces Divisions JSX while leaving the larger division editor workflow untouched.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract single-division tournament pool controls as a small Divisions subsection.
  Rationale: Bracket teams, pool count, and derived pool team count share one display condition and one mutation callback. Moving them together reduces inline Divisions JSX without moving tournament pool default state.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract single-division pricing and tax controls without moving billing state.
  Rationale: Price entry, fee preview, tax handling, manual tax rate, and Stripe connection UI form one cohesive single-division subsection. Passing explicit props keeps payment and tax policy state ownership in `EventForm` while reducing inline JSX.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract single-division payment plan controls without moving installment state.
  Rationale: The payment plan toggle, installment count, due-date editors, amount editors, and installment total are one cohesive subsection. Passing callbacks keeps the existing payment-plan mutation behavior in `EventForm` while reducing the Divisions render body.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division-editor payment plan controls separately from the division editor state.
  Rationale: The division payment-plan card mirrors the event-level payment-plan workflow but mutates `divisionEditor`. Moving the UI behind callbacks reduces the editor body without prematurely introducing a shared payment-plan abstraction.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division-editor core fields without moving editor selection logic.
  Rationale: Gender, skill, age, name, capacity, and direct price controls form the first visible editor row group. Passing explicit callbacks keeps selection normalization and editor state ownership in `EventForm` while reducing inline editor JSX.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division-editor tournament pool controls as a small subsection.
  Rationale: Bracket teams, pool count, and derived pool team count are displayed together and share the same visibility condition. Keeping derived pool calculations in `EventForm` preserves existing editor state ownership while reducing inline JSX.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division-editor league/playoff config controls without moving placement mapping.
  Rationale: League settings, playoff team count, and playoff configuration share the same editor state callbacks and can move as a UI-only group. Placement mapping has a separate select-options dependency, so it should remain in `EventForm` until it can be extracted independently.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division-editor playoff placement mapping while keeping mapping mutation in `EventForm`.
  Rationale: Placement mapping has a compact visual boundary and a dedicated playoff-division option set. Passing normalized placement IDs and an indexed callback preserves the existing normalization and editor state ownership.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division-editor tournament config controls as a UI-only group.
  Rationale: Pool scoring settings and tournament configuration share the same tournament-only visibility area and stable callbacks. Passing normalized tournament config from `EventForm` avoids moving config normalization yet.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract playoff-division editor controls without moving playoff normalization.
  Rationale: Playoff division name, count, and tournament config fields form a compact editor branch. The parent still owns count normalization and tournament config mutation so behavior remains unchanged.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division-editor actions and errors as a plain footer.
  Rationale: Save/cancel controls and validation text have no local state needs. Passing strings and flags keeps form validation ownership in `EventForm` while reducing JSX noise.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract division summary cards as a display component while passing existing normalizers.
  Rationale: League and playoff division cards are display-heavy and use stable edit/remove callbacks. Passing existing pool-team and tournament-config helpers avoids moving normalization behavior in this JSX-only step.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract staff official-position editor without moving scheduling-mode normalization.
  Rationale: The official scheduling mode and event-specific position rows form a cohesive staff card. `EventForm` still owns mode normalization and position mutations.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract organization staff roster picker while preserving roster filtering state in `EventForm`.
  Rationale: The roster picker is a display and selection card with stable filter props and assignment callbacks. `EventForm` still owns filter state, pagination state, and assignment mutations.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract non-organization staff search and invite UI with draft callbacks.
  Rationale: Existing-user search and email-invite staging are display-heavy but still depend on form-level assignment and pending-invite state. Explicit callbacks keep those mutations in `EventForm`.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract assigned officials list while keeping draft-removal logic in `EventForm`.
  Rationale: The officials card owns display and eligibility controls, but removing draft invite roles still mutates shared pending invite state. A card-level remove callback keeps that logic in the parent.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract assigned host-side staff list while keeping draft-removal logic in `EventForm`.
  Rationale: The host staff list mirrors the assigned officials list visually, but assistant-host draft removal still updates shared pending invite state. A card-level remove callback keeps that mutation boundary explicit.
  Date/Author: 2026-06-22 / Codex
- Decision: Start hook extraction with registration-question drafts.
  Rationale: The loading state and event fetch effect are isolated from the rest of the form, while the existing editor callbacks can keep mutating the returned draft list through the hook setter.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract section navigation state as a UI-only hook.
  Rationale: Active section tracking, collapse state, scroll targeting, and field-name collapse are independent from form data. Passing the existing item list, collapse defaults, and scroll offset keeps the hook behavior-compatible without moving constants in the same step.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract template loading with its row normalization.
  Rationale: Template document fetch state and API row mapping are only used to build required-document selector options. Moving both into one hook removes a direct normalization concern from `EventForm` without changing selector props.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract rental booking resource loading while keeping selection reconciliation in `EventForm`.
  Rationale: The booking API fetch and rental field merge are a cohesive async state boundary. The downstream rules that reconcile selected resources, local field counts, and time slots still coordinate broader form state and should remain in the parent for now.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract organization field hydration while keeping field sanitization local.
  Rationale: Fetching organization fields and tracking `fieldsLoading` is a cohesive async boundary. The field sanitizer is still shared by many local default/build paths, so the hook accepts it as a parameter until helper extraction can move that logic safely.
  Date/Author: 2026-06-22 / Codex
- Decision: Defer larger state hooks until schema/default extraction is narrowed.
  Rationale: Remaining state clusters such as division editor state, dirty tracking, and draft building are still entangled with schema/default helpers. Extracting them now would either create very large prop surfaces or move validation/default behavior at the same time.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract shared event-rule and location helpers before moving the schema.
  Rationale: The schema and default builder both depend on event-type predicates and coordinate checks, and rendering also uses the same helpers. Moving those first reduces the next schema extraction diff without changing validation behavior.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract slot validation before moving the schema.
  Rationale: `buildEventFormSchema` and schedule state normalization both depend on slot overlap and error logic. Moving it as a pure helper keeps the schema move smaller and preserves `EventForm` ownership of side effects.
  Date/Author: 2026-06-22 / Codex
- Decision: Move the Zod schema before default-building helpers.
  Rationale: After event rules, location checks, and slot validation were extracted, the schema no longer depended on React state. Default construction still depends on active event state, immutable defaults, sports hydration, and local sanitizer functions, so it should remain local until those dependencies are narrowed.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract field default helpers before moving default construction.
  Rationale: `buildDefaultFormValues`, organization field hydration, field-count sync, and draft serialization all share field sanitization and event-location fallback behavior. Moving those pure helpers first reduces repeated dependencies without changing form reset behavior.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract default field state separately from full form defaults.
  Rationale: The full default builder still coordinates divisions, slots, league config, tournament config, immutable defaults, and sports hydration. The default field/resource selection portion has a clear data-only boundary and carries the most organization/rental branching, so extracting it first lowers the risk of the later default-builder move.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract default slot construction without moving live slot-reset paths.
  Rationale: Default form construction has a distinct immutable/editing/fallback slot flow, while edit-mode slot reset code still coordinates current form state and refs. Moving only the default construction branch keeps the extraction narrow.
  Date/Author: 2026-06-22 / Codex
- Decision: Move reusable league and tournament config normalizers before the remaining full default-builder extraction.
  Rationale: These helpers are used by default construction, division normalization, editor updates, and draft serialization. Moving the shared helpers first keeps the final default-builder extraction smaller while preserving existing call sites.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract default config calculation as calls instead of moving the full default builder.
  Rationale: `buildDefaultFormValues` still owns form reset orchestration, immutable default application, sport hydration, division defaults, and slot creation. Moving just league/tournament/playoff config calculations keeps behavior stable and leaves the remaining builder easier to split later.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract payment-plan helpers before moving more default/draft code.
  Rationale: Installment normalization is used by default hydration, division normalization, mobile edit warnings, editor updates, and draft serialization. Keeping those helpers shared narrows future default/draft extraction without changing payment behavior.
  Date/Author: 2026-06-22 / Codex
- Decision: Move small shared normalizers into existing helper modules instead of creating another module.
  Rationale: Boolean normalization belongs with other shared pure helpers, while user label/search formatting belongs with staff invite and roster helpers. Reusing those homes avoids creating a miscellaneous helper file.
  Date/Author: 2026-06-22 / Codex
- Decision: Keep match-rules override sanitization in a dedicated helper.
  Rationale: The sanitizer is shared by event hydration, immutable default application, and editor updates. A dedicated match-rules helper keeps that behavior reusable without tying it to the section component.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract validation-error flattening separately from schema validation.
  Rationale: Error flattening is used by the validation reporting path and no longer needs to live next to render logic. Moving it separately keeps the larger submit/save workflow untouched.
  Date/Author: 2026-06-22 / Codex
- Decision: Move equality comparisons into a dedicated form helper.
  Rationale: Config and slot equality checks are reused across form reset, editor update, and conflict reconciliation paths. Keeping them in one helper module preserves those checks while trimming parent orchestration code.
  Date/Author: 2026-06-22 / Codex
- Decision: Split date formatting and pool-team derivation without moving broader scheduling logic.
  Rationale: The datetime formatter and pool-team count calculation are pure helpers used by default hydration and editor display. Moving them separately avoids mixing simple value helpers with the larger slot-conflict workflow.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract external slot-conflict logic while keeping conflict effects in `EventForm`.
  Rationale: Overlap detection, conflict entry construction, and auto-resolve suggestions are pure data logic. The parent still owns the async field-event fetch, state updates, and user-triggered auto-resolve action.
  Date/Author: 2026-06-22 / Codex
- Decision: Move persisted division entry normalizers into `divisionForm.ts`.
  Rationale: Event/default hydration still depends on division normalization, but the normalization itself belongs with division form types, age cutoff logic, and slot division helpers. Moving it first narrows the later event mapper extraction.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract form value types before moving the event mapper.
  Rationale: Section components and the parent were importing form value types from `EventForm.tsx`, which kept UI components coupled to the orchestrator. A shared type module gives the remaining mapper/default extraction a stable type boundary.
  Date/Author: 2026-06-22 / Codex
- Decision: Move event hydration as a pure mapper before moving the full default builder.
  Rationale: `mapEventToFormState` is a large pure transformation with no React state dependency. Extracting it removes the persisted-event normalization branch from the orchestrator while keeping create-mode defaults and live form effects local for the next smaller slices.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract immutable default overlays separately from create-mode default construction.
  Rationale: Immutable defaults are a pure overlay once provided the current form state, immutable defaults, and sport catalog. Keeping this separate lets the default builder stay local while removing a large normalization block from the orchestrator.
  Date/Author: 2026-06-22 / Codex
- Decision: Move slot form construction into the slot helper module.
  Rationale: `createSlotForm` is used by defaults and later schedule mutations, but it only builds the `LeagueSlotForm` shape from slot inputs. Keeping it in `slotForm.ts` makes all slot form construction share the same helper without introducing new state.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract default value assembly as an option-driven helper.
  Rationale: After event hydration, immutable overlays, field defaults, config defaults, and slot construction were separated, the remaining default builder could be moved behind explicit inputs. The parent still owns the reset timing and dirty-tracking effects.
  Date/Author: 2026-06-22 / Codex
- Decision: Move organization staff roster derivation into staff helpers before extracting staff workflow state.
  Rationale: Roster rows, allowed host/official IDs, and roster filters are pure transforms of organization data and UI filters. Moving them into `staffInvites.ts` reduces the staff section's inline data shaping while keeping assignment mutations in `EventForm`.
  Date/Author: 2026-06-22 / Codex
- Decision: Move assigned staff card assembly into staff helpers.
  Rationale: Assigned official and host cards are display-only transforms of assignment IDs, lookup maps, invite state, and pending draft invites. Keeping them in `staffInvites.ts` trims staff render data shaping while `EventForm` still owns mutations.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract staff invite submission payload construction but keep submit side effects in `EventForm`.
  Rationale: The payload builder is a pure transform of assigned staff IDs, pending email invites, invite membership lookup results, and existing invite state. The callback still owns validation, API calls, user hydration, stale invite deletion, and form-state cleanup.
  Date/Author: 2026-06-22 / Codex
- Decision: Extract staff invite lookup and assigned ID derivations into staff helpers.
  Rationale: Current event staff invite filtering, invite-by-user maps, existing assignment IDs, and role-based assigned ID sets are pure normalization mechanics. Moving them keeps staff actions in `EventForm` while reducing local map/set construction.
  Date/Author: 2026-06-22 / Codex
- Decision: Move official staffing coverage calculations into official helpers.
  Rationale: Required official counts, active assigned coverage, and the STAFFING validation message are pure official-domain derivations. Keeping them in `officials.ts` trims the staff workflow area without changing validation ownership in `EventForm`.
  Date/Author: 2026-06-22 / Codex
- Decision: Move mobile edit unsupported warning construction into payment-plan helpers.
  Rationale: The warning is a pure result of split-playoff state and payment-plan/installment config across event, division, and editor drafts. Keeping it near payment-plan helpers avoids duplicating mobile support rules in the parent component.
  Date/Author: 2026-06-22 / Codex
- Decision: Move organization staff user-map and host-ID derivation into staff helpers.
  Rationale: Organization user maps, allowed official maps, assistant-host IDs, host staff IDs, and user-by-ID maps are pure staff data-shaping operations. Moving them keeps EventForm focused on state and handler orchestration.
  Date/Author: 2026-06-22 / Codex
- Decision: Move schedule warning and error message construction into a dedicated helper.
  Rationale: League schedule warning/error text is a pure presentation derivation from conflict state and validation error shape. A small `scheduleMessages.ts` module keeps message text out of the parent without mixing it into validation or conflict helper internals.
  Date/Author: 2026-06-22 / Codex
- Decision: Keep section navigation item construction with the SectionNavigation component.
  Rationale: The nav item list is display metadata derived from section visibility flags. Keeping the builder next to `SectionNavigation` centralizes section labels and keeps EventForm from owning presentation-only item shape.
  Date/Author: 2026-06-22 / Codex

## Outcomes & Retrospective

The first helper extraction landed with no TypeScript or focused EventForm test regression. The leaf component extraction also landed cleanly. The helper test milestone now covers rental booking mapping and locked slots, resource grouping, slot normalization, staff invite normalization, official normalization, and division helper behavior. Slot overlap/error logic now lives in a pure helper module that can be shared by the schema and schedule state normalization. The Zod validation schema now lives outside the parent component, and field/slot/config default helpers are separated from the default builder. League, tournament, playoff, payment-plan, shared boolean, staff label/search, match-rules sanitizer, validation-error flattening, form equality, date formatting, pool-team, external conflict, persisted division-normalization helper calls, the shared form value type contract, persisted event-to-form hydration, immutable default overlays, slot form construction, default value assembly, organization staff roster derivation, assigned staff display card assembly, staff invite submission payload construction, staff invite lookup/assigned-ID derivation, official staffing coverage derivation, mobile edit warning derivation, organization staff user-map/host-ID derivation, schedule warning/error message construction, and section navigation item construction now live outside `EventForm`. The expected final outcome remains a much smaller `EventForm.tsx` that coordinates smaller modules, with no regression in event create/edit behavior.

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
- 2026-06-22 / Codex: Extracted section navigation as a small UI checkpoint before continuing into the remaining larger sections.
- 2026-06-22 / Codex: Extracted Event Details resource controls as the first smaller split from the still-large Event Details section.
- 2026-06-22 / Codex: Extracted Event Details location/document/age controls as a second smaller split from Event Details.
- 2026-06-22 / Codex: Extracted Event Details timing controls while leaving multi-field date side effects in `EventForm`.
- 2026-06-22 / Codex: Extracted Event Details type/team controls while leaving event-type transition side effects in `EventForm`.
- 2026-06-22 / Codex: Extracted the Event Details section shell after the subsection controls were split out.
- 2026-06-22 / Codex: Extracted the Staff section shell while leaving the staff workflow body in `EventForm`.
- 2026-06-22 / Codex: Extracted the Divisions section shell while leaving the division editor body in `EventForm`.
- 2026-06-22 / Codex: Extracted the Schedule section shell while leaving scheduling controls in `EventForm`.
- 2026-06-22 / Codex: Extracted the Schedule section body while leaving schedule state and mutation callbacks in `EventForm`.
- 2026-06-22 / Codex: Extracted the Divisions mode switches while leaving the larger division editor state in `EventForm`.
- 2026-06-22 / Codex: Extracted single-division tournament pool controls while leaving tournament pool defaults in `EventForm`.
- 2026-06-22 / Codex: Extracted single-division pricing and tax controls while leaving billing and tax policy state in `EventForm`.
- 2026-06-22 / Codex: Extracted single-division payment plan controls while leaving installment state and mutations in `EventForm`.
- 2026-06-22 / Codex: Extracted division-editor payment plan controls while leaving division installment state and mutations in `EventForm`.
- 2026-06-22 / Codex: Extracted division-editor core fields while leaving editor state and normalization in `EventForm`.
- 2026-06-22 / Codex: Extracted division-editor tournament pool controls while leaving derived pool state in `EventForm`.
- 2026-06-22 / Codex: Extracted division-editor league/playoff config controls while leaving placement mapping and editor state in `EventForm`.
- 2026-06-22 / Codex: Extracted division-editor playoff placement mapping while leaving normalized mapping mutation in `EventForm`.
- 2026-06-22 / Codex: Extracted division-editor tournament config controls while leaving config normalization and mutation in `EventForm`.
- 2026-06-22 / Codex: Extracted playoff-division editor controls while leaving count normalization and editor state in `EventForm`.
- 2026-06-22 / Codex: Extracted division-editor actions and validation messages into a plain footer component.
- 2026-06-22 / Codex: Extracted division summary cards while leaving edit/remove mutations and normalizers in `EventForm`.
- 2026-06-22 / Codex: Extracted staff official-position editor while leaving scheduling-mode normalization and position mutations in `EventForm`.
- 2026-06-22 / Codex: Extracted organization staff roster picker while leaving filters, pagination, and assignment mutations in `EventForm`.
- 2026-06-22 / Codex: Extracted non-organization staff search and invite UI while leaving search and invite draft state in `EventForm`.
- 2026-06-22 / Codex: Extracted assigned officials list while leaving pending invite role removal and eligibility mutation in `EventForm`.
- 2026-06-22 / Codex: Extracted assigned host-side staff list while leaving pending invite role removal in `EventForm`.
- 2026-06-22 / Codex: Extracted registration question draft loading into `useRegistrationQuestionDrafts` while preserving existing editor callbacks in `EventForm`.
- 2026-06-22 / Codex: Extracted section navigation and collapse state into `useEventFormSectionNavigation`.
- 2026-06-22 / Codex: Extracted template document loading and row normalization into `useTemplateDocuments`.
- 2026-06-22 / Codex: Extracted rental booking resource loading and rental-field merging into `useRentalBookingResources`.
- 2026-06-22 / Codex: Extracted organization field hydration and loading state into `useOrganizationFieldHydration`.
- 2026-06-22 / Codex: Completed the stable hook extraction pass and deferred larger form-state hooks until schema/default helpers can be separated with a narrower behavior surface.
- 2026-06-22 / Codex: Extracted shared event-rule predicates and coordinate helpers as a prerequisite to moving form schema/default logic.
- 2026-06-22 / Codex: Added focused helper tests for the extracted pure modules and kept the existing EventForm integration suite passing.
- 2026-06-22 / Codex: Started section extraction by moving League Scoring Config into `eventForm/sections/LeagueScoringConfigSection.tsx`.
- 2026-06-22 / Codex: Extracted Match Rules into `eventForm/sections/MatchRulesConfigSection.tsx` and added a named match-rules change handler in `EventForm`.
- 2026-06-22 / Codex: Extracted Registration Questions into `eventForm/sections/RegistrationQuestionsSection.tsx`.
- 2026-06-22 / Codex: Extracted Basic Information into `eventForm/sections/BasicInformationSection.tsx`.
- 2026-06-22 / Codex: Extracted shared EventForm state/value types into `eventForm/formTypes.ts` so sections no longer import types from the orchestrator component.
- 2026-06-22 / Codex: Extracted persisted event-to-form-state hydration into `eventForm/eventStateMapping.ts`.
- 2026-06-22 / Codex: Extracted immutable default overlays into `eventForm/immutableDefaults.ts`.
- 2026-06-22 / Codex: Moved league slot form construction into `eventForm/slotForm.ts`.
- 2026-06-22 / Codex: Extracted create/edit default value assembly into `eventForm/defaultValues.ts`.
- 2026-06-22 / Codex: Extracted organization staff roster and assignment ID derivation into `eventForm/staffInvites.ts`.
- 2026-06-22 / Codex: Extracted assigned official and host display card assembly into `eventForm/staffInvites.ts`.
- 2026-06-22 / Codex: Extracted staff invite submission payload construction while keeping submit side effects in `EventForm`.
- 2026-06-22 / Codex: Extracted staff invite lookup and assigned-staff ID derivation into `eventForm/staffInvites.ts`.
- 2026-06-22 / Codex: Extracted official staffing coverage counts and error-message construction into `eventForm/officials.ts`.
- 2026-06-22 / Codex: Extracted mobile edit unsupported reason and warning construction into `eventForm/paymentPlanHelpers.ts`.
- 2026-06-22 / Codex: Extracted organization staff user maps and host staff ID derivation into `eventForm/staffInvites.ts`.
- 2026-06-22 / Codex: Extracted schedule warning/error message construction into `eventForm/scheduleMessages.ts`.
- 2026-06-22 / Codex: Extracted section navigation item construction into `eventForm/components/SectionNavigation.tsx`.
