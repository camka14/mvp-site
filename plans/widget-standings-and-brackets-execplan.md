# Public Standings And Bracket Widgets

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](C:\Users\samue\Documents\Code\mvp-site\PLANS.md).

## Purpose / Big Picture

After this change, organization admins can build two new public embed widgets: a standings widget for league events and a bracket widget for tournament or playoff events. A visitor on the client website will be able to move left and right through public events, see the current league or tournament name at the top, switch divisions from a dropdown, and view live standings or a bracket without opening the full BracketIQ app. Admins will be able to configure those widgets from the existing public widget builder by choosing whether to show all or only upcoming events and by locking the widget to specific event IDs through an organization-scoped event search field.

The first visible outcome should be:

1. An organization admin opens the public widget builder and chooses `Standings` or `Brackets`.
2. The builder shows a dedicated settings group with event timing (`Upcoming` or `All`) and a search-driven list of selected organization events.
3. Opening the widget preview renders one event at a time with left and right controls and a division selector.
4. The standings widget shows a division table headed by the league and division name, and the bracket widget shows the selected division bracket for a public tournament or playoff event.

## Progress

- [x] (2026-04-21T14:08:26-07:00) Read `PLANS.md`, the existing public widget ExecPlans, the public catalog, the embed route, the embed script, the organization public settings panel, the discover event search API, and the schedule-page standings/bracket logic to map reuse points.
- [x] (2026-04-21T14:08:26-07:00) Created this ExecPlan before implementation.
- [ ] Extend public widget contracts with standings/bracket kinds, event ID filtering, and widget-specific public DTO loaders.
- [ ] Add reusable public standings/bracket rendering helpers and wire them into `/embed/[slug]/[kind]`.
- [ ] Add organization-scoped event search controls plus dedicated standings/bracket settings groups in `OrganizationPublicSettingsPanel.tsx`.
- [ ] Add focused Jest coverage for the new public catalog helpers, embed HTML output, and widget-builder behavior.
- [ ] Run targeted validation and record the results here.

## Surprises & Discoveries

- Observation: `/embed/[slug]/[kind]` is currently a raw HTML `route.ts`, not a React page, so it bypasses the root layout and avoids the global app navigation and footer.
  Evidence: `src/app/embed/[slug]/[kind]/route.ts` returns `new NextResponse(renderWidgetHtml(...), { headers: { 'Content-Type': 'text/html' } })`.

- Observation: the current public widget route is a good fit for static card sections, but standings and brackets need more stateful controls such as event paging and division selection.
  Evidence: the existing route only supports event filters, pagination, and section rendering through inline HTML and JavaScript.

- Observation: the discover page search bar is a plain `TextInput`, not a reusable organization-scoped event picker component.
  Evidence: `src/app/discover/components/EventsTabContent.tsx` renders a `TextInput` for search, while organization-scoped event lookup already exists at the API layer through `POST /api/events/search`.

- Observation: the schedule page already has reliable logic for league division options, playoff bracket division options, and bracket root selection, but that logic is buried inside `src/app/events/[id]/schedule/page.tsx`.
  Evidence: `leagueDivisionOptions`, `bracketDivisionOptions`, `pickPreferredRootMatch`, and `collectConnectedMatchIds` are defined in the schedule page rather than a shared module.

## Decision Log

- Decision: keep `/embed/[slug]/[kind]` as an HTML route instead of converting it into a `page.tsx`.
  Rationale: the current route avoids the root app layout, which would otherwise inject the normal site shell into iframe widgets. The new controls can still be implemented with route-rendered HTML plus a small inline script.
  Date/Author: 2026-04-21 / Codex

- Decision: ship standings and brackets as separate widget kinds rather than folding them into the existing `all sections` widget.
  Rationale: the current `all sections` widget is a multi-card catalog summary. A division-driven standings or bracket widget is structurally different and would make the combined widget confusing and too tall.
  Date/Author: 2026-04-21 / Codex

- Decision: use event-level paging with one selected event per standings or bracket view.
  Rationale: that matches the user request for left and right navigation, keeps each iframe compact, and avoids embedding many full bracket payloads in one HTML response.
  Date/Author: 2026-04-21 / Codex

- Decision: use the existing authenticated `POST /api/events/search` route for admin-side event picking, filtered by `organizationId`.
  Rationale: there is no reusable search component today, but the search route already supports organization scoping and returns the event data needed to present matches in the settings panel.
  Date/Author: 2026-04-21 / Codex

## Outcomes & Retrospective

This section will be updated after implementation and validation.

## Context and Orientation

This repository is a Next.js App Router application using TypeScript, Mantine UI, Prisma, and Postgres. Public branded organization pages and public widgets were recently added. The public widget builder lives in `src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx`. It does not persist widget presets in the database; instead it locally builds preview URLs and snippets from form state.

The public widget HTML response is built in `src/app/embed/[slug]/[kind]/route.ts`, and the script snippet bootstrapper is implemented in `src/app/embed.js/route.ts`. Both files understand the widget query contract today. Any new widget option must be added in the settings panel, the script route, and the embed route together.

Public data loading for pages and widgets lives in `src/server/publicOrganizationCatalog.ts`. Today that file supports public organization summaries plus events, teams, rentals, products, public team registration, and public event registration. It does not yet expose widget-specific standings or bracket DTOs.

League standings already have a public-safe read path at `src/app/api/events/[eventId]/standings/route.ts`. The `GET` handler allows non-host access for published events and returns one division at a time using the shared builder in `src/app/api/events/[eventId]/standings/shared.ts`.

Bracket data already exists in the event scheduling area. `src/app/events/[id]/schedule/page.tsx` computes division options, chooses a root match, and builds a filtered bracket subtree. The visual component is `src/app/events/[id]/schedule/components/TournamentBracketView.tsx`. That component is a client component with schedule-specific controls, so widget work should extract only the pure selection and rendering logic needed for public display.

In this plan, a “standings widget event” means a public `LEAGUE` event that has at least one non-playoff division. A “bracket widget event” means a public `TOURNAMENT` event or a public `LEAGUE` event that has playoff-style matches. A “selected event ID” means an event explicitly added in the widget builder; those IDs should override the date-based event list when present.

## Plan of Work

Start by extending the public catalog contract. `src/server/publicOrganizationCatalog.ts` needs new widget kinds for `standings` and `brackets`, plus new option fields that accept event timing (`all` or `upcoming`) and a list of selected event IDs. Reuse the existing public event visibility rules so unpublished, private, and template events never leak into widget data. Add server helpers that load the current page event, derive division options, and return the selected division payload for either standings or brackets.

For standings, reuse the existing standings calculation path instead of duplicating table logic. Load the published event with relations, convert it into a league object with the existing helper, derive non-playoff division options, and return the selected division’s standings response together with event metadata and page info. If a selected event is not a league or has no valid divisions, skip it rather than surfacing a broken page.

For brackets, reuse the schedule page’s bracket-selection logic in a shared module rather than leaving it inline. Extract the event-agnostic helpers that identify playoff matches, derive bracket division options, select a preferred root match, and gather the connected bracket subtree. Use those helpers to build a small public DTO that contains only the event title, division options, match cards, and any display-only metadata needed by the widget. Keep player emails, user management data, and editor-only affordances out of the DTO.

Once the public data helpers exist, update `src/app/embed/[slug]/[kind]/route.ts`. Add the new widget kinds to validation, parse the new query parameters, and render separate sections for standings or brackets. Each widget should show one event at a time, put the event and division name in the header, include a division `<select>` when more than one division is available, and use left and right buttons to move between events by changing the `page` query param. The inline script should update the iframe URL for event paging and division changes the same way it already does for event-filter refetches.

Then update the embed script route `src/app/embed.js/route.ts` and the widget builder `src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx`. Add `standings` and `brackets` to the widget-kind selector. Add dedicated settings groups that expose the timing select and the selected event list. Implement an organization-scoped event search control that calls the existing event search API with `organizationId`, displays matching event names, and lets admins add or remove locked events. When locked events exist, include them in iframe and script snippets through a new query parameter.

Finally, add targeted tests. Public catalog tests should cover event ID filtering and standings/bracket widget selection behavior. Embed route tests should assert that the new query parameters reach the catalog and that the rendered HTML contains the new controls. Add a focused React test for the widget builder’s event-search settings behavior so this feature is not validated only through manual previewing.

## Concrete Steps

Work from `C:\Users\samue\Documents\Code\mvp-site`.

1. Edit `src/server/publicOrganizationCatalog.ts` to add standings/bracket widget kinds, selected-event filtering, and public loaders for standings and bracket widget pages.
2. Add a small shared helper module for bracket selection logic if extracting from `src/app/events/[id]/schedule/page.tsx` keeps the widget route smaller and easier to test.
3. Edit `src/app/embed/[slug]/[kind]/route.ts` to parse the new params and render standings/bracket HTML plus client-side query updates for paging and division changes.
4. Edit `src/app/embed.js/route.ts` to forward the new query attributes from script snippets into the iframe URL.
5. Edit `src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx` and add any small helper components it needs for organization-scoped event search and selected-event chips.
6. Add or update tests in `src/server/__tests__/publicOrganizationCatalog.test.ts`, `src/app/embed/[slug]/[kind]/__tests__/route.test.ts`, and a new React test near `OrganizationPublicSettingsPanel.tsx` or a helper component.
7. Run focused Jest coverage and a type-check or document any unrelated pre-existing failures.

## Validation and Acceptance

Run these commands from `C:\Users\samue\Documents\Code\mvp-site`:

    npx jest --runInBand --runTestsByPath "src/server/__tests__/publicOrganizationCatalog.test.ts" "src/app/embed/[slug]/[kind]/__tests__/route.test.ts"
    npx tsc --noEmit

If a new widget-builder component test is added, include that path in the Jest command and record the final command in `Outcomes & Retrospective`.

Manual acceptance is:

- In `OrganizationPublicSettingsPanel`, choosing `Standings` or `Brackets` shows dedicated settings groups instead of the events/teams/products controls.
- Typing into the new event search field only returns events from the current organization, and selected events become removable chips or rows.
- Opening the standings widget preview shows a league title, a division dropdown when needed, and left and right navigation between eligible events.
- Opening the bracket widget preview shows a tournament or playoff title, a division dropdown when needed, and left and right navigation between eligible events.
- The iframe resizes correctly after changing event pages or division selections.

## Idempotence and Recovery

This work is code-only. No schema migration is required. The new widget settings are derived from local builder state and URL query params, so retries are safe. If a shared helper extraction from the schedule page turns out to be too invasive, fall back to a widget-local helper module rather than editing unrelated schedule behavior in place.

If full-project type-checking fails on unrelated files, record the exact failure in `Surprises & Discoveries` and still run the focused Jest coverage for the touched files.

## Artifacts and Notes

Expected new snippet query parameters will look like:

    /embed/scsoccer/standings?dateRule=upcoming&eventIds=event_1,event_2
    /embed/scsoccer/brackets?dateRule=all&eventIds=event_3

Expected widget chrome will include:

    <button data-widget-page="2">Next</button>
    <select name="widgetDivision">...</select>

## Interfaces and Dependencies

At the end of this work:

- `src/server/publicOrganizationCatalog.ts` must understand widget event ID filters and expose public standings/bracket widget loaders.
- `src/app/embed/[slug]/[kind]/route.ts` must render `standings` and `brackets` in addition to the existing widget kinds.
- `src/app/embed.js/route.ts` and `src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx` must share the same new query parameter names.
- The admin-side event search UI must use the existing event search API filtered by `organizationId`.

Revision note: created on 2026-04-21 before implementation to document the standings/bracket widget scope, the route-based widget constraint, and the selected-event search approach.
