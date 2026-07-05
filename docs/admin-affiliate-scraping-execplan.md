# Admin Affiliate Event and Rental Imports

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root and must be maintained in accordance with that file. The separate source registry for this work lives at `docs/admin-affiliate-scrape-sources.md`.

## Purpose / Big Picture

BracketIQ should let an internal admin discover local sports events and rentals from approved public websites, review the discovered items, and publish selected items into BracketIQ as affiliate link listings. A published affiliate event should be a real row in `Events` with no host user, an `organizationId` pointing at a private source organization for the scraped website, a behavioral `eventType`, and `affiliateUrl` set to the official source URL. It should appear in discovery like a normal event, but its primary call to action should open the official source URL instead of starting BracketIQ's internal join, registration, payment, or rental booking flow.

The first visible outcome is an admin-only import surface where an admin chooses a configured source, clicks "Scrape", receives a list of discovered event or rental candidates, opens any candidate for full detail, and publishes the selected candidate. The public-user outcome is that clicking the listing's primary action takes the user to the official event registration or rental booking page.

## Progress

- [x] (2026-06-25 20:26Z) Created this initial ExecPlan after reviewing `PLANS.md`, the current admin dashboard, the `Events` and rental booking Prisma models, and the supplied Portland metro source list.
- [x] (2026-06-25 20:26Z) Created the source registry in `docs/admin-affiliate-scrape-sources.md` with priorities, URLs, descriptions, target listing types, and implementation status.
- [x] (2026-06-25 21:05Z) Added Prisma models and migration for affiliate scrape sources, DB-stored mappings, scrape runs, import candidates, and published affiliate listings.
- [x] (2026-06-25 21:05Z) Added a server-only ScrapingDog adapter, generic DB mapping extractor, affiliate import service, and admin-only API routes for sources, scraping, candidate detail, and publishing.
- [x] (2026-06-25 21:05Z) Added an admin "Affiliate imports" tab that lists sources, runs saved mappings, lists discovered candidates, shows candidate detail, and publishes candidates.
- [x] (2026-06-26 00:25Z) Removed the first local TeamSideline experiment from the active path after product direction changed; the first retained source should be City of Gresham, Troutdale Indoor Sports, or The Courts at Clear Creek.
- [x] (2026-06-26 00:52Z) Saved the City of Gresham Sports Field Rentals DB mapping and ran it through ScrapingDog, producing 14 persisted affiliate rental candidates.
- [x] (2026-06-26 00:36Z) Updated the City of Gresham mapping to version 2 after link verification so retained candidates use facility-specific CommunityPass calendar URLs.
- [x] (2026-06-26 00:44Z) Reviewed the current rental discover flow and decided affiliate rentals should be rendered as facility/resource rental cards, with external booking CTAs when BracketIQ does not own checkout.
- [x] (2026-06-26 01:05Z) Saved the Troutdale Indoor Sports Rentals DB mapping and ran it through ScrapingDog, producing 2 persisted affiliate rental candidates from the rendered Natty Hatty booking page.
- [x] (2026-06-26 01:16Z) Saved page-level Troutdale Indoor Sports event/program mappings for adult soccer, youth soccer, and men's basketball leagues, producing 3 persisted affiliate event candidates.
- [x] (2026-06-26 09:30Z) Replaced the temporary published `AffiliateListings` event path with real `Events` rows for affiliate event candidates.
- [x] (2026-06-26 23:15Z) Removed the legacy `AffiliateListings` model and `publishedListingId` candidate column now that events, teams, and rental facilities publish into real target tables.
- [x] (2026-06-26 09:30Z) Made affiliate events hostless by allowing `Events.hostId` to be null and adjusting host-specific flows to no-op or skip host controls when no host exists.
- [x] (2026-06-26 09:30Z) Added the manual first-time website setup requirement to source records through `AffiliateScrapeSources.organizationId`; event scrapes now require a linked organization.
- [x] (2026-06-26 09:55Z) Updated affiliate event image handling so imports leave missing event images as `null` and public event cards can fall back to the source organization's logo.
- [x] (2026-06-26 09:45Z) Created and linked the local private Troutdale Indoor Sports source organization, then reran the three Troutdale event sources into real affiliate event rows.
- [x] (2026-06-26 05:44Z) Captured the official Troutdale Indoor Sports green text mark, created a transparent upscaled logo PNG, and assigned it to the local Troutdale source organization.
- [x] (2026-06-26 05:50Z) Added visual identity capture to the required first-time setup checklist for every new scraped website.
- [x] (2026-06-26 05:58Z) Added source organization descriptions to the required first-time setup checklist.
- [x] (2026-06-26 06:15Z) Tightened affiliate event imports so event candidates without a source-provided future start date are skipped instead of falling back to the scrape time.
- [x] (2026-06-26 18:25Z) Replaced the Rose City overview-table adult league and community team mappings with registration-card mappings from `https://rosecityfutsal.com/registration/`.
- [x] (2026-06-26 18:25Z) Added source-derived division creation for affiliate event imports when a scraper mapping captures a division or level.
- [x] (2026-06-26 18:25Z) Added registration-deadline filtering so event/team imports skip source registrations that are already closed.
- [x] (2026-06-30 15:00Z) Added evergreen affiliate program support for sources that describe stable programs but do not expose reliable dated event rows. Candidate mappings can now set `dateDisplayMode` and `dateDisplayText`, and manual-summary mappings can emit curated no-fixed-date candidates after a source page is fetched.
- [x] (2026-07-04 17:25Z) Added the Oregon Youth Soccer sanctioned tournaments source as a directory-style scraper-backed mapping. The OYSA source creates candidates from official sanctioned tournament links and treats host tournament sites as the authority for registration, fees, venues, and detailed divisions.
- [x] (2026-07-04 18:05Z) Added Portland Youth Soccer Association as a separate direct source from OYSA. The PYSA source uses manual-summary candidates for Fall 2026 league, Fall Shootout, and Spring 2027 league because the Sports Connect pages expose dates, fees, and division tables across static pages rather than repeated event cards.
- [x] (2026-07-04 19:00Z) Added scheduled scrape metadata to affiliate sources, a DigitalOcean-compatible due-runner command, and an idempotent cadence configuration script for known active sources.
- [ ] Publish flow end to end with manually inspected ScrapingDog output.
- [ ] Make affiliate/external registration orthogonal to event behavior so manually created and scraped affiliate events can also use `WEEKLY_EVENT`.
- [ ] Update public event/rental UI so affiliate listings replace internal join or booking controls with a clear external link.
- [ ] Add a server-side address/place resolver for scraper processing so addresses can be normalized into coordinates before discover filtering.
- [ ] Add facility/resource grouping for affiliate rentals so adjacent fields at one location become resources under one facility listing.

## Surprises & Discoveries

- Observation: The existing `Events` table has source-style fields such as `sourceType` and `sourceId` in TypeScript types, but the Prisma `Events` model does not have an external registration or affiliate URL field.
  Evidence: `src/types/index.ts` includes optional event source fields, while `prisma/schema.prisma` model `Events` has no `affiliateUrl`, `externalUrl`, or equivalent call-to-action URL.
- Observation: Rentals are currently represented as internal booking records, not standalone public rental listings.
  Evidence: `RentalBookings` and `RentalBookingItems` in `prisma/schema.prisma` model BracketIQ checkout, payment, locks, and booking items.
- Observation: The admin dashboard is a single tabbed client component backed by admin-only API routes.
  Evidence: `src/app/admin/AdminDashboardClient.tsx` owns admin tabs, while `/api/admin/events`, `/api/admin/organizations`, and similar routes use `requireRazumlyAdmin`.
- Observation: ScrapingDog response URLs point at the ScrapingDog API endpoint, not the scraped source URL.
  Evidence: The first Portland Softball run initially resolved relative TeamSideline program paths against `https://api.scrapingdog.com`; the adapter now preserves the requested source URL as `finalUrl` so relative links resolve against the source site.
- Observation: City of Gresham's public parks reservation page has a static sports-field rental list and a public CommunityPass reservation calendar.
  Evidence: The parks reservation page includes a "Sports fields available to rent" section and links to `https://register.capturepoint.com/reg/pubcal.cfm?a=2218&f=`.
- Observation: The current Discover rentals tab is driven by BracketIQ-owned organizations, fields, and rental slots, then renders organization cards instead of rental cards.
  Evidence: `src/app/discover/page.tsx` calls `organizationService.listOrganizationsWithFields()`, derives `RentalListing` rows from `organization.fields[].rentalSlots[]`, groups by organization, and renders `OrganizationCard`.
- Observation: The current browser location service can geocode addresses, but scraper processing needs a server-side resolver.
  Evidence: `src/lib/locationService.ts` reads `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and its Places methods require `window`, while scraper runs execute in server code.
- Observation: `Events.eventType` already supports `AFFILIATE`, but `Events.hostId` is currently required.
  Evidence: `prisma/schema.prisma` has `AFFILIATE` in `EventsEventTypeEnum`, while `model Events` defines `hostId String`.
- Observation: DigitalOcean App Platform scheduled jobs can run a command in the app environment on a cron expression, so the scraper does not need a public endpoint for automation.
  Evidence: The scheduled runner is exposed as `npm run affiliate:scrape:due`, which can run inside the same deployed app environment that already has the database, ScrapingDog, and email environment variables.

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

- Decision: Model affiliate rentals around facilities and resources, not one flat card per scraped row.
  Rationale: BracketIQ already separates `Facilities` from `Fields`; a facility is the location users compare on rental discover, while resources are the rentable courts, fields, rooms, or surfaces at that location. When several scraped rows are at the same address or venue, they should appear as one facility rental card with multiple resources, not as duplicate location cards.
  Date/Author: 2026-06-26 / Codex

- Decision: Add server-side geocoding/place resolution for affiliate import processing.
  Rationale: Imported events and rentals need coordinates for distance filtering and map display. The existing client-side location service cannot run inside scraper jobs and uses a public key, so imports need a server-only resolver that can geocode an address or search a venue name/address combination and persist confidence/warnings.
  Date/Author: 2026-06-26 / Codex

- Decision: Public rental discover should merge BracketIQ-owned rental cards and affiliate rental cards into one card feed.
  Rationale: Users should not need to know whether a rental is internally bookable or affiliate link-out before comparison. Cards should share name, facility, resource count/type, city/address, sport/resource tags, price text, status text, and distance. The CTA differs: internal rentals go to BracketIQ rental selection/checkout, affiliate rentals open the official booking URL.
  Date/Author: 2026-06-26 / Codex

- Decision: Published affiliate events should be real `Events` rows, not `AffiliateListings` rows.
  Rationale: Affiliate events need to participate in the normal event lifecycle, admin event state controls, Discover filtering, public event detail pages, tags, divisions, and organization association. Keeping the public event as a separate listing table forces duplicate event-shaped logic and makes status management inconsistent.
  Date/Author: 2026-06-26 / Codex

- Decision: Each scraped website needs a manually created private organization before its first scraper is used.
  Rationale: Affiliate events should not be assigned to a BracketIQ user host. A private organization gives every source a durable owner/attribution record, website link, and grouping surface while keeping the event host null. This setup is intentionally manual for each new website so the source can be reviewed before import.
  Date/Author: 2026-06-26 / Codex

- Decision: Affiliate status should be an external-registration/source axis, not a mutually exclusive event behavior type.
  Rationale: `WEEKLY_EVENT` already drives special weekly behavior, and affiliate events can also be weekly. Adding variants such as `AFFILIATE_WEEKLY_EVENT` would multiply event-type combinations and make filters harder to reason about. The preferred model is: `eventType` describes behavior (`EVENT`, `WEEKLY_EVENT`, `LEAGUE`, `TOURNAMENT`), while `affiliateUrl`, `sourceType`, and source organization metadata describe whether the action leaves BracketIQ. Existing `AFFILIATE` rows should be treated as a transition state until affiliate creation/import paths can write the underlying behavior type.
  Date/Author: 2026-06-26 / Codex

- Decision: Use evergreen program events as the standard fallback for stale, vague, or non-date-specific source pages.
  Rationale: Some organization sites, such as Troutdale Indoor Sports, describe stable leagues, friendly games, tournaments, and rental processes but do not publish discrete current registration cards with parseable future start dates. Others leave old events on the page, mix outdated rows with active programs, or describe an event category poorly enough that importing it as a dated event would be misleading. For those sources, admins should not invent dates or fallback to scrape time. Instead, the mapping can emit manually approved summary candidates with `dateDisplayMode = NO_FIXED_DATE` or `ONGOING`, a clear `dateDisplayText` such as "No fixed start date" or "Call for availability", the official action URL, and a numeric `Events.price` plus `priceText` whenever the official site specifies a price. Public Discover includes these program listings by default, labels them as programs, and hides them when the user applies an explicit date range.
  Steps: First inspect the official page with ScrapingDog and, when useful, a rendered browser screenshot. If repeated cards include official action URLs plus future start dates or date ranges, build a normal selector mapping. If the page only describes ongoing programs, seasons, friendly games, rentals, tournaments, or categories without reliable current dated rows, or if the page contains stale/old event rows that cannot be separated safely from active opportunities, create a manual-summary mapping and record why the site was classified as evergreen. Preserve official prices by setting both `priceText` and numeric `Events.price` from the source when a price is specified. If neither pattern is trustworthy, leave the source in research or blocked status instead of creating misleading listings.
  Date/Author: 2026-06-30 / Codex

- Decision: Run automated affiliate scraping through a scheduled job that refreshes candidates but never publishes them.
  Rationale: Scraping is useful for keeping the admin review queue current, but source content can still be stale, closed, or parsed incorrectly. The scheduled job should call the same scraper used by the admin "Scrape" button, isolate failures per source, and send Samuel a summary email with items needing approval. Publishing remains a manual admin action.
  Date/Author: 2026-07-04 / Codex

- Decision: Store scrape cadence per source as minutes, with an explicit enable flag.
  Rationale: Different sources change at different rates. High-change open-play/signup pages should run daily, active seasonal program pages should run weekly, and evergreen/static rental or summary sources should run monthly. A boolean enable flag keeps newly added sources manual until their mapping and compliance review are complete.
  Date/Author: 2026-07-04 / Codex

## Outcomes & Retrospective

Initial planning is complete. The remaining implementation should start with the data model and public UI semantics before any scraper calls are wired, because publishing scraped listings needs a durable way to distinguish BracketIQ-owned registration from affiliate link-out listings.

The first implementation slice is partially complete. The database now has durable records for sources, mappings, runs, and candidates. Published event candidates create or update real `Events` rows, team candidates create or update canonical teams, and rental candidates create or update affiliate facilities. The temporary `AffiliateListings` table has been removed. The server has a ScrapingDog client and generic HTML mapping extractor. Admin-only routes and an admin dashboard tab can run saved mappings, review discoveries, and publish candidates.

The Portland Metro Softball Association / TeamSideline experiment was removed from the active implementation path after product direction changed. The next retained proof point should use City of Gresham, Troutdale Indoor Sports, or The Courts at Clear Creek.

The City of Gresham Sports Field Rentals source is saved locally with source key `city-gresham-sports-field-rentals` and active mapping `4a4dcd31-fee3-4c95-8da6-00bc8f0ced6d`. Scrape run `88ea0de0-84f4-4244-896e-f69a35e15ebb` succeeded and persisted 12 discovered rental candidates. The mapping uses `#sportsfield h3 + table li` for repeated rental items, stores each park page as `sourceUrl`, and uses a generic `valueMap` to convert retained park names into facility-specific CommunityPass calendar URLs for `officialActionUrl`. Bella Vista Park and Butler Creek Park are excluded until a matching public CommunityPass facility ID is confirmed. This proves the retained non-TeamSideline mapping path, but publishing and public affiliate listing rendering still need to be verified end to end.

The Troutdale Indoor Sports Rentals source is saved locally with source key `troutdale-indoor-sports-rentals` and active mapping `d89ba5c6-5002-47e2-87d7-6d24be74e027`. Scrape run `2b822c13-39e7-4c6b-89a8-faefbb82f843` succeeded and persisted 2 discovered rental candidates: Soccer Field and Basketball Court. The mapping uses JavaScript rendering on `https://nattyhatty.com/114/bookings`, extracts `.res_p_main .res_p_wrap` resource cards, and sends the public CTA back to the Natty Hatty booking calendar. Manual inspection also found Natty Hatty's public `facility_booking_registrations` JSON endpoints, which can return date-specific booking events; importing individual open-court or open-field time slots should be a future JSON/API extractor instead of overloading the current HTML-only mapping extractor.

The Troutdale Indoor Sports event/program source should now be consolidated into one evergreen manual-summary mapping instead of three separate page-level mappings. The official pages describe stable leagues and call-for-availability friendly games but do not expose clean repeated current session rows with parseable future starts. The consolidated source should emit approved program candidates for adult soccer leagues, youth soccer league, men's basketball league, indoor soccer friendly matches, and any official booking-calendar link-out we choose to represent as a program. These candidates use `dateDisplayMode = NO_FIXED_DATE` or `ONGOING` so public cards show "Program" and a clear availability label rather than a fake event date.

The affiliate event publishing model has been corrected enough for the first pass. Event candidates create or update real `Events` rows with a behavioral `eventType`, `hostId = null`, `organizationId` set to the source organization, source metadata fields, and `affiliateUrl` set to the official action URL. Existing `eventType = AFFILIATE` rows are treated as legacy transition data. The local Troutdale private source organization is `affiliate_org_troutdale_indoor_sports`. Rerunning the three Troutdale event sources created `Adult Soccer Leagues` and `Youth Soccer League` as `UNPUBLISHED` affiliate events and `Men's Basketball League` as a `PUBLISHED` affiliate event because that candidate had already been published before the model change. Troutdale's official site renders its green name mark as text rather than a standalone image asset, so the local org logo uses a captured transparent upscale saved as file `a48dc83e-94f2-4290-b9a0-d1d47afc8a31`.

Affiliate event imports no longer fall back to the current date. Scraped event candidates are only persisted when the source provides a parseable `startsAt` value in the future. Missing, invalid, or past starts are skipped during scrape runs, and publishing an existing event candidate without a valid future start now fails instead of creating a misleading event row.

## Context and Orientation

The admin dashboard lives in `src/app/admin/AdminDashboardClient.tsx`. It currently has tabs for events, organizations, teams, verification, fields, users, chats, and moderation. The server page at `src/app/admin/page.tsx` gates the dashboard to Razumly admins by reading the session token and redirecting non-admin users.

Admin APIs live under `src/app/api/admin`. Existing routes such as `src/app/api/admin/events/route.ts` call `requireRazumlyAdmin` from `src/server/razumlyAdmin.ts`, query Prisma, and return JSON payloads for the dashboard.

The main event table is `Events` in `prisma/schema.prisma`. Public organization event pages use `src/app/o/[slug]/events/[eventId]/page.tsx` and `src/app/o/[slug]/events/[eventId]/EventRegistrationClient.tsx`, which render `EventDetailSheet` from `src/app/discover/components/EventDetailSheet.tsx`. `EventDetailSheet` currently owns internal registration, team registration, waitlist, payment, signing, refund, and weekly-session behavior.

Rental checkout is currently internal to BracketIQ. The Prisma models `RentalBookings` and `RentalBookingItems` record BracketIQ-owned bookings, payment state, booking items, and field locks. Affiliate rental listings should not create these records until BracketIQ actually owns the booking flow. For the first affiliate import version, rentals should be published as link-out listing records or event-like discoverable records with a rental listing type.

In this plan, a "source" is a website or organization page configured for scraping. A source must be linked to a private BracketIQ organization before first use. A "mapping" is JSON stored in the database that tells the generic parser how to find repeated event or rental items and how to extract fields from each item. A "scrape run" is one admin-triggered attempt to fetch and parse a source using its active mapping. A "candidate" is one discovered event or rental returned by a scrape run. A "published affiliate event" is a real `Events` row created after an admin approves an event candidate. A "published affiliate rental" is the public rental/facility/resource representation created after an admin approves a rental candidate. A "custom extractor" is optional TypeScript code used only when a source cannot be represented by a mapping.

## Plan of Work

First correct the durable data model. Keep source, mapping, scrape-run, and discovered-candidate tables for import history. Remove the event-facing dependency on `AffiliateListings`: publishing an event candidate must create or update a real `Events` row with `affiliateUrl` set to the official action URL, `organizationId` set to the private source organization, and no host user. `eventType` should describe the event behavior, not the affiliate source; a weekly affiliate listing should use `eventType = WEEKLY_EVENT` with `affiliateUrl` set. Because `Events.hostId` is currently required, add a migration to allow hostless affiliate events or otherwise split host ownership from source organization ownership. Rental publishing should not be forced into `Events`; model it through the chosen facility/resource rental representation.

Each affiliate source must be associated with a private organization before scraping. The manual setup task for a new website is: create the private organization with host/owner user `samuel.r@razumly.com`, set the organization name and website/source URL, add a concise organization description based on the official site, set the organization logo when a usable website logo can be found, mark or treat it as not publicly listed unless intentionally exposed, and link the affiliate source row to that organization. The scrape button should refuse to publish event candidates for a source that is missing this organization association. Scraper-owned source organizations should not be assigned to whichever admin happens to create them; `samuel.r@razumly.com` is the stable internal owner for these private source orgs.

Logo and visual identity capture is part of first-time source setup. For each new website, inspect the rendered page and page metadata for a usable source logo, including header images, Open Graph or Twitter images, favicon/icon assets, and public brand assets linked from the site. Prefer a clean official logo image. If the site does not expose a standalone logo, capture a screenshot crop of the rendered site name/header or another recognizable source mark. Upscale or clean the image when possible, store it through the normal `File` model, and assign it to the private source organization. This logo is the fallback for affiliate events whose source does not provide event-specific images.

At minimum, persisted import candidate data needs source identity, source URL, official action URL, listing kind (`EVENT` or `RENTAL`), title, organizer, sport, format, city, venue, address, date range, day/time text, skill level, age group, gender or division, team versus individual availability, price text, registration or booking status, registration deadline, source last-checked timestamp, source payload, admin review status, and the published target id such as `publishedEventId` for event candidates. For scheduled event candidates, a parseable future `startsAt` from the source is required; do not fall back to the scrape date or current date. For approved evergreen program candidates, set `dateDisplayMode` to `NO_FIXED_DATE` or `ONGOING`, set `dateDisplayText` to the public availability label, leave `startsAt` null on the candidate, and store a numeric `Events.price` when the official source specifies a price. The official action URL is copied to `Events.affiliateUrl` for published affiliate events.

Each source also needs one active mapping. The mapping stores the list URL, whether JavaScript rendering is required, the repeated item selector, field selectors, field extraction modes, required-field flags, transforms, detail-page follow rules when needed, and dedupe strategy. Mappings are created manually after Codex runs ScrapingDog against the source and inspects the returned HTML or JSON. The application only needs to use saved mappings; it does not need a UI for building mappings.

Next update public UI semantics. Any published affiliate event or rental must visibly identify the source and must not show BracketIQ-only join, payment, waitlist, refund, or booking controls. The public action should use text such as "Register on official site" for events and "Book on official site" for rentals. Links should open the official URL and include standard outbound-link attributes. Existing BracketIQ-owned events and rentals must keep their current join and booking behavior. If an imported event has no event-specific image, store `Events.imageId` as `null` and let public surfaces fall back to the source organization logo; if the source organization also has no logo, use the existing generated fallback image.

Then add admin APIs. Add endpoints under `src/app/api/admin/affiliate-sources` for listing and manually creating/updating scrape sources, `src/app/api/admin/affiliate-sources/[id]/scrape` for running a scrape, `src/app/api/admin/affiliate-discoveries` for listing candidates, `src/app/api/admin/affiliate-discoveries/[id]` for full candidate detail, and `src/app/api/admin/affiliate-discoveries/[id]/publish` for publishing. Every route must call `requireRazumlyAdmin`. Publishing an event candidate should create or update an `Events` row; publishing should fail with a clear admin-facing error when the source does not have a private organization association.

Add scheduled scraping after the manual scrape flow is working. `AffiliateScrapeSources` stores `autoScrapeEnabled` and `scrapeIntervalMinutes`. The command `npm run affiliate:scrape:due` loads enabled active sources with an active mapping, checks their latest scrape run start time against the interval, acquires a Postgres advisory lock so two scheduled jobs cannot run together, and calls `runAffiliateSourceScrape` for each due source. The job continues after individual source failures, records those failures in its email summary, and sends one email to `samuel.r@razumly.com` or `AFFILIATE_SCRAPE_SUMMARY_EMAIL_TO` if that environment variable is set. The DigitalOcean App Platform scheduled job should run this command daily; source intervals decide which rows are actually scraped.

Then add the admin UI. Add an `affiliateImports` tab to `AdminDashboardClient`. The first version should show configured sources, status, last run time, last candidate count, and a "Scrape" button. After a run returns, show discovered candidates in a table or dense card list with title, kind, source, date/range, city, venue, sport, price/status, confidence, duplicate status, and actions to view detail or publish. Candidate detail should show the normalized fields, source URL, official action URL, raw extracted snippets, and warnings.

Then add the scraping layer. Create a server-only adapter for ScrapingDog that accepts a URL and source options and returns fetched content plus metadata. Keep the API key in a non-public environment variable such as `SCRAPINGDOG_API_KEY`; never use `NEXT_PUBLIC_`. Add a generic mapping extractor that reads a source's active mapping, uses `jsdom` or JSON traversal to find repeated items, applies field mappings, validates required fields, normalizes prices, dates, sports, cities, URLs, and dedupe keys, then returns candidates and warnings.

Add rental-location normalization before public rendering. When a candidate has an address, resolve it server-side through a geocoding/place adapter and store the formatted address, coordinates, place id if available, and confidence/warning metadata. When a candidate lacks a full address but has a venue or facility name, combine the venue name with city/state/source context and attempt a place search. Do not silently invent coordinates; if resolution is ambiguous, keep the candidate reviewable with warnings and no distance ranking.

Add facility/resource grouping for affiliate rentals. A facility should represent one physical location, preferably keyed by source id plus place id, or by normalized address when no place id exists. Resources should represent the rentable surfaces at that facility. For Gresham, each park is a facility; if a source later exposes "Field 1", "Field 2", or court names at the same park address, those become resources under the same facility. For venues such as The Courts at Clear Creek, the building is one facility and basketball, volleyball, badminton, or court numbers become resources.

Update rental discover to read a unified rental card feed. The feed should include BracketIQ-owned rentals derived from organizations/facilities/fields/rental slots and affiliate rentals derived from published affiliate listings. BracketIQ-owned cards keep internal reservation behavior. Affiliate cards show source attribution and use an external CTA such as "Book on official site". Distance filtering should use facility coordinates when present; affiliate cards without coordinates can still show for text search but should not pass a strict near-me distance filter.

Implement the first source as a vertical slice. Start with one of the approved non-TeamSideline sources, currently City of Gresham, Troutdale Indoor Sports, or The Courts at Clear Creek. Before the first scrape, manually create the private organization for that website with host/owner user `samuel.r@razumly.com`, capture and assign its logo or fallback visual identity, and link the affiliate source to it. Codex should manually run ScrapingDog for that source, read the returned output, identify the repeated item selector and field selectors, insert or update the mapping row in the database, then prove the full flow: source row exists with organization association, admin clicks "Scrape", candidates persist, admin opens candidate details, admin publishes, a real affiliate event appears in `Events` when the candidate is an event, and the public CTA opens the official source URL.

After the first source works, add more mappings one by one. Each new source should update `docs/admin-affiliate-scrape-sources.md` with implementation status, active mapping version, known limitations, and validation notes. Add a custom TypeScript extractor only when a source cannot be handled by mapping JSON.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

1. Inspect the current discovery and public event query paths:

       rg -n "discover|EventDetailSheet|public event|events.findMany|RentalBookings|RentalBookingItems" src prisma -S

   Confirm whether affiliate events can reuse `Events` immediately or whether a separate public listing query is cleaner.

2. Add Prisma schema changes and a migration. The migration should be additive and should not alter existing event registration behavior. Include indexes for source id, active mapping, listing kind, publication status, source URL, official action URL, scrape run id, dedupe key, source organization id, and published target id. Ensure affiliate event rows can be hostless while normal BracketIQ-owned event creation still requires a host through API validation.

3. Regenerate Prisma client if this repo requires it:

       npx prisma generate

4. Add server-side types and helpers for normalized candidates and mapping definitions. Keep these in `src/server` or `src/lib` depending on existing server-only import patterns. Do not import ScrapingDog code into client components.

5. Add tests for forbidden non-admin access, source listing, source missing organization validation, scrape-run creation with a mocked adapter, mapping extraction from a saved fixture, candidate listing, candidate detail, event-candidate publish creating an `Events` row with a behavioral event type plus `affiliateUrl`, duplicate protection, and publish idempotence.

6. Update public UI tests so an affiliate listing renders an outbound CTA and does not render internal join/booking controls.

7. Add the admin tab and UI tests for scrape, candidate list, detail view, publish action, loading states, and error states.

8. Run validation after every meaningful slice:

       npm test -- --runInBand <focused test file>
       npx tsc --noEmit

9. Configure scheduled scraping cadence for local or live rows after the scheduling migration is applied:

       npm run affiliate:scrape:schedules

   Preview which sources are due without scraping or emailing:

       npm run affiliate:scrape:due:dry-run

   Run the same command DigitalOcean should execute:

       npm run affiliate:scrape:due

10. Before committing implementation work, run:

       git diff --check

## Validation and Acceptance

The data model slice is accepted when migrations apply locally, Prisma types compile, and tests prove that an affiliate source can have an active mapping and a required private organization association. Event candidate publishing must create a real `Events` row with a behavioral event type, `affiliateUrl` set, `organizationId` set, `hostId` null, and no internal registration, payment, or rental booking records.

The public UI slice is accepted when a fixture affiliate event shows a source attribution and a primary outbound CTA, and the same component still shows the normal BracketIQ registration controls for a normal event.

The admin UI slice is accepted when a Razumly admin can open `/admin`, switch to "Affiliate imports", see configured sources, trigger a mocked scrape, view discovered candidates, open candidate detail, and publish one candidate. A non-admin request to every new `/api/admin/affiliate-*` route must receive 403 or the existing admin-denied response.

The first real scraper slice is accepted when Codex has manually inspected the selected P0 source's ScrapingDog output, manually created and linked the private source organization, saved a working mapping to the database, and the local admin flow returns at least one candidate using that mapping. An event candidate can be published into `Events`, and the public listing CTA opens the source's official registration or booking URL.

Do not run scraper requests in tests against live third-party sites. Use recorded fixtures or mocked adapter responses for automated tests.

## Idempotence and Recovery

Scrape runs must be safe to repeat. A repeated scrape of the same source URL with the same active mapping should update or supersede candidates by dedupe key instead of creating unbounded duplicates. Publishing the same event candidate twice should return the existing published event or a clear "already published" response. If a future scrape rediscovers a previously published event, it should update the candidate and optionally refresh safe event fields without overwriting admin-managed state unexpectedly.

If a scraper fails, persist the scrape run with failure status, error message, started time, and finished time. Do not delete prior successful candidates. If ScrapingDog is unavailable or the API key is missing, the admin UI should show a clear source-level error and leave existing published listings unchanged.

Scheduled scrape failures should be isolated to the source that failed. The scheduled job should continue to the next due source, include the failure in the summary email, and exit successfully unless the whole job cannot start or the database is unavailable. This keeps one broken website from blocking the rest of the approval queue.

If a published affiliate event or rental is later found to be wrong or stale, admins need a way to unpublish it without deleting the scrape history. For affiliate events, this should update the real `Events.state` rather than deleting the event or the candidate. Add unpublish/archive behavior before allowing broad source coverage.

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

Revision note: Troutdale Indoor Sports Rentals added as the second retained source. The generic rendered HTML mapping covers stable rental resources; individual Natty Hatty booking slots should be handled by a future JSON/API extractor.

Revision note: Troutdale Indoor Sports event pages added as page-level affiliate program mappings for adult soccer, youth soccer, and men's basketball leagues. They should not be treated as date-specific event rows until the source exposes current sessions.

Revision note: Added scheduled affiliate scraping. The new job keeps publishing manual by refreshing due candidates only, uses source-level intervals for daily/weekly/monthly cadence, and sends one approval summary email after a scheduled run.
