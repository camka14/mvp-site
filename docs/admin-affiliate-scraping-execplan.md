# Admin Affiliate Event and Rental Imports

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root and must be maintained in accordance with that file. The separate source registry for this work lives at `docs/admin-affiliate-scrape-sources.md`.

## Purpose / Big Picture

BracketIQ should let an internal admin discover local sports events and rentals from approved public websites, review the discovered items, and publish selected items into BracketIQ as affiliate link listings. A published affiliate listing should appear in discovery like a normal event or rental, but its primary call to action should open the official source URL instead of starting BracketIQ's internal join, registration, payment, or rental booking flow.

The first visible outcome is an admin-only import surface where an admin chooses a configured source, clicks "Scrape", receives a list of discovered event or rental candidates, opens any candidate for full detail, and publishes the selected candidate. The public-user outcome is that clicking the listing's primary action takes the user to the official event registration or rental booking page.

## Progress

- [x] (2026-06-25 20:26Z) Created this initial ExecPlan after reviewing `PLANS.md`, the current admin dashboard, the `Events` and rental booking Prisma models, and the supplied Portland metro source list.
- [x] (2026-06-25 20:26Z) Created the source registry in `docs/admin-affiliate-scrape-sources.md` with priorities, URLs, descriptions, target listing types, and implementation status.
- [x] (2026-06-25 21:05Z) Added Prisma models and migration for affiliate scrape sources, DB-stored mappings, scrape runs, import candidates, and published affiliate listings.
- [x] (2026-06-25 21:05Z) Added a server-only ScrapingDog adapter, generic DB mapping extractor, affiliate import service, and admin-only API routes for sources, scraping, candidate detail, and publishing.
- [x] (2026-06-25 21:05Z) Added an admin "Affiliate imports" tab that lists sources, runs saved mappings, lists discovered candidates, shows candidate detail, and publishes candidates.
- [ ] Implement the first P0 source mapping and publish flow end to end with manually inspected ScrapingDog output.
- [ ] Update public event/rental UI so affiliate listings replace internal join or booking controls with a clear external link.

## Surprises & Discoveries

- Observation: The existing `Events` table has source-style fields such as `sourceType` and `sourceId` in TypeScript types, but the Prisma `Events` model does not have an external registration or affiliate URL field.
  Evidence: `src/types/index.ts` includes optional event source fields, while `prisma/schema.prisma` model `Events` has no `affiliateUrl`, `externalUrl`, or equivalent call-to-action URL.
- Observation: Rentals are currently represented as internal booking records, not standalone public rental listings.
  Evidence: `RentalBookings` and `RentalBookingItems` in `prisma/schema.prisma` model BracketIQ checkout, payment, locks, and booking items.
- Observation: The admin dashboard is a single tabbed client component backed by admin-only API routes.
  Evidence: `src/app/admin/AdminDashboardClient.tsx` owns admin tabs, while `/api/admin/events`, `/api/admin/organizations`, and similar routes use `requireRazumlyAdmin`.

## Decision Log

- Decision: Model affiliate imports as reviewed listings, not as automatic public posts.
  Rationale: Scraped data can be stale, incomplete, or incorrectly parsed. The admin should review candidates before publishing so BracketIQ does not publish misleading event dates, prices, or rental availability.
  Date/Author: 2026-06-25 / Codex

- Decision: Build a generic scraper framework with DB-stored source mappings, not one TypeScript extractor file per normal source.
  Rationale: Most target sources are pages with repeated event or rental cards and stable fields such as title, date, price, status, and official link. A stored mapping can define the list selector and field selectors once, then future scrapes can reuse that mapping without a deployment. Site-specific TypeScript extractors remain an escape hatch only for pages that cannot be expressed with selector mappings.
  Date/Author: 2026-06-25 / Codex

- Decision: Mapping creation is a manual developer/Codex workflow, not an admin mapping-builder UI.
  Rationale: The current requirement is for Codex to run ScrapingDog, inspect the returned output, decide which selectors and transforms map to BracketIQ fields, and save that mapping to the database. The product does not need admin controls for fetching samples, selecting elements, previewing selectors, or saving mappings interactively.
  Date/Author: 2026-06-25 / Codex

- Decision: Affiliate listings should use BracketIQ public detail pages but replace internal registration/booking actions with official links.
  Rationale: Public detail pages let BracketIQ keep discovery, search, SEO, moderation, and source attribution consistent, while the external call to action avoids pretending BracketIQ owns payment, inventory, or registration for the source.
  Date/Author: 2026-06-25 / Codex

- Decision: Do not promise real-time rental availability unless a source explicitly exposes it in public scrapeable data.
  Rationale: Many facility rental pages only expose facility type, pricing, booking process, or login-gated availability. BracketIQ should link to the official booking page instead of implying that a rental slot is held or available.
  Date/Author: 2026-06-25 / Codex

## Outcomes & Retrospective

Initial planning is complete. The remaining implementation should start with the data model and public UI semantics before any scraper calls are wired, because publishing scraped listings needs a durable way to distinguish BracketIQ-owned registration from affiliate link-out listings.

The first implementation slice is complete. The database now has durable records for sources, mappings, runs, candidates, and published affiliate listings. The server has a ScrapingDog client and generic HTML mapping extractor. Admin-only routes and an admin dashboard tab can run saved mappings, review discoveries, and publish candidates. Public discovery/rendering has not yet been connected to `AffiliateListings`, and no real source mapping has been saved yet.

## Context and Orientation

The admin dashboard lives in `src/app/admin/AdminDashboardClient.tsx`. It currently has tabs for events, organizations, teams, verification, fields, users, chats, and moderation. The server page at `src/app/admin/page.tsx` gates the dashboard to Razumly admins by reading the session token and redirecting non-admin users.

Admin APIs live under `src/app/api/admin`. Existing routes such as `src/app/api/admin/events/route.ts` call `requireRazumlyAdmin` from `src/server/razumlyAdmin.ts`, query Prisma, and return JSON payloads for the dashboard.

The main event table is `Events` in `prisma/schema.prisma`. Public organization event pages use `src/app/o/[slug]/events/[eventId]/page.tsx` and `src/app/o/[slug]/events/[eventId]/EventRegistrationClient.tsx`, which render `EventDetailSheet` from `src/app/discover/components/EventDetailSheet.tsx`. `EventDetailSheet` currently owns internal registration, team registration, waitlist, payment, signing, refund, and weekly-session behavior.

Rental checkout is currently internal to BracketIQ. The Prisma models `RentalBookings` and `RentalBookingItems` record BracketIQ-owned bookings, payment state, booking items, and field locks. Affiliate rental listings should not create these records until BracketIQ actually owns the booking flow. For the first affiliate import version, rentals should be published as link-out listing records or event-like discoverable records with a rental listing type.

In this plan, a "source" is a website or organization page configured for scraping. A "mapping" is JSON stored in the database that tells the generic parser how to find repeated event or rental items and how to extract fields from each item. A "scrape run" is one admin-triggered attempt to fetch and parse a source using its active mapping. A "candidate" is one discovered event or rental returned by a scrape run. A "published affiliate listing" is the BracketIQ public listing created after an admin approves a candidate. A "custom extractor" is optional TypeScript code used only when a source cannot be represented by a mapping.

## Plan of Work

First add the durable data model. Create a source table, a mapping table, a scrape-run table, a discovered-candidate table, and affiliate listing fields. The implementation can either add affiliate columns directly to `Events` or create a separate `AffiliateListings` model. Prefer a separate `AffiliateListings` model for the first version if rental listings and event listings need to share one review/publish workflow without forcing rental-shaped data into `Events`. If the team wants affiliate events to reuse all existing event discovery surfaces immediately, then add minimal affiliate fields to `Events` and create a parallel `AffiliateRentalListings` model for rentals. Decide this during implementation by inspecting the current public discovery query paths.

At minimum, persisted affiliate listing data needs source identity, source URL, official action URL, listing kind (`EVENT` or `RENTAL`), title, organizer, sport, format, city, venue, address, date range, day/time text, skill level, age group, gender or division, team versus individual availability, price text, registration or booking status, registration deadline, source last-checked timestamp, source payload, and admin publication status. The official action URL is the URL used by the public CTA.

Each source also needs one active mapping. The mapping stores the list URL, whether JavaScript rendering is required, the repeated item selector, field selectors, field extraction modes, required-field flags, transforms, detail-page follow rules when needed, and dedupe strategy. Mappings are created manually after Codex runs ScrapingDog against the source and inspects the returned HTML or JSON. The application only needs to use saved mappings; it does not need a UI for building mappings.

Next update public UI semantics. Any published affiliate event or rental must visibly identify the source and must not show BracketIQ-only join, payment, waitlist, refund, or booking controls. The public action should use text such as "Register on official site" for events and "Book on official site" for rentals. Links should open the official URL and include standard outbound-link attributes. Existing BracketIQ-owned events and rentals must keep their current join and booking behavior.

Then add admin APIs. Add endpoints under `src/app/api/admin/affiliate-sources` for listing and manually creating/updating scrape sources, `src/app/api/admin/affiliate-sources/[id]/scrape` for running a scrape, `src/app/api/admin/affiliate-discoveries` for listing candidates, `src/app/api/admin/affiliate-discoveries/[id]` for full candidate detail, and `src/app/api/admin/affiliate-discoveries/[id]/publish` for publishing. Every route must call `requireRazumlyAdmin`.

Then add the admin UI. Add an `affiliateImports` tab to `AdminDashboardClient`. The first version should show configured sources, status, last run time, last candidate count, and a "Scrape" button. After a run returns, show discovered candidates in a table or dense card list with title, kind, source, date/range, city, venue, sport, price/status, confidence, duplicate status, and actions to view detail or publish. Candidate detail should show the normalized fields, source URL, official action URL, raw extracted snippets, and warnings.

Then add the scraping layer. Create a server-only adapter for ScrapingDog that accepts a URL and source options and returns fetched content plus metadata. Keep the API key in a non-public environment variable such as `SCRAPINGDOG_API_KEY`; never use `NEXT_PUBLIC_`. Add a generic mapping extractor that reads a source's active mapping, uses `jsdom` or JSON traversal to find repeated items, applies field mappings, validates required fields, normalizes prices, dates, sports, cities, URLs, and dedupe keys, then returns candidates and warnings.

Implement the first source as a vertical slice. Use a P0 source from `docs/admin-affiliate-scrape-sources.md`, preferably one with event registration data rather than login-gated rental inventory. Codex should manually run ScrapingDog for that source, read the returned output, identify the repeated item selector and field selectors, insert or update the mapping row in the database, then prove the full flow: source row exists, admin clicks "Scrape", candidates persist, admin opens candidate details, admin publishes, public listing appears, and the public CTA opens the official source URL.

After the first source works, add more mappings one by one. Each new source should update `docs/admin-affiliate-scrape-sources.md` with implementation status, active mapping version, known limitations, and validation notes. Add a custom TypeScript extractor only when a source cannot be handled by mapping JSON.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

1. Inspect the current discovery and public event query paths:

       rg -n "discover|EventDetailSheet|public event|events.findMany|RentalBookings|RentalBookingItems" src prisma -S

   Confirm whether affiliate events can reuse `Events` immediately or whether a separate public listing query is cleaner.

2. Add Prisma schema changes and a migration. The migration should be additive and should not alter existing event registration behavior. Include indexes for source id, active mapping, listing kind, publication status, source URL, official action URL, scrape run id, and dedupe key.

3. Regenerate Prisma client if this repo requires it:

       npx prisma generate

4. Add server-side types and helpers for normalized candidates and mapping definitions. Keep these in `src/server` or `src/lib` depending on existing server-only import patterns. Do not import ScrapingDog code into client components.

5. Add tests for forbidden non-admin access, source listing, scrape-run creation with a mocked adapter, mapping extraction from a saved fixture, candidate listing, candidate detail, publish success, and duplicate protection.

6. Update public UI tests so an affiliate listing renders an outbound CTA and does not render internal join/booking controls.

7. Add the admin tab and UI tests for scrape, candidate list, detail view, publish action, loading states, and error states.

8. Run validation after every meaningful slice:

       npm test -- --runInBand <focused test file>
       npx tsc --noEmit

9. Before committing implementation work, run:

       git diff --check

## Validation and Acceptance

The data model slice is accepted when migrations apply locally, Prisma types compile, and tests prove that an affiliate source can have an active mapping and that an affiliate candidate can be saved without creating an internal event registration or rental booking.

The public UI slice is accepted when a fixture affiliate event shows a source attribution and a primary outbound CTA, and the same component still shows the normal BracketIQ registration controls for a normal event.

The admin UI slice is accepted when a Razumly admin can open `/admin`, switch to "Affiliate imports", see configured sources, trigger a mocked scrape, view discovered candidates, open candidate detail, and publish one candidate. A non-admin request to every new `/api/admin/affiliate-*` route must receive 403 or the existing admin-denied response.

The first real scraper slice is accepted when Codex has manually inspected the selected P0 source's ScrapingDog output, saved a working mapping to the database, and the local admin flow returns at least one candidate using that mapping. The candidate can be published, and the public listing CTA opens the source's official registration or booking URL.

Do not run scraper requests in tests against live third-party sites. Use recorded fixtures or mocked adapter responses for automated tests.

## Idempotence and Recovery

Scrape runs must be safe to repeat. A repeated scrape of the same source URL with the same active mapping should update or supersede candidates by dedupe key instead of creating unbounded duplicates. Publishing the same candidate twice should return the existing published listing or a clear "already published" response.

If a scraper fails, persist the scrape run with failure status, error message, started time, and finished time. Do not delete prior successful candidates. If ScrapingDog is unavailable or the API key is missing, the admin UI should show a clear source-level error and leave existing published listings unchanged.

If a published affiliate listing is later found to be wrong or stale, admins need a way to unpublish it without deleting the scrape history. Add unpublish/archive behavior before allowing broad source coverage.

## Artifacts and Notes

The initial source registry is `docs/admin-affiliate-scrape-sources.md`. It is intentionally separate from this ExecPlan so future scraper work can update source status without rewriting implementation instructions.

The recommended initial P0 event source is one of:

- Underdog Sports Leagues Portland, because it likely exposes sport, location, day, start date, registration mode, status, and pricing.
- Portland Volleyball Association / TeamSideline, because it is a sports-program source with structured league registration pages.
- Portland Basketball, because it has adult league and registration inventory that maps directly to affiliate event listings.

The recommended initial P0 rental source is one of:

- Eastside Timbers Field Rentals, because it is locally relevant and rental-focused.
- The Courts at Clear Creek, because it is in Gresham and maps directly to courts/rentals/events.
- Batting a Thousand or Big Dawg Batting, because cage rentals are likely simpler than school-district facility marketplaces.

## Interfaces and Dependencies

Use ScrapingDog only from server-side code. The code should expose a local interface so tests can mock it without real network calls:

    export type ScrapedPage = {
      url: string;
      finalUrl: string;
      statusCode: number | null;
      body: string;
      fetchedAt: string;
    };

    export interface ScrapePageClient {
      fetchPage(params: { url: string; renderJavascript?: boolean }): Promise<ScrapedPage>;
    }

The mapping extractor should support this stored mapping shape:

    export type FieldMapping = {
      selector: string;
      mode: 'text' | 'html' | 'attribute';
      attribute?: string;
      regex?: string;
      required?: boolean;
      transform?: 'trim' | 'priceText' | 'dateTime' | 'absoluteUrl';
    };

    export type AffiliateScrapeMapping = {
      kind: 'EVENT' | 'RENTAL';
      listUrl: string;
      renderJavascript?: boolean;
      waitMs?: number;
      itemSelector: string;
      fields: {
        title: FieldMapping;
        officialActionUrl: FieldMapping;
        organizerName?: FieldMapping;
        sportName?: FieldMapping;
        formatLabel?: FieldMapping;
        city?: FieldMapping;
        venueName?: FieldMapping;
        address?: FieldMapping;
        startsAt?: FieldMapping;
        endsAt?: FieldMapping;
        scheduleText?: FieldMapping;
        skillLevel?: FieldMapping;
        ageGroup?: FieldMapping;
        divisionText?: FieldMapping;
        participantOptionsText?: FieldMapping;
        priceText?: FieldMapping;
        statusText?: FieldMapping;
        registrationDeadlineText?: FieldMapping;
        sourceUrl?: FieldMapping;
        description?: FieldMapping;
      };
      detailPage?: {
        urlField: 'officialActionUrl' | 'sourceUrl';
        fields: Partial<Record<keyof AffiliateScrapeMapping['fields'], FieldMapping>>;
      };
      dedupe?: {
        fields: string[];
      };
    };

The generic extractor returns normalized candidates:

    export type AffiliateCandidateInput = {
      listingKind: 'EVENT' | 'RENTAL';
      title: string;
      organizerName?: string | null;
      sportName?: string | null;
      formatLabel?: string | null;
      city?: string | null;
      venueName?: string | null;
      address?: string | null;
      startsAt?: string | null;
      endsAt?: string | null;
      scheduleText?: string | null;
      skillLevel?: string | null;
      ageGroup?: string | null;
      divisionText?: string | null;
      participantOptionsText?: string | null;
      priceText?: string | null;
      statusText?: string | null;
      registrationDeadlineText?: string | null;
      officialActionUrl: string;
      sourceUrl: string;
      rawSummary?: Record<string, unknown>;
      warnings?: string[];
    };

    export interface AffiliateMappingExtractor {
      extract(params: {
        page: ScrapedPage;
        mapping: AffiliateScrapeMapping;
      }): Promise<AffiliateCandidateInput[]>;
    }

Before adding broad coverage, verify ScrapingDog's current request format and JavaScript-rendering options against its official documentation, then record the exact adapter behavior in this plan.

Revision note: Initial ExecPlan created to define affiliate link listings, admin scrape/review/publish workflow, source-specific scraper implementation, and source registry maintenance.

Revision note: Updated after product direction changed from per-site TypeScript extractors and any admin mapping-builder workflow to a DB-stored mapping extractor. Mappings are authored manually by Codex/developers after inspecting ScrapingDog output, then saved to the database for future admin-triggered scrapes.

Revision note: First implementation slice added Prisma persistence, ScrapingDog/mapping extraction services, admin APIs, admin UI, and focused tests. The next slice should manually inspect one P0 source with ScrapingDog, insert its mapping, and connect published affiliate listings to public discovery/detail pages.
