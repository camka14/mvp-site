# Reorganize the event Simple Setup wizard

This ExecPlan is a living document. Keep the sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. The implementation must proceed one milestone at a time. Complete and verify one milestone before starting the next milestone.

## Purpose / Big Picture

The event Simple Setup wizard must help a first-time organizer make correct choices without showing duplicate controls or unrelated settings. After this work, each planning choice will change a later page, each setting will have one clear owner, and the review page will show the complete event configuration before the user saves it.

The visible result will be a compact and responsive wizard. The event image will use an event-card-sized preview. Division fields will use fixed control widths inside wrapping rows. Schedule style will use descriptive choices. Fixed event windows will stay synchronized with the event date and time. Bracket team counts will remain empty until the organizer enters a valid value. Pricing, manual payment, Stripe, operations, and review behavior will match the choices made earlier in the wizard. Advanced Setup will share the corrected manual-payment contract and will identify errors on collapsed section titles.

## Progress

- [x] (2026-08-03 23:20Z) Inspected the five supplied screenshots and mapped each reported issue to the current Simple Setup source.
- [x] (2026-08-03 23:20Z) Traced planning choices through page resolution, form state, validation, persistence, scheduling, payment, staff, and match-rule code.
- [x] (2026-08-03 23:20Z) Compared web manual-payment behavior with the current `mvp-app` implementation.
- [x] (2026-08-03 23:20Z) Wrote this implementation plan without changing application code.
- [x] (2026-08-03 17:54Z) Added the provider-aware payment validation, Advanced Setup error discovery, and manual-price display requirements from the follow-up screenshot.
- [x] (2026-08-03 18:10Z) Milestone 1: Added baseline tests and corrected the wizard shell, Format page, and Basics page layout. Focused Jest suites, scoped ESLint, and `npx tsc --noEmit` pass. Browser-sized visual verification remains in Milestone 10 because no approved local runtime was active.
- [x] (2026-08-03 18:15Z) Milestone 2: Removed duplicate planning controls and changed schedule style to four descriptive radio cards. The focused resolver and EventForm tests, the complete EventForm suite, scoped ESLint, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 18:39Z) Milestone 3: Rebuilt Divisions with fixed-width wrapping controls, removed Simple-only pricing and payment-plan controls, preserved Advanced pricing placement, and removed bracket-team auto-fill. Focused unit and component tests, all 102 EventForm tests, scoped ESLint, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 19:04Z) Milestone 4: Added persisted division-phase rules, per-phase Division Rules controls in Simple and Advanced Setup, derived timed-match duration, scheduler snapshots, and phase-aware match resolution. Removed the duplicate Simple Competition Rules page. Focused Jest suites, all 102 EventForm tests, scheduler integration tests, scoped ESLint, Prisma generation, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 19:33Z) Milestone 5: Moved Simple Setup division pricing to Pricing and Registration. Added provider-aware manual payment editing and persistence. Added the no-Stripe recovery path. Kept Advanced pricing in Divisions while removing online fee and payment-plan UI from Advanced manual mode. All 146 focused tests and all 103 EventForm tests pass. Scoped ESLint, `git diff --check`, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 19:48Z) Milestone 6: Enforced each schedule style in Schedule and Location. Fixed event window now owns one synchronized non-repeating slot. Weekly and one-time styles show only their slot type. Mixed style groups both types. Immutable rental slots remain unchanged. All 65 focused tests and all 104 EventForm tests pass. Scoped ESLint, `git diff --check`, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 20:01Z) Milestone 7: Added explicit team check-in and roster operations planning. Each operations choice now controls its Staff and Operations block. The page is absent when all choices are off. Disabling a choice clears only its owned form data and invite roles. Ten focused suites have 127 passing tests. All 104 EventForm tests, scoped ESLint, `git diff --check`, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 20:30Z) Milestone 8: Added one current error index for Simple and Advanced Setup. Review and publish validation now opens the owning page or section, shows inline and navigation counts, announces the blocker, and focuses the first invalid field. Seven focused suites have 26 passing tests. All 106 EventForm tests, scoped ESLint, `git diff --check`, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 20:41Z) Milestone 9: Replaced the short summary with a normalized read-only review model and dedicated page. Each section has an Edit action, validation warnings, and current human-readable form values. The review suites and the complete EventForm suite have 110 passing tests. Scoped ESLint, `git diff --check`, and `npx tsc --noEmit` pass.
- [x] (2026-08-03 20:52Z) Milestone 10: Completed serial integration, persistence, schema, TypeScript, lint, whitespace, and repository CI verification. The targeted integration run has 59 suites and 538 tests. Repository CI has 773 suites and 4,267 tests, and its 315-route coverage gate passes. No local server listens on port 3000, so browser-sized visual verification remains deferred without changing runtime state.
- [x] (2026-08-03 22:04Z) Milestone 11: Aligned division controls, moved phase timing and each rules action into its owning configuration, removed timed-match duration inputs, simplified schedule-style choices, removed the resource scrollbar gap, and loaded sport official positions for new events.
- [x] (2026-08-03 22:04Z) Milestone 12: Added segment-break duration to generated match snapshots and added the matching virtual break countdown to `mvp-app`.
- [ ] (2026-08-03 22:04Z) Milestone 13: Applied only the division phase migration to the confirmed local database. The new column is readable. Focused web tests, route tests, repository tests, TypeScript, lint, and the focused mobile test pass. Full browser submission remains pending because the running development server is timing out during unrelated sport seeding and background requests.
- [x] (2026-08-04 00:18Z) Milestone 14: Added confirmed Skip Break and Restart Break actions to the web match runner. Preserved blank phase timing inputs after intentional clearing. Used the sport segment term in timing labels. Removed the duplicate self-managed payment control. Replaced the final Review event action with a validity-gated Create Event action. The focused run has 5 suites and 54 passing tests. The complete EventForm suite has 107 passing tests. TypeScript and scoped lint pass; lint reports only three existing hook dependency warnings in `ScoreUpdateModal.tsx`.

## Surprises & Discoveries

- Observation: The visible corner defect has two border and radius owners.
  Evidence: `src/app/events/[id]/schedule/components/eventForm/EventForm.tsx` wraps the page in a rounded bordered container. `src/app/events/[id]/schedule/components/eventForm/simpleSetup/SimpleSetupNavigation.tsx` adds a second rounded bordered `section`. Neither shared owner clips all child borders.

- Observation: The Basics page passes a width class to `ImageUploader`, but the component ignores it.
  Evidence: `src/components/ui/ImageUploader.tsx` declares `className` in `ImageUploaderProps`, but it does not destructure or apply that prop. The image also has a fixed height of 160 pixels and no fixed preview width.

- Observation: Participation Plan already owns the shared-versus-separate division decision.
  Evidence: `SimpleSetupPlanningPage.tsx` stores `divisionMode`. `SimpleSetupDivisionsPage.tsx` renders `DivisionModeControls` again.

- Observation: The bracket value of 2 is produced by several normalization paths, not only by the input.
  Evidence: `divisionEditorDraftState.ts`, `useEventDivisionNormalization.ts`, and `useEventFormConfigurationActions.ts` use a fallback of 2 when playoffs or bracket configuration becomes active.

- Observation: The schedule style choice is only wizard state.
  Evidence: `SimpleSetupScheduleLocationPage.tsx` does not receive `EventSetupChoices`. It always renders `ScheduleConfigBody` for schedulable events. This is why weekly controls remain visible after the user selects Fixed event window.

- Observation: Resource source and resource count are planning-only duplicates.
  Evidence: `SimpleSetupPlanningPage.tsx` asks for both values. `SimpleSetupScheduleLocationPage.tsx` already owns organization resources and local resource creation, including local resource count.

- Observation: The Customize match rules switch clears event-wide data but does not control the later page.
  Evidence: `EventForm.tsx` clears `matchRulesOverride` when the switch is off. `SimpleSetupCompetitionRulesPage.tsx` uses `sectionsController.showMatchRulesSection`, which does not use the switch. The page also renders `SingleDivisionDefaultsPanel`, which repeats bracket, pool, and event-format controls.

- Observation: Match-rule segment length currently changes match duration as a side effect.
  Evidence: `MatchRulesSection.tsx` edits `timekeeping.segmentDurationMinutes`. `useEventFormConfigurationActions.ts` multiplies that value by segment count and writes event-level match duration.

- Observation: The no-Stripe path can keep Online payment as the apparent selection while pricing is disabled or reset.
  Evidence: Registration Plan falls back to `ONLINE`. `useEventPaymentController` enables pricing only for Stripe or manual payment and resets create-mode prices when neither path is active.

- Observation: The mobile app has a more complete manual-payment contract than the web form.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/EventCreateSimpleSetup.kt` clears incompatible payment-plan data in manual mode. `EventDetailsRegistrationSection.kt` provides provider marks, handle prefixes, provider-specific labels, and URL normalization.

- Observation: The Cash App value `$camka14` in the follow-up screenshot is valid under the mobile contract but invalid under the web schema.
  Evidence: `src/app/events/[id]/schedule/components/eventForm/schema.ts` applies `z.string().url()` to every manual payment row. The mobile `normalizeManualPaymentUrl` converts `$camka14` to `https://cash.app/$camka14` before validation and persistence.

- Observation: Advanced Setup does not connect array validation errors to manual-payment inputs or section headings.
  Evidence: `ManualPaymentSettingsSection.tsx` renders payment destinations as controlled `TextInput` values without React Hook Form `Controller` field state or an `error` prop. `ManualPaymentsSection.tsx` renders a plain title and has no error status prop.

- Observation: The review action can report a validation summary without revealing the owning field.
  Evidence: `getDraftFromForm` in `src/app/events/[id]/schedule/page.tsx` shows up to three messages in a page-level submit error. The Simple Setup review validation reads the current top-level `errors` object after `trigger()`. Neither path has one shared current-error index that expands, scrolls to, and focuses the first invalid field.

- Observation: Manual mode enables the advanced online-pricing component.
  Evidence: `useEventPaymentController.ts` defines `pricingControlsEnabled` as Stripe connected or manual mode. Advanced division pricing passes that value as `hasStripeAccount`, so `HostPriceInput` and `PriceWithFeesPreview` can show Online price and platform-fee details even though the Manual Payments warning says those fees are disabled.

- Observation: Operations Plan mainly controls whether one later page exists.
  Evidence: `SimpleSetupStaffOperationsPage.tsx` always renders the full `StaffManagementPanel`. The panel does not receive the individual planning choices. Team events can also force the page to exist even when team operations were not selected.

- Observation: The current review is a short summary, not a full review.
  Evidence: The Review branch in `SimpleSetupPlanningPage.tsx` shows a small set of badges and location text. It omits most division, schedule, registration, rule, document, question, and operations values.

- Observation: `ImageUploader` callers already pass width classes outside Simple Setup.
  Evidence: Advanced Basic Information, team creation, and organization creation pass `className`, but the component did not apply it. Milestone 1 now applies the existing prop and keeps the default preview height at 160 pixels so those callers keep their prior height.

- Observation: Competition Rules must remain temporarily after Competition Plan is removed.
  Evidence: Current league and tournament scoring, pool, bracket, and legacy match-rule controls still render through `SimpleSetupCompetitionRulesPage.tsx`. Milestone 2 removes only the planning switch and its page. Milestone 4 will move the remaining controls before it removes Competition Rules from Simple Setup.

- Observation: The Simple Divisions Next action did not validate division-owned league, tournament, or playoff configuration.
  Evidence: `EventForm.tsx` triggered only `divisionDetails`, `playoffDivisionDetails`, and `maxParticipants` for the Divisions page. A missing playoff team count could show an inline error and then advance to Schedule Plan. Milestone 3 adds `leagueData`, `tournamentData`, and `playoffData` to this page validation boundary.

- Observation: Zod 4 treats an enum-keyed `z.record` as a complete record.
  Evidence: The first Milestone 4 EventForm run required all four phase keys. The form schema now uses an object with optional `LEAGUE`, `POOL`, `BRACKET`, and `PLAYOFF` properties so partial phase settings remain valid.

- Observation: An unsplit league playoff division can retain its regular division kind.
  Evidence: Scheduler and repository test shapes identify a league postseason match through its bracket links. Phase resolution now uses both the division kind and bracket-link fields.

- Observation: The nested tournament builder for a league playoff previously changed the event context to Tournament.
  Evidence: `EventBuilder.ts` created the nested bracket event without preserving the parent event type. It now retains League so linked postseason matches resolve the `PLAYOFF` phase instead of `BRACKET`.

- Observation: Tournament bracket fallback duration used a hard-coded 20-minute set.
  Evidence: `Brackets.ts` now uses the division or phase duration for timed matches and the configured set length and count for set matches.

- Observation: The create-mode no-Stripe effect removed valid registration prices.
  Evidence: `useEventPaymentController.ts` reset event and division prices when neither Stripe nor manual mode was active. It now selects manual mode without changing the stated registration price.

- Observation: Provider changes could lose an adjacent label or destination update.
  Evidence: Consecutive controlled updates used a captured payment-link array. The shared editor now reads the latest form values before it applies each row patch.

- Observation: The server accepted manual mode with Stripe-only plan data when a client bypassed the form.
  Evidence: The event repository now clears cancellation refund hours, payment-plan flags, installment counts, and installment arrays for the event and its divisions while it preserves registration prices.

- Observation: The provider-friendly editor contract needs separate display and persistence values.
  Evidence: Cash App, Venmo, and PayPal handles stay readable in form state. The draft and repository boundaries convert them to canonical HTTPS destinations and reject invalid rows instead of dropping them.

- Observation: The timeslot component used one combined list and one per-slot repeating switch for every setup surface.
  Evidence: `LeagueFields.tsx` had one `Weekly Timeslots` heading and rendered all slots. It now accepts an explicit timeslot mode. Advanced Setup keeps the prior combined mode.

- Observation: Fixed-window time-zone changes were invisible to the form slot equality check.
  Evidence: `leagueSlotsEqual` compared dates, times, resources, divisions, and conflicts but not `timeZone`. It now compares `timeZone`, so the synchronized slot updates when the event time zone changes.

- Observation: A fixed-window league still needs per-slot resource assignment.
  Evidence: Organization league resources are selected inside the schedule slot instead of the event-level resource selector. Fixed-window mode now keeps a resource and division assignment card, but it replaces the timing editor with a read-only event-range summary.

- Observation: Team signup previously forced Staff and Operations into the wizard even when the organizer selected no operations feature.
  Evidence: `resolveEventSetupCapabilities` treated `teamSignup` as a staff-page capability. It now requires one explicit operations choice, including the new team check-in and roster choice.

- Observation: Pending staff invitations can contain both assistant-host and official roles.
  Evidence: A disabled operations choice cannot remove the complete invite row without deleting data owned by another choice. Choice cleanup now filters only the owned role and preserves the invite when another role remains.

- Observation: Team-officiating mode and official positions depend on dedicated officials.
  Evidence: These controls affect match staffing. Dedicated officials now owns the scheduling-mode and team-officiating blocks. Turning it off also clears its dependent custom-position choice and official staffing data.

- Observation: Strict persistence normalization cannot also build a dirty-state draft while an invalid payment handle is being edited.
  Evidence: Once manual destination inputs became registered fields, dirty-state draft calculation reached the same strict normalizer as submission and threw before the user could correct the row. The draft boundary now preserves invalid raw input, while schema validation and the repository boundary remain strict.

- Observation: Nested form errors need a stable ownership table instead of reading the current page's top-level error keys.
  Evidence: Manual payment rows, division playoff counts, and schedule resource arrays use indexed paths. Milestone 8 flattens these paths once and assigns each path to both a Simple Setup page and an Advanced Setup section.

- Observation: One combined review card cannot route both a planning choice and its detailed configuration to the exact owner page.
  Evidence: Schedule style belongs to Schedule Plan while times and resources belong to Schedule and Location. Operations choices and staff assignments have the same split. Milestone 9 uses separate read-only cards so each Edit action has one exact owner.

- Observation: Manual payment destinations are not required in the organizer review.
  Evidence: The public-facing label and provider identify the destination without exposing a handle or URL. The normalized review model includes provider labels and whether instructions exist, but it omits destination values.

- Observation: A directory-wide event-form lint includes four existing React-effect errors in unchanged files.
  Evidence: `FacilityResourceSelector.tsx`, `TryoutDivisionSelector.tsx`, `useEventFormSectionNavigation.ts`, and `useRegistrationQuestionDrafts.ts` fail the current `react-hooks/set-state-in-effect` rule. Linting every file changed by this event-setup implementation passes with no errors and one React Hook Form compiler warning in a test harness.

- Observation: No approved local runtime was available for the final browser pass.
  Evidence: `lsof -nP -iTCP:3000 -sTCP:LISTEN` returned no listener. The implementation did not start, stop, or reconfigure a process.

- Observation: The current create-event 500 is a local schema mismatch.
  Evidence: The running development server reports Prisma `P2022` for `Divisions.phaseSettings` during `POST /api/events/schedule`. The migration exists in the worktree, but the connected local database does not contain the column.

- Observation: The forced scrollbar gutter creates the visible resource gap.
  Evidence: `LeagueFields.tsx` applies `[scrollbar-gutter:stable]` to the resource list. The reserved gutter remains visible beside the selected-row background.

- Observation: The division draft does not own phase settings.
  Evidence: `DivisionEditorState` omits `phaseSettings`. The save path copies settings only from an existing saved division. This prevents a new or edited division configuration from owning its timing fields and rules actions before save.

- Observation: Match snapshots do not carry the break duration.
  Evidence: Scheduled duration includes `segmentBreakMinutes`, but `ResolvedMatchTimekeepingConfig` has no segment-break field. The mobile match screen can therefore render segment timers but cannot render a break countdown from the saved match snapshot.

## Decision Log

- Decision: Keep one outer border and radius owner for the Simple Setup page.
  Rationale: A single clipped shell removes the corner artifact and prevents header or footer borders from extending past the radius.
  Date/Author: 2026-08-03 / Codex

- Decision: Use fixed control widths inside `flex-wrap` rows. Do not stretch short numeric inputs to fill a grid column.
  Rationale: This keeps short values compact while allowing the row to adapt to available width. Compound controls can stay aligned as one wrapping unit.
  Date/Author: 2026-08-03 / Codex

- Decision: Participation Plan is the only owner of shared-versus-separate division mode in Simple Setup.
  Rationale: The user should answer this question once. Advanced Setup can retain its existing control for direct editing.
  Date/Author: 2026-08-03 / Codex

- Decision: Remove Resource source and Custom resource count from Schedule Plan.
  Rationale: Schedule and Location already has the real resource data and can infer whether resources come from an organization or the event.
  Date/Author: 2026-08-03 / Codex

- Decision: Remove Competition Plan and Competition Rules from Simple Setup after their remaining controls move to Divisions.
  Rationale: The switch does not provide useful progressive disclosure. Match behavior depends on the division and competition phase. A separate page creates duplicate ownership.
  Date/Author: 2026-08-03 / Codex

- Decision: Store rule overrides by division and competition phase.
  Rationale: A league regular season, tournament pool, tournament bracket, and league playoff can need different rules even when they belong to the same division.
  Date/Author: 2026-08-03 / Codex

- Decision: Use the phase keys `LEAGUE`, `POOL`, `BRACKET`, and `PLAYOFF`.
  Rationale: These keys match the four places where the user asked for a Division Rules action. They also give the scheduler a stable lookup key.
  Date/Author: 2026-08-03 / Codex

- Decision: Keep event-wide match-rule fields as a read fallback for old events and Advanced Setup.
  Rationale: Existing saved events and matches must continue to load. New Simple Setup edits will write phase rules. Existing event-wide values will remain valid until the host customizes a phase.
  Date/Author: 2026-08-03 / Codex

- Decision: Timed-match duration is a derived value for each division phase.
  Rationale: The schedule needs one regulation duration. The correct formula is `segment count * segment length + break count * segment break`, where break count is one less than segment count. Overtime is not part of the scheduled regulation duration.
  Date/Author: 2026-08-03 / Codex

- Decision: Timed sports expose segment count in Division Rules. Set sports keep set count in the existing division format controls.
  Rationale: Soccer-like sports use periods, halves, or quarters as rules. Volleyball-like sports use the existing sets-per-match and winner or loser set controls.
  Date/Author: 2026-08-03 / Codex

- Decision: Segment length and break between segments belong in the visible division phase configuration, not in the rules dialog.
  Rationale: These values determine scheduled duration. The sport template can supply the initial segment length, but the rules dialog must not provide a second duration owner.
  Date/Author: 2026-08-03 / Codex

- Decision: A numeric field can have an initial default, but an intentional clear remains blank.
  Rationale: Editing must not replace a blank value with a fallback. The form stores `null` while the field is blank and shows an inline validation error. It applies defaults only before the user edits the field.
  Date/Author: 2026-08-04 / Codex

- Decision: Store the segment break in the resolved match timekeeping snapshot.
  Rationale: The scheduler and mobile match runner need the same immutable value. A snapshot field keeps generated matches stable when a division rule changes later.
  Date/Author: 2026-08-03 / Codex

- Decision: The mobile break countdown is a virtual phase between scoring segments.
  Rationale: Scoring segments must keep their existing sequence and score ownership. The app can derive the break start from the completed segment `endedAt` value and the saved break duration without adding a second scoring segment or a new database table.
  Date/Author: 2026-08-03 / Codex

- Decision: Skip and restart persist timestamps on the next scoring segment metadata.
  Rationale: Persisted metadata keeps both actions consistent after reload and across web and mobile. Restart replaces the break start. Skip suppresses the break until a restart clears the skip marker.
  Date/Author: 2026-08-04 / Codex

- Decision: The final Simple Setup action creates the event directly and remains disabled while the draft is invalid.
  Rationale: The final page is already the complete read-only review. A second Review event action adds no state transition and obscures the publish contract.
  Date/Author: 2026-08-04 / Codex

- Decision: Self-managed payment is the create-mode default when Stripe is not connected.
  Rationale: BracketIQ online payment cannot work without Stripe. The form must not show an unavailable path as the active default.
  Date/Author: 2026-08-03 / Codex

- Decision: Use provider-aware validation before canonical URL persistence.
  Rationale: Cash App, Venmo, and PayPal accept usernames in the editor. The form must validate the provider input, show an error beside that row, and convert valid input to HTTPS only when building the saved event.
  Date/Author: 2026-08-03 / Codex

- Decision: Manual mode uses a plain Registration price control and hides online-price and fee calculations in both setup modes.
  Rationale: A host can still state the amount collected outside BracketIQ, but BracketIQ does not calculate or collect processing and platform fees in manual mode.
  Date/Author: 2026-08-03 / Codex

- Decision: Move division pricing out of Divisions only in Simple Setup.
  Rationale: Simple Setup benefits from one consolidated Pricing and Registration step. Advanced Setup is an expert editing surface and keeps price and payment controls inside each division. Shared payment validation, manual-mode fee visibility, and error presentation still apply to both modes.
  Date/Author: 2026-08-03 / Codex

- Decision: Simple Setup and Advanced Setup share one error-ownership index.
  Rationale: A validation path must map to one wizard page and one Advanced Setup section. Separate mappings will drift and produce generic blockers.
  Date/Author: 2026-08-03 / Codex

- Decision: A collapsed Advanced Setup section with an error shows a red issue badge next to its title and in section navigation.
  Rationale: The user must see where the blocker is without expanding every section. The first invalid section must also expand and receive focus when validation blocks review or publish.
  Date/Author: 2026-08-03 / Codex

- Decision: Use existing payment-provider artwork and an approved official Zelle mark. Use the existing icon library for Other.
  Rationale: The interface must use real brand assets. It must not use emoji or hand-drawn provider marks.
  Date/Author: 2026-08-03 / Codex

- Decision: Each review section has an Edit action that returns to its owning page.
  Rationale: A full review can be long. Direct edit navigation lets the host correct one section without searching through the wizard.
  Date/Author: 2026-08-03 / Codex

## Outcomes & Retrospective

All ten implementation milestones are complete. The Simple Setup page has one clipped outer border and radius owner. Format uses compact wrapping groups. Basics uses a 320-by-176-pixel desktop image preview beside a responsive details grid. `ImageUploader` now honors caller width classes and uses accessible Lucide actions instead of emoji controls. Participation Plan is now the only Simple Setup owner of division mode. Schedule Plan uses four descriptive radio cards and no longer asks for resource source, resource count, or division assignment. The selected schedule style now controls Schedule and Location. Fixed event window keeps one non-repeating slot synchronized with event timing, time zone, resources, and divisions. Weekly and one-time styles render only their owned slot type. Mixed style groups both types. The redundant weekly outer panel is removed in Simple Setup. Immutable rental slots are preserved. The unused Competition Plan and Competition Rules pages are gone. Divisions now uses fixed-width controls in wrapping rows. Simple Setup no longer renders division price or payment-plan controls, while Advanced Setup keeps them. Bracket and playoff counts remain empty until the organizer enters a value. Empty values and values below two show `At least 2 teams need to be in the bracket.` directly below the field and block the Divisions Next action. Each saved division can now keep separate league, pool, bracket, and playoff settings. Timed phases derive scheduled duration from segment count, segment length, and segment break. Generated matches receive phase-aware rule snapshots, while existing snapshots remain stable. Simple Setup now owns all shared and per-division pricing on Pricing and Registration. A no-Stripe create draft defaults to Self-managed payment and shows a Connect Stripe recovery action for online payment. The shared manual destination editor accepts provider handles, shows provider marks and row errors, saves canonical HTTPS destinations, and restores provider-friendly values on reload. Manual mode preserves the stated registration price and removes online fees, automatic refunds, and payment plans in Simple and Advanced Setup. Operations Plan now owns four explicit capabilities. Staff assignment, official staffing, custom positions, and team operations show only their selected blocks. The Staff and Operations page disappears when no capability is active. Role-specific cleanup preserves data owned by other choices. Validation now builds one current error index for both setup modes. Simple Setup opens the owning page. Advanced Setup expands the owning section. Both surfaces show error counts, announce the blocker, and focus the exact field. Invalid provider input remains editable until it passes strict submission validation. Review now uses current normalized display values in read-only cards. It covers format, basics, participation, divisions, schedule, per-phase rules and scoring, pricing, documents and questions, and operations. Every card has one exact Edit destination. The additive migration `20260803210000_add_division_phase_settings` stores the phase settings as nullable JSON. The final targeted integration run passed 59 suites and 538 tests. Repository CI passed 773 suites and 4,267 tests plus the 315-route coverage gate. Prisma validation, scoped ESLint, `git diff --check`, and `npx tsc --noEmit` pass. No process or live runtime changed. Browser-sized verification remains deferred because no local server was active.

Milestones 11 and 12 are complete. Bracket Teams and wrapped rest controls share one aligned label height. Timed pool, league, bracket, and playoff configurations now own Segment length, Break between segments, calculated duration, and their phase rules action. Timed formats no longer show a separate editable Match Duration. Set formats keep Set duration and set count in the format configuration. Summary cards no longer contain rules actions. Schedule style choices no longer use bordered cards. Resource lists no longer reserve a visible scrollbar gutter. New events seed official positions from the selected sport without marking the form dirty. Generated match snapshots now include the nonnegative segment-break duration. Mobile treats the break as a countdown phase between scoring segments and prevents the next segment timer from starting before the countdown ends. The focused web runs passed 10 suites and 181 tests in total, TypeScript passed, and scoped lint has no new errors or warnings. The focused Android unit-test build passed. The local database now has the `Divisions.phaseSettings` column, while the two unrelated affiliate migrations remain pending. Browser completion is still pending because the running development server produced unrelated connection and sport-seeding transaction timeouts during verification.

Milestone 14 makes the break phase operable on web. Skip and Restart both require confirmation and save segment metadata, so the result survives reload. Phase timing labels now use the sport term, such as Quarter or Half. Clearing the length keeps the control blank and shows `Enter at least 1 minute.` The duplicate timing-row self-managed payment choice is removed. The review footer now uses Create Event and shares the same validity gate as the page header. The final focused run passed 54 tests. The full EventForm regression run passed 107 tests. TypeScript passed.

## Context and Orientation

The event form has two modes. Advanced Setup exposes the full section-based form. Simple Setup uses a page resolver and planning choices to show a smaller wizard. This plan reorganizes Simple Setup and changes shared behavior in both modes when payment, pricing, validation, or error presentation uses the same data contract. It must not remove required controls from Advanced Setup.

`src/app/events/[id]/schedule/components/EventForm.tsx` owns the React Hook Form instance, Simple Setup choices, page navigation, validation, and submission. `src/app/events/[id]/schedule/components/eventForm/simpleSetup/resolveEventSetup.ts` converts event facts and planning choices into visible wizard pages. `types.ts` in the same directory defines those choices and page identifiers.

The planning pages are in `src/app/events/[id]/schedule/components/eventForm/simpleSetup/SimpleSetupPlanningPage.tsx`. The form pages are separate files in the same directory. `SimpleSetupNavigation.tsx` renders the page shell, side navigation, Back button, and Next button.

Division form state uses `divisionDetails` for per-division editor values. `DivisionEditorLeaguePanel.tsx` composes classification, capacity, price, payment plan, league, pool, bracket, and playoff controls. `SingleDivisionDefaultsPanel.tsx` provides similar event-wide defaults when one shared division is active. This plan will remove price controls from Divisions and add compact phase sections with Division Rules buttons.

A competition phase is the part of a competition that creates a match. This plan uses four phases: league regular season, tournament pool, tournament bracket, and league playoff. A phase rule override is a saved change from the sport template for one division and one phase.

`src/app/events/[id]/schedule/components/MatchRulesSection.tsx` resolves sport defaults and event overrides. `src/server/repositories/events.ts` hydrates events and currently resolves one event-wide rule set for generated matches. Scheduler code stores the resolved rule set on each match as `matchRulesSnapshot`. The snapshot keeps played and scheduled matches stable after an event rule changes.

`src/app/events/[id]/schedule/components/eventForm/simpleSetup/SimpleSetupScheduleLocationPage.tsx` owns event date, time, location, resources, and timeslots. `ScheduleConfigBody.tsx` passes weekly slot editing to `src/app/discover/components/LeagueFields.tsx`. A fixed event window must have one non-repeating slot that matches the event start and end.

`src/app/events/[id]/schedule/components/eventForm/hooks/useEventPaymentController.ts` owns Stripe availability and manual payment state. `src/lib/manualRegistrationPayments.ts` validates web payment destinations. The mobile reference behavior is in `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventCreate/EventCreateSimpleSetup.kt` and `EventDetailsRegistrationSection.kt`.

The five initial screenshots show the current state of Format, Basics, Divisions, Schedule Plan, and Operations Plan. The follow-up screenshot shows Advanced Setup Manual Payments with a valid Cash App handle and no inline blocker. Static screenshots prove layout and error-discovery defects. Source inspection proves the validation, conditional-state, and persistence defects. Keyboard behavior, focus order, and runtime state transitions still require browser and component tests during implementation.

Current page health is:

1. Format needs layout revision. The event type control is too wide and the shell has competing radii.
2. Basics needs layout revision. The image is too wide and too short. The image component ignores its requested wrapper class.
3. Participation and Divisions need structural revision. The division-mode question is duplicated. Fields use too much width. Prices and rules have the wrong owner.
4. Schedule Plan needs structural revision. It uses an unexplained select and asks for resource data that belongs on the next page.
5. Schedule and Location has a broken conditional contract. Fixed event window does not hide or synchronize timeslot controls.
6. Competition Plan and Competition Rules are redundant. Their switch does not control rendering, and the page repeats division format controls.
7. Simple Setup Pricing and Registration is incomplete. It sends per-division pricing back to Divisions and does not provide a valid no-Stripe default.
8. Operations Plan has a broken conditional contract. Its choices do not filter the next page.
9. Review is incomplete. It does not show a complete read-only event configuration.
10. Advanced validation needs structural revision. Collapsed section headings and navigation do not show error ownership, and manual-payment rows do not render their field error.

## Plan of Work

### Milestone 1: Baseline tests and visual shell

Add focused tests before changing behavior. Extend `src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx` or add small Simple Setup page tests beside the simple setup components. Cover visible page resolution, shell ownership, and the Basics layout props. Do not place all new behavior in one large snapshot test.

In `EventForm.tsx` and `SimpleSetupNavigation.tsx`, keep one border, background, shadow, and radius owner. Apply `overflow-hidden` to that owner. Remove the nested competing border and radius. Confirm that the sticky or fixed footer border stays inside the radius.

In the Format branch of `SimpleSetupPlanningPage.tsx`, replace the equal two-column grid with a wrapping row. Give Event type a fixed desktop width near 20 to 22 rem. Give Registration destination enough width for its labels. Let the second group move below the first when the viewport is narrow.

In `src/components/ui/ImageUploader.tsx`, apply the existing `className` prop and add explicit wrapper and preview sizing props if needed. Replace emoji action controls with the existing icon library. Keep the event image at the same 176-pixel height used by `EventCard.tsx`. On desktop, use an event-card-like fixed width. In `SimpleSetupBasicsPage.tsx`, place this image column on the left and a flexible details column on the right. Put Event Name, Tags, Sport, and Description in the right column. Stack the image above the fields on small screens. Do not stretch or crop the image into the current full-page banner shape.

Acceptance for this milestone is visual and structural. At desktop width, the Format controls use the available white space without stretching. The Basics image has event-card proportions and the fields sit beside it. At mobile width, both rows wrap without horizontal scrolling. No child border extends past the page radius.

### Milestone 2: Planning page ownership

Remove `DivisionModeControls` from `SimpleSetupDivisionsPage.tsx`. Keep the Participation Plan radio choice as the Simple Setup owner. When a user returns to Participation Plan and changes the choice, preserve compatible division data and run the existing normalization that is required for the selected mode. Do not silently replace names, capacity, or valid competition values.

In Schedule Plan, replace the schedule style `Select` with a keyboard-accessible radio-card group. Use these labels and descriptions:

- Fixed event window: Use one non-repeating timeslot that always matches the event start and end.
- Weekly repeating timeslots: Use the same selected weekdays and times each week during the event.
- Fixed one-time timeslots: Add individual dates and times that do not repeat.
- Mixed repeating and fixed timeslots: Combine weekly availability with one-time dates or exceptions.

Keep the schedule choice area wide because each option has explanatory text. Remove Resource source, Custom resource count, and the derived Division assignment card from Schedule Plan. Resource ownership and resource count stay on Schedule and Location.

Remove `resourceSource`, `customizeMatchRules`, and `customizeScoring` from the Simple Setup choice contract when no caller remains. Remove the Competition Plan controller and page. Do not remove Advanced Setup controls. Move standings scoring to the Divisions page as described in Milestone 4 before removing the Competition Rules page from the resolver.

Update `resolveEventSetup.ts`, its types, page labels, controller map, validation prefix map, default-choice construction, and tests. Ensure Back and Next navigation do not leave inaccessible page identifiers in history when a page is removed.

Acceptance for this milestone is that every remaining planning choice changes data or controls a later page. The user answers division mode once. Schedule Plan has four descriptive choices and no resource inputs. Simple Setup has no Customize match rules switch.

### Milestone 3: Compact Divisions layout and explicit bracket validation

Create shared layout primitives for division fields. A compact numeric field should use a fixed width near 8 to 10 rem. A medium select or text field should use about 14 to 18 rem. Price and payment-plan groups can use about 18 to 22 rem. The parent row must use `display: flex`, `flex-wrap: wrap`, top alignment, and consistent gaps. A field can move to the next line, but its input width must not expand to fill the row.

Update `DivisionEditorCoreControls.tsx`, `DivisionEditorLeagueConfigControls.tsx`, `DivisionEditorTournamentConfigControls.tsx`, `DivisionEditorTournamentPoolControls.tsx`, `SingleDivisionScheduleControls.tsx`, and their composed panels. Use one grouped wrapper for controls that must stay aligned. The set-score group must keep sets per match, sets needed to win, winner set target, and loser or deciding set target aligned as a single unit. Timed-match timing controls must also stay grouped.

Remove pricing and payment-plan controls from `SimpleSetupDivisionsPage.tsx`. Keep classification, capacity, competition format, advancement, and division timing. Do not move or remove pricing and payment-plan controls from Advanced Setup division panels.

Remove every create-mode fallback that writes 2 into bracket or playoff team count. Update `divisionEditorDraftState.ts`, `useEventDivisionNormalization.ts`, `useEventFormConfigurationActions.ts`, and any pool control change handler. Keep valid persisted values when editing an existing event. When bracket or playoffs are enabled for a new configuration, store `null` until the user enters a value.

Standardize the field error to exactly `At least 2 teams need to be in the bracket.` Show it in red directly below the relevant Bracket Teams field after blur or after Next is pressed. The empty state and values below 2 use the same message. Do not rely only on a page-level alert. Add regression tests that prove the field starts empty, stays empty after toggling the bracket on, blocks Next, shows the exact message, and accepts 2 or more.

Acceptance for this milestone is a dense wrapping division editor with no stretched short inputs, no pricing controls, no duplicate division-mode control, and no bracket team auto-fill.

### Milestone 4: Division-phase rules and derived duration

Add a stable form and persistence contract for phase settings. Define these types in the event type and form type modules:

    export type DivisionCompetitionPhase = 'LEAGUE' | 'POOL' | 'BRACKET' | 'PLAYOFF';

    export type DivisionPhaseSettings = {
        matchRulesOverride?: MatchRulesConfig | null;
        autoCreatePointMatchIncidents?: boolean;
        segmentLengthMinutes?: number | null;
        segmentBreakMinutes?: number | null;
    };

    export type DivisionPhaseSettingsMap = Partial<Record<DivisionCompetitionPhase, DivisionPhaseSettings>>;

Add a nullable JSON column with a clear name such as `phaseSettings` to the Prisma `Divisions` model. Create one Prisma migration. Add `phaseSettings` to `DivisionDetailPayload`, the form schema, default mapping, editor state, commit mapping, event serializer, repository upsert, and API payload validation. Event templates already store division details as JSON, so confirm that template save and load includes the new field.

Create a pure helper that resolves the active phase for a generated match. Regular league matches use `LEAGUE`. Tournament pool matches use `POOL`. Tournament elimination matches use `BRACKET`. League postseason matches use `PLAYOFF`. Add tests using actual scheduler match shapes before changing repository logic.

Update match-rule resolution in `src/server/repositories/events.ts` and the scheduler path. Resolve rules in this order: division-phase override, legacy event-wide override, sport template, built-in fallback. Store the resolved rules in each match `matchRulesSnapshot`. Do not rewrite snapshots on already saved or played matches unless the existing regeneration path already creates a new match.

Create a reusable Division Rules dialog from `MatchRulesSection.tsx`. Add a Division Rules button to each visible league, pool, bracket, and playoff phase block. The dialog title must name the division and phase. Timed sports can edit segment count, overtime, shootout, supported incidents, and automatic point incidents. Set sports must not show segment count in the dialog. They continue to use the set-count fields in the division configuration.

Remove segment or half length from the rules dialog. Use `sport.matchRulesTemplate.timekeeping.segmentDurationMinutes` only as the initial segment-length value when the division phase has no saved timing. Show Segment length and Break between segments in the timed phase configuration. Show Match duration as a read-only calculated value. Use this formula:

    totalMinutes = segmentCount * segmentLengthMinutes
        + Math.max(segmentCount - 1, 0) * segmentBreakMinutes

Write the derived total into the existing phase configuration field that the scheduler uses for match duration. Do not include overtime in the total. Recalculate when segment count, segment length, or segment break changes. Add pure helper tests for 1, 2, and 4 segments and for a zero-minute break.

Move event-wide league or pool standings scoring from `SimpleSetupCompetitionRulesPage.tsx` to a clearly labeled Divisions control. It can remain one event-wide scoring dialog if the data is still event-wide, but the copy must state which phases it affects. After the move, remove `SimpleSetupCompetitionRulesPage.tsx` from Simple Setup navigation and validation routing. Keep the component or equivalent controls for Advanced Setup if it still uses event-wide legacy values.

Acceptance for this milestone is that two divisions can have different rules, a pool and bracket in one division can have different rules, and generated matches receive the correct snapshot. Timed match duration updates from segment count, segment length, and segment break. Set sports keep their existing set-count controls.

### Milestone 5: Simple Setup pricing ownership and shared payment behavior

Build a division pricing list for `SimpleSetupPricingRegistrationPage.tsx`. Render one read-only division identity row for every selected division. Each row owns its price, payment-plan enablement, installment values, and team-split default when applicable. Shared division mode can show one Shared division row and apply that row to all selected division labels. Separate division mode must write to each division detail. Keep compact price inputs but allow payment-plan content to use more horizontal space. This ownership change is limited to Simple Setup. Advanced Setup keeps its current per-division price and payment-plan placement.

Remove the alert that sends users back to Divisions. Ensure validation errors for division price and installments resolve to Pricing and Registration. Preserve existing valid payment plans when moving controls. Do not duplicate them in Divisions.

Pass Stripe connection state and `connectStripe` into Registration Plan. When Stripe is connected, allow BracketIQ online registration. When Stripe is not connected, default new events to Self-managed payment. If the user selects BracketIQ online registration without Stripe, show the existing Connect Stripe button in place and do not switch modes until connection succeeds. Existing events with an unavailable online state must show an explicit warning and recovery action. They must not silently convert on load.

Create a shared manual-payment destination editor for Simple Setup and Advanced Setup. Reproduce the current mobile behavior. Show real provider marks for Cash App, Venmo, PayPal, Stripe, and Zelle. Show the Link icon for Other. Use provider-specific labels and inputs. Accept `$cashtag`, `@venmo`, and PayPal username forms. Normalize them to valid HTTPS destinations on save. Keep direct HTTPS links valid. Add provider helper tests in `src/lib/__tests__/manualRegistrationPayments.test.ts` or the existing manual-payment test file.

Replace the unconditional `z.string().url()` rule in `schema.ts` with a provider-aware refinement. Keep the raw editor value in form state so the user can see `$camka14`, `@camka14`, or a PayPal.Me username. Validate the row with the same rules as `mvp-app/core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/ManualRegistrationPayment.kt`. Convert valid inputs to these canonical forms only in the event draft and persistence boundary:

    Cash App $camka14 -> https://cash.app/$camka14
    Venmo @camka14 -> https://venmo.com/u/camka14
    PayPal camka14 -> https://paypal.me/camka14

Accept an existing HTTPS destination for every provider. Reject blank values, username-only input for providers that require HTTPS, whitespace inside destinations, and `http://`. Do not silently remove an invalid row through `normalizeManualPaymentLinks`. Show provider-specific text beside the row, such as `Enter a valid Cash App username or HTTPS link.`

In manual mode, render a plain currency input labeled Registration price. Do this for shared and per-division prices in Simple Setup and Advanced Setup without changing where Advanced Setup places those controls. Do not render `HostPriceInput`, Online price, `PriceWithFeesPreview`, processing fees, BracketIQ fees, Stripe fees, automatic-refund controls, or payment-plan controls. Keep the registration price because it tells participants how much the host expects to collect. When the mode returns to Online, restore the online price and fee presentation from the current base price.

When Self-managed payment becomes active, apply the mobile compatibility rules. Clear BracketIQ-only cancellation refund hours. Clear event-level and division-level payment plans and installment arrays. Preserve the manual destination rows and instructions. Show the existing warning that the host confirms payment and handles refunds outside BracketIQ.

Acceptance for this milestone is that all Simple Setup prices are edited on Pricing and Registration while Advanced Setup prices remain inside their division controls. No-Stripe create mode defaults to Self-managed payment, online payment offers Connect Stripe, and each manual provider produces the same normalized destination as mobile. `$camka14` passes Cash App validation, saves as `https://cash.app/$camka14`, and reloads as `$camka14`. Manual mode shows Registration price but no online-price or fee UI in either setup mode.

### Milestone 6: Schedule style enforcement

Pass `scheduleStyle` from the Simple Setup choice state to `SimpleSetupScheduleLocationPage.tsx` and the slot controller. Define one rendering and normalization branch for each style.

For `FIXED_WINDOW`, hide weekly and one-time slot editors. Maintain exactly one non-repeating slot. Its start, end, start date, end date, time zone, selected resource identifiers, and division identifiers must follow the current event values. Update it when event start, event end, time zone, resources, or divisions change. Use the mobile helper in `EventCreateSimpleSetup.kt` as a behavior reference. Preserve immutable rental-linked slots and do not replace them.

For `WEEKLY_SLOTS`, show only weekly repeating slot controls. Remove the extra outer bordered container around the Weekly Timeslots group. Keep each individual timeslot visually separated. For `FIXED_SLOTS`, show only one-time slot controls. For `MIXED_SLOTS`, show both groups with clear headings.

Do not infer schedule style only from the current slot array after the user has made a choice. When loading an existing event, derive an initial style once. After that, the explicit wizard choice is authoritative. When changing style, preserve compatible slots where possible and ask for explicit confirmation only if the change would discard saved user-entered slots. Add a pure normalization helper and test each transition.

Update schema validation so each style validates only the slot data that it owns. A Fixed event window with valid event start and end must not fail a weekly-timeslot requirement. Weekly and fixed slot styles must still require at least one applicable slot.

Acceptance for this milestone is that Fixed event window shows no weekly controls and its single slot updates immediately after date or time changes. Weekly view has no redundant outer container. Each other style shows only its described controls.

### Milestone 7: Operations Plan controls the next page

Add an explicit `useTeamCheckInAndRosterOperations` choice to the Simple Setup choice type. Do not infer it only from `teamSignup`. Keep the option hidden for events that cannot use team operations.

Split `StaffManagementPanel.tsx` into visible blocks or add explicit visibility props. `useStaffAssignments` controls host and assistant-host assignment. `useDedicatedOfficials` controls official assignment and officiating schedule controls. `useCustomOfficialPositions` controls the position editor and is disabled or cleared when dedicated officials are off. `useTeamCheckInAndRosterOperations` controls team check-in, roster edits, and related controls. Define the ownership of team-officiating controls in tests; they should appear with dedicated officials because they affect match staffing.

Update `resolveEventSetupCapabilities` so Staff and Operations appears only when at least one operations choice is active. Update `updateSimpleSetupChoices` so turning a choice off clears only data owned by that choice. Do not clear host data when only custom official positions are disabled. Do not show empty page headings when no block is enabled.

Acceptance for this milestone is that every Operations Plan choice changes the next page immediately. With one choice active, only its block and required dependencies appear. With all choices off, the Staff and Operations page is absent.

### Milestone 8: Error discovery in Simple Setup and Advanced Setup

Create one error-ownership module beside `validationErrors.ts`. It must map every top-level and nested form path to a Simple Setup page identifier and an Advanced Setup section identifier. Array paths such as `manualPaymentLinks.0.url`, `divisionDetails.1.playoffTeamCount`, and `leagueSlots.2.fieldIds` must match by stable prefixes. Replace the separate Simple Setup validation prefix list with this shared ownership data.

After `trigger()` fails, build the error index from the current schema result and current React Hook Form errors. Do not rely on a possibly stale `errors` closure to choose the first blocker. Keep the page-level summary, but make it secondary. The primary recovery path must navigate to the owning Simple Setup page or expand the owning Advanced Setup section, scroll it into view, and focus the first invalid control.

Update page-scoped validation so Pricing and Registration includes `manualPaymentLinks` and `manualPaymentInstructions` whenever manual mode is active. This lets Next show the row error before the user reaches Review. Full Review and publish validation must use the same error index and must not produce a different message for the same input.

Convert `ManualPaymentSettingsSection.tsx` rows to `Controller` fields or use `useController` for `manualPaymentLinks.${index}.provider`, `.label`, and `.url`. Pass each row error to the provider input. Associate error text with the input through `aria-describedby`. Keep the raw provider-friendly input visible until the event draft is built.

Extract the repeated Advanced Setup paper, title, Collapse, and toggle header into a shared `CollapsibleEventFormSection` component. Give it `errorCount` and `firstErrorMessage` props. When `errorCount` is positive, use a red border treatment and show a red `1 error` or `N errors` badge next to the title even while collapsed. The badge must not rely on color alone. Add the same count to desktop and mobile `SectionNavigation` items. Announce newly visible validation errors with an accessible status region.

Apply the shared shell to Basic Information, Event Details, Manual Payments, Match Rules, Staff, Divisions, Scoring, and Schedule. Preserve their existing identifiers and Collapse state. A section with no errors must keep the normal border and no issue badge.

Add component tests for a collapsed Manual Payments section. Enter an invalid value, request review, and confirm that the section expands, the heading shows `1 error`, navigation shows the issue count, the field shows its specific message, and focus moves to the field. Add a multi-section test to prove that fixing the first error moves the recovery path to the next invalid section.

Acceptance for this milestone is that Review event and publish validation always reveal the first blocker. Simple Setup opens the correct page. Advanced Setup expands the correct section and marks its title and navigation item. The invalid field has inline text and focus. No error is visible only in a generic page-level alert.

### Milestone 9: Complete read-only review

Replace the Review branch in `SimpleSetupPlanningPage.tsx` with a dedicated `SimpleSetupReviewPage.tsx`. Keep the page read-only. Do not reuse editable inputs with `disabled` state.

Render these sections when applicable: Format; Basics; Participation and Divisions; Schedule and Location; Division Rules and Scoring; Pricing and Registration; Documents and Questions; Staff and Operations. Each section must show human-readable labels and values. Show event image, event name, tags, sport, dates and times with time zone, location, resources, each division, each visible competition phase, calculated duration, rule customizations, prices, installment summary, payment mode, manual providers, registration cutoffs, document counts and names, question counts and labels, staff assignments, official configuration, and team operations.

Add one Edit action per section. The action moves to the owning Simple Setup page and preserves form state. If validation finds a missing required value, show a warning row in the review section and route the user to the exact owning page when Edit is selected. Keep the final submit validation in `EventForm.tsx` as the source of truth.

Use compact definition lists, badges, and grouped rows. Do not recreate the editable form. Mask no secrets because the form must never hold secret keys. Do not show a raw payment destination when the value contains data that the public registration flow would not display.

Acceptance for this milestone is that a host can compare every meaningful selection against the earlier pages. Changing a value, returning to Review, and reading the section shows the new value. Every Edit action opens the correct page.

### Milestone 10: Integrated validation and cleanup

Run the targeted unit and component tests after every milestone. At the end, run the full event-form and scheduler suites in one process. Do not run Jest concurrently in this checkout. Run TypeScript and lint checks for touched files. Generate Prisma Client after the migration and confirm that generated files match the schema.

Use an existing local development server for browser verification. Do not start, stop, or restart a server unless the user gives explicit process-control authorization. Verify the wizard and Advanced Setup at a desktop viewport near 1440 by 1000 and a mobile viewport near 390 by 844. Cover keyboard-only radio selection, focus order, visible focus, collapsed-section error badges, error announcement, field wrapping, image cropping, and no horizontal overflow.

Exercise create and edit flows for one timed league, one timed tournament with pools and bracket, and one set-based tournament. Reload each saved event and confirm the same review values. Generate matches and confirm the saved `matchRulesSnapshot` and scheduled duration for the correct division phase. Test a no-Stripe account and a Stripe-connected account. Test every operations-choice combination that changes page visibility.

Remove dead Simple Setup choice types, page identifiers, controller mappings, and copy only after tests prove that no route uses them. Keep legacy event-wide match-rule fields and Advanced Setup behavior.

## Concrete Steps

Use `/Users/elesesy/StudioProjects/mvp-site` as the working directory for every command.

Before each milestone, inspect the dirty worktree and limit the diff to that milestone:

    git status --short --branch
    git diff --check -- <paths-touched-by-the-current-milestone>

Add or update tests first. Run the affected tests with one Jest process. Example commands are:

    npm test -- --runInBand 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx'
    npm test -- --runInBand 'src/app/events/[id]/schedule/components/eventForm/hooks/__tests__/useEventDivisionNormalization.test.ts'
    npm test -- --runInBand 'src/app/events/[id]/schedule/components/eventForm/hooks/__tests__/useEventFormConfigurationActions.test.ts'
    npm test -- --runInBand 'src/app/events/[id]/schedule/components/eventForm/hooks/__tests__/useEventPaymentController.test.ts'
    npm test -- --runInBand 'src/app/events/[id]/schedule/components/eventForm/sections/__tests__/ManualPaymentSettingsSection.test.tsx'
    npm test -- --runInBand 'src/app/events/[id]/schedule/components/eventForm/sections/__tests__/EventFormSections.test.tsx'
    npm test -- --runInBand 'src/app/events/[id]/schedule/components/__tests__/MatchRulesSection.test.tsx'
    npm test -- --runInBand 'src/server/scheduler/__tests__/leagueTimeSlots.test.ts' 'src/server/scheduler/__tests__/tournamentTimeSlots.test.ts'

For the division-phase persistence milestone, create and inspect one migration. Use a descriptive timestamped migration directory under `prisma/migrations`. Then run:

    npx prisma generate
    npx prisma validate

Do not deploy the migration to a live database as part of this plan. Live deployment requires a separate explicit request.

After the implementation is complete, run:

    npx tsc --noEmit
    npx eslint \
      'src/app/events/[id]/schedule/components/EventForm.tsx' \
      'src/app/events/[id]/schedule/components/eventForm/simpleSetup' \
      'src/app/events/[id]/schedule/components/eventForm/sections' \
      'src/components/ui/ImageUploader.tsx' \
      'src/lib/manualRegistrationPayments.ts'

Run the final event-form tests without coverage first. Then run the repository CI command only after the targeted tests pass:

    npm test -- --runInBand 'src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx' 'src/app/events/[id]/schedule/components/eventForm'
    npm run test:ci

Expected targeted test output has no failing suites. The exact pass count will grow as tests are added. Record the final count in `Artifacts and Notes` when each milestone completes.

For browser verification, use the local URL and test event selected for the implementation. Record the exact URL, viewport, event type, and observed result in `Artifacts and Notes`. If no development server is already running, stop and obtain explicit authorization before starting one.

At each stopping point, update `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`, and the revision note at the bottom of this file.

## Validation and Acceptance

The implementation is accepted only when all of these behaviors are observable:

1. The wizard shell has clean corners at desktop and mobile widths. Header, body, and footer borders stay within one radius.
2. Event type has a compact fixed width. Registration destination uses adjacent white space and wraps on a narrow viewport.
3. The event image preview has event-card proportions. It sits to the left of Basics fields on desktop and above them on mobile.
4. The user answers shared-versus-separate division mode once in Participation Plan.
5. Division numeric fields keep fixed compact widths. Rows wrap without stretching. Related set-score controls remain aligned.
6. Bracket Teams starts empty. Enabling a bracket does not enter 2. Empty or invalid input shows `At least 2 teams need to be in the bracket.` directly under the field and blocks Next.
7. Schedule Plan shows four descriptive choices and no resource source or resource count.
8. Fixed event window hides weekly controls and keeps one non-repeating slot synchronized with event dates, times, time zone, resources, and divisions.
9. Weekly repeating timeslots has no redundant outer bordered container. Fixed and mixed styles show only their applicable editors.
10. Simple Setup has no event-wide Competition Plan or Competition Rules page.
11. Each visible league, pool, bracket, or playoff phase has a Division Rules action. Different divisions and phases can save different rule overrides.
12. Timed sports calculate scheduled regulation duration from segment count, segment length, and break between segments. Set sports keep set count outside the rules dialog.
13. Newly generated matches store the rule snapshot for their division and phase. Existing saved snapshots remain stable.
14. In Simple Setup, all division price and payment-plan inputs appear on Pricing and Registration and do not appear on Divisions. In Advanced Setup, they remain inside the existing division controls.
15. Without Stripe, a new event defaults to Self-managed payment. Selecting BracketIQ online registration offers Connect Stripe and does not create an unusable online state.
16. Manual payment providers show real marks and provider-specific inputs. Cash App, Venmo, PayPal, and HTTPS destinations normalize like the mobile app. Cash App input `$camka14` is accepted and persisted as `https://cash.app/$camka14`.
17. Manual mode shows a plain Registration price and hides Online price, fee breakdowns, automatic refunds, and payment plans in Simple Setup and Advanced Setup.
18. Invalid manual-payment input shows provider-specific text beside the row. It is not silently removed and is not visible only in a generic alert.
19. Every Operations Plan choice changes Staff and Operations content. Turning all choices off removes the page.
20. A collapsed Advanced Setup section with an error shows a red text badge next to its title and in section navigation. Review or publish expands, scrolls to, and focuses the first invalid field.
21. Review shows every applicable section in read-only form. Each Edit action returns to the correct owner page. Changed values appear after returning to Review.
22. Create, save, reload, edit, and match-generation tests pass for timed and set-based events.
23. `npx tsc --noEmit`, targeted Jest tests, and relevant lint checks pass. Any unrelated pre-existing repository failure is recorded with its exact output and is not hidden.

## Idempotence and Recovery

The UI refactors and pure helpers are safe to reapply when they use stable props and types. Preserve valid form values when a planning choice changes. Never reset an entire event form to implement one conditional page.

The Prisma migration is additive. It adds a nullable JSON field, so existing rows remain valid. The repository must treat a missing phase setting as a request to use the legacy event-wide or sport default. If the migration is created but not applied, remove only that new migration directory before any shared database uses it. Do not edit an already applied migration.

Fixed-window normalization must be idempotent. Running it twice with the same event inputs must produce an equal slot and must not append a second slot. Rental-linked immutable slots are outside this normalization and must remain unchanged.

Manual payment normalization must be idempotent. Normalizing a provider handle twice must return the same HTTPS destination. Formatting a saved canonical Cash App or Venmo URL for editing must restore the provider-friendly handle. A mode change must clear only the incompatible online-payment values named in Milestone 5. Invalid raw input must stay in form state until the user fixes or removes it.

The current worktree contains unrelated affiliate changes. Do not stage, revert, format, regenerate, or commit those paths as part of this plan. Stage explicit event-wizard paths only if the user later requests a commit.

## Artifacts and Notes

Initial visual evidence consists of the five user-supplied screenshots from 2026-08-03:

- Format shows nested rounded containers and an Event type select that fills half of a very wide page.
- Basics shows a full-width image crop at 160 pixels high.
- Divisions shows a second Single Division decision after Participation Plan.
- Schedule Plan shows an open schedule-style select beside Resource source.
- Operations Plan shows four choices whose next page does not change.

Exact accepted copies are stored in `/Users/elesesy/.codex/visualizations/2026/08/03/019fc8b1-9594-77f0-ac11-5ab96b0b7511/event-simple-setup-audit` as `01-format.png` through `05-operations-plan.png`.

The follow-up Advanced Setup screenshot is stored in the same directory as `06-advanced-manual-payments.png`. It shows Cash App selected with `$camka14`, no inline validation message, and a Manual Payments title with no error status.

Important source evidence:

    ImageUploaderProps includes className, but ImageUploader does not apply it.
    EventCard uses h-44 for its image region.
    SimpleSetupScheduleLocationPage does not receive scheduleStyle.
    SimpleSetupCompetitionRulesPage renders SingleDivisionDefaultsPanel.
    StaffManagementPanel receives no Simple Setup visibility choices.
    schema.ts requires every manual payment value to be a URL before provider normalization.
    ManualPaymentSettingsSection does not render manualPaymentLinks array errors.
    pricingControlsEnabled treats manual mode like Stripe availability and exposes online fee UI.

Add concise test counts, browser viewport results, migration name, and significant diffs here as each milestone completes.

Milestone 4 added migration `20260803210000_add_division_phase_settings`. Eleven phase-helper tests, 117 focused repository and component tests, 53 scheduler integration tests, and all 102 EventForm tests pass. Prisma Client generation includes `Divisions.phaseSettings`. The generator also included the separate in-progress affiliate schema addition; its generated whitespace was normalized without removing that unrelated model.

Milestone 5 added eight provider and payment focused suites with 146 passing tests. The complete EventForm suite has 103 passing tests. The provider contract accepts `$camka14`, persists `https://cash.app/$camka14`, and restores `$camka14` for editing. Repository tests confirm that manual mode preserves event and division prices while it removes Stripe-only plan and refund data. Scoped ESLint passed with one React Compiler warning in a test harness that calls React Hook Form `watch()`. `npx tsc --noEmit` and `git diff --check` pass.

Milestone 6 added four pure schedule-style tests and expanded the slot and wizard suites. Five focused suites have 65 passing tests. The complete EventForm suite has 104 passing tests. Tests cover style inference, fixed-window idempotence, date and time-zone synchronization, compatible slot preservation, immutable rental slots, filtered weekly and one-time controls, mixed groups, and the unstyled Simple Setup slot surface. Scoped ESLint, `npx tsc --noEmit`, and `git diff --check` pass.

Milestone 7 added explicit operations capability state and Staff Management visibility tests. Ten focused operations, payment, phase, scheduler, and repository suites have 127 passing tests. The complete EventForm suite has 104 passing tests. Tests cover page removal with all choices off, each visible block, team-officiating ownership, role-specific invite cleanup, manual-payment compatibility, and persisted phase rules. Scoped ESLint passes with one known React Compiler warning in a test harness that calls React Hook Form `watch()`. `npx tsc --noEmit` and `git diff --check` pass.

Milestone 8 added the shared error-ownership index, the shared collapsed-section shell, inline provider errors, Simple and Advanced recovery navigation, and accessible status summaries. Seven focused suites have 26 passing tests. The complete EventForm suite has 106 passing tests. Integration tests cover two simultaneous Advanced section blockers, recovery after the first fix, collapsed title and desktop/mobile navigation counts, raw invalid Cash App input, Simple Review routing, and exact field focus. Scoped ESLint, `npx tsc --noEmit`, and `git diff --check` pass.

Milestone 9 added a pure normalized review model and a dedicated read-only review page. Three focused review tests and all 107 EventForm tests pass, for 110 tests in the combined run. Tests confirm complete section coverage, current-value rebuilding, omission of raw payment destinations, no editable controls, warning display, exact Edit routing, and updated values after returning to Review. Scoped ESLint, `npx tsc --noEmit`, and `git diff --check` pass.

Milestone 10 ran the event-form, scheduling, match, persistence, image, and API verification serially. The targeted integration run has 59 passing suites and 538 passing tests. The complete repository CI run has 773 passing suites and 4,267 passing tests. The route coverage check passes for 315 route files at 65.44% statements, 54.11% branches, 65.47% functions, and 66.51% lines. Prisma reports a valid schema. TypeScript, changed-file ESLint, and `git diff --check` pass. No service was running on port 3000, so no browser viewport result is claimed.

## Interfaces and Dependencies

Use the current Next.js App Router, React Hook Form, Mantine, Tailwind, Zod, Prisma, and Jest dependencies. Do not add a new form, layout, payment, or rules library.

Use Lucide icons for generic image and link actions. Use real provider image files under `public/payment-providers`. Keep alt text on every provider image. Do not use emoji, inline SVG, or CSS drawings as provider artwork.

The final Simple Setup choice type must retain the event-type, registration, participation, division-mode, schedule-style, document, question, and operations choices that control visible behavior. Remove planning-only resource and competition switches when their consumers are gone.

The final division phase contract must expose:

    export type DivisionCompetitionPhase = 'LEAGUE' | 'POOL' | 'BRACKET' | 'PLAYOFF';

    export type DivisionPhaseSettings = {
        matchRulesOverride?: MatchRulesConfig | null;
        autoCreatePointMatchIncidents?: boolean;
        segmentLengthMinutes?: number | null;
        segmentBreakMinutes?: number | null;
    };

    export type DivisionPhaseSettingsMap = Partial<Record<DivisionCompetitionPhase, DivisionPhaseSettings>>;

Create pure functions with stable names or equivalent names that communicate the same purpose:

    calculateRegulationMatchDurationMinutes(input): number | null
    resolveMatchCompetitionPhase(match, event): DivisionCompetitionPhase
    resolveDivisionPhaseRules(input): ResolvedMatchRules
    normalizeFixedEventWindowSlot(input): LeagueSlotForm
    normalizeManualPaymentDestination(provider, value): string | null
    formatManualPaymentProviderInput(provider, value): string
    getManualPaymentLinkError(provider, value): string | null
    buildEventFormErrorIndex(errors): EventFormErrorIndex

The error index must provide ordered errors and group them by both setup surfaces:

    export type EventFormErrorLocation = {
        path: string;
        message: string;
        simplePageId: EventSetupPageId;
        advancedSectionId: string;
        focusFieldName: string;
    };

    export type EventFormErrorIndex = {
        ordered: EventFormErrorLocation[];
        bySimplePage: Partial<Record<EventSetupPageId, EventFormErrorLocation[]>>;
        byAdvancedSection: Record<string, EventFormErrorLocation[]>;
    };

Extend `SectionNavigationItem` with `errorCount?: number`. Define the shared Advanced Setup shell with `id`, `title`, `collapsed`, `onToggle`, `errorCount`, `firstErrorMessage`, and `children` props. Existing section identifiers must not change because scroll navigation and tests use them.

`calculateRegulationMatchDurationMinutes` must return `null` when required timed values are missing. `normalizeFixedEventWindowSlot` must return one deterministic slot value and must not mutate its input. `resolveDivisionPhaseRules` must implement the fallback order in Milestone 4.

The final review page must receive normalized display models, not raw Prisma rows. Each section model must include its owner page identifier so its Edit action can navigate without duplicating routing rules.

Revision note, 2026-08-03: Created the initial ExecPlan from the supplied screenshots, repository source audit, and mobile payment behavior audit. The plan now separates ten independently verifiable milestones so the user can approve and implement them one at a time. The follow-up revisions add provider-aware Cash App, Venmo, and PayPal validation; plain manual registration pricing without online fees; inline payment-row errors; and shared collapsed-section error discovery for Advanced Setup. Moving pricing out of Divisions applies only to Simple Setup. Advanced Setup retains its per-division pricing placement. Saved exact copies of all accepted screenshots with the audit artifacts and scoped the whitespace check to milestone paths because the worktree contains unrelated changes. The implementation record now marks all ten milestones complete. Milestone 4 documents the persisted phase contract, the phase-resolution edge cases, the derived-duration scheduler behavior, the generated Prisma artifacts, and the deferred runtime visual check. Milestone 5 documents consolidated Simple pricing, the no-Stripe path, provider-aware destinations, server enforcement, and shared manual-mode presentation. Milestone 6 documents schedule-style inference, style-specific controls, fixed-window synchronization, rental preservation, and the removal of the redundant Simple Setup timeslot panel. Milestone 7 documents explicit operations capabilities, conditional Staff and Operations blocks, role-specific cleanup, and team-officiating ownership. Milestone 8 documents shared error ownership, collapsed-section counts, exact focus recovery, and the separate draft versus persistence normalization boundaries for invalid manual payment input. Milestone 9 documents normalized read-only review models, complete section coverage, and exact owner-page Edit actions. Milestone 10 documents the complete CI result, schema and static verification, scoped pre-existing lint findings, and the deferred browser pass.
