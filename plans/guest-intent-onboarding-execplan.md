# Add first-visit guest intent onboarding

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan follows `PLANS.md` at the repository root.

## Purpose / Big Picture

An unauthenticated person opening BracketIQ at `/` should not have to interpret a broad marketing page before reaching the useful product. On the first visit, BracketIQ asks whether the person wants to find events, clubs, or rentals, or create an event, organization, or club. Searchers answer a short follow-up for sport, skill when applicable, and location, then arrive at Discover with those filters active. Creators see that a free account is required and can either create one with the intended destination preserved or continue browsing as a guest.

The flow is a browser-first guest onboarding. It is distinct from the existing `/onboarding` page, which stores account profile preferences for older authenticated profiles. New web accounts created after this change receive an onboarding intent during registration and therefore do not repeat the account onboarding after already completing the guest flow.

## Progress

- [x] (2026-07-12) Audited root routing, guest sessions, authenticated onboarding, registration, Google OAuth, Discover filters, location search, and organization creation.
- [x] (2026-07-12) Created an isolated branch and worktree based on the organization club/tryout feature branch.
- [x] (2026-07-12) Added versioned first-visit persistence and destination-building helpers.
- [x] (2026-07-12) Built the root onboarding wizard, search follow-up, and account-required branch.
- [x] (2026-07-12) Made Discover consume onboarding tab, sport, skill, club-tag, distance, and location presets.
- [x] (2026-07-12) Preserved create intent through registration and opened the requested creation screen.
- [x] (2026-07-12) Added focused regressions and verified desktop and mobile browser layouts with Playwright.
- [x] (2026-07-13) Replaced the full-page first step with a focused modal over a strongly dimmed home screen.

## Surprises & Discoveries

- Observation: BracketIQ already has `/onboarding`, but it is a profile onboarding page that expects an authenticated user or an established guest session.
  Evidence: `src/app/onboarding/page.tsx` persists `UserData.onboardingIntent` and redirects signed-out visitors to `/login`.

- Observation: Discover already accepts repeated `sport` query parameters but does not initialize its active tab, division skill, organization Club tag, distance, or location from URL parameters.
  Evidence: `src/app/discover/page.tsx` calls `parseDiscoverSportFilters`, while the remaining filters start from component constants.

- Observation: Discover requires either an authenticated user or the local guest-session marker.
  Evidence: `src/app/discover/page.tsx` renders a login redirect state when neither `isAuthenticated` nor `guest-session` is present.

- Observation: Location is already a shared, local-storage-backed client store.
  Evidence: `src/app/hooks/useLocation.ts` exposes `setLocationFromInfo` and persists `user-location` plus `user-location-info`.

- Observation: A server-only repeat-visitor redirect can reach Discover without restoring the required client guest-session marker.
  Evidence: Browser verification showed that completion is server-readable while guest access remains local-storage-backed, so `GuestDiscoverRedirect` restores guest mode before navigation.

- Observation: The isolated branch includes a parent-branch division schema migration that is not applied to the shared local database.
  Evidence: The first filtered event request returned Prisma `P2022` for `Divisions.scope`; the URL and all filter controls still initialized correctly, and an unfiltered repeat-visit request succeeded through the older local schema path. No database migration belongs to this onboarding change.

- Observation: The global Mantine light ThemeIcon color is white on this page's light surface.
  Evidence: Computed browser styles showed white SVG foregrounds, so onboarding choice icons now use explicit accessible blue and green surface colors.

## Decision Log

- Decision: Render the new onboarding directly at `/` and retain the existing `/onboarding` route for legacy authenticated profiles.
  Rationale: The new flow is a first-visit product router, while the old flow persists account-level home behavior and organization membership preferences.
  Date/Author: 2026-07-12 / Codex.

- Decision: Mark onboarding complete only when the visitor commits to a search result, account creation, or guest exploration destination.
  Rationale: Merely selecting the first tile should not suppress onboarding if the visitor leaves before choosing a useful route.
  Date/Author: 2026-07-12 / Codex.

- Decision: Store completion in a one-year first-party cookie and a versioned local-storage record.
  Rationale: The server needs the cookie to route repeat visits before hydration; local storage keeps the selected intent available to client account and analytics flows. Versioning permits a future materially different onboarding to run once again.
  Date/Author: 2026-07-12 / Codex.

- Decision: Ask for skill only for events and clubs, not rentals.
  Rationale: Event and organization division rows have canonical skill ids. Rental facilities do not, so presenting a rental skill control would claim a filter the backend cannot apply.
  Date/Author: 2026-07-12 / Codex.

- Decision: Start a guest session before routing searchers or guest explorers to Discover.
  Rationale: Discover intentionally requires an authenticated or guest session; creating the guest session in the mounted provider prevents a redirect/loading race.
  Date/Author: 2026-07-12 / Codex.

- Decision: New web profiles default to `DISCOVER_EVENTS` when no more specific onboarding intent was supplied.
  Rationale: New account creators have already seen the browser onboarding and should not repeat the old account onboarding. A requested organization or individual-event intent remains more specific and is persisted instead.
  Date/Author: 2026-07-12 / Codex.

- Decision: Repeat visitors use a client guest bootstrap instead of a direct server redirect.
  Rationale: The server can read the onboarding cookie but cannot set the local guest-session state required by Discover. The bootstrap preserves the fast repeat path without weakening Discover access checks.
  Date/Author: 2026-07-12 / Codex.

- Decision: First-visit onboarding is always presented as a bounded dialog over a dimmed page; no step may use the viewport or full page as its highlighted surface.
  Rationale: A full-page step reads like a replacement page and makes the dialog state easy to miss. The backdrop establishes modal focus, while any future guided highlight must target a concrete control or component.
  Date/Author: 2026-07-13 / Codex.

## Outcomes & Retrospective

Implemented a first-visit root wizard with six intent choices, search follow-ups backed by the sports/division/location catalogs, shareable Discover presets, direct post-signup create routes, and a repeat-visitor guest bootstrap. First-time visitors see the wizard in a bounded, non-dismissible dialog above a strongly dimmed home screen rather than as a full-page replacement. New web registrations and Google-created web profiles receive an onboarding intent, so they do not repeat legacy account onboarding.

Focused Jest coverage passes for URL construction, malformed presets, root routing, guest restoration, wizard actions, login mode, registration, Google OAuth, organization presets, and modal payloads. TypeScript and whitespace checks pass. Playwright verified the first screen, event follow-up, and club account gate at 1440 x 900 and 390 x 844. The real event search handoff produced:

    /discover?tab=events&skillDivisionTypeIds=premier&lat=45.515232&lng=-122.6783853&location=Portland%2C+OR&distanceMiles=50&sport=Indoor+Soccer

Discover showed Events selected with Indoor Soccer, the division filter, Portland location, and 50-mile distance active. Create Club produced signup mode with `/organizations?create=1&preset=club` preserved. Browser screenshots are retained under `output/playwright/guest-onboarding/` and remain ignored verification artifacts.

## Context and Orientation

`src/app/page.tsx` is the server-rendered root route. It currently redirects valid authenticated sessions and renders `LandingPage` for everyone else. It can read a first-party cookie before choosing what to render.

`src/app/providers.tsx` owns browser authentication and exposes `startGuestSession`. The method updates both the auth storage marker and mounted React context, which is required before navigating to `/discover`.

`src/app/discover/page.tsx` owns all Discover tabs and filters. Event and organization division filters use canonical ids from `GET /api/division-types`. The Club organization classification is represented by the `club` organization tag. `src/app/hooks/useLocation.ts` owns the selected coordinates and location label.

`src/app/login/page.tsx`, `src/lib/auth.ts`, and `src/app/api/auth/register/route.ts` implement web account creation. A safe same-origin `next` path must carry the selected create destination. `src/app/organizations/page.tsx` owns the organization creation modal and must honor a reviewed `create=1` query preset.

## Plan of Work

Add `src/lib/guestOnboarding.ts` as the single vocabulary for onboarding version, completion cookie, selected target, safe Discover query construction, create destinations, and profile onboarding intent. Keep browser-only storage writes in explicit functions so server modules can safely import constants and pure URL builders.

Add `src/components/onboarding/GuestIntentOnboarding.tsx`. The first step presents six clear actions grouped into Find and Create. Find actions open a second step using `useSports`, `GET /api/division-types`, and Google Places-backed location search. Create actions open an account-required step with Create free account and Explore as guest commands. Do not render a marketing hero before this tool.

Change `src/app/page.tsx` so authenticated sessions continue using `resolveLandingRedirectPathFromToken`, repeat anonymous visitors restore guest mode before opening `/discover`, and first-time anonymous visitors render the new wizard. The wizard marks completion only immediately before navigation.

Extend `src/lib/discoverFilters.ts` and `src/app/discover/page.tsx` to initialize tab, organization Club tag, skill ids, distance, and location from a validated query preset. Apply all selected division predicates to one row through the existing backend contract. Do not add a client-only skill filter.

Update account creation so `onboardingIntent` is accepted by the web registration route and defaults to `DISCOVER_EVENTS` for newly created web profiles. Update login to honor `mode=signup` and a safe `next` path. Google-created web profiles also receive the default intent. Mobile auth routes remain unchanged.

Update the organization list and creation modal so `/organizations?create=1&preset=club` opens the modal with Club and team tools plus Event management selected and the canonical Club tag selected. A regular organization preset opens the normal event-management configuration.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-site-guest-onboarding`:

    npm test -- --runInBand src/lib/__tests__/guestOnboarding.test.ts src/app/__tests__/page.test.tsx src/components/onboarding/__tests__/GuestIntentOnboarding.test.tsx src/app/login/__tests__/page.test.tsx
    npx tsc --noEmit --pretty false
    git diff --check

Then start the isolated development server on an unused port:

    node server.mjs --dev --port 3011

Use a clean browser context. Open `http://localhost:3011/`, choose Events, select a sport and skill, choose a location, and submit. Confirm that Discover opens on Events and the corresponding controls are active. Repeat for Clubs and Rentals. Clear the onboarding cookie and repeat the Create club path, confirming the account gate and direct post-signup organization modal preset.

## Validation and Acceptance

Acceptance is met when a first-time signed-out browser sees the intent wizard at `/`, not the landing page. Event and club search routes must show the selected sport, skill, location, and 50-mile distance filter; rental routes must show sport, location, and distance without a false skill filter. Club search must open Organizations with the Club tag selected.

After any completed branch, revisiting `/` in the same browser must go to Discover rather than replaying onboarding. A visitor who abandons before selecting a final action must still see onboarding on the next root visit.

Create organization, create club, and create event must show the free-account explanation first. Create free account must open signup mode and, after successful account creation, route directly to the requested creation screen. Explore as guest must enter guest mode and open Discover. New web accounts must not be sent to `/onboarding` after registration.

## Idempotence and Recovery

The completion marker is a client preference and can be cleared without affecting account or platform data. Tests and browser verification may delete the `bracketiq:first-visit-onboarding:v1` local-storage key and `bracketiq_guest_onboarding_v1` cookie to replay the wizard. All URL parsing must ignore malformed tabs, coordinates, distances, and unsafe post-auth destinations.

## Artifacts and Notes

Browser screenshots belong under `output/playwright/guest-onboarding/` and are verification artifacts, not committed product assets.

## Interfaces and Dependencies

Use existing Mantine components and Lucide icons. Use `useSports` for the sports catalog, `/api/division-types` for skill ids, `locationService` for Places predictions/details, `useLocation.setLocationFromInfo` for the shared location, and `useApp.startGuestSession` for guest access. Do not add a new database model or third-party onboarding library.

Revision note (2026-07-12): Initial implementation plan created after auditing the existing root, account onboarding, Discover, auth, location, and organization creation flows.

Revision note (2026-07-12): Updated after implementation and browser verification to record the guest-session bootstrap, explicit icon colors, local parent-schema mismatch, final test coverage, and verified redirect contracts.

Revision note (2026-07-13): Replaced full-page onboarding presentation with a bounded modal and explicit dimmed-backdrop rule; future highlights must target concrete components rather than the screen.
