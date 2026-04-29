# Shared Calendar Redesign

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` in the repository root. It is self-contained so a contributor can restart the work from this file and the current working tree without prior conversation context.

## Purpose / Big Picture

BracketIQ has several calendar screens that use the same scheduling library but do not look or behave like one cohesive product surface. After this change, organization field availability, event match scheduling, and a user's personal schedule will share one calendar visual language: compact day headers, clearer time grid lines, event blocks using the same fallback color palette as initials avatars, and field filtering that matches the fields-first Paper design. The underlying scheduling behavior must stay the same: existing slot selection, drag, resize, resource grouping, navigation, and click handlers should continue to call the same state updates and service methods they call today.

The user-visible result can be seen by starting the app and visiting an organization fields tab, an event schedule page, and `/my-schedule`. Field managers should see a left-side searchable field selector next to the week/day calendar, with each selected field's slots colored by that field. Event calendars should color match blocks by match identity while keeping conflict and "my match" highlights visible.

## Progress

- [x] (2026-04-28) Created branch `codex/shared-calendar-redesign` from local `main` after stashing a pre-existing `package-lock.json` change.
- [x] (2026-04-28) Identified the three calendar surfaces that must share the redesign: `src/app/organizations/[id]/FieldsTabContent.tsx`, `src/app/events/[id]/schedule/components/LeagueCalendarView.tsx`, and `src/app/my-schedule/page.tsx`.
- [x] (2026-04-28) Confirmed initials avatar colors currently come from `src/app/theme/mobilePalette.ts` and are selected in `src/app/api/avatars/initials/route.ts` with a route-local string hash.
- [x] (2026-04-28) Extracted a shared client-safe entity color helper in `src/lib/entityColors.ts` and updated the initials avatar route to use it.
- [x] (2026-04-28) Added `SharedCalendarEvent`, `FieldCalendarFilter`, and scoped shared calendar CSS under `.shared-calendar-shell`.
- [x] (2026-04-28) Applied the shared visuals to the organization fields tab while keeping the existing drag, resize, selection, rental slot, and checkout handlers.
- [x] (2026-04-28) Applied the shared visuals to event schedule and personal schedule calendars while keeping current filtering, navigation, click, and lock behavior.
- [x] (2026-04-28) Added focused tests for shared color/filter behavior and ran TypeScript/Jest validation.

## Surprises & Discoveries

- Observation: The fields tab already shows resource columns to participants but not to managers. The manager flow uses selected fields plus one draft selection block, so the redesign should not enable `react-big-calendar` resources for managers unless behavior is intentionally changed.
  Evidence: In `FieldsTabContent.tsx`, `resources={!canManage ? calendarResources : undefined}` is passed to `DnDCalendar`.
- Observation: The event schedule calendar already has a "Calendar / By Field" segmented control, so the shared layer must support both normal day columns and resource columns.
  Evidence: `LeagueCalendarView.tsx` uses `layoutMode === 'resource'` to switch views and resource props.
- Observation: The initials avatar palette is already centralized, but the hash selection is not. Reusing the exact hash preserves visual consistency across avatars and calendar slots.
  Evidence: `src/app/api/avatars/initials/route.ts` defines `hashString` locally and selects `MOBILE_APP_AVATAR_PALETTE[hashString(name) % palette.length]`.
- Observation: The existing `FieldsTabContent` Jest suite passes but logs caught `JestAssertionError` messages from a mocked `fieldService.getFieldEventsMatches` call that expects an options argument not supplied by the component.
  Evidence: `npx jest --runTestsByPath "src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx" --runInBand` exited 0 with 2 passing tests and console errors showing "Expected: { rentalOverlapOnly: true, includeMatches: false } Received: undefined".

## Decision Log

- Decision: Implement a shared calendar presentation layer instead of wrapping every calendar in a single high-level component.
  Rationale: The current calendars use different behavior contracts. The organization fields tab depends on drag-and-drop, resizing, selection, and participant resource columns; the event calendar supports match cards, agenda grouping, and resource mode; My Schedule is read-only. Shared CSS and reusable small components give consistent visuals with less risk to behavior.
  Date/Author: 2026-04-28 / Codex
- Decision: Color field calendar slots by field identity, event schedule match slots by match identity, and personal schedule entries by event identity.
  Rationale: The user wants selected fields to reveal all events for those fields in a week, and wants event calendars to use distinct colors for matches. Personal schedule entries should group visually by the parent event so a user's schedule stays scan-friendly.
  Date/Author: 2026-04-28 / Codex
- Decision: Keep the organization fields tab manager calendar in normal week/day layout rather than `react-big-calendar` resource columns.
  Rationale: The user asked for days of the week as columns and fields as colored event slots within each day. The existing manager flow already does this structurally, while the visual left selector provides the resource-like field control.
  Date/Author: 2026-04-28 / Codex

## Outcomes & Retrospective

The refactor is implemented. Shared color selection now lives in `src/lib/entityColors.ts`, avatar generation uses the same helper, and all three calendar surfaces render through the shared visual layer. Organization field managers get a searchable left-side field selector; selected field slots are colored by field. Event schedules color slots by match identity, and `/my-schedule` colors entries by parent event identity. Focused Jest tests, the existing fields-tab test, TypeScript, and `git diff --check` passed.

## Context and Orientation

This repository is a Next.js App Router TypeScript application. Calendar UI uses `react-big-calendar`, a React component library for month, week, day, agenda, and resource-calendar layouts. In this plan, "resource" means a calendar grouping dimension such as a field. A resource column is a `react-big-calendar` feature where a day or week can be split into separate columns per field. A "slot" means a rendered calendar event block, such as a match, rental slot, booked field time, or draft selection.

The main files are:

`src/app/organizations/[id]/FieldsTabContent.tsx`: organization fields tab. It uses `withDragAndDrop(BigCalendar)` to allow managers and participants to select, drag, and resize rental time ranges. Managers select one or more fields and add rental slots. Participants build rental selections and can create events from them. This behavior must not change.

`src/app/organizations/[id]/fieldCalendar.ts`: converts field data into calendar event entries. It creates "booked" entries from field events and matches and "rental" entries from rental slots.

`src/app/events/[id]/schedule/components/LeagueCalendarView.tsx`: event schedule calendar for matches. It has normal calendar mode and resource-by-field mode, plus special rendering for agenda groups, weekly occurrence selection cards, conflict state, "my matches" filtering, and lock controls.

`src/app/my-schedule/page.tsx`: read-only user schedule page. It combines event and match entries, shows month/week/day/agenda views, and navigates to the related event when an entry is selected.

`src/app/theme/mobilePalette.ts`: exports `MOBILE_APP_AVATAR_PALETTE`, the fallback image color palette used by initials avatars.

`src/app/api/avatars/initials/route.ts`: generates initials avatars. It currently chooses a palette color with a local `hashString` helper. That logic should be extracted so calendar colors and avatars stay aligned.

## Plan of Work

First, create a shared color utility in `src/lib/entityColors.ts`. It should export the same unsigned 31-based string hash currently used by the initials avatar route and a `getEntityColorPair(seed)` function that returns one `{ bg, text }` pair from `MOBILE_APP_AVATAR_PALETTE`. Update `src/app/api/avatars/initials/route.ts` to use the shared function.

Second, add small shared calendar UI modules under `src/components/calendar/`. `SharedCalendarEvent.tsx` should render a compact event block with title, subtitle, optional meta text, and a swatch-friendly filled style. `FieldCalendarFilter.tsx` should render a visible search input plus selectable field rows and export a pure `filterFieldCalendarItems(items, query)` helper so search behavior can be tested. These components should not own scheduling state beyond the search query.

Third, add global CSS for the shared calendar class names in `src/app/globals.css`. The CSS should style only calendars inside a class such as `.shared-calendar-shell`, so unrelated calendar or Mantine styles are not affected accidentally. It should hide the default event label, normalize event padding, style headers/time gutters, preserve clickability, and support month/week/day/agenda/resource views.

Fourth, update `FieldsTabContent.tsx`. Replace the manager-only `MultiSelect` field picker with the shared left-side field filter while keeping the same `selectedFieldIds` state updates. Keep participant rental-selection controls intact. Add shared calendar shell classes around `DnDCalendar`. Update `eventPropGetter` and `CalendarEvent` so booked/rental slots use field-derived palette colors while selection blocks retain their current selection semantics.

Fifth, update `LeagueCalendarView.tsx`. Add shared calendar shell classes, color normal match blocks by match identity, and keep conflict and "my match" outlines. Weekly occurrence cards and agenda groups should stay functionally identical but adopt the shared color utility where it improves consistency.

Sixth, update `src/app/my-schedule/page.tsx`. Add shared calendar shell classes, use the shared event tile, and color entries by parent event identity. Keep the existing click-through to `/events/{eventId}?tab=details`.

Finally, add tests for shared color consistency and field filtering, then run focused Jest tests and `npx tsc --noEmit`.

## Concrete Steps

Run all commands from `C:\Users\samue\Documents\Code\mvp-site`.

Check the branch and working tree:

    git status --short --branch

Expected branch line:

    ## codex/shared-calendar-redesign

After implementation, run:

    npx jest src/lib/__tests__/entityColors.test.ts src/components/calendar/__tests__/FieldCalendarFilter.test.tsx
    npx tsc --noEmit

If component tests need existing Jest environment setup, use the repository's current Jest configuration rather than adding a second test runner.

Actual validation commands run:

    npx jest src/lib/__tests__/entityColors.test.ts src/components/calendar/__tests__/FieldCalendarFilter.test.ts --runInBand
    npx tsc --noEmit
    npx jest --runTestsByPath "src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx" --runInBand
    git diff --check

## Validation and Acceptance

The implementation is accepted when these behaviors are true:

On an organization fields tab as a manager, fields appear in a left-side selector with a search input. Typing a field name narrows the selector rows. Selecting multiple fields shows all booked and rental slots for those fields in the week/day calendar. Dragging and resizing the draft selection still updates the selected time range, and adding a rental slot still creates slots for the selected fields.

On an event schedule page, the calendar keeps its existing month/week/day/agenda views plus "Calendar / By Field" mode. Match blocks use stable palette colors derived from match identity. Conflict and "my match" states remain visible and do not prevent match click handlers from opening the existing match workflow.

On `/my-schedule`, schedule entries use the shared calendar styling and stable event-derived colors. Selecting an entry still navigates to that event's details tab.

Automated validation should include deterministic color helper tests, field-filter search tests, and TypeScript compilation. If a full browser check is practical, start the development server with `npm run dev` and inspect the three pages at `http://localhost:3000`.

## Idempotence and Recovery

The plan is additive and repeatable. Running tests or TypeScript checks multiple times is safe. The branch was created after stashing a pre-existing `package-lock.json` change; do not pop that stash unless the user asks, because it predates this work and could reintroduce unrelated modifications.

If an edit causes a type or test failure, inspect the failing file and adjust the shared component or page integration. Do not reset the branch or discard user changes. If the shared CSS affects unrelated UI, constrain selectors more tightly under `.shared-calendar-shell`.

## Artifacts and Notes

Current branch evidence:

    git status --short --branch
    ## codex/shared-calendar-redesign

Focused validation evidence:

    PASS src/components/calendar/__tests__/FieldCalendarFilter.test.ts
    PASS src/lib/__tests__/entityColors.test.ts
    Test Suites: 2 passed, 2 total
    Tests: 6 passed, 6 total

    npx tsc --noEmit
    exit code 0

    PASS src/app/organizations/[id]/__tests__/FieldsTabContent.test.tsx
    Tests: 2 passed, 2 total

Important existing behavior to preserve:

    FieldsTabContent.tsx passes resources only for non-manager calendars:
    resources={!canManage ? calendarResources : undefined}

    LeagueCalendarView.tsx switches resource mode with:
    const [layoutMode, setLayoutMode] = useState<CalendarLayoutMode>('calendar');

    Initials avatars currently use:
    const paletteIndex = hashString(name) % palette.length;

## Interfaces and Dependencies

Create `src/lib/entityColors.ts` with these exported interfaces:

    export type EntityColorPair = { bg: string; text: string };
    export function hashEntityString(value: string): number;
    export function getEntityColorPair(seed?: string | null): EntityColorPair;
    export function getEntityColorCssVariables(seed?: string | null): React.CSSProperties;

Create `src/components/calendar/SharedCalendarEvent.tsx` with props that let callers pass title, subtitle, meta, color seed or explicit color pair, selected/conflict state, and click-related class names. The component should render plain HTML and CSS class names; it should not import `react-big-calendar`.

Create `src/components/calendar/FieldCalendarFilter.tsx` with props for items, selected IDs, change handler, optional disabled state, and optional empty text. Export `filterFieldCalendarItems` from the same module or a sibling module so tests can validate search without rendering the whole page.

Revision note (2026-04-28): Initial plan created after branch setup and source inspection so the implementation can proceed incrementally while preserving current calendar behavior.

Revision note (2026-04-28): Updated after implementation and validation so the plan reflects the completed shared visual layer, tests run, and the existing console noise observed in the fields-tab test.
