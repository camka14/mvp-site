# Add Discover Map and Typed Search

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan follows `PLANS.md` in the repository root.

## Purpose / Big Picture

The discover page should let someone search by the kind of thing they want: events, organizations, rentals, or open-registration teams. It should also offer a map beside the existing location control, showing nearby events, organizations, and rental fields around the user's current or selected location. After the change, a user can open `/discover`, choose a search type, search from the page header, open the map modal, pan the map, press "Search this area", and select a result to focus the map or navigate to the relevant page.

## Progress

- [x] (2026-05-14T19:34:28Z) Read the current web discover page, location components, team API, and the mobile map component used as behavioral reference.
- [x] (2026-05-14T19:34:28Z) Committed the previous discover event-search fix separately as `6cf5d47`.
- [x] (2026-05-14T20:06:12Z) Added typed search controls shared by discover tabs, including a left dropdown and right search button.
- [x] (2026-05-14T20:06:12Z) Added open-registration team search to the teams API and surfaced it in a Teams discover tab.
- [x] (2026-05-14T20:06:12Z) Added a discover map modal with nearby event, organization, and rental markers plus a search-this-area button.
- [x] (2026-05-14T20:06:12Z) Added focused tests for team service and canonical team filtering behavior.
- [x] (2026-05-14T20:52:09Z) Validated with TypeScript, focused Jest tests, lint, diff checks, production build, and rendered browser checks.

## Surprises & Discoveries

- Observation: The mobile map uses Google Maps camera bounds and a "search places in bounds" model for place search, but its event search currently loads events from a repository using bounds derived from the current location.
  Evidence: `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/androidMain/kotlin/com/razumly/mvp/eventMap/MapComponent.kt` has `updateCameraBounds(...)`, `searchPlaces(...)`, and `getEvents()`.
- Observation: The web repo already has `@react-google-maps/api`, a shared `GOOGLE_MAPS_SCRIPT_ID`, and location helpers, so the discover map should reuse those instead of adding a new map loader.
  Evidence: `src/components/location/LocationSelector.tsx` and `src/lib/googleMapsLoader.ts`.

## Decision Log

- Decision: Implement open-registration team discovery by extending the existing `/api/teams` list path instead of creating a parallel discover-only teams endpoint.
  Rationale: The current `teamService` and `listCanonicalTeamsForUser(...)` already centralize canonical team hydration and compatibility behavior.
  Date/Author: 2026-05-14 / Codex
- Decision: Add a Teams discover tab for open-registration team results.
  Rationale: The existing discover page has separate result panels per entity type. A typed search target for teams needs a place to show results without overloading events, organizations, or rentals.
  Date/Author: 2026-05-14 / Codex
- Decision: The map modal will focus markers for events, organizations, and rentals, while team search remains page-level because teams do not have their own coordinates.
  Rationale: Teams are attached to organizations, but not every team has a direct mappable location. Mapping team markers would imply a location model that does not exist.
  Date/Author: 2026-05-14 / Codex

## Outcomes & Retrospective

Implementation is complete. The discover page now owns a typed search target, including a Teams tab backed by `teamService.searchOpenRegistrationTeams(...)`. The map modal reuses the existing Google Maps loader and searches around the user's current discover location first, falling back only if current location is unavailable. Rendered verification confirmed the controls and modal open on the production server; Google Maps marker rendering was blocked locally by `RefererNotAllowedMapError` for `http://localhost:3000`.

## Context and Orientation

The discover page is `src/app/discover/page.tsx`. It owns the active tab, location state, event fetching through `eventService.getEventsPaginated(...)`, and organization/rental loading through `organizationService.listOrganizationsWithFields()`. The event tab's search input currently lives in `src/app/discover/components/EventsTabContent.tsx`; organization and rental search inputs are local functions inside `page.tsx`. The web location button is `src/components/location/LocationSearch.tsx`, and map loading should reuse `src/lib/googleMapsLoader.ts`.

Teams are canonical teams stored through the Prisma `CanonicalTeams` model and exposed by `src/app/api/teams/route.ts`, which calls `listCanonicalTeamsForUser(...)` in `src/server/teams/teamMembership.ts`. Open-registration state is stored as `openRegistration` on canonical teams.

## Plan of Work

First, extend the team listing path so callers can pass `query` and `openRegistration=true`. The API should filter canonical teams by team name, sport, or division and only return open-registration teams when requested. Add a `teamService.searchOpenRegistrationTeams(...)` helper.

Second, create a shared discover search control component with a type dropdown on the left, the text field in the middle, and a search button on the right. Use it in Events, Organizations, Rentals, and the new Teams tab. The existing location button remains beside the search group, with a new map button next to it.

Third, add the map modal. It opens centered on the current discover location when available, otherwise it asks for current location and falls back to a default center. Initial map loading searches around that center. Panning the map far enough shows "Search this area"; pressing it refreshes event results around the camera center and re-filters organizations/rentals around that center. The modal search bar lets the user choose Events, Organizations, or Rentals, then selecting a result pans to that marker and opens its details. Marker info actions navigate to the existing event or organization pages.

Fourth, validate with focused tests around team API filtering, typed search behavior where practical, TypeScript, lint, and rendered browser checks against `/discover`.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site`.

1. Edit `src/server/teams/teamMembership.ts`, `src/app/api/teams/route.ts`, and `src/lib/teamService.ts` to support `query` and `openRegistration`.
2. Add `src/app/discover/components/DiscoverSearchControls.tsx` and `src/app/discover/components/DiscoverMapModal.tsx`.
3. Update `src/app/discover/page.tsx` and `src/app/discover/components/EventsTabContent.tsx` to use shared controls, add the Teams tab, and wire the map modal.
4. Add or update Jest tests for the team API and any focused discover component behavior that can be tested without loading Google Maps.
5. Run:

    npm test -- --runTestsByPath <focused test paths> --runInBand
    npx tsc --noEmit --pretty false
    npx eslint <touched files>

6. Start or reuse a dev server and inspect `/discover` in a browser.

## Validation and Acceptance

Acceptance is user-visible. On `/discover`, each tab search area has a type dropdown to the left of the input and a Search button to the right. Selecting Teams and searching shows only teams with open registration. The Map button appears next to Set Location, opens a modal, and initially searches around the user's selected/current location. Panning the map reveals a Search this area button, and pressing it refreshes nearby markers. Selecting an event, organization, or rental search result in the modal pans to the marker and exposes a navigation action.

## Idempotence and Recovery

All edits are additive or scoped replacements. The previous search fix is already committed separately. If the map validation fails because `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is unavailable, the map component should show a clear inline error and the non-map discover search should remain usable.

## Artifacts and Notes

- `npx tsc --noEmit --pretty false` passed.
- `npm test -- --runTestsByPath src/lib/__tests__/teamService.test.ts src/server/teams/__tests__/teamMembership.test.ts src/app/discover/components/__tests__/EventsTabContent.test.tsx --runInBand` passed: 3 suites, 25 tests.
- `npx eslint src/app/discover/page.tsx src/app/discover/components/EventsTabContent.tsx src/app/discover/components/DiscoverSearchControls.tsx src/app/discover/components/DiscoverMapModal.tsx src/app/api/teams/route.ts src/lib/teamService.ts src/server/teams/teamMembership.ts src/lib/__tests__/teamService.test.ts src/server/teams/__tests__/teamMembership.test.ts src/app/discover/components/__tests__/EventsTabContent.test.tsx` passed.
- `git diff --check -- <touched files>` passed after removing one trailing whitespace line.
- `npm run build` passed. It emitted an existing Turbopack NFT warning for `next.config.mjs` through `src/lib/storage.ts` and two existing `z-index` warnings.
- Browser verification at `http://localhost:3000/discover` confirmed Events/Organizations/Rentals/Teams tabs, the discover target dropdown, the Teams search target switching to the Teams tab, the Map button, and the map modal search controls. The Google Maps script returned `RefererNotAllowedMapError` for `http://localhost:3000`.

## Interfaces and Dependencies

Use `@react-google-maps/api` already present in `package.json`. Reuse `GOOGLE_MAPS_SCRIPT_ID`, `GOOGLE_MAPS_LIBRARIES`, and `GOOGLE_MAP_OPTIONS_WITH_MAP_ID` from `src/lib/googleMapsLoader.ts`. The team list API accepts new optional query parameters:

    GET /api/teams?query=<text>&openRegistration=true&limit=100

`teamService.searchOpenRegistrationTeams(query, limit)` returns `Team[]` hydrated through existing `mapRowToTeam(...)`.
