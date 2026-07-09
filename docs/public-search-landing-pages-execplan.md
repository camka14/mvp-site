# Public Search Landing Pages for Events, Clubs, Facilities, and Sports

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` in the repository root.

## Purpose / Big Picture

After this work, people searching Google for phrases such as "soccer leagues near Portland OR", "pickleball tournaments near Austin TX", "sports clubs near Seattle", or a public BracketIQ organization/event name can land on a useful, crawlable BracketIQ page instead of only seeing the app homepage. The page will show real public events, clubs, facilities, and sports inventory, then link users into the filtered BracketIQ discovery experience when they want the interactive app view.

The implementation should not make every arbitrary search query indexable. Instead, it should publish a controlled set of high-quality server-rendered landing pages for combinations that have real public inventory. In this plan, "public inventory" means organizations, events, facilities, fields, teams, rentals, or sports that can be shown without authentication and that belong to a public organization page.

## Progress

- [x] (2026-07-09 00:00Z) Created the initial implementation plan from the current repository state.
- [x] (2026-07-09 17:18Z) Confirmed the current public routes, sitemap output, robots behavior, and regular organization profile auth behavior from source.
- [x] (2026-07-09 17:18Z) Defined the public search URL model and inventory quality rules in `src/server/publicSearchPages.ts`.
- [x] (2026-07-09 17:18Z) Added a server-side public search index module that derives indexable pages from listed organizations, events, facilities, fields, and sports.
- [x] (2026-07-09 17:18Z) Added crawlable public search landing routes for event, club, and facility searches.
- [x] (2026-07-09 17:18Z) Added structured data, metadata, canonical URLs, and sitemap entries for the new landing pages.
- [x] (2026-07-09 17:18Z) Added regular `/organizations/[id]` profile metadata, structured data, sitemap entries, and anonymous read access for listed organization profiles.
- [x] (2026-07-09 17:18Z) Added focused Jest coverage for URL generation, location parsing, filtering, sitemap entries, and regular org profile SEO.
- [x] (2026-07-09 17:18Z) Ran focused Jest coverage and build route compilation; full type checking is blocked by unrelated existing script errors listed below.
- [x] (2026-07-09 17:46Z) Added curated major-city coverage for every sport in Oregon and Washington across events, clubs, facilities, leagues, tournaments, and weekly event search pages.
- [x] (2026-07-09 18:22Z) Added regular public event detail pages at `/event/[id]` for published events on listed organizations that do not already have an enabled `/o/[slug]/events/[eventId]` page.
- [ ] Run browser/HTML SEO smoke checks against a local database-backed server.

## Surprises & Discoveries

- Observation: The repository already has a public event SEO foundation.
  Evidence: `src/app/find-events/page.tsx`, `src/app/find-events/[sport]/page.tsx`, `src/app/o/[slug]/page.tsx`, `src/app/o/[slug]/events/[eventId]/page.tsx`, `src/app/sitemap.ts`, and `src/server/publicSearchSeo.ts` already exist.

- Observation: The interactive Discover page should remain separate from public SEO landing pages.
  Evidence: `src/app/robots.ts` disallows `/discover`, while `/find-events` and public organization/event pages are indexable.

- Observation: Location search is not yet modeled as a normalized first-class public SEO dimension.
  Evidence: `Events`, `Organizations`, `Facilities`, and `Fields` have `location`, `address`, and sometimes `coordinates`, but there is no shared `city`, `state`, `metroSlug`, or public search page table in `prisma/schema.prisma`.

- Observation: Regular organization profile pages were not indexable before this implementation because the client page redirected anonymous visitors to `/login`.
  Evidence: `src/app/organizations/[id]/page.tsx` returned early for unauthenticated users and pushed `/login`; this was changed so anonymous users can load listed organization profile content while private tabs remain permission-gated.

- Observation: Next route compilation passed, but full type checking is currently blocked by unrelated affiliate script edits already present in the working tree.
  Evidence: `npm run build` output included `✓ Compiled successfully in 14.4s`, then failed at `scripts/setup-athena-ajax-volleyball-affiliate-source.ts:557:16` with `Parameter 'id' implicitly has an 'any' type.` `npx tsc --noEmit` reported the same family of errors across several `scripts/setup-*affiliate-source.ts` files.

- Observation: The major-city coverage can exceed the original small sitemap cap once every sport is multiplied by Oregon/Washington cities and event-type variants.
  Evidence: The implementation raised `PUBLIC_SITEMAP_PAGE_LIMIT` to 50000, which stays within the standard sitemap URL count limit while allowing all curated sport-city combinations generated from the sports catalog.

- Observation: The existing `/events/[id]` route is not a public SEO detail page.
  Evidence: `src/app/events/[id]/page.tsx` exports the event schedule page from `./schedule/page`, so the implementation added `/event/[id]` instead of repurposing a management route.

## Decision Log

- Decision: Keep `/discover` blocked from crawling and use it only as the interactive app surface.
  Rationale: App search URLs can produce many low-value query combinations. Public SEO should use stable server-rendered landing pages with canonical URLs, visible result content, and sitemap entries.
  Date/Author: 2026-07-09 / Codex

- Decision: Build landing pages only for combinations that have public inventory.
  Rationale: A page like `/find-events/soccer-leagues/portland-or` is useful only if it contains real public soccer league results or a strong nearby fallback. Publishing empty or thin combinations creates duplicate or low-quality pages.
  Date/Author: 2026-07-09 / Codex

- Decision: Start with derived indexing from existing data, then add a materialized table only if performance or location quality requires it.
  Rationale: Existing public org/event/facility data can power the first implementation without a risky migration. If sitemap generation or location grouping becomes slow or unreliable, a later milestone can add a `PublicSearchPages` table.
  Date/Author: 2026-07-09 / Codex

- Decision: Use readable path segments, not arbitrary query strings, for indexable pages.
  Rationale: URLs such as `/find-events/soccer-leagues/portland-or` are more understandable and easier to canonicalize than `/discover?q=soccer&type=league&city=Portland&state=OR`.
  Date/Author: 2026-07-09 / Codex

- Decision: Include listed regular organization profile pages at `/organizations/[id]` in sitemap and metadata, separate from public slug pages at `/o/[slug]`.
  Rationale: The user explicitly wants regular org profile pages searchable, not only configured public pages. Listed organization profiles can show public overview/events/teams/facilities while management-only tabs remain hidden by existing permission gates.
  Date/Author: 2026-07-09 / Codex

- Decision: Generate sitemap summaries from one in-memory inventory snapshot instead of re-querying for each sport/location/type combination.
  Rationale: Sitemap generation is database-backed and dynamic; repeatedly querying per combination would scale poorly as the number of sports and locations grows.
  Date/Author: 2026-07-09 / Codex

- Decision: Generate curated pages for every sport in the sports catalog across major cities in Oregon and Washington, even when no current listing exists.
  Rationale: The user explicitly requested one page for every sport in major Washington/Oregon cities. Empty curated pages render an honest no-listings-yet state and a filtered Discover link; unknown non-curated empty locations still return no page.
  Date/Author: 2026-07-09 / Codex

- Decision: Limit empty curated page creation to sports that exist in the `Sports` table.
  Rationale: This provides broad coverage for BracketIQ's actual supported sports without accidentally indexing arbitrary fake sport slugs.
  Date/Author: 2026-07-09 / Codex

- Decision: Use `/event/[id]` for regular public event detail pages and keep `/o/[slug]/events/[eventId]` as canonical when a public org page is enabled.
  Rationale: This avoids changing the existing `/events/[id]` schedule route and avoids duplicate indexed URLs for events that already have a public registration/detail page under the organization slug.
  Date/Author: 2026-07-09 / Codex

## Outcomes & Retrospective

Initial implementation is complete for server-side helpers, route files, metadata, sitemap integration, robots changes, regular organization profile indexing, regular public event detail pages, curated Oregon/Washington sport-city coverage, and focused tests. Browser HTML smoke checks remain because full build/typecheck is blocked by unrelated affiliate script type errors in the dirty working tree. A follow-up should add normalized city/state/metro fields or a materialized public search table if location parsing from free-text `location` and `address` proves insufficient.

## Context and Orientation

This repository is a Next.js App Router application. Public pages live under `src/app`. Server-side helpers for public SEO live in `src/server/publicSearchSeo.ts`. Database access uses Prisma through `src/lib/prisma.ts`. The canonical public domain is `https://bracket-iq.com`, exposed through `src/lib/siteUrl.ts`.

The current public event discovery flow has two layers. The app search page is `/discover`, which users can interact with after landing on the site. The SEO-facing event directory is `/find-events` and `/find-events/[sport]`. The public organization page is `/o/[slug]`, and public event registration/detail pages live under `/o/[slug]/events/[eventId]`. The root sitemap at `src/app/sitemap.ts` calls `listPublicSitemapEntries()` from `src/server/publicSearchSeo.ts`, which currently emits public organization, public event, and sport directory URLs.

The term "landing page" in this plan means a server-rendered page that Google and unauthenticated users can fetch directly. It must have useful visible text, result links using normal anchor tags, metadata, one canonical URL, and a sitemap entry when it should be indexed.

The term "facet" means a search dimension such as sport, event type, or location. For this implementation, the allowed SEO facets are sport, event type, result kind, and location. Result kind means whether the page is about events, clubs, or facilities. Event type means league, tournament, weekly event, or event.

The term "location slug" means a lower-case URL-safe representation of a place, such as `portland-or`. It should map to display text such as `Portland, OR`. The first implementation may derive it from existing `location` or `address` text. If that proves unreliable, later work should add normalized city/state fields.

## Plan of Work

First, confirm the current baseline without changing behavior. Read `src/app/find-events/page.tsx`, `src/app/find-events/[sport]/page.tsx`, `src/server/publicSearchSeo.ts`, `src/app/sitemap.ts`, and `src/app/robots.ts`. Start a local server only if the environment has a working database, then fetch `/find-events`, `/find-events/soccer` for a sport known to exist, `/sitemap.xml`, and `/robots.txt`. Record what works in this plan.

Next, define the public URL model in code. Add a new module at `src/server/publicSearchPages.ts` or expand `src/server/publicSearchSeo.ts` if the additions remain small. Prefer a new module if the result list and location logic would make `publicSearchSeo.ts` too broad. The module should export helpers with stable names:

    export type PublicSearchKind = 'events' | 'clubs' | 'facilities';
    export type PublicSearchEventType = 'events' | 'leagues' | 'tournaments' | 'weekly-events';
    export type PublicSearchLocation = { slug: string; label: string; city?: string; state?: string };
    export type PublicSearchPageSummary = { path: string; title: string; description: string; lastModified?: Date };

    export function publicSearchPath(input: {
      kind: PublicSearchKind;
      sportSlug?: string;
      eventType?: PublicSearchEventType;
      locationSlug?: string;
    }): string;

    export async function listPublicSearchPageSummaries(): Promise<PublicSearchPageSummary[]>;
    export async function getPublicSearchPage(input: {
      kind: PublicSearchKind;
      sportSlug?: string;
      eventType?: PublicSearchEventType;
      locationSlug?: string;
    }): Promise<PublicSearchPage | null>;

The implementation should normalize sport names with the existing `sportNameToSlug()` helper in `src/lib/discoverFilters.ts`. It should derive event type from `Events.eventType`. It should derive organization eligibility from `Organizations.publicPageEnabled = true`, `Organizations.publicSlug IS NOT NULL`, and the default listed organization status. It should derive event eligibility from the existing public event states used in `src/server/publicSearchSeo.ts`, excluding templates.

Then add location extraction. Implement small, well-tested helpers that turn existing `location` and `address` strings into a conservative `PublicSearchLocation`. The helper should recognize common values like `Portland, OR`, `Portland, Oregon`, and full addresses containing `Portland, OR`. If a location cannot be confidently parsed into city and state, do not create a location landing page for it. This keeps the first implementation useful without mislabeling inventory.

After the server module exists, add page routes. Use these route groups:

    src/app/find-events/[...segments]/page.tsx
    src/app/find-clubs/[...segments]/page.tsx
    src/app/find-facilities/[...segments]/page.tsx

The existing `src/app/find-events/[sport]/page.tsx` can remain if it is simpler, but the catch-all route should not conflict with it. If keeping both causes complexity, replace `src/app/find-events/[sport]/page.tsx` with the catch-all route and preserve the existing `/find-events/[sport]` behavior. The catch-all parser should support:

    /find-events/soccer
    /find-events/soccer/portland-or
    /find-events/soccer-leagues
    /find-events/soccer-leagues/portland-or
    /find-events/soccer-tournaments/portland-or
    /find-clubs/soccer/portland-or
    /find-facilities/soccer/portland-or

If a route maps to a syntactically valid combination but has no public inventory, return `notFound()` unless the page is a broad directory such as `/find-events` or `/find-clubs`. Do not index empty city/sport/type pages.

Each landing page should render actual result cards using normal links. Event result cards should link to `/o/[slug]/events/[eventId]`. Club result cards should link to `/o/[slug]`. Facility result cards can link to the owning public organization page at first, ideally with an anchor or query that points to rentals/facility content if that route already supports it. The page should include a call-to-action link to `/discover` with matching sport and query filters using `buildDiscoverEventsHref()`, but `/discover` itself should stay disallowed in `robots.ts`.

Metadata should use the Next.js App Router `generateMetadata()` API. Each indexable landing page must set a title, description, canonical path, `robots: { index: true, follow: true }`, and Open Graph metadata. Examples:

    Soccer Leagues Near Portland, OR | BracketIQ
    Soccer Tournaments Near Portland, OR | BracketIQ
    Soccer Clubs Near Portland, OR | BracketIQ
    Soccer Facilities Near Portland, OR | BracketIQ

Structured data should reuse `src/components/blog/BlogStructuredData.tsx`. Each landing page should emit a `CollectionPage`, `BreadcrumbList`, and `ItemList`. Event items should include minimal `Event` objects when start date and location are available. Club items should include `Organization` objects. Facility items should include `Place` or local-business-style objects only when name and location/address are present. Do not invent review ratings, phone numbers, opening hours, or exact addresses that the database does not have.

Update `src/app/sitemap.ts` indirectly by extending `listPublicSitemapEntries()` or by adding and calling a new `listPublicSearchSitemapEntries()` helper. Include only canonical URLs that have enough public inventory. Keep each sitemap URL absolute through `absoluteUrl()` or `SITE_URL`. Maintain the existing `dynamic = 'force-dynamic'` behavior so Prisma-backed sitemap generation does not run at build time without a database.

Update internal links so Google can discover these pages through normal anchors. `/find-events` should link to sport pages and a curated set of sport/location/type pages. Public organization pages can link back to relevant sport and local search pages where natural. Avoid excessive link blocks. The goal is a compact, useful directory, not a generated wall of links.

Finally, preserve robots behavior. `src/app/robots.ts` should continue disallowing `/discover`, `/api`, `/admin`, login, profile, and private organization/team management routes. It should allow the new public routes by omission or explicit allow rules. If adding explicit allows, include `/find-events`, `/find-clubs`, `/find-facilities`, `/o`, `/blog`, `/guides`, and file preview routes.

## Concrete Steps

Work from the repository root:

    cd /Users/elesesy/StudioProjects/mvp-site

Inspect baseline:

    git status --short
    sed -n '1,220p' src/app/find-events/page.tsx
    sed -n '1,260p' 'src/app/find-events/[sport]/page.tsx'
    sed -n '1,760p' src/server/publicSearchSeo.ts
    sed -n '1,220p' src/app/sitemap.ts
    sed -n '1,180p' src/app/robots.ts

Add unit tests before or alongside implementation. Suggested files:

    src/server/__tests__/publicSearchPages.test.ts
    src/app/find-events/__tests__/publicSearchRoutes.test.tsx

The server test should cover these behaviors:

- `publicSearchPath()` produces stable, lower-case, hyphenated canonical paths.
- Location parsing accepts `Portland, OR` and rejects unclear free text.
- Public search page listing does not emit empty combinations.
- Event type pages distinguish leagues and tournaments.
- Sitemap entries include event, club, and facility pages only when backed by public inventory.

Add the server module and routes:

    src/server/publicSearchPages.ts
    src/app/find-events/[...segments]/page.tsx
    src/app/find-clubs/page.tsx
    src/app/find-clubs/[...segments]/page.tsx
    src/app/find-facilities/page.tsx
    src/app/find-facilities/[...segments]/page.tsx

If replacing the old sport route, remove or simplify:

    src/app/find-events/[sport]/page.tsx

Run focused tests:

    npx jest --runTestsByPath src/server/__tests__/publicSearchPages.test.ts --runInBand

Run type checking:

    npx tsc --noEmit

If the local database is available, start the dev server:

    npm run dev

Then fetch or open sample URLs:

    http://localhost:3000/find-events
    http://localhost:3000/find-events/soccer
    http://localhost:3000/find-events/soccer-leagues/portland-or
    http://localhost:3000/find-clubs/soccer/portland-or
    http://localhost:3000/find-facilities/soccer/portland-or
    http://localhost:3000/sitemap.xml
    http://localhost:3000/robots.txt

If the default port is busy, use the next available port and record it in this plan.

## Validation and Acceptance

The feature is acceptable when the following behavior is observable:

An unauthenticated browser can open `/find-events/soccer-leagues/portland-or` and see a server-rendered page titled "Soccer Leagues Near Portland, OR | BracketIQ" or an equivalent title that matches the inventory. The page shows real public league results if they exist, links each event result to a public event page under `/o/[slug]/events/[eventId]`, and includes a visible link into filtered Discover.

An unauthenticated browser can open `/find-clubs/soccer/portland-or` and see public organization results backed by organizations with `publicPageEnabled = true` and a public slug. Each result links to `/o/[slug]`.

An unauthenticated browser can open `/find-facilities/soccer/portland-or` and see public facility or field results backed by active facilities/fields that belong to public organizations. Each result links to the owning public organization or an existing public rental/facility route if one is added.

The HTML for each indexable page has one canonical URL, a useful title and meta description, and JSON-LD structured data for the collection and listed items. Use a browser or `curl` to inspect the actual rendered HTML, not only the React source.

The sitemap at `/sitemap.xml` includes canonical URLs for public org pages, public event pages, existing sport pages, and new event/club/facility search landing pages that have public inventory. It must not include private app routes such as `/discover`, `/admin`, `/profile`, `/organizations`, or `/teams`.

The robots file continues to disallow `/discover` and private app routes while allowing public landing pages by not disallowing them.

Run these commands before considering the work complete:

    npx jest --runTestsByPath src/server/__tests__/publicSearchPages.test.ts --runInBand
    npx tsc --noEmit
    npm run build

If `npm run build` fails because the environment lacks `DATABASE_URL`, record the exact error in `Surprises & Discoveries` and validate with the focused Jest tests plus a local dev server connected to a working database. Do not remove `dynamic = 'force-dynamic'` from Prisma-backed sitemap or public pages to make a build pass.

## Idempotence and Recovery

The implementation should be additive and safe to retry. URL generation helpers must be deterministic: the same sport, event type, and location should always produce the same path. Sitemap generation must be read-only and must not mutate the database.

If location parsing creates bad URLs, tighten the parser to emit fewer pages rather than guessing. It is better to omit a location page until data quality improves than to index a misleading page.

If `src/server/publicSearchSeo.ts` becomes too large, move new logic into `src/server/publicSearchPages.ts` and keep `publicSearchSeo.ts` focused on existing organization/event SEO helpers. Avoid unrelated refactors.

The working tree may contain unrelated local changes. Stage and commit only files touched for this implementation. Before committing, run:

    git diff --check
    git diff --cached --check

## Artifacts and Notes

The initial repo inspection showed this relevant current structure:

    src/app/find-events/page.tsx
    src/app/find-events/[sport]/page.tsx
    src/app/o/[slug]/page.tsx
    src/app/o/[slug]/events/[eventId]/page.tsx
    src/app/sitemap.ts
    src/app/robots.ts
    src/server/publicSearchSeo.ts
    src/lib/discoverFilters.ts

The current schema includes searchable source fields but not normalized public SEO location fields:

    Events.location
    Events.address
    Events.coordinates
    Events.sportId
    Events.eventType
    Organizations.location
    Organizations.address
    Organizations.coordinates
    Organizations.publicSlug
    Organizations.publicPageEnabled
    Facilities.location
    Facilities.address
    Facilities.coordinates
    Fields.location
    Fields.sportIds

## Interfaces and Dependencies

Use existing project dependencies and patterns. Do not introduce a new SEO package. Use Next.js App Router pages and `generateMetadata()`. Use Prisma through `src/lib/prisma.ts`. Use `BlogStructuredData` for JSON-LD script injection. Use existing helpers from `src/lib/discoverFilters.ts` for sport slug normalization and Discover links.

The public search server module should expose these stable interfaces at minimum:

    export type PublicSearchKind = 'events' | 'clubs' | 'facilities';
    export type PublicSearchEventType = 'events' | 'leagues' | 'tournaments' | 'weekly-events';

    export type PublicSearchResult = {
      id: string;
      kind: PublicSearchKind;
      title: string;
      description: string | null;
      href: string;
      organizationName?: string;
      organizationSlug?: string;
      sportName?: string | null;
      eventType?: string | null;
      start?: string | null;
      location?: string | null;
      imageUrl?: string | null;
      lastModified?: Date;
    };

    export type PublicSearchPage = {
      path: string;
      title: string;
      h1: string;
      description: string;
      canonicalPath: string;
      discoverHref: string;
      kind: PublicSearchKind;
      sportName?: string;
      eventType?: PublicSearchEventType;
      location?: PublicSearchLocation;
      results: PublicSearchResult[];
      relatedPages: PublicSearchPageSummary[];
      lastModified?: Date;
    };

    export async function getPublicSearchPage(input: {
      kind: PublicSearchKind;
      sportSlug?: string;
      eventType?: PublicSearchEventType;
      locationSlug?: string;
    }): Promise<PublicSearchPage | null>;

    export async function listPublicSearchPageSummaries(): Promise<PublicSearchPageSummary[]>;

The route parser should be covered by tests. Avoid parsing route meaning directly inside React components if it can live in a pure helper that Jest can test.

## Revision Notes

2026-07-09 / Codex: Created the initial plan to guide implementation of public, crawlable search landing pages for events, clubs, facilities, sports, and location-based Google searches.

2026-07-09 / Codex: Implemented the first pass of the plan, including public search routes, regular organization profile SEO, sitemap/robots changes, and focused tests. Full type checking remains blocked by unrelated affiliate script errors already present in the working tree.

2026-07-09 / Codex: Expanded public search coverage to generate pages for every supported sport across major Oregon and Washington cities, including event, club, facility, league, tournament, and weekly-event variants.

2026-07-09 / Codex: Added searchable regular public event detail pages at `/event/[id]` for published listed-organization events that do not already have a canonical public slug event page.
