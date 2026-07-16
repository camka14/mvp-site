# Separate simplified event setup into page-owned components

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan is maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

The website's Simple Setup flow currently shows the complete Advanced Setup form on several individual pages. For example, opening the Simple Setup `Basics` page renders Basic Information followed by Event Details, staff, divisions, competition, and schedule sections. After this change, each Simple Setup page will render only the inputs assigned to that page through a simple-owned component. The simple components will initially preserve the existing fields, controllers, validation, and save payload so they can be redesigned later without changing or destabilizing Advanced Setup.

A user can verify the result by creating an event in Simple Setup, completing Format, and moving through Basics, Divisions, Schedule & Location, Competition Rules, Pricing & Registration, Documents & Questions, and Staff & Operations. Each page must show its own content rather than the full advanced form, while switching to Advanced Setup must still show the complete advanced form.

## Progress

- [x] (2026-07-16 18:48Z) Audited the current Simple Setup renderer, page resolver, advanced sections, tests, and pre-existing dirty worktree.
- [x] (2026-07-16 18:48Z) Confirmed that `EventForm.tsx` routes every non-planning Simple Setup page to the complete `EventFormSections` renderer.
- [x] (2026-07-16 19:01Z) Added simple-owned page components and a simple page dispatcher while preserving the existing form controllers.
- [x] (2026-07-16 19:01Z) Replaced the all-sections Simple Setup fallback in `EventForm.tsx`.
- [x] (2026-07-16 19:01Z) Added regression coverage proving Basics and Divisions do not render unrelated advanced sections and that external registration retains its URL field.
- [x] (2026-07-16 19:01Z) Ran targeted Jest tests, TypeScript validation, ESLint, production build validation, and desktop/mobile browser verification.
- [x] (2026-07-16 19:02Z) Recorded the scoped commit containing only this work.

## Surprises & Discoveries

- Observation: The problem is broader than the Basics page reusing `BasicInformationSection`.
  Evidence: `EventForm.tsx` defines only seven planning page IDs as special and assigns `formSections`, the full `EventFormSections` tree, to every other Simple Setup page.

- Observation: A simple-owned documents component already exists but is not wired into the Simple Setup renderer.
  Evidence: `src/app/events/[id]/schedule/components/eventForm/simpleSetup/SimpleSetupDocumentsPage.tsx` contains the document and question UI, while `EventForm.tsx` never imports it.

- Observation: The worktree contains extensive unrelated affiliate import, schedule, navigation, organization, and package changes.
  Evidence: `git status --short` on 2026-07-16 showed no existing changes in the event form paths targeted by this plan, so this work can remain isolated.

- Observation: Isolating Basics initially removed the external registration URL because that input lived inside the advanced Event Details type controls.
  Evidence: The Basics page validation includes `affiliateUrl` for external listings. The simple-owned Basics copy now conditionally renders that field, and the focused browser/test flow verifies it without mounting Event Details.

- Observation: Desktop layout was correct, but a 390-pixel browser viewport squeezed the Simple/Advanced selector beside the header copy.
  Evidence: Browser screenshots showed the selector clipping before the setup header changed to a stacked base layout and a horizontal layout from the `sm` breakpoint.

## Decision Log

- Decision: Keep one shared React Hook Form state, controller set, validation schema, and submission path for Simple and Advanced Setup.
  Rationale: The requested separation is about visual and component ownership. Duplicating form state or payload construction would create two data contracts and make mode switching unsafe.
  Date/Author: 2026-07-16 / Codex

- Decision: Give Simple Setup its own top-level page components, while allowing those pages to reuse stable leaf input panels and controllers from the event form.
  Rationale: This prevents Simple Setup from mounting advanced section navigation and collapse shells, establishes independent page ownership, and avoids copying business logic that must remain consistent between modes.
  Date/Author: 2026-07-16 / Codex

- Decision: Preserve all pre-existing unrelated work and create a path-scoped commit.
  Rationale: The current checkout is intentionally dirty in areas outside event creation, and none of those changes are required for this component split.
  Date/Author: 2026-07-16 / Codex

- Decision: Copy the complex division and staff compositions into Simple-owned files, but continue to share low-level editors, typed controller state, validation, and submission.
  Rationale: This matches the mobile ownership boundary: future Simple visual changes do not rewrite Advanced top-level sections, while business mutations and payload rules remain authoritative.
  Date/Author: 2026-07-16 / Codex

## Outcomes & Retrospective

Simple Setup no longer mounts the complete Advanced Setup form on its data-entry pages. Basics, Divisions, Schedule & Location, Competition Rules, Pricing & Registration, Documents & Questions, and Staff & Operations dispatch to dedicated files under `eventForm/simpleSetup/`. Advanced Setup still mounts the original `EventFormSections` tree.

The parity boundary is now explicit: UI composition is independent, while React Hook Form state, controller hooks, validation, normalization, and submission remain shared. This gives later Simple Setup redesigns a safe place to evolve without changing Advanced Setup or creating a second event payload.

Focused Jest coverage passed with 100 EventForm tests available, including three Simple Setup regressions, and 29 resolver/navigation tests. The complete EventForm suite also passed with 99 tests before the final responsive-only header adjustment. TypeScript, scoped ESLint, and the production Next.js build passed. Browser verification on the release server showed only Basic Information on the Simple Basics page at desktop and 390 by 844 pixels, no console errors after the final reload, and the complete collapsible form after switching to Advanced Setup.

## Context and Orientation

The main form is `src/app/events/[id]/schedule/components/EventForm.tsx`. It owns React Hook Form state, loads catalogs and related records, constructs controller hooks, resolves Simple Setup page availability, validates each page, and submits the event. It supports two presentation modes that edit the same draft.

Advanced Setup is rendered by `src/app/events/[id]/schedule/components/eventForm/sections/EventFormSections.tsx`. That component intentionally renders the complete form: Basic Information, Event Details, manual payments, match rules, staff, divisions, standings or pool scoring, and schedule configuration.

Simple Setup page order and availability are defined in `src/app/events/[id]/schedule/components/eventForm/simpleSetup/types.ts` and `resolveEventSetup.ts`. Planning pages already use `SimpleSetupPlanningPage.tsx`. Data-entry pages currently have no dispatcher of their own; `EventForm.tsx` falls back to the complete advanced renderer.

In this plan, a "simple-owned page component" means a component under `eventForm/simpleSetup/` whose public responsibility is exactly one Simple Setup page. It may use shared leaf controls such as the division editor or match rules editor so the form behavior stays identical, but it must not mount `EventFormSections`, the advanced section navigation, or unrelated page content.

## Plan of Work

First, expose the existing advanced renderer's input model as a TypeScript type. `EventForm.tsx` will construct that model once and pass it either to Advanced Setup or to the new simple page dispatcher. This removes duplicated prop assembly without sharing the rendered section tree.

Next, add simple-owned components for Basics, Divisions, Schedule & Location, Competition Rules, Pricing & Registration, Documents & Questions, and Staff & Operations. The Basics component will own a copy of the current basic field composition without the advanced collapsible Paper. The existing `SimpleSetupDocumentsPage` will be wired and adjusted as necessary. The remaining page components will compose only the relevant existing leaf editors and will render them expanded without relying on Advanced Setup's collapse state.

Then, add `SimpleSetupFormPage.tsx` as the dispatcher for the non-planning data-entry pages. `EventForm.tsx` will continue to send planning pages to `SimpleSetupPlanningPage`, send data-entry pages to `SimpleSetupFormPage`, and render `EventFormSections` only when the selected mode is Advanced Setup.

Finally, extend `EventForm.test.tsx` with regression assertions that the Basics page displays its inputs but not Event Details or other advanced sections. Add focused tests for the dispatcher where useful to prove page isolation. Run targeted tests, the TypeScript compiler, a production build, and the browser flow at desktop and mobile widths.

## Concrete Steps

All commands run from `/Users/elesesy/StudioProjects/mvp-site`.

Inspect the relevant paths and confirm the unrelated dirty tree remains untouched:

    git status --short
    git diff -- src/app/events/[id]/schedule/components

Implement the page components and dispatcher with edits limited to:

    src/app/events/[id]/schedule/components/EventForm.tsx
    src/app/events/[id]/schedule/components/eventForm/sections/EventFormSections.tsx
    src/app/events/[id]/schedule/components/eventForm/simpleSetup/
    src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx
    plans/web-simple-event-setup-page-components-execplan.md

Run focused tests:

    npm test -- --runInBand src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx
    npm test -- --runInBand src/app/events/[id]/schedule/components/eventForm/simpleSetup/__tests__

Run static and production validation:

    npx tsc --noEmit
    npm run build

Start the production server using the repository's normal production command, open the event creation flow, and verify Simple and Advanced Setup in the browser.

Before committing:

    git diff --check -- src/app/events/[id]/schedule/components plans/web-simple-event-setup-page-components-execplan.md
    git diff --stat -- src/app/events/[id]/schedule/components plans/web-simple-event-setup-page-components-execplan.md
    git diff --cached --check

The final commit must stage only the files named by this plan.

## Validation and Acceptance

The regression test for Simple Setup fails against the original implementation because Event Details is present on the Basics page. It passes after the change because the page displays Event Image, Event Name, Tags, Sport, and Description without mounting the advanced Event Details heading.

Navigating to each used data-entry page must show page-specific content:

Basics shows basic identity and image fields. Divisions shows division configuration. Schedule & Location shows dates, location, resources, and applicable slots. Competition Rules shows competition and optional rule editors. Pricing & Registration shows applicable pricing, payment, and registration timing fields. Documents & Questions shows only enabled registration requirements. Staff & Operations shows staff, officials, and team-operation inputs.

Advanced Setup must remain unchanged and continue to show the full section navigation and complete form.

Mode switching must retain field values because both modes edit the same React Hook Form draft. Saving must continue through the existing submission controller; this plan does not add a second payload mapper.

The focused Jest tests, `npx tsc --noEmit`, scoped ESLint, and `npm run build` exited successfully. Browser verification covered the first Simple Setup transition at desktop and mobile widths, plus the Advanced Setup mode switch.

## Idempotence and Recovery

The changes are additive and can be reapplied safely. No database migration, seed operation, or external write is required. If a page component causes a regression, Advanced Setup remains available because its renderer is not being replaced. Restore only the new simple dispatcher wiring while retaining the page components for follow-up debugging.

Because the checkout is dirty, never use `git reset --hard`, `git checkout --`, or a broad `git add .`. Use explicit paths for inspection, staging, and committing.

## Artifacts and Notes

The original faulty branch in `EventForm.tsx` is:

    const simplePageContent = SIMPLE_PLANNING_PAGE_IDS.has(currentSimplePageId)
        ? <SimpleSetupPlanningPage ... />
        : formSections;

The intended structure is:

    const simplePageContent = SIMPLE_PLANNING_PAGE_IDS.has(currentSimplePageId)
        ? <SimpleSetupPlanningPage ... />
        : <SimpleSetupFormPage pageId={currentSimplePageId} sections={formSectionsProps} ... />;

The exact component API may be refined during implementation, but `EventFormSections` must never be mounted as a child of a Simple Setup data-entry page.

Validation evidence:

    PASS EventForm.test.tsx
    3 Simple Setup regressions passed; 97 unrelated cases skipped in the final focused run

    PASS resolveEventSetup.test.ts
    PASS SimpleSetupNavigation.test.tsx
    29 tests passed

    npx tsc --noEmit --pretty false
    exit 0

    npm run build
    Compiled successfully
    Finished TypeScript
    Generated 124 static pages

Browser evidence:

    output/playwright/simple-event-basics-desktop.png
    output/playwright/simple-event-basics-mobile-final.png

The final browser reload reported zero console errors. The one remaining warning is Stripe.js noting that local HTTP is acceptable for testing but production Stripe integration requires HTTPS.

## Interfaces and Dependencies

`EventFormSectionsProps` in `EventFormSections.tsx` will become an exported type so both presentation modes consume one stable controller model.

`SimpleSetupFormPage` will accept the current `EventSetupPageId`, the shared event form input model, and the resolved Simple Setup capabilities and choices needed to hide optional controls. It will return the component for that one page or `null` for planning pages handled elsewhere.

The implementation will continue to use React Hook Form, Mantine, the existing event form controllers, and existing leaf panels. It will not add a new state library, validation schema, API route, or submission contract.

Plan revision note (2026-07-16 18:48Z): Created the initial plan after confirming the all-sections fallback and the clean status of all targeted event-form paths.

Plan revision note (2026-07-16 19:01Z): Recorded the completed page split, the recovered external registration field, responsive browser finding, and final automated and rendered validation evidence.

Plan revision note (2026-07-16 19:02Z): Marked the path-scoped commit complete after confirming that no unrelated worktree files were staged.
