# Add a machine-readable BracketIQ navigation and content layer

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept current while the work proceeds. This document follows `PLANS.md` in the repository root.

## Purpose / Big Picture

After this change, an LLM or agent can begin at `https://bracket-iq.com/llms.txt`, learn which BracketIQ URLs are public, construct a shareable Discover URL whose filters survive reload, and request a concise Markdown representation of a public page. The same agent is explicitly told that BracketIQ affiliate destinations and organizer websites must never be shared directly; it must share the first-party BracketIQ event or organization detail URL instead.

The result is observable by starting the site and requesting `/llms.txt`, `/discover.md`, a public event or organization URL with `.md` appended, or a normal public URL with `Accept: text/markdown`. Discover is separately verifiable by selecting filters, reloading the resulting URL, and observing the same active filters.

## Progress

- [x] (2026-07-20 02:17Z) Audited the dirty checkout, public sitemap routes, public event and organization loaders, Discover state, existing URL parsing, affiliate destinations, and current Terms page.
- [x] (2026-07-20 02:17Z) Researched the llms.txt proposal and current Markdown-serving conventions.
- [x] (2026-07-20 02:39Z) Implemented the central manifest plus data-aware and semantic-HTML Markdown renderers.
- [x] (2026-07-20 02:39Z) Added `.md`, `index.html.md`, and `Accept: text/markdown` routing behind a public-path allowlist.
- [x] (2026-07-20 02:39Z) Persisted and restored the active Discover tab's meaningful filter set in the URL.
- [x] (2026-07-20 02:39Z) Added focused regression coverage, passed 38 tests and TypeScript, checked the scoped diff, and directly exercised the route handlers.

## Surprises & Discoveries

- Observation: Discover already persists `q` and repeated `sport` query parameters, but tab, tags, event type, division, date, price, distance, rental-time, and team filters remain component state and disappear on reload.
  Evidence: the URL synchronization effect in `src/app/discover/page.tsx` only writes `q` and `sport`.
- Observation: BracketIQ already has first-party public identities suitable for safe sharing: `/event/{id}`, `/o/{slug}`, and `/o/{slug}/events/{eventId}`.
  Evidence: those routes are built by `src/server/publicSearchPages.ts` and `src/server/publicSearchSeo.ts` and are already emitted in `src/app/sitemap.ts`.
- Observation: some human UI surfaces intentionally open affiliate websites, so blindly converting their HTML could leak a destination the LLM contract forbids sharing.
  Evidence: `src/components/ui/EventCard.tsx` and `src/app/discover/components/eventDetail/EventJoinCard.tsx` use event or organization affiliate destinations.
- Observation: the already-running process on port 3000 could not serve any page because its `.next/dev/required-server-files.json` artifact was missing.
  Evidence: every HTTP smoke request returned 500 and `.next/dev/logs/next-development.log` contained `ENOENT`; direct execution of the new route handlers returned 200 for `/llms.txt`, filtered `/discover` Markdown, and a full guide Markdown response.

## Decision Log

- Decision: Follow the proposed llms.txt document order: one H1, a short blockquote, explanatory prose, then H2 link lists with absolute Markdown URLs.
  Rationale: This is both human-readable and parseable, and it matches the published proposal rather than inventing a BracketIQ-specific format.
  Date/Author: 2026-07-20 / Codex
- Decision: Support both an appended `.md` suffix and `Accept: text/markdown`; also accept `index.html.md` for directory URLs.
  Rationale: The proposal recommends appended Markdown companions, while production examples commonly support both suffix URLs and HTTP content negotiation.
  Date/Author: 2026-07-20 / Codex
- Decision: Generate event and organization Markdown from first-party server data and never serialize `affiliateUrl` or organization `website` fields.
  Rationale: Data-aware rendering is safer than post-processing affiliate anchors out of HTML and makes the Terms restriction enforceable in the served content.
  Date/Author: 2026-07-20 / Codex
- Decision: Treat public organization team, rental, and product pages as Markdown-eligible, while excluding invite, completion, embed, and authenticated transaction surfaces.
  Rationale: These are public browsing/detail pages covered by the request for page companions; the excluded surfaces are private, ephemeral, or purpose-built widgets rather than public reference pages.
  Date/Author: 2026-07-20 / Codex
- Decision: Limit Markdown conversion to a public-path allowlist and return 404 for authenticated, management, billing, admin, and API paths.
  Rationale: “Each page” means each public, shareable site page; mirroring private UI would create a security and privacy risk.
  Date/Author: 2026-07-20 / Codex
- Decision: Store Discover filters as query parameters on `/discover`, using repeatable parameters for multi-value filters.
  Rationale: Query parameters are the stable URL representation for combinatorial search state and preserve the existing public path without an explosion of route segments.
  Date/Author: 2026-07-20 / Codex

## Outcomes & Retrospective

The machine-readable layer is complete. `/llms.txt` is a curated, spec-shaped entry point; every allowlisted public route has a Markdown companion through `.md`, `index.html.md`, or content negotiation; public HTML responses advertise that companion with an alternate `Link` header. Dynamic event, organization, team, rental, product, and public search Markdown is rendered from first-party data, while guide and blog Markdown comes from the source MDX and static public pages use semantic HTML conversion. Affiliate destinations and organization websites are omitted from the sensitive renderers, raw third-party URLs inside descriptive fields are redacted, and first-party detail pages are given as the only shareable URLs.

Discover now restores and serializes query text, tab, sports, tags, event types, division fields, prices, dates, validated location and distance, rental hours, and team division fields as applicable. A tab writes only meaningful fields; Teams deliberately rejects inherited location and distance state.

Verification passed 7 focused Jest suites with 38 tests, `npx tsc --noEmit`, and the scoped `git diff --check`. Direct handler smoke tests returned 200 with the expected content types and no affiliate host. End-to-end curl through the existing port-3000 server remains pending a developer-server restart because that unrelated process is already failing all routes due to a missing `.next` artifact; it was left untouched to preserve the user's running process.

## Context and Orientation

`src/proxy.ts` runs before App Router route matching and is the correct narrow place to rewrite a requested Markdown companion to an internal route. `src/app/llms.txt/route.ts` will serve the central manifest. `src/app/llms/page/route.ts` will serve Markdown for an allowlisted source path. Pure manifest, path, and HTML-to-Markdown helpers will live under `src/lib` so Jest can test them without a database. Data-aware page renderers will live under `src/server` because they use Prisma-backed public loaders.

The Discover UI is a client page in `src/app/discover/page.tsx`. Its reusable URL parser and link builder are in `src/lib/discoverFilters.ts`. Multi-value filters use repeated query parameters, for example `sport=Soccer&sport=Basketball`. Event tags use display names, organization tags use slugs, and division filters use their configured IDs, matching the values already consumed by the current UI and APIs.

The llms.txt proposal is not a robots policy. It is a curated, inference-time index that complements `robots.txt` and `sitemap.xml`. Its useful structural requirements are an H1 site name, an optional blockquote summary, non-heading explanatory text, and H2 sections containing Markdown links with short descriptions. The proposal recommends clean page Markdown at the original URL plus `.md`; it calls out `index.html.md` for a directory URL. Current public implementations also commonly respond to `Accept: text/markdown` and optionally expose `llms-full.txt`. This implementation will add the index and page forms now; a full-site bundle is unnecessary because BracketIQ has dynamic event and organization inventory that would make a monolithic response large and stale.

## Plan of Work

First, add pure helpers that build the manifest, normalize a Markdown companion URL back to its source URL, allow only public routes, and convert semantic page HTML into concise Markdown. The manifest will document public search route patterns, the exact Discover parameters, Markdown retrieval, canonical detail routes, and the affiliate-link restriction. It will link to the Terms, privacy policy, guides, public search directories, and sitemap without including any external affiliate destination.

Second, add App Router handlers and a small proxy rewrite. `.md` and `index.html.md` requests will become an internal `/llms/page?path=...` request. A normal public GET with an `Accept` header containing `text/markdown` will use the same renderer. Public event and organization patterns will use server data renderers that deliberately omit external destinations. Blog and guide pages will use their source MDX. Other allowlisted static public pages will be fetched internally and converted from the semantic `main` or `article` subtree. Direct requests for private paths will return 404.

Third, expand `src/lib/discoverFilters.ts` so it parses and builds every active filter represented by the current Discover UI. Initialize each relevant state value from that parser in `src/app/discover/page.tsx`, then replace the narrow URL synchronization effect with one that serializes the active tab’s filters. The URL will keep the free-text query, tab, sports, tags, event types, division IDs, gender, prices, dates, location and distance, rental hours, or team division IDs as applicable.

Finally, add unit and route tests. Tests will prove document structure, the affiliate instruction, absence of direct affiliate destinations in page Markdown, safe-path rejection, proxy rewrites, and full Discover parse/build round trips. Run only the focused Jest suites serially, then `npx tsc --noEmit`, `git diff --check`, and local HTTP smoke requests.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

The final focused test command was:

    npm test -- --runInBand src/lib/__tests__/llms.test.ts src/lib/__tests__/discoverFilters.test.ts src/proxy.test.ts src/app/llms/__tests__/routes.test.ts src/app/discover/__tests__/page.test.tsx src/app/discover/components/__tests__/EventsTabContent.test.tsx next.config.test.ts

It passed 7 suites and 38 tests. Type checking and the scoped diff check also passed:

    npx tsc --noEmit
    git diff --check -- <the files owned by this plan>

For the runtime proof, start the existing development server and request:

    curl -i http://localhost:3000/llms.txt
    curl -i http://localhost:3000/discover.md
    curl -i -H 'Accept: text/markdown' http://localhost:3000/terms

The already-running developer server is currently missing a required `.next` artifact, so direct route-handler execution was used for the content proof without restarting or killing the user's server. `/llms.txt`, `/discover` Markdown, and a guide Markdown request each returned HTTP 200 with the expected plain-text or Markdown content type. The guide response contained no affiliate host.

## Validation and Acceptance

`/llms.txt` must start with `# BracketIQ`, immediately explain the product in a blockquote, and contain H2 link groups. It must give exact examples for `/find-events`, `/find-clubs`, `/find-facilities`, and `/discover` filters. It must state that sharing an affiliate destination or organizer website is forbidden and instruct the agent to share the BracketIQ detail route.

Appending `.md` to an allowlisted public URL, using `index.html.md`, or sending `Accept: text/markdown` must return equivalent Markdown. Requests for `/admin.md`, `/profile.md`, `/api/...md`, or another private surface must return 404. Event and organization Markdown must not include an affiliate URL or the organization website even if source data contains one.

A Discover URL with event filters must restore those filters after reload. Changing to Organizations, Rentals, or Teams must write that tab and only the filters meaningful to it. Multi-select values must survive URL encoding, repeated keys, and comma-separated legacy inputs. Invalid dates, coordinates, distances, hours, and prices must be ignored rather than applied.

## Idempotence and Recovery

All work is additive or a small change to existing pure URL synchronization and proxy logic. No database mutation or migration is required. Focused files can be reverted independently if a test exposes a regression. The dirty worktree belongs to the user; stage or commit nothing and do not reformat unrelated files.

## Artifacts and Notes

The research baseline used for the implementation is: llms.txt is a proposed inference-time index, not a crawler-enforcement standard; the concise manifest should point to clean Markdown pages; the proposal uses appended `.md` or `index.html.md`; and current public implementations often also honor `Accept: text/markdown`.

## Interfaces and Dependencies

`src/lib/discoverFilters.ts` will export a complete `DiscoverPreset`, `parseDiscoverPreset`, `parseDiscoverSportFilters`, and a `buildDiscoverHref` serializer. Existing `buildDiscoverEventsHref` remains backward compatible.

`src/lib/llms.ts` will export the central manifest builder, Markdown source-path normalization, public-path classification, and HTML-to-Markdown conversion. `src/server/llmsPage.ts` will export a function that accepts a source URL and returns Markdown or `null`. `src/app/llms/page/route.ts` and `src/app/llms.txt/route.ts` will return standards-compliant `Response` objects with explicit content types and caching headers.

Revision note (2026-07-20): Created the initial self-contained plan after repository and standards research so implementation can proceed without relying on prior conversational context.

Revision note (2026-07-20): Recorded the completed implementation, focused verification, direct route smoke results, and the unrelated stale developer-server artifact that prevented end-to-end curl verification.
