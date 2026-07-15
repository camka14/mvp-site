# Build a complete page-based Simple Setup wizard for event creation and editing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root. It is self-contained so a contributor can implement the feature without relying on prior conversation.

## Purpose / Big Picture

BracketIQ's current event form exposes the full event model on one long Advanced Setup screen. The screen changes shape as users select an event type, enable external registration, choose teams, change division mode, enable playoffs or pool play, choose payment plans, configure taxes, or enable staffing options. Those inline changes make it difficult to understand which decisions caused sections to appear or disappear.

After this plan is complete, event creation opens in a page-based Simple Setup wizard. Simple Setup does not remove advanced capabilities. Instead, it presents every applicable option in a deliberate order. A decision that changes which fields are needed is asked on an earlier planning page; the resulting details are entered on a later page. A labeled progress rail shows every page, makes completed and available pages easy to revisit, and greys out pages that are locked or not used by the selected path. Users can switch at any time between Simple Setup and the existing Advanced Setup screen without losing form data.

The result is observable by creating an Event, Weekly Event, League, Tournament, Tryout, and externally registered listing. Each path shows a stable sequence of pages, collects the same data available in Advanced Setup, and produces the same event payload and validation behavior.

## Progress

- [x] (2026-07-12) Inspected the current event form, event-type transitions, affiliate simplifications, division editors, scheduling controls, competition configuration, pricing, documents, registration questions, and staff controls.
- [x] (2026-07-12) Defined the Simple Setup page order, page states, dependencies, and single-versus-split division behavior in this plan.
- [x] (2026-07-12) Added the pure capability, page-state, transition-impact, and validation-routing resolver with 29 focused passing tests.
- [x] (2026-07-12) Added shared Simple/Advanced form mode state over the existing React Hook Form draft; switching modes preserves entered values.
- [x] (2026-07-12) Implemented the labeled, horizontally scrollable progress rail, current-page centering, direct page navigation, and sticky Back/Next controls.
- [x] (2026-07-12) Implemented all fourteen Simple Setup pages by composing the existing event-form controls with new planning-page components.
- [x] (2026-07-12) Added destructive-transition confirmations and current-page versus full-form validation routing.
- [x] (2026-07-12) Added resolver coverage for all managed and external event paths plus EventForm integration coverage for create defaults, edit defaults, and mode-switch draft preservation.
- [x] (2026-07-12) Constrained Tryout divisions to organization-owned selections, added inline organization-division creation, made source division parameters read only, and kept only the event-specific Tryout price editable.
- [x] (2026-07-13) Fixed the initialization dirty-baseline race and verified the complete EventForm suite passes all 97 tests together.
- [ ] Verify desktop and mobile browser layouts with authenticated screenshots. The worktree server is reachable on port 3011, but its auth context rejects the available local credentials and does not accept the existing port-3000 session.

## Surprises & Discoveries

- Observation: External registration is currently a boolean and URL layered over the selected event type, not a standalone event type for new records.
  Evidence: `src/app/events/[id]/schedule/components/eventForm/sections/EventDetailsTypeControls.tsx` renders `eventType`, `isAffiliateEvent`, and `affiliateUrl` as separate controls. `src/app/events/[id]/schedule/components/EventForm.tsx` uses the affiliate URL to suppress internal scheduling and operations.

- Observation: Changing event type or enabling external registration currently clears or forces several fields immediately.
  Evidence: `src/app/events/[id]/schedule/components/EventForm.tsx` forces team registration for League and Tournament, forces separate organization divisions for Tryout, and clears payment plans, documents, staff, officials, match rules, and other fields when external registration is enabled.

- Observation: The current external-registration division mode is inconsistent with previously supported affiliate data because the UI passes `singleDivisionOnly={isAffiliateEvent}` while affiliate division rows and per-division prices still exist.
  Evidence: `DivisionModeControls` receives `singleDivisionOnly` for affiliate events, while the affiliate branch still renders `DivisionEditorLeaguePanel` and `DivisionSummaryList` with division-level capacity and price support.

- Observation: Some conditional behavior occurs inside repeated editors. A weekly slot can switch between repeating and fixed dates, payment plans can expose an arbitrary number of installments, and tournament set counts control repeated points-to-victory inputs.
  Evidence: `src/app/discover/components/LeagueFields.tsx`, `src/app/discover/components/TournamentFields.tsx`, and the payment plan controls all change their detailed input layout based on a choice in the same component.

- Observation: The create route cannot currently be visually verified in the isolated worktree without an authenticated session accepted by that server.
  Evidence: The event-creation route on port 3011 redirects to the sign-in screen. The existing localhost port-3000 Chrome session is not accepted by the worktree server, and the known local test credentials are rejected.

- Observation: Reusing the entire existing Divisions section initially repeated the shared-versus-split control on both Participation Plan and Divisions.
  Evidence: The final composition now renders `DivisionModeControls` only in Advanced Setup. Simple Setup owns that structural choice exclusively on Participation Plan and invalidates dependent page completion when the choice changes.

- Observation: The original Tryout selector created correct source snapshots but still exposed selected snapshots through the normal event division editor.
  Evidence: `EventForm.tsx` rendered `DivisionEditorLeaguePanel` and `DivisionSummaryList` after `TryoutDivisionSelector`, allowing organization-owned gender, age, skill, name, and capacity values to be edited as if they were event-owned configuration.

## Decision Log

- Decision: Simple Setup contains all applicable options; Advanced Setup is an alternate layout, not a higher feature tier.
  Rationale: Users should not need to discover that an important event capability exists only after switching modes.
  Date/Author: 2026-07-12 / Codex

- Decision: Use one form state and one payload builder for both modes.
  Rationale: Maintaining separate simple and advanced drafts would cause data loss and inconsistent validation when switching modes.
  Date/Author: 2026-07-12 / Codex

- Decision: Use fourteen named pages in a stable order, including separate planning and detail pages for schedule, competition, registration, and operations.
  Rationale: A choice that changes the later form shape must be collected before the page containing the dependent inputs.
  Date/Author: 2026-07-12 / Codex

- Decision: Keep dependency choices visible on their planning page. If a choice depends on another choice on that page, render it disabled with an explanation rather than inserting or removing it with animation.
  Rationale: Planning pages should not jump as the user answers questions, while still showing the complete capability surface.
  Date/Author: 2026-07-12 / Codex

- Decision: Define division mode as `SHARED` or `SPLIT` in the Simple Setup UI while continuing to map it to the existing `singleDivision` boolean.
  Rationale: "Single Division (all skill levels play together)" does not clearly explain configuration ownership. Shared means one participant pool, price, capacity, and competition configuration. Split means each division owns those values independently.
  Date/Author: 2026-07-12 / Codex

- Decision: Tryouts always use split organization divisions. Event, Weekly Event, League, Tournament, and external listings can choose shared or split divisions.
  Rationale: Tryout sessions are scheduled for specific club divisions, while external tournaments and leagues can legitimately publish multiple divisions with different prices and capacities.
  Date/Author: 2026-07-12 / Codex

- Decision: The Tryout Divisions page is a selector over organization-owned divisions, not a general division editor.
  Rationale: Club gender, age, skill, name, season price, and season capacity are organization catalog data. A Tryout snapshots those values and may change only the event-scoped per-player Tryout price. Organizations with no divisions can create one in a modal without leaving event setup.
  Date/Author: 2026-07-12 / Codex

- Decision: Page availability is represented by five states: current, complete, available, locked, and not used.
  Rationale: A grey page can mean either that prerequisites are incomplete or that the chosen path does not use the page; those cases need distinct explanations.
  Date/Author: 2026-07-12 / Codex

- Decision: Create opens in Simple Setup. Edit opens in Advanced Setup unless the user switches modes during the current session.
  Rationale: New users benefit from guided sequencing, while existing complex events should initially expose their complete persisted configuration.
  Date/Author: 2026-07-12 / Codex

## Outcomes & Retrospective

The first complete Simple Setup implementation now exists under `src/app/events/[id]/schedule/components/eventForm/simpleSetup/` and is integrated into the existing `EventForm`. New events open in Simple Setup, existing events open in Advanced Setup, and both layouts operate on the same React Hook Form draft and existing payload builder. The stable fourteen-page rail resolves page use, prerequisites, completion, and explanations from the selected event path. Planning pages collect structural choices before the corresponding detail pages, while the detail pages reuse the established controls for basics, divisions, scheduling, competition, registration, documents, questions, staff, and review.

The focused resolver and navigation suites pass 29 tests, the new EventForm create, mode-switch, and Tryout ownership integration tests pass, and the focused Tryout selector and snapshot suites pass. `npx tsc --noEmit` passes, and `git diff --check` is clean. The initialization dirty baseline now exists before reset normalization, and its delayed rebase refuses to absorb a real user edit; the complete EventForm suite consequently passes all 97 tests in one run. Authenticated desktop and mobile screenshot verification remains pending because the isolated worktree server does not accept the available local browser session or known local credentials. No database, auth, or user records were changed merely to obtain screenshots.

## Context and Orientation

The current form is `src/app/events/[id]/schedule/components/EventForm.tsx`. It uses React Hook Form values described by `src/app/events/[id]/schedule/components/eventForm/formTypes.ts` and validated by `src/app/events/[id]/schedule/components/eventForm/schema.ts`. `buildEventDraft.ts` converts the form values into the event payload used by create and edit APIs.

The current Advanced Setup sections are Basic Information, Event Details, Manual Payments, Match Rules, Staff, Divisions, League or Pool Scoring, and Schedule. Visibility is calculated directly inside `EventForm.tsx`. The new wizard must not replace or fork these contracts. It should reuse controls or extract shared control groups where necessary.

In this plan, a "planning page" contains choices that determine later page structure. It does not contain the detailed fields enabled by those choices. A "detail page" contains a stable set of inputs derived from completed planning pages. Adding or removing repeated records, such as divisions, timeslots, questions, installment rows, or staff assignments, is allowed on a detail page because it does not change the event path. Choosing a record type that changes its fields must happen before the record detail editor opens.

An "external listing" is an event with an `affiliateUrl`. It retains an Event, Weekly Event, League, Tournament, or Tryout type for labeling and filtering, but registration happens on another website. External listings do not use BracketIQ checkout, documents, registration questions, staff scheduling, match generation, or internal competition rules.

## Page Rail and Navigation Contract

The progress rail has these page names in this exact order:

1. Format
2. Basics
3. Participation Plan
4. Divisions
5. Schedule Plan
6. Schedule & Location
7. Competition Plan
8. Competition Rules
9. Registration Plan
10. Pricing & Registration
11. Documents & Questions
12. Operations Plan
13. Staff & Operations
14. Review & Publish

On desktop, render a sticky horizontal stepper above the form. It may horizontally scroll but must keep stable item dimensions and full page names. On narrow screens, use the same horizontally scrollable rail and keep the current page centered when navigation changes. Do not shrink text based on viewport width.

Each page has one of five states:

- `current`: selected page, emphasized with the primary color and current-step marker.
- `complete`: required fields for that page pass page-level validation. It is clickable.
- `available`: prerequisites are complete, but the page is unfinished. It is clickable.
- `locked`: a prerequisite page is incomplete. It is grey. Clicking it identifies and navigates to the earliest incomplete prerequisite.
- `not-used`: prior choices make the page inapplicable. It is grey with a "Not used" status. It remains clickable and shows why it is skipped plus a link back to the planning page that can enable it.

Back and Next buttons remain fixed below the page body. Users may click any complete or available page directly. Navigating backward never clears later data. If an earlier choice would invalidate or clear later data, show a confirmation listing the affected pages and data categories before applying the transition.

Switching to Advanced Setup shows the existing complete form with its section navigation. Switching back reconstructs page states from the current form values plus transient Simple Setup choices. Do not reset the form on mode change.

## Page Content and Dependencies

### Page 1: Format

Purpose: choose the two decisions that determine the top-level event path.

Controls:

- Event type: Event, Weekly Event, League, Tournament, or Tryout.
- Registration destination: BracketIQ registration or External registration.

Rules:

- Tryout is available only when the event belongs to an organization with `CLUB_TEAMS` enabled.
- League and Tournament map to team registration.
- Tryout maps to individual registration and split organization divisions.
- External registration does not change the event type. It activates the external-listing capability set.
- Do not reveal the affiliate URL, playoff options, pool-play options, or other dependent fields on this page.
- Changing either answer after later configuration exists requires a confirmation before current simplification logic clears incompatible data.

Completion unlocks Basics and the path-aware progress rail.

### Page 2: Basics

Purpose: establish the identity and sport context used by all later defaults.

Controls:

- Event image.
- Event name.
- Sport.
- Description.
- Additional searchable tags.
- External URL when Page 1 selected External registration.

Rules:

- League, Tournament, and Tryout reserved tags are applied automatically and remain locked.
- Sport must be selected here because it determines scoring model, set or period terminology, match-rule defaults, and official-position defaults on later pages.
- Changing sport after Competition Rules or Staff & Operations contains customized values requires confirmation before resetting sport-derived overrides.
- This page has no controls whose answer inserts another field on the same page. External URL presence is known from Page 1 before this page renders.

### Page 3: Participation Plan

Purpose: decide participant and division ownership before any division details are entered.

Controls are displayed in a fixed layout. Inapplicable choices remain visible but disabled with a reason.

- Registration unit: individuals or teams.
- Team size when teams are used.
- Division mode: Shared configuration or Split divisions.
- Register by division type.
- League playoffs: yes or no.
- Split league and playoff divisions: yes or no.
- Tournament pool play: yes or no.

Rules:

- Managed Event and Weekly Event allow individual or team registration.
- Managed League and Tournament force teams.
- Managed or external Tryout forces individuals and split divisions selected from the organization.
- External listings preserve division mode, prices, and capacities for discovery, even though they do not register users internally.
- Register by division type is available only for managed split divisions.
- Split league and playoff divisions is enabled only when type is League, playoffs are enabled, division mode is Split, and no immutable rental restriction prevents it.
- Pool play is available only for Tournament.
- No division editor appears on this page.

Completion determines the Divisions page layout and whether competition configuration pages will be used.

### Page 4: Divisions

Purpose: define classification, capacity, and participant pools without mixing in pricing or competition rules.

Shared configuration controls:

- Gender classification.
- Skill division type.
- Age division type.
- Display name.
- Event maximum participants or teams.

Split division controls:

- Repeated divisions with gender, skill, age, display name, and maximum participants or teams.
- League playoff division list when split league and playoff divisions was selected.

Tryout controls:

- Select one or more organization club divisions.
- Create an organization division in a modal when the organization has no suitable division.
- Show organization division name, sport, gender, age, skill, season price, and season capacity as read-only values.
- Enter an event-specific per-player Tryout price for each selected division.

Rules:

- Shared configuration means one registration pool, one capacity, one price definition, and one competition configuration applies to the selected classification.
- Split divisions means every division has its own registration pool, capacity, price definition, schedule assignment, and competition configuration where applicable. Tryouts are the exception: their source capacity and classifications remain organization-owned and read only.
- Non-Tryout division prices and payment plans are entered later on Pricing & Registration. Tryout prices are entered beside each selected organization division on this page so they cannot be confused with the organization division season price.
- Playoff placement mapping is entered on Competition Rules after bracket team counts are known.
- Adding and removing division rows is allowed on this page. Each row always renders the same field set chosen by Page 3.

### Page 5: Schedule Plan

Purpose: decide schedule and resource structure before date, time, map, and timeslot editors render.

Controls:

- Schedule style: fixed event window, weekly repeating timeslots, fixed one-time timeslots, or mixed timeslots where supported.
- Use event end datetime or no fixed end datetime where the current event type supports generated schedules.
- Resource source: organization resources, custom event resources, immutable rental resources, or location only.
- Number of custom resources when custom resources are selected.
- Timeslot division assignment: all divisions or specific divisions. Shared division mode is fixed to all divisions.

Rules:

- A normal Event uses a fixed event window unless backed by immutable rental slots.
- Weekly Event, League, Tournament, and managed Tryout can use timeslots.
- Tryout requires division-specific timeslots and at least one resource per selected division.
- External listings use published date/time and location only; they do not create scheduler timeslots.
- Immutable rental resources are selected before the event form and are read-only here.
- Mixed timeslots allows both weekly and fixed slot records. The user chooses a slot type in an add-slot prompt before the slot detail editor opens; changing a saved slot's type requires confirmation.
- No date picker, map, resource picker, or slot detail fields appear on this page.

### Page 6: Schedule & Location

Purpose: enter the schedule details determined by Schedule Plan.

Controls:

- Event start and end date/time as applicable.
- Location search, map, selected address, and coordinates.
- Organization resource selection.
- Custom resource names.
- Repeated fixed or weekly timeslot editors.
- Timeslot resource and division assignments.
- Conflict warnings and existing auto-resolution actions.

Rules:

- A weekly slot editor always shows days of week plus start/end times and optional date overrides.
- A fixed slot editor always shows explicit start and end date/time.
- Do not place a "Repeats weekly" switch inside a detail editor. Slot type was selected on Schedule Plan or in the add-slot type prompt before details are shown.
- Tryout timeslots show the selected organization division and require an assigned resource.
- External listings show only source date/time, location, and coordinates.

### Page 7: Competition Plan

Purpose: decide which competition and scoring details the next page must collect.

This page is `not-used` for Event, Weekly Event, Tryout, and all external listings unless a future product decision explicitly enables internally generated competition behavior for those paths.

Controls:

- Use sport-recommended match rules or customize match rules.
- Use default scoring configuration or customize scoring.
- Tournament format: single elimination or double elimination.
- Set, period, inning, or points-only model, normally locked to the selected sport's model.
- Sets per match or winner-bracket set count when the sport uses sets.
- Loser-bracket set count for double-elimination set-based tournaments.
- Automatically create point incidents: yes or no.

Rules:

- League playoff and Tournament pool-play decisions come from Participation Plan and are summarized here.
- Sport-derived scoring model is visible but disabled unless the existing data contract supports an override.
- Dependent choices remain visible and disabled. For example, loser-bracket set count is visible but disabled until double elimination is selected.
- This page never renders points-to-victory arrays, pool counts, duration fields, or detailed rule editors.

### Page 8: Competition Rules

Purpose: enter all competition details selected on Competition Plan and earlier pages.

Controls include every applicable current Advanced option:

- Games per opponent.
- Match or set duration.
- Rest time between matches.
- Points to victory for every configured set.
- League playoff team counts.
- Tournament pool count and derived teams per pool.
- Tournament bracket team count.
- Winner and loser bracket points to victory.
- Prize.
- Match-rule overrides.
- League or pool scoring configuration.
- Split playoff division placement mapping.

Rules:

- The page field set is fixed before entry because set counts, tournament format, pool play, playoffs, division mode, and customization choices were all answered earlier.
- Split divisions render one stable configuration editor per division.
- Shared configuration renders one editor whose values apply to the shared participant pool.

### Page 9: Registration Plan

Purpose: choose registration, pricing, payment, document, and question features before their details appear.

For managed registration, controls are displayed in a fixed layout:

- Free or paid registration.
- Online Stripe checkout or self-managed manual payment.
- Use payment plans.
- Allow a team to split payments when team registration and payment plans are enabled.
- Tax handling: inherit organization policy, organizer-managed tax, or no organizer tax where allowed.
- Enable automatic refunds.
- Require documents.
- Ask registration questions.

Rules:

- External listings show their external-registration summary and mark internal payment, document, and question choices unavailable.
- Tryout uses per-player total prices and does not use payment plans under the current contract.
- Payment plans require paid managed registration and an available online payment path.
- Team split requires teams and payment plans.
- Automatic refunds require online payment.
- Organizer tax rate details are collected on the next page; choosing the tax method here does not reveal a rate input here.
- Required-document and registration-question editors are on Page 11.

### Page 10: Pricing & Registration

Purpose: enter capacity-adjacent registration rules and every applicable price or payment detail selected previously.

Controls:

- Shared event price or per-division prices.
- External display prices using the simplified cents input.
- Registration cutoff hours.
- Refund cutoff hours when automatic refunds are enabled.
- Payment plan installment count, amounts, and due dates or weekly relative due days.
- Team split default.
- Manual payment providers, labels, links, and instructions.
- Organizer-managed tax rate.

Rules:

- Installment count was chosen or enabled on Registration Plan. Changing the number of installments uses an explicit edit action that opens a replacement confirmation instead of silently animating extra rows into the page.
- The sum of installment amounts remains the authoritative total price.
- Shared configuration stores price at event level. Split divisions store price and payment configuration on each division.
- Tryout pricing is not duplicated here. Each per-player Tryout price is edited on Divisions beside its read-only organization source settings.
- External listings never use platform fees, Stripe checkout, payment plans, or tax collection.

### Page 11: Documents & Questions

Purpose: configure registration requirements selected on Registration Plan.

Controls:

- Required organization document templates.
- Repeated registration questions with prompt, answer type, required flag, and ordering.

Rules:

- The page is `not-used` when both features are off or registration is external.
- Required documents and questions occupy fixed subsections based on prior choices; toggling them is not repeated here.
- Adding, removing, and reordering repeated questions is allowed because it does not alter the page path.

### Page 12: Operations Plan

Purpose: decide staff, official, check-in, and roster behavior before assignment editors appear.

This page is `not-used` for external listings and managed Tryout under the current Advanced Setup behavior.

Controls in a fixed layout:

- Assign hosts or assistant hosts.
- Assign dedicated officials.
- Official scheduling mode.
- Load sport default official positions or define custom positions.
- Teams provide officials.
- Team officials may swap.
- Team check-in mode: off, event, or match.
- Allow match roster edits.
- Allow temporary match players.

Rules:

- Team-only choices remain visible but disabled for individual events.
- Team officials may swap is disabled until teams provide officials is selected.
- Temporary players is disabled until match roster edits is selected.
- Custom official positions is disabled when dedicated officials and team officiating are both off.
- The page has choices only. Staff search, invitations, position names, counts, field eligibility, and check-in minutes are on Page 13.

### Page 13: Staff & Operations

Purpose: enter assignments and operational details selected on Operations Plan.

Controls:

- Host and assistant host selection.
- Organization staff roster search or non-organization user search and invitation.
- Official assignment.
- Official position names and required counts.
- Official field and position eligibility.
- Team check-in opening minutes.
- Assigned host and official cards.
- Existing staffing coverage warnings.

Rules:

- The field set is fixed by Operations Plan.
- Loading sport defaults is an explicit replacement action and requires confirmation when custom position rows already exist.
- Adding and removing staff assignments does not alter page availability.

### Page 14: Review & Publish

Purpose: present the complete event before save and route errors back to the correct page.

Content:

- Event identity, sport, type, registration destination, and external link summary.
- Participants and division summary.
- Schedule, resources, and location summary.
- Competition summary when used.
- Pricing and registration summary.
- Documents, questions, staff, and operations summary.
- Draft, Private, or Published state controls using the existing create/edit contract.
- Save or publish action.

Rules:

- Run the complete current Zod schema and business validation before save.
- Group validation failures by wizard page and make every group heading navigate to that page.
- A skipped page cannot contain unresolved data that would be silently submitted. Changing a planning choice to disable a page must either clear its data after confirmation or preserve it while leaving the feature enabled.

## Page Dependency Summary

The following table is the authoritative high-level path resolver:

| Path | Divisions | Internal Schedule | Competition | Internal Registration | Requirements | Operations |
| --- | --- | --- | --- | --- | --- | --- |
| Managed Event | Shared or Split | Fixed event window | Not used | Available | Available | Available |
| Managed Weekly Event | Shared or Split | Weekly/fixed/mixed slots | Not used | Available | Available | Available |
| Managed League | Shared or Split | Weekly/fixed/mixed slots | Available | Available | Available | Available |
| Managed Tournament | Shared or Split | Weekly/fixed/mixed slots | Available | Available | Available | Available |
| Managed Tryout | Split organization divisions | Division timeslots | Not used | Simple per-player registration | Available | Not used under current behavior |
| External Event/Weekly/League/Tournament | Shared or Split | Listing date/location only | Not used | External URL and display pricing | Not used | Not used |
| External Tryout | Split organization divisions | Listing date/location only | Not used | External URL and display pricing | Not used | Not used |

## Plan of Work

First, add a pure resolver under `src/app/events/[id]/schedule/components/eventForm/simpleSetup/`. It must accept current form values, organization features, immutable rental context, and transient wizard choices. It returns event capabilities, page states, prerequisites, and a mapping from validation field paths to page IDs. Unit-test this module before changing UI.

Second, add a `setupMode` control outside the event payload and render a `Basic | Advanced` segmented control above `EventFormShell`. Rename the user-facing mode to `Simple Setup`, even if internal modules use `simpleSetup`. Keep the current Advanced form intact during this milestone.

Third, implement the progress rail and a page host. The page host renders exactly one page body at a time. Add Back, Next, and direct-step navigation. Keep page state in the existing React Hook Form instance. Add a small UI-only `EventSetupChoices` object for choices that are not persisted directly, such as whether an empty optional page has been intentionally enabled during a create session.

Fourth, extract shared controls from the existing section components only where reuse is necessary. Do not duplicate payload mapping or validation. Planning pages should write the same existing fields, while detail pages should reuse current input components with conditional switches removed or replaced by props resolved from prior pages.

Fifth, add confirmation dialogs for event type, registration destination, sport, division mode, pool/playoff mode, and any planning choice that would clear configured downstream values. The dialog must name affected pages and categories.

Sixth, add page-level validation and final error routing. Next validates the current page only. Review validates the full event. Advanced Setup continues to use full-form validation.

Finally, verify every path through browser tests and screenshots at desktop and mobile widths. Confirm that the progress rail is navigable, page bodies do not shift when a decision changes, and switching modes preserves data.

## Concrete Steps

Run all commands from `/Users/elesesy/StudioProjects/mvp-site-club-tryouts`.

1. Establish the baseline:

       git status --short --branch
       npx tsc --noEmit
       npm test -- --runInBand src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx

2. Add resolver tests before UI implementation. Expected test groups include:

       simpleSetupCapabilities.test.ts
       simpleSetupPages.test.ts
       simpleSetupTransitions.test.ts

3. During implementation, run focused tests after each milestone, then run:

       npx tsc --noEmit
       npm run test:ci
       git diff --check

4. Start the local server on an unused port and perform browser verification:

       REDIS_DISABLED=true npm run dev -- --hostname localhost --port 3011

Use Playwright to capture desktop and mobile screenshots for at least a managed Tournament with split divisions and pool play, a managed Tryout, and an external League.

## Validation and Acceptance

Acceptance requires all of the following observable behavior:

- Creating a new event opens Simple Setup and displays all fourteen named pages in the progress rail.
- Pages with unanswered prerequisites are grey and identify the prerequisite when clicked.
- Pages excluded by the selected path are grey, marked Not used, and explain which earlier choice controls them.
- Every applicable control currently available in Advanced Setup can be reached through Simple Setup.
- No detail field appears or disappears because of a switch on the same page. Planning choices affect only later detail pages or disabled choices in the same fixed planning layout.
- Event and Weekly Event allow individual or team registration. League and Tournament force teams. Tryout forces individual registration and split organization divisions.
- Shared and split division paths store capacity, price, scheduling, and competition configuration at the correct existing ownership level.
- External League, Tournament, and Tryout paths retain their event type and divisions while skipping internal scheduling, checkout, documents, questions, staff, and match generation.
- Switching from Simple to Advanced and back preserves all values.
- A destructive earlier change requires confirmation and lists what will be cleared.
- Review groups validation errors by page and navigation opens the correct field page.
- Existing Advanced Setup behavior and event payloads remain backward compatible.

## Idempotence and Recovery

The capability resolver and page definitions are pure and safe to rerun in tests. Database migrations are not expected for the wizard because it uses existing event fields and UI-only transient choices. If implementation reveals a choice that must persist independently of existing event data, update this plan and justify a schema change before adding a migration.

Keep Advanced Setup functional throughout implementation. If a Simple Setup milestone is incomplete, hide the Simple mode behind a local feature flag rather than partially replacing the current event form. Do not reset or delete existing event data to recover from a wizard transition bug.

## Artifacts and Notes

The intended rail is:

    Format -> Basics -> Participation Plan -> Divisions -> Schedule Plan
    -> Schedule & Location -> Competition Plan -> Competition Rules
    -> Registration Plan -> Pricing & Registration -> Documents & Questions
    -> Operations Plan -> Staff & Operations -> Review & Publish

Planning pages contain path decisions. Detail pages contain the stable fields enabled by those decisions. This separation is the central UX rule of the implementation.

## Interfaces and Dependencies

Create these stable types under `src/app/events/[id]/schedule/components/eventForm/simpleSetup/types.ts`:

    export type EventSetupMode = 'SIMPLE' | 'ADVANCED';

    export type EventSetupPageId =
        | 'format'
        | 'basics'
        | 'participation-plan'
        | 'divisions'
        | 'schedule-plan'
        | 'schedule-location'
        | 'competition-plan'
        | 'competition-rules'
        | 'registration-plan'
        | 'pricing-registration'
        | 'documents-questions'
        | 'operations-plan'
        | 'staff-operations'
        | 'review-publish';

    export type EventSetupPageStatus =
        | 'current'
        | 'complete'
        | 'available'
        | 'locked'
        | 'not-used';

    export type DivisionConfigurationMode = 'SHARED' | 'SPLIT';

    export interface EventSetupChoices {
        scheduleStyle: 'FIXED_WINDOW' | 'WEEKLY_SLOTS' | 'FIXED_SLOTS' | 'MIXED_SLOTS';
        resourceSource: 'ORGANIZATION' | 'CUSTOM' | 'RENTAL_LOCKED' | 'LOCATION_ONLY';
        customizeMatchRules: boolean;
        customizeScoring: boolean;
        paidRegistration: boolean;
        useRequiredDocuments: boolean;
        useRegistrationQuestions: boolean;
        useStaffAssignments: boolean;
        useDedicatedOfficials: boolean;
        useCustomOfficialPositions: boolean;
    }

In `simpleSetup/resolveEventSetup.ts`, expose pure functions with no React dependencies:

    export function resolveEventSetupCapabilities(input: EventSetupResolverInput): EventSetupCapabilities;

    export function resolveEventSetupPages(input: EventSetupResolverInput): EventSetupPage[];

    export function resolveValidationPage(fieldPath: string): EventSetupPageId;

`EventSetupCapabilities` must be the single visibility source for both Simple page status and any newly centralized Advanced section visibility. Do not create a second API payload. Both modes continue through the existing `buildEventDraft.ts` and current create/edit services.

Revision note 2026-07-12: Created this plan after the Simple Setup requirement was clarified to include every applicable Advanced option. The page structure separates every state-changing decision from the later detail page it controls and records the shared-versus-split division contract explicitly.

Revision note 2026-07-12: Implemented and tested the first milestone: capability resolution, progress-page state resolution, validation routing, and destructive-transition impact descriptions.
