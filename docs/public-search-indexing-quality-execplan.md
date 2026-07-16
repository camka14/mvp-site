# Improve Public Search Indexing Quality and Local Radius Matching

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` in the repository root.

## Purpose / Big Picture

After this work, Google and unauthenticated visitors will reach a smaller, higher-quality set of BracketIQ search pages. Public organization and event pages will have one preferred canonical URL, generic soccer and volleyball searches will aggregate their indoor, grass, and beach variants, and local pages will include matching inventory within 25 miles of the named city instead of requiring an exact city string. Empty sport, type, and city combinations will return HTTP 404 and will not appear in the sitemap.

The behavior is visible by opening a backed local page such as `/find-events/soccer-leagues/portland-or`, confirming that it contains matching events within 25 miles of Portland, and comparing it with an empty combination, which should return 404. The sitemap should contain the backed page, omit the empty page, contain each URL only once, and include the `/find-clubs` and `/find-facilities` directory roots.

## Progress

- [x] (2026-07-16 17:49Z) Audited the current public routes, live sitemap, local database inventory, coordinate coverage, canonical behavior, and existing public-search tests.
- [x] (2026-07-16 17:49Z) Confirmed that events, organizations, and facilities store longitude/latitude coordinate pairs in `[longitude, latitude]` order and that the repository already contains a Haversine distance pattern.
- [x] (2026-07-16 18:03Z) Added checked-in city centers, 25-mile Haversine matching, and exact-city fallback for records without usable coordinates.
- [x] (2026-07-16 18:03Z) Added umbrella Soccer and Volleyball entries while retaining populated specific variant pages.
- [x] (2026-07-16 18:03Z) Removed unconditional empty combinations; filtered pages now return 404 and sitemap summaries require at least one result.
- [x] (2026-07-16 18:03Z) Preferred `/o/[slug]` for public organization links and canonical metadata, and limited `/organizations/[id]` sitemap entries to fallback organizations.
- [x] (2026-07-16 18:03Z) Added all three public search roots to crawlable navigation and the sitemap, removed legacy search URL ownership, and deduplicated the final sitemap.
- [x] (2026-07-16 18:06Z) Added regression coverage and completed focused Jest, TypeScript, production build, real-database inventory, rendered-HTML, and desktop/mobile browser verification.
- [x] (2026-07-16 18:03Z) Recorded final evidence and the remaining post-deploy Google Search Console action.

## Surprises & Discoveries

- Observation: The live sitemap contains 4,114 entries, including 3,503 public-search URLs, while most local pages have no backing inventory.
  Evidence: The live sitemap audit counted 2,329 `/find-events`, 604 `/find-clubs`, and 570 `/find-facilities` URLs. In the current code, `src/server/publicSearchPages.ts` explicitly adds every supported sport across every curated Oregon and Washington city with an empty result list.

- Observation: Coordinate coverage is already sufficient for radius matching on the most important records.
  Evidence: The local database audit found usable coordinates on 223 of 225 listed organizations, 157 public events, and all 4 active facilities. Events, organizations, and facilities store `[longitude, latitude]`; fields store separate `lat` and `long` values.

- Observation: Facility sport landing pages currently lack trustworthy inventory.
  Evidence: The local database has active facilities, but none of the current field rows have populated `sportIds`. Sport-specific facility pages should therefore remain absent until real field-to-sport mappings exist.

- Observation: Before this change, two independent sitemap generators emitted some of the same sport directory URLs.
  Evidence: Eight `/find-events/[sport]` URLs occurred twice in the live sitemap. The implementation removed legacy search URL ownership and retained URL-level deduplication as a final safeguard.

- Observation: Most listed organizations already have an enabled public slug page.
  Evidence: The local database audit found 222 listed organizations with enabled `/o/[slug]` pages and only 3 listed organizations that need `/organizations/[id]` as the public fallback.

- Observation: The legacy public sitemap helper still emitted sport-directory URLs after the new inventory-gated generator was corrected.
  Evidence: `src/server/publicSearchSeo.ts` independently called `listPublicEventSportSummaries()`. Removing those sport entries made `src/server/publicSearchPages.ts` the sole sitemap owner for `/find-*` combinations and eliminated stale or duplicate search URLs.

- Observation: The cleaned live-database sitemap is materially smaller without losing the backed local pages used for validation.
  Evidence: The post-change generator produced 545 populated search combinations and 1,034 total unique sitemap URLs, compared with 3,503 search URLs and 4,114 total entries before the change. There were zero summaries without results and zero duplicate final URLs.

- Observation: No sport-specific facility sitemap pages are currently emitted, as intended.
  Evidence: The post-change search summary counts were 304 event pages and 241 club pages. Facility roots remain linked and indexable, but facility sport pages wait for real field `sportIds`.

## Decision Log

- Decision: Local public-search pages use a 25-mile radius measured from a checked-in city-center coordinate.
  Rationale: The user selected 25 miles. A deterministic checked-in center avoids runtime geocoding calls, keeps sitemap generation build-safe, and makes tests repeatable.
  Date/Author: 2026-07-16 / Codex

- Decision: Records with usable coordinates are matched by Haversine distance; records without coordinates fall back to exact parsed city/state matching.
  Rationale: Radius behavior should use geographic evidence when available, while older legitimate records should not disappear solely because their coordinates have not been repaired.
  Date/Author: 2026-07-16 / Codex

- Decision: Empty filtered combinations return 404 and are omitted from the sitemap.
  Rationale: Filtered pages exist to show real inventory. Returning 404 avoids indexing thousands of identical empty pages and allows the same stable URL to become live automatically when inventory appears.
  Date/Author: 2026-07-16 / Codex

- Decision: Soccer aggregates Soccer, Grass Soccer, Indoor Soccer, and Beach Soccer; Volleyball aggregates Volleyball, Indoor Volleyball, Grass Volleyball, and Beach Volleyball.
  Rationale: These are the generic search terms people use, while the specific catalog pages remain valuable and should continue to exist.
  Date/Author: 2026-07-16 / Codex

- Decision: `/o/[slug]` is the preferred public organization URL whenever the public page is enabled.
  Rationale: Human-readable slug pages are already the product’s richest public organization surface. `/organizations/[id]` remains the fallback for listed organizations without an enabled public page.
  Date/Author: 2026-07-16 / Codex

- Decision: Keep Prisma-backed pages and the sitemap dynamically rendered.
  Rationale: Inventory changes frequently and the existing lazy Prisma client plus `dynamic = 'force-dynamic'` avoids build-time database initialization failures.
  Date/Author: 2026-07-16 / Codex

- Decision: Remove sport-directory entries from `listPublicSitemapEntries()` and let `listPublicSearchSitemapEntries()` exclusively own search URLs.
  Rationale: Two generators cannot consistently apply the same current-inventory, umbrella-sport, radius, and empty-page rules. One owner prevents stale 404 URLs and makes final URL deduplication a safety net instead of the primary consistency mechanism.
  Date/Author: 2026-07-16 / Codex

## Outcomes & Retrospective

The implementation is complete in the working tree. Public local-search pages now use a deterministic 25-mile radius, umbrella Soccer and Volleyball routes aggregate their real variants, filtered pages without results return 404, and search cards and canonical metadata prefer `/o/[slug]`. The public footer and search header expose Events, Clubs, and Facilities as normal crawlable links.

The real database produced 545 populated public-search pages: 304 event pages and 241 club pages. It produced no sport-specific facility pages because the current field rows have no `sportIds`, which is the desired inventory-gated result. The complete sitemap contains 1,034 unique URLs with no duplicates, down from 4,114 pre-change entries.

Verification passed with 26 focused Jest tests, `npx tsc --noEmit`, and `npm run build`. A production server smoke test returned HTTP 200 for `/find-events`, `/find-events/soccer-leagues/portland-or`, `/find-events/volleyball/portland-or`, and `/find-clubs/soccer/portland-or`; it returned HTTP 404 for `/find-events/pickleball-tournaments/eugene-or`. The backed soccer page rendered one apex canonical tag, one viewport tag, `index, follow`, no duplicate heading text, and no `X-Powered-By` response header. Playwright snapshots at 1440 by 1000 and 390 by 844 showed the 25-mile copy, backed result cards, crawlable navigation, and responsive mobile menu with no backed-page console warnings or errors. The empty route showed the standard 404 page; its only console error was the expected failed document request. The local sitemap endpoint returned 1,034 URLs with zero duplicates. With `X-Forwarded-Proto: https`, a `www.bracket-iq.com` request returned HTTP 308 to the apex URL.

Deployment and Google Search Console submission remain operational follow-up steps. No database write or migration was required.

## Context and Orientation

This repository is a Next.js App Router application. The public SEO routes live in `src/app/find-events`, `src/app/find-clubs`, `src/app/find-facilities`, `src/app/o/[slug]`, `src/app/organizations/[id]`, and `src/app/event/[id]`. The shared public-search inventory and URL logic lives in `src/server/publicSearchPages.ts`. Older public organization and event SEO helpers live in `src/server/publicSearchSeo.ts`. The XML sitemap is assembled in `src/app/sitemap.ts`, and crawler rules are returned by `src/app/robots.ts`.

A canonical URL is the preferred URL for content that can otherwise be reached through more than one path. For organizations, `/o/[slug]` is preferred when enabled; `/organizations/[id]` is the fallback. For events, `/o/[slug]/events/[eventId]` is preferred when an enabled public organization page exists; `/event/[id]` is the fallback.

A public-search facet is one filtered dimension in a URL: the result kind (`events`, `clubs`, or `facilities`), sport, event type, or location. A page such as `/find-events/soccer-leagues/portland-or` combines all four. The location portion represents a 25-mile circle around Portland’s checked-in center coordinate.

Coordinates in Prisma JSON fields use `[longitude, latitude]` order. The distance calculation must convert these into latitude and longitude arguments before applying the Haversine formula, which calculates straight-line distance over the earth’s surface.

## Plan of Work

First, extend `src/server/publicSearchPages.ts` with a public coordinate type, a 25-mile constant, checked-in longitude/latitude centers for the curated Oregon and Washington locations, a coordinate normalizer, and a Haversine helper. Add coordinates to the searchable organization, event, and facility projections. Replace exact-only location matching with a function that uses the selected curated location’s center and the record’s coordinates when both exist, then falls back to the existing city/state parser.

Next, add a pure sport-entry builder in `src/server/publicSearchPages.ts`. It will turn database sport rows into the current specific sport entries and add synthetic `soccer` and `volleyball` entries whose member IDs and names cover the relevant variants. Event, organization, and facility filtering will match any member of an umbrella entry. The Discover link will include every member sport, the city-center latitude and longitude, and `distanceMiles=25`.

Then remove the unconditional empty-page generation in `listPublicSearchPageSummaries()`. The summary generator will test actual and curated locations and add only combinations with results. `getPublicSearchPage()` will return `null` for any filtered page with no results, causing the App Router page to call `notFound()` and return HTTP 404. Broad roots remain available as directory pages.

After inventory behavior is correct, update organization URL selection. Club and facility result cards will use `/o/[slug]` when enabled. `getRegularOrganizationSeoData()` will point its canonical metadata at the public slug when present. `listRegularOrganizationProfileSitemapEntries()` will emit only listed organizations without enabled public slug pages.

Update `src/app/sitemap.ts` to include `/find-clubs` and `/find-facilities` and deduplicate all returned URLs. Update the public search root and shared public navigation so normal anchor links expose the event, club, and facility directories. Convert `/find-events` to the shared root search view so its umbrella sport pages and backed sport links are rendered from the same inventory rules.

Finally, update Jest fixtures with coordinates and variant sports, add radius boundary and canonical tests, and update the sitemap and footer tests. Run focused tests first, then `npx tsc --noEmit`, `npm run build`, and local or direct server-rendered checks. Record the resulting sitemap counts and representative HTTP behavior here.

## Concrete Steps

Work from:

    cd /Users/elesesy/StudioProjects/mvp-site

Implement the server behavior and tests:

    npx jest --runTestsByPath \
      src/server/__tests__/publicSearchPages.test.ts \
      src/app/__tests__/sitemap.test.ts \
      src/components/layout/__tests__/SiteFooter.test.tsx \
      --runInBand

Run the wider verification:

    npx tsc --noEmit
    npm run build

The completed run produced:

    Test Suites: 5 passed, 5 total
    Tests:       26 passed, 26 total
    TypeScript:  passed
    Production build: compiled successfully; 124 static pages generated

If the local database-backed server is available, start it on an unused port and inspect:

    /find-events
    /find-events/soccer-leagues/portland-or
    /find-events/volleyball/portland-or
    /find-clubs/soccer/portland-or
    /find-facilities/soccer/portland-or
    /sitemap.xml
    /robots.txt

The backed URLs should return 200 with one self-canonical link and `index, follow`. Empty filtered URLs should return 404 and should not occur in the sitemap.

After deployment, submit the updated sitemap in Google Search Console and inspect one organization page, one event page, one umbrella sport page, and one local radius page. Search Console submission is intentionally post-deploy because Google must fetch the public sitemap and rendered pages.

The local production smoke test produced:

    200 /find-events
    200 /find-events/soccer-leagues/portland-or
    200 /find-events/volleyball/portland-or
    200 /find-clubs/soccer/portland-or
    404 /find-events/pickleball-tournaments/eugene-or
    200 /sitemap.xml
    200 /robots.txt

## Validation and Acceptance

The change is accepted when a Portland umbrella page includes a matching Beaverton, Gresham, Hillsboro, Vancouver, or other record whose coordinates are no more than 25 miles from the Portland center, and excludes a record beyond 25 miles. A record without usable coordinates is included only when its parsed city/state exactly matches the page.

`/find-events/soccer-leagues/portland-or` must aggregate league events from the Soccer, Grass Soccer, Indoor Soccer, and Beach Soccer catalog entries. `/find-events/volleyball/portland-or` must aggregate Volleyball, Indoor Volleyball, Grass Volleyball, and Beach Volleyball. The specific variant URLs remain valid when they have inventory.

An empty filtered page must cause `getPublicSearchPage()` to return `null`, the route to return HTTP 404, and `listPublicSearchSitemapEntries()` to omit its URL. Broad roots remain indexable directory pages.

Club and facility result cards must link to `/o/[slug]` for enabled public organizations and fall back to `/organizations/[id]` otherwise. The regular organization sitemap must include only fallback organization URLs. Regular organization metadata must name the slug path as canonical when one exists.

The final sitemap must contain `/find-events`, `/find-clubs`, and `/find-facilities`; must contain backed local pages; must omit empty combinations; and must have no duplicate URL values. Shared public navigation must expose crawlable links to all three roots.

## Idempotence and Recovery

All changes are read-only with respect to the database. Sitemap generation and page rendering derive output from existing rows and do not mutate inventory. Tests use mocked Prisma responses. Re-running tests, type checking, builds, or local HTTP checks is safe.

The working tree contains unrelated changes. Only the public-search, sitemap, shared public navigation, tests, and this ExecPlan may be edited for this task. If verification exposes an unrelated failure, record its exact command and error here without modifying unrelated work.

If a checked-in city center is wrong, update only that location’s coordinate and rerun the radius tests. If records lack coordinates, preserve exact-city fallback rather than adding runtime geocoding or silently widening the radius.

## Artifacts and Notes

Pre-change live sitemap evidence:

    total URLs: 4114
    /find-events: 2329
    /find-clubs: 604
    /find-facilities: 570
    duplicate URLs: 8

Pre-change database coordinate evidence:

    listed organizations: 225 total, 223 with coordinates
    public events: 259 total, 157 with coordinates
    active facilities: 4 total, 4 with coordinates
    fields: 458 total, 65 with coordinates, 0 with sportIds

Post-change live-database evidence:

    populated public-search summaries: 545
    event search summaries: 304
    club search summaries: 241
    facility sport summaries: 0
    zero-result summaries: 0
    final sitemap URLs: 1034
    duplicate final URLs: 0
    regular organization fallback URLs: 3
    Portland soccer league results: 6
    Portland volleyball results: 24 (display limit)
    empty Eugene pickleball tournament page: null / HTTP 404

## Interfaces and Dependencies

`src/server/publicSearchPages.ts` must export:

    export const PUBLIC_SEARCH_RADIUS_MILES = 25;

    export type PublicSearchCoordinates = {
      lng: number;
      lat: number;
    };

    export function createPublicSearchSportEntries(
      rows: Array<{ id?: unknown; name?: unknown }>,
    ): PublicSearchSportEntry[];

The internal public sport entry must retain a stable `slug` and display `name`, plus all member database sport IDs and names used by filtering and Discover links.

The implementation must use the existing Prisma client in `src/lib/prisma.ts`, the existing `sportNameToSlug()` and `buildDiscoverEventsHref()` helpers in `src/lib/discoverFilters.ts`, Next.js App Router metadata, and normal `Link` or anchor elements for crawlable navigation. It must not introduce a runtime geocoding dependency or database migration.

Revision note: Created on 2026-07-16 to replace the earlier empty curated-page strategy with inventory-gated indexing, 25-mile radius matching, umbrella sports, and canonical URL cleanup.

Revision note: Updated on 2026-07-16 after implementation to record single-owner search sitemap generation, completed verification, live-database URL counts, rendered HTTP behavior, and the remaining post-deploy Search Console step.

Revision note: Updated on 2026-07-16 after final Playwright verification to record responsive desktop/mobile behavior and the expected empty-route browser result.
