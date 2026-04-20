# Public Organization Embeds and Branded Pages

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` from the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

After this change, an organization can publish a branded BracketIQ page and copy embeddable widgets into third-party website builders such as WordPress, Weebly, Square Online, Wix, or a plain HTML site. A visitor on the client's site can see that organization's upcoming events, teams, rentals, and products without needing a BracketIQ account. When the visitor wants to register, purchase, rent, or sign required documents, the widget opens the first-party BracketIQ branded page so existing login, registration, Stripe checkout, and document flows continue to work reliably.

The first visible outcome should be:

1. An organization manager opens their organization in BracketIQ, configures a public slug, color, logo, and intro text, then copies an iframe snippet.
2. Pasting that iframe into a static HTML test page renders a branded list of published organization events.
3. Clicking "Register" or "View details" from the iframe opens the organization's branded BracketIQ page in the top browser window, not trapped inside the third-party iframe.

## Progress

- [x] (2026-04-20 16:48Z) Audited the existing repository structure, Prisma schema, organization route, event search route, products route, teams route, and organization detail page enough to shape this plan.
- [x] (2026-04-20 16:48Z) Created this ExecPlan as the implementation guide.
- [x] (2026-04-20 18:13Z) Added database fields, Prisma migration, generated Prisma client, shared organization type mapping, and server-side validation for public branding and embed settings.
- [x] (2026-04-20 18:13Z) Built `src/server/publicOrganizationCatalog.ts` for public-safe organization, event, team, rental, and product summaries.
- [x] (2026-04-20 18:13Z) Added public catalog API routes under `/api/public/organizations/[slug]`.
- [x] (2026-04-20 18:13Z) Added branded public organization pages at `/o/[slug]` and branded event registration pages at `/o/[slug]/events/[eventId]`.
- [x] (2026-04-20 18:13Z) Added iframe HTML widget routes at `/embed/[slug]/[kind]` and a script helper at `/embed.js`.
- [x] (2026-04-20 18:13Z) Added organization manager UI for public slug, color, copy, enable flags, preview links, and snippets.
- [x] (2026-04-20 18:13Z) Added targeted unit coverage for public catalog behavior and organization public settings PATCH validation.
- [x] (2026-04-20 18:24Z) Added `public/widget-test.html` as a manual static fixture for script and iframe embed testing.
- [ ] Add Playwright smoke coverage for live iframe resizing/navigation.

## Surprises & Discoveries

- Observation: `rg` is unavailable in this checkout due an "Access is denied" error, so repository research used PowerShell file listing and `Select-String`.
  Evidence: `rg --files src prisma` failed from the repository root.

- Observation: The current `Organizations` model already has `logoId`, `description`, `website`, `sports`, `productIds`, and `teamIds`, but it does not have public slug, public page enablement, embed enablement, brand color, or custom public page copy fields.
  Evidence: `prisma/schema.prisma` model `Organizations` includes those existing fields at lines around 778-804.

- Observation: Public event discovery already has a useful visibility rule that hides `UNPUBLISHED`, `PRIVATE`, and `TEMPLATE` events for anonymous visitors.
  Evidence: `src/app/api/events/search/route.ts` builds visibility around `PUBLISHED`, `null`, and authenticated host/admin exceptions.

- Observation: Rentals appear to be represented through fields and time slots rather than a standalone `Rentals` Prisma model.
  Evidence: `Fields` has `rentalSlotIds`; `TimeSlots` has `price`, `scheduledFieldId`, and `scheduledFieldIds`; the API tree currently has `src/app/api/rentals/sign/route.ts`.

- Observation: `npx tsc --noEmit --pretty false` currently fails on a pre-existing schedule file unrelated to the public widget changes.
  Evidence: The only reported error was `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx(863,5): error TS2322: Type 'number' is not assignable to type 'Timeout'.`

## Decision Log

- Decision: Put public branding fields directly on `Organizations` for the first release rather than creating a separate branding table.
  Rationale: The feature is one public page and one family of widgets per organization. Keeping fields on `Organizations` avoids an extra join and follows the existing organization service pattern. A later release can add saved per-widget configurations if clients need multiple independent widgets.
  Date/Author: 2026-04-20 / Codex

- Decision: Use a public branded route shaped as `/o/[slug]`, while keeping `/organizations/[id]` as the authenticated management surface.
  Rationale: The existing organization detail page is a large client-side management page with owner-only behavior. A short public route is easier to share, safer to cache, and clearer for customers.
  Date/Author: 2026-04-20 / Codex

- Decision: Treat the iframe as a discovery and navigation surface, not as the place where login, registration, checkout, or document signing happens.
  Rationale: Auth cookies and payment flows are fragile inside third-party iframes because modern browsers restrict third-party cookies and payment redirects. Opening a first-party BracketIQ page gives the existing auth, Stripe, and signing flows the best chance to work.
  Date/Author: 2026-04-20 / Codex

- Decision: Ship raw iframe snippets first and add a small script helper as a convenience layer.
  Rationale: Iframes work in most website builders and are easy to troubleshoot. The script helper can improve automatic height resizing, but the core embed should not depend on custom JavaScript being allowed by every builder.
  Date/Author: 2026-04-20 / Codex

- Decision: In the MVP, the Teams widget lists organization-level canonical teams, not every event-specific tournament team.
  Rationale: `CanonicalTeams` already has `organizationId`; event teams are bracket participants and may expose more participant context than a public client website needs. Event team display can be added later for bracket-specific widgets.
  Date/Author: 2026-04-20 / Codex

## Outcomes & Retrospective

The first implementation slice is complete. Organization managers can configure public page/widget settings, public catalog data is served through a public-safe server module and APIs, branded public organization/event pages exist, iframe/script embeds render public catalog sections, and `public/widget-test.html` provides a local static test harness. Remaining work is deeper browser-level validation in real iframe contexts and any follow-up refinements to rental booking and product checkout handoff.

## Context and Orientation

This repository is a Next.js App Router application using TypeScript, Mantine UI, Prisma, and Postgres. Prisma Client is exposed through `src/lib/prisma.ts`. API routes live under `src/app/api`. Client-side service wrappers live under `src/lib/*Service.ts`. Shared UI types live in `src/types/index.ts`.

The current authenticated organization management page is `src/app/organizations/[id]/page.tsx`. It already displays organization events, products, teams, fields, users, documents, and management controls. It should not become the public branded page because it is large, client-heavy, and permission-sensitive.

The current organization API route is `src/app/api/organizations/[id]/route.ts`. Anonymous users can read a basic organization row today, while manager-only fields such as staff invites and staff emails are only included when `canManageOrganization` allows them. This route should remain a management/detail route. New public embed endpoints should return a deliberately smaller public shape.

The current event search API route is `src/app/api/events/search/route.ts`. It accepts filters such as `organizationId`, date range, event type, sport, division, price, and location. Its visibility rule is a useful model for public embeds: anonymous results should only include published or legacy-null events and must exclude templates.

The current products route is `src/app/api/products/route.ts`. It supports public GET by `organizationId`, but the first public embed implementation should still route product reads through a new public catalog layer so product, event, rental, and team visibility stay consistent.

The current teams route is `src/app/api/teams/route.ts`. It returns teams for user/player/manager contexts. Public organization widgets should instead query organization teams directly through a public catalog function.

In this plan, "widget" means a small page rendered by BracketIQ and embedded inside another website with an `<iframe>`. An iframe is a browser frame that loads one site inside another site's page. In this plan, "script helper" means a small JavaScript file hosted by BracketIQ that creates the iframe for the client and listens for resize messages so the widget height can adjust automatically. In this plan, "first-party page" means a normal BracketIQ page in the browser's top window, where BracketIQ owns the URL and login/payment cookies behave normally.

## Plan of Work

Start with data modeling and public contracts. Add organization fields for public slug, page/widget enablement, brand colors, public headline, public intro text, and optional embed domain allowlist. Use optional fields so existing organizations keep working without immediate backfill. A public slug is the human-readable identifier used in URLs such as `/o/seattle-volleyball-club`. Slugs must be lowercase, URL-safe, unique, and not collide with reserved words such as `new`, `api`, `embed`, `admin`, or `organizations`.

Then build a public catalog module in `src/server/publicOrganizationCatalog.ts`. This module should contain pure server-side functions for loading public organization summary, events, teams, products, and rental slots. These functions should not return owner IDs, host IDs, staff emails, participant emails, hidden user data, or private/unpublished objects. Route handlers and pages should call this shared module so the public page and widgets cannot drift.

After the public catalog exists, add public route handlers under `src/app/api/public/organizations/[slug]/...`. The minimal endpoints are:

- `GET /api/public/organizations/[slug]` returns organization public branding and high-level counts.
- `GET /api/public/organizations/[slug]/events` returns published event cards.
- `GET /api/public/organizations/[slug]/teams` returns public organization team cards.
- `GET /api/public/organizations/[slug]/rentals` returns publicly bookable rental slot cards.
- `GET /api/public/organizations/[slug]/products` returns active public product cards.

Then create the public branded page at `src/app/o/[slug]/page.tsx`. This should be a server component or mostly server-rendered page so it loads quickly and can be shared. It should use the organization's brand color and logo, show custom text, and immediately show actionable catalog sections: upcoming events, rentals, teams, and products. The page should link registration, purchase, and rental actions into existing BracketIQ flows. If the existing `/events/[id]` page is the best public event detail route, use it. If the current event detail behavior is only reliable inside Discover modals, add a small public event handoff route in this milestone that loads the event and opens or redirects into the existing join flow.

Then create iframe routes under `src/app/embed/[slug]/[kind]/page.tsx`, where `kind` can be `events`, `teams`, `rentals`, `products`, or `all`. The iframe should render without the main app navigation, should use simple responsive cards, and should keep CSS isolated inside the iframe. It should accept query parameters for common client needs: `limit`, `theme`, `sport`, `eventType`, `showLogo`, and `compact`. Brand color should default to the organization's saved brand color. Calls to action inside the iframe should use `target="_top"` or a click handler that sets `window.top.location` so registration and checkout happen on the top-level BracketIQ page.

After raw iframe support works, add a script helper route at `src/app/embed.js/route.ts` or `src/app/api/embed/script/route.ts` that returns JavaScript with `Content-Type: application/javascript`. The script should let clients paste a snippet such as:

    <div data-bracketiq-widget data-org="seattle-volleyball-club" data-kind="events" data-limit="6"></div>
    <script async src="https://bracketiq.com/embed.js"></script>

The script helper should find `data-bracketiq-widget` elements, create iframes pointed at `/embed/[slug]/[kind]`, and listen for `postMessage` height messages from the iframe. The iframe page should post its document height after load and after content changes.

Then add organization manager UI. Because `src/app/organizations/[id]/page.tsx` is already large, prefer a focused component such as `src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx` rather than adding all logic inline. The panel should be visible only to users who can manage the organization. It should allow the manager to enable the public page, set or regenerate the slug, set brand colors, confirm logo, edit public headline and text, enable widgets, preview the public page and each widget, and copy raw iframe and script snippets.

Finally, add tests and manual validation. The first release should include server tests for slug validation and public visibility, component tests for manager settings behavior, and a Playwright or static HTML smoke test showing that an iframe renders and top-level navigation works.

## Concrete Steps

From repo root (`C:\Users\samue\Documents\Code\mvp-site`), implement the work in this order.

First, update Prisma schema in `prisma/schema.prisma`. Add optional fields to `Organizations`:

    publicSlug String? @unique
    publicPageEnabled Boolean @default(false)
    publicWidgetsEnabled Boolean @default(false)
    brandPrimaryColor String?
    brandAccentColor String?
    publicHeadline String?
    publicIntroText String?
    embedAllowedDomains String[] @default([])

Create a Prisma migration under `prisma/migrations/<timestamp>_organization_public_branding/migration.sql`. Use additive SQL. Because existing rows need no immediate public slug, keep `publicSlug` nullable. Add a unique index on `publicSlug` where not null if Prisma's generated SQL does not do this safely for Postgres. Run:

    npx prisma migrate dev
    npx prisma generate

Second, update shared types and mapping. Add the same fields to `Organization` in `src/types/index.ts`. Update `src/lib/organizationService.ts` so `mapRowToOrganization` reads the new fields and create/update payloads can send them. Update `src/app/api/organizations/[id]/route.ts` so manager PATCH can update the public fields after validating color strings, slug format, intro length, and allowed domains. Add tests under `src/app/api/organizations/[id]/__tests__` or the nearest existing organization route test folder.

Third, create the server catalog module `src/server/publicOrganizationCatalog.ts`. Define functions with names close to:

    getPublicOrganizationBySlug(slug: string)
    listPublicOrganizationEvents(organizationId: string, options)
    listPublicOrganizationTeams(organizationId: string, options)
    listPublicOrganizationRentals(organizationId: string, options)
    listPublicOrganizationProducts(organizationId: string, options)

These functions should return plain JSON-safe objects. Event queries must include only `state: 'PUBLISHED'` and possibly `state: null` if legacy published events still use null, and must exclude `state: 'PRIVATE'`, `state: 'UNPUBLISHED'`, and `state: 'TEMPLATE'`. Product queries should include `isActive: true` or products where `isActive` is null only if existing behavior treats null as active. Teams should come from `CanonicalTeams` with matching `organizationId`, with a fallback to `Organizations.teamIds` if needed. Rentals should use field and time-slot data already used by Discover, but only include slots with price and public availability.

Fourth, add route handlers:

    src/app/api/public/organizations/[slug]/route.ts
    src/app/api/public/organizations/[slug]/events/route.ts
    src/app/api/public/organizations/[slug]/teams/route.ts
    src/app/api/public/organizations/[slug]/rentals/route.ts
    src/app/api/public/organizations/[slug]/products/route.ts

Each route should call `publicOrganizationCatalog`, return 404 when the organization does not exist or public page/widgets are disabled, and return only the public DTO. DTO means "data transfer object", a small object designed specifically for the API response rather than the full database row.

Fifth, add the branded public page:

    src/app/o/[slug]/page.tsx
    src/app/o/[slug]/PublicOrganizationPage.tsx
    src/app/o/[slug]/publicOrganizationTheme.ts

Use the server catalog to load the organization and initial sections. Do not require authentication to view the page. Use the saved brand colors through CSS variables. Keep the first screen useful: show the org identity and immediately show upcoming events or the next available action, not a marketing-only landing page. Make registration, rental, and purchase buttons navigate to first-party BracketIQ routes.

Sixth, add widget pages:

    src/app/embed/[slug]/[kind]/page.tsx
    src/app/embed/[slug]/[kind]/EmbedWidget.tsx
    src/app/embed/[slug]/[kind]/embedWidgetParams.ts

Validate `kind` against the allowed list. Validate query parameters with `zod`. For client-side height messaging, add a small client component that posts:

    window.parent.postMessage({ type: 'bracketiq:widget-height', height, slug, kind }, '*')

The script helper will filter messages by iframe reference, so the iframe can use `'*'` for compatibility with varied client domains. Do not include secrets or user data in these messages.

Seventh, add the script helper. Prefer a route handler over a static file because the script needs the current public origin:

    src/app/embed.js/route.ts

It should create iframes with `loading="lazy"`, `width="100%"`, `style.border = "0"`, and a sensible initial height. It should read data attributes from the placeholder element and preserve unknown attributes only if explicitly safe. It should not execute arbitrary user-provided JavaScript.

Eighth, add organization manager settings UI:

    src/app/organizations/[id]/OrganizationPublicSettingsPanel.tsx
    src/app/organizations/[id]/__tests__/OrganizationPublicSettingsPanel.test.tsx

Wire the panel into `src/app/organizations/[id]/page.tsx`, likely in an existing settings/overview area where `viewerCanManageOrganization` is available. The UI should show the public page URL, iframe snippets, script snippets, and live preview links after settings are valid. It should disable snippets until the public page or widgets are enabled.

Ninth, update security headers only where needed. The app must not globally block framing for widget routes. If the project later adds a global `X-Frame-Options: DENY` or strict `Content-Security-Policy frame-ancestors`, widget routes must override that behavior. For the first release, use public widget routes that can be embedded broadly. If `embedAllowedDomains` is non-empty, enforce it by checking the request `Referer` or `Origin` header as a best-effort guard and showing a friendly disabled message when the host is not allowed. Do not rely on `Referer` as the only security boundary for private data because headers can be missing; the real boundary is that widgets only serve public data.

Tenth, add a manual test fixture under `test/fixtures/embed-smoke.html` or `public/embed-smoke.html` containing an iframe and the script snippet for a known seeded organization. This fixture is for local validation only.

## Validation and Acceptance

Run these checks from `C:\Users\samue\Documents\Code\mvp-site`:

    npx tsc --noEmit
    npm test -- src/server/__tests__/publicOrganizationCatalog.test.ts
    npm test -- src/app/api/public/organizations
    npm test -- src/app/organizations/[id]/__tests__/OrganizationPublicSettingsPanel.test.tsx

If repository-wide typecheck has unrelated pre-existing failures, record the exact errors in `Surprises & Discoveries` and still run targeted tests for the new files.

Manual acceptance should prove these behaviors:

- A manager can enable the public page, choose a slug, set a color, write public text, save, reload, and see the same settings.
- Visiting `/o/[slug]` as an anonymous user shows the branded organization page.
- `/o/[slug]` does not expose staff emails, owner-only controls, private events, unpublished events, or template events.
- `/embed/[slug]/events?limit=3` renders in a browser without the main app navigation.
- A raw iframe pasted into a local static HTML page renders the events widget.
- The script helper creates an iframe from a `data-bracketiq-widget` element and adjusts iframe height after content loads.
- Clicking registration or purchase from inside the iframe navigates the top-level browser window to a BracketIQ page, where existing auth and checkout flows continue.
- Disabling widgets prevents iframe widget content from rendering while keeping the authenticated organization management page usable.
- Disabling the public page makes `/o/[slug]` return a not-found or disabled page for anonymous users.

## Idempotence and Recovery

All database changes should be additive. Keep new organization public fields nullable or defaulted so existing records remain valid. Slug generation must be deterministic and retry on collisions by adding a short suffix, such as `seattle-volleyball-club-2`.

If a migration fails locally, do not reset the database unless the user explicitly approves it. Inspect the failed migration, fix the SQL, and rerun `npx prisma migrate dev`. In production, use `npx prisma migrate deploy`.

If public page routes expose too much data during review, stop and narrow the public DTOs in `src/server/publicOrganizationCatalog.ts` instead of trying to hide fields in UI components. The server response is the security boundary.

If iframe rendering conflicts with global app providers, isolate the embed route with a minimal layout or route-specific component tree. The widget should not depend on authenticated app context.

If third-party login or Stripe checkout fails inside an iframe, keep the iframe behavior simple: navigate the top window to BracketIQ. Do not try to force checkout to work embedded.

## Artifacts and Notes

The expected raw iframe snippet should look like this after implementation:

    <iframe
      src="https://bracketiq.com/embed/seattle-volleyball-club/events?limit=6"
      title="Seattle Volleyball Club events on BracketIQ"
      width="100%"
      height="640"
      style="border:0;max-width:100%;"
      loading="lazy">
    </iframe>

The expected script snippet should look like this after implementation:

    <div
      data-bracketiq-widget
      data-org="seattle-volleyball-club"
      data-kind="events"
      data-limit="6">
    </div>
    <script async src="https://bracketiq.com/embed.js"></script>

Example public API response shape for organization:

    {
      "organization": {
        "id": "org_123",
        "slug": "seattle-volleyball-club",
        "name": "Seattle Volleyball Club",
        "description": "Indoor volleyball leagues and tournaments.",
        "logoUrl": "/api/public/organizations/seattle-volleyball-club/logo",
        "brandPrimaryColor": "#0f766e",
        "brandAccentColor": "#facc15",
        "publicHeadline": "Play your next league with us",
        "publicIntroText": "Find upcoming tournaments, leagues, rentals, and memberships."
      }
    }

During implementation, confirm whether existing logo file downloads are safe for anonymous public use. If the current file API requires permissions, add a narrow public logo route that only serves the configured organization logo for organizations with public page or widgets enabled.

## Interfaces and Dependencies

New Prisma fields on `Organizations`:

    publicSlug String? @unique
    publicPageEnabled Boolean @default(false)
    publicWidgetsEnabled Boolean @default(false)
    brandPrimaryColor String?
    brandAccentColor String?
    publicHeadline String?
    publicIntroText String?
    embedAllowedDomains String[] @default([])

New shared TypeScript additions in `src/types/index.ts`:

    publicSlug?: string;
    publicPageEnabled?: boolean;
    publicWidgetsEnabled?: boolean;
    brandPrimaryColor?: string;
    brandAccentColor?: string;
    publicHeadline?: string;
    publicIntroText?: string;
    embedAllowedDomains?: string[];

New server DTO names should be explicit and public:

    PublicOrganizationSummary
    PublicOrganizationEventCard
    PublicOrganizationTeamCard
    PublicOrganizationRentalCard
    PublicOrganizationProductCard

New route paths:

    /o/[slug]
    /embed/[slug]/[kind]
    /embed.js
    /api/public/organizations/[slug]
    /api/public/organizations/[slug]/events
    /api/public/organizations/[slug]/teams
    /api/public/organizations/[slug]/rentals
    /api/public/organizations/[slug]/products

This feature depends on existing auth, registration, document signing, product purchase, Stripe checkout, and file storage behavior. It should reuse those flows by linking into first-party BracketIQ pages rather than duplicating them inside the widget.

Revision Note (2026-04-20): Created the initial implementation plan after repository inspection and product-scope clarification. The plan chooses a public `/o/[slug]` branded page, iframe-first widgets, top-window registration/checkout navigation, and server-side public catalog functions as the first shippable architecture.

Revision Note (2026-04-20): Updated the plan after the first implementation pass. The implemented slice includes database fields, public APIs, branded public pages, HTML widgets, script embeds, manager settings, targeted tests, a manual static widget fixture, and validation notes. Playwright iframe smoke coverage remains as follow-up work.
