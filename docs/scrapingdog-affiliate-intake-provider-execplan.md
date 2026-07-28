# Make ScrapingDog the Primary Affiliate Discovery and Intake Provider

This ExecPlan is a living document. It must be maintained under the requirements in `PLANS.md` at the repository root. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be updated whenever work stops or a decision changes.

## Purpose / Big Picture

BracketIQ currently uses Firecrawl to search for possible sports websites and to capture pre-mapping evidence for approved affiliate source intakes. Firecrawl returns Markdown, raw HTML, links, images, branding, screenshots, and mapped URLs in convenient provider responses. The application already uses ScrapingDog for approved source scraping, and the configured ScrapingDog plan can also perform Google searches, fetch static or JavaScript-rendered HTML, and capture screenshots.

After this change, ScrapingDog is the primary provider for both affiliate source discovery and source intake. BracketIQ fetches HTML once, stores that raw HTML as the authoritative evidence for future mappings, and deterministically derives Markdown, links, images, metadata, branding candidates, and same-origin page suggestions in local TypeScript code. Static HTML is attempted first at the lower provider cost. JavaScript rendering is retried only when a measurable content-quality check determines that the static response is an empty or incomplete application shell.

Firecrawl remains available behind an explicit fallback setting during rollout. It is not called silently, and every artifact records which provider actually produced it. No small language model is introduced for HTML-to-Markdown conversion. Language models may later help classify or propose mappings, but they must not invent or become the source of dates, prices, registration state, locations, capacities, divisions, or outbound URLs.

The user-visible admin workflow remains unchanged: an administrator discovers or imports a source, reviews policy, queues an intake, and reviews stored HTML, Markdown, screenshots, links, and logo candidates. A successful ScrapingDog intake creates no event, rental, team, organization, approved source, mapping, or candidate. It only creates immutable intake evidence and, when appropriate, a mapping job.

## Progress

- [x] (2026-07-28) Reviewed `PLANS.md`, the existing Firecrawl discovery and intake clients, the ScrapingDog approved-source client, intake persistence, artifact storage, queue workers, provider fields, and relevant scripts.
- [x] (2026-07-28) Confirmed that `AffiliateSourceIntakeRuns.provider` and artifact provider fields are strings, so mixed provider provenance is already representable.
- [x] (2026-07-28) Chose deterministic local HTML processing instead of an SLM and documented the rollout and fallback boundaries.
- [x] (2026-07-28) Established the focused baseline: 5 suites and 16 tests passed across Firecrawl, ScrapingDog, source discovery, source intake, and artifact persistence.
- [x] (2026-07-28) Added provider-neutral search and capture contracts without changing the approved-source mapping contract.
- [x] (2026-07-28) Added a shared ScrapingDog transport plus Google discovery search, static-first page capture, JavaScript fallback, and screenshot operations.
- [x] (2026-07-28) Added deterministic HTML-to-Markdown, metadata, link, image, branding, and content-quality extraction.
- [x] (2026-07-28) Replaced Firecrawl Map in the intake worker with bounded sitemap and same-origin captured-link discovery.
- [x] (2026-07-28) Wired provider selection, provenance, cost estimates, CLI options, deployment configuration, the new-run database default, and explicit Firecrawl fallback into discovery and intake workers.
- [x] (2026-07-28) Added focused provider, extractor, page-discovery, and worker tests plus a read-only benchmark command.
- [x] (2026-07-28) Validated a bounded local ScrapingDog Google discovery request and read-only intake benchmark without creating candidates, organizations, mappings, or approved records.
- [x] (2026-07-28) Benchmarked five stored intake URLs, corrected real-world content-root and unsafe-Markdown issues, and reran the same five URLs successfully.
- [x] (2026-07-28) Ran one approved stored intake through the actual worker with ScrapingDog, verified persisted provider artifacts and classification, and corrected noisy global-sitemap page discovery using source-location context.
- [ ] After explicit production approval, switch the live discovery and intake provider settings, monitor the rollout, and retain Firecrawl as a manual fallback for the initial observation period.

## Surprises & Discoveries

- Observation: Firecrawl is coupled into both source discovery and source intake through one `AffiliateFirecrawlClient` interface.
  Evidence: `src/server/affiliateImports/sourceDiscovery.ts` calls `searchSources`, while `src/server/affiliateImports/sourceIntake.ts` calls `mapSourceUrls` and `scrapeSourcePage`.

- Observation: approved recurring source scrapes already use a separate `ScrapePageClient` implementation backed by ScrapingDog.
  Evidence: `src/server/affiliateImports/scrapingDogClient.ts` implements `ScrapePageClient` from `src/server/affiliateImports/types.ts`.

- Observation: the intake persistence model does not require a new table or provider enum to store ScrapingDog runs.
  Evidence: `AffiliateSourceIntakeRuns.provider` and `AffiliateSourceIntakeArtifacts.provider` are `String` fields in `prisma/schema.prisma`.

- Observation: current intake capture classification depends on provider Markdown and provider link extraction.
  Evidence: `processNextAffiliateSourceIntakeRun` concatenates `capture.normalized.markdown` and `capture.normalized.links` before calling `classifyAffiliateSourceEvidence`.

- Observation: raw HTML is more important than Markdown for this product because source mappings use CSS selectors and repeated listing structures.
  Evidence: the affiliate mapping pipeline in `src/server/affiliateImports/mappingExtractor.ts` parses structured source content; Markdown cannot preserve all DOM relationships needed for selectors.

- Observation: article-oriented readability extraction alone would be unsafe for event and rental catalogs because repeated cards may be treated as boilerplate.
  Evidence: affiliate sources commonly expose many sibling league, event, tryout, or rental cards rather than one article body.

- Observation: Firecrawl currently provides screenshot, branding, and map output in the same scrape workflow, while ScrapingDog exposes screenshots separately and has no equivalent site-map response in the current client.
  Evidence: `firecrawlClient.ts` requests `branding` and a full-page screenshot and separately calls Firecrawl Map; `scrapingDogClient.ts` currently calls only `/scrape`.

- Observation: the existing intake artifact schema and export flow can retain the same artifact-kind names even when map evidence is produced locally.
  Evidence: local discovery now persists `PROVIDER_MAP_REQUEST_JSON`, `PROVIDER_MAP_RESPONSE_JSON`, and `DISCOVERED_URLS` with provider `LOCAL`, preserving historical exporter compatibility.

- Observation: repository tests use minimal `Response` mocks that do not always expose a complete `Headers` implementation.
  Evidence: the shared transport accepts missing header accessors while retaining strict redaction and retry behavior against real responses.

- Observation: adding Turndown did not require another HTML parser because JSDOM safely handled both inert HTML extraction and the bounded sitemap fixtures.
  Evidence: TypeScript, Prisma validation, and the focused extractor/page-discovery test suites pass with `jsdom`, `turndown`, and no new XML dependency.

- Observation: `npm install` reports 51 existing dependency vulnerabilities.
  Evidence: the dependency installation output reported the existing audit count; no automatic dependency upgrades were applied because they are outside this provider migration.

- Observation: a real static ScrapingDog capture of `https://example.com` passed the local quality gate without JavaScript rendering.
  Evidence: `npm run affiliate:intake:benchmark -- --url https://example.com` completed in 283 milliseconds, estimated one credit, and wrote the ignored report under `output/affiliate-provider-benchmark/2026-07-28T18-36-40-446Z`.

- Observation: a real ScrapingDog Google request returned organic results in the expected normalized contract.
  Evidence: the bounded query `Portland Oregon indoor volleyball leagues official` returned three results and estimated five credits; no result was promoted or persisted.

- Observation: `prisma migrate dev` cannot be used safely against the current local database because the repository already contains modified historical migrations and schema drift.
  Evidence: Prisma requested a destructive reset. The reset was declined, and `prisma migrate deploy` applied only `20260728143000_default_affiliate_intake_provider_scrapingdog`; `prisma migrate status` now reports all 164 migrations applied.

- Observation: the local database contains 221 current intake records, but only two have an allowed policy status; 219 remain unreviewed.
  Evidence: direct local Prisma counts returned 219 `UNREVIEWED` and two `ALLOWED` intake rows. The worker correctly refuses to capture unreviewed sources.

- Observation: evaluating HTML quality against the cleaned body while converting only a sparse `main` element can accept a page whose stored Markdown is effectively empty.
  Evidence: the first five-source benchmark accepted the Triangle Flag and Tucson Wildcats pages but produced only 536 and zero Markdown characters respectively. Selecting one shared content root for quality and conversion corrected both outputs.

- Observation: provider HTML can contain `data:` image placeholders and `javascript:` links that should not survive Markdown conversion.
  Evidence: the first benchmark retained one municipal data image and Omaha `javascript:void()` targets. Custom Turndown rules now discard unsafe image and link targets.

- Observation: a global sitemap can be dominated by commerce pages and other regional registrations even when the intake URL identifies one city.
  Evidence: the first GridIron New York worker run discovered 50 mostly Shopify product and unrelated location pages. Bounded candidate collection, noise filtering, relevance ranking, and source-location context now reduce the same stored evidence to six directly captured same-origin links and no unrelated sitemap pages.

## Decision Log

- Decision: do not run an SLM for HTML-to-Markdown conversion.
  Rationale: conversion is deterministic, must be reproducible, and must not invent source facts. An SLM adds memory, latency, model operations, and nondeterministic output without improving the authoritative raw HTML.
  Date/Author: 2026-07-28 / Codex

- Decision: raw HTML is the authoritative intake artifact; locally generated Markdown is a review and classification aid.
  Rationale: future source mappings need the actual DOM structure, while Markdown is useful for humans and text classification.
  Date/Author: 2026-07-28 / Codex

- Decision: ScrapingDog becomes primary for both Google-based source discovery and page capture.
  Rationale: one paid provider can cover the two billed network operations, while local code replaces Firecrawl transformations.
  Date/Author: 2026-07-28 / Codex

- Decision: use static-first capture and retry with JavaScript rendering only when a deterministic quality gate fails.
  Rationale: ScrapingDog static fetches cost fewer credits, while many municipal, club, and league pages do not require browser rendering.
  Date/Author: 2026-07-28 / Codex

- Decision: preserve Firecrawl as an explicit fallback during rollout instead of removing its package immediately.
  Rationale: Firecrawl still covers difficult maps, browser-rendered edge cases, and provider outages. Retaining it reduces migration risk and gives the benchmark a stable comparison.
  Date/Author: 2026-07-28 / Codex

- Decision: fallback must be configured and recorded, never silent.
  Rationale: silent fallback hides cost and quality problems. The requested provider belongs on the run, and the actual provider belongs on every artifact and in the run summary.
  Date/Author: 2026-07-28 / Codex

- Decision: replace Firecrawl Map with bounded local discovery from `robots.txt` sitemap declarations, `/sitemap.xml`, sitemap indexes, and links from the captured page.
  Rationale: intake needs useful same-origin page suggestions, not an unrestricted crawl. A bounded local process is auditable and avoids an additional provider feature.
  Date/Author: 2026-07-28 / Codex

- Decision: use JSDOM plus Turndown and custom rules, not Readability as the default extraction path.
  Rationale: JSDOM already exists in the repository, and custom cleaning can retain repeated cards and lists. Turndown provides deterministic HTML-to-Markdown conversion with rules for tables, links, images, and line breaks.
  Date/Author: 2026-07-28 / Codex

- Decision: keep existing intake artifact kinds and APIs compatible.
  Rationale: admin review, export scripts, retained historical Firecrawl evidence, and mapping jobs already understand these artifact kinds. Provider-neutral behavior can be represented through artifact provider metadata without rewriting historical rows.
  Date/Author: 2026-07-28 / Codex

- Decision: default new discovery and intake work to ScrapingDog immediately, while honoring the provider recorded on already-queued runs.
  Rationale: the user explicitly requested implementation against the active paid ScrapingDog plan. Preserving the queued provider prevents a deployment from silently changing historical Firecrawl work.
  Date/Author: 2026-07-28 / Codex

- Decision: change only the database default for future intake runs.
  Rationale: existing `FIRECRAWL` run rows are evidence and must not be rewritten. The migration alters the column default to `SCRAPINGDOG` without updating data.
  Date/Author: 2026-07-28 / Codex

- Decision: default intake screenshots to the first selected page.
  Rationale: ScrapingDog screenshots are separate billed operations. One screenshot normally provides enough visual mapping context while raw HTML, Markdown, links, metadata, and branding evidence are still retained for every captured page. Administrators can explicitly select `all` for difficult sources.
  Date/Author: 2026-07-28 / Codex

- Decision: use an explicit fallback for rejected final capture quality as well as provider errors.
  Rationale: a provider can return HTTP 200 with an unusable application shell. When Firecrawl fallback is explicitly enabled, the quality evidence should trigger it and the warning must explain why; without explicit fallback, the rejected ScrapingDog evidence remains visible for review.
  Date/Author: 2026-07-28 / Codex

- Decision: quality scoring and Markdown derivation must use the same selected content root.
  Rationale: accepting a full body while converting a sparse `main` creates misleading success records and unusable artifacts. A sufficiently complete `main` remains preferred; otherwise both operations fall back to the cleaned body.
  Date/Author: 2026-07-28 / Codex

- Decision: page discovery must filter known site noise before ranking and must require location context for sitemap pages when the source path contains a distinctive location token.
  Rationale: captured source-page links are useful supporting evidence, but global product catalogs and registrations for other cities should not become pages for a city-specific intake.
  Date/Author: 2026-07-28 / Codex

## Outcomes & Retrospective

The provider-neutral implementation is wired through the discovery and intake workers. New work defaults to ScrapingDog, raw HTML is authoritative, local derived artifacts retain the existing exporter/admin contract, and Firecrawl remains available only through an explicit provider or fallback setting. The bounded worker path records requested and actual providers, render mode, quality evidence, elapsed time, and estimated credits.

Validation passes for the provider transport, provider factory, Google result normalization, static/dynamic capture, screenshots, deterministic HTML artifacts, bounded local page discovery, existing Firecrawl compatibility, approved-source ScrapingDog compatibility, explicit fallback behavior, and the intake/discovery orchestration boundaries. The final affiliate-import run passed 46 suites and 211 tests; `npx tsc --noEmit`, focused ESLint, Prisma schema validation, local migration status, and `git diff --check` also passed.

A real bounded ScrapingDog Google request and a five-source benchmark over current stored intake URLs succeeded. The current-intake benchmark used five static captures per pass; all five passed without JavaScript rendering after the extractor fixes. One approved GridIron New York intake then completed through the actual local worker with provider `SCRAPINGDOG`, a static capture, one screenshot, expected immutable artifacts, source classification, and no provider warnings or failures. This validation did not create an organization, mapping, candidate, event, rental, or team, and it made no live database changes.

The local default migration is applied. The worker correctly leaves the 219 unreviewed intake records untouched until their policy status is reviewed. The noisy child-page rows created by the first verification run were removed after the corrected discovery logic was replayed against its stored artifacts. A representative multi-site comparison against Firecrawl and an explicitly approved production rollout are still required before recommending removal of Firecrawl.

## Context and Orientation

The repository root is `/Users/elesesy/StudioProjects/mvp-site`.

Affiliate source discovery searches the web for potential organizers, clubs, events, and rentals. Its campaign and processing logic is in `src/server/affiliateImports/sourceDiscovery.ts`. Search queries are generated and evaluated by `src/server/affiliateImports/sourceDiscoveryRules.ts`. Discovery results can be promoted into source intakes after duplicate and policy checks.

Affiliate source intake is the pre-mapping evidence pipeline in `src/server/affiliateImports/sourceIntake.ts`. An intake groups related pages for one website or organization. An intake run checks `robots.txt`, captures selected pages, stores immutable artifacts, suggests related pages, classifies the source, and queues a mapping job. Intake must remain separate from approved source scraping and candidate publishing.

`src/server/affiliateImports/firecrawlClient.ts` currently defines `AffiliateFirecrawlClient`, which combines three responsibilities: web search, site mapping, and page capture. `src/server/affiliateImports/sourceDiscovery.ts` uses its search method. `src/server/affiliateImports/sourceIntake.ts` uses its map and scrape methods.

`src/server/affiliateImports/scrapingDogClient.ts` is the existing ScrapingDog adapter used by approved source scrapes. It calls `https://api.scrapingdog.com/scrape`, supports optional JavaScript rendering and wait time, and returns the fetched body through the stable `ScrapePageClient` contract. That contract must remain compatible because source-specific scrapers already depend on it.

`src/server/affiliateImports/sourceIntakeArtifacts.ts` stores artifact metadata in Postgres and artifact bytes through the configured storage provider. Important existing kinds are `PAGE_HTML`, `PAGE_MARKDOWN`, `PAGE_LINKS`, `PAGE_IMAGES`, `PAGE_BRANDING`, `PAGE_SCREENSHOT`, `LOGO_CANDIDATE`, provider request/response JSON, and `DISCOVERED_URLS`.

The term “provider request artifact” means a redacted JSON description of the operation sent to an external service. It must never contain `SCRAPINGDOG_API_KEY` or `FIRECRAWL_API_KEY`. The term “provider response artifact” means serializable response metadata. ScrapingDog page HTML is stored once as `PAGE_HTML`; its response artifact stores status, safe response headers, byte counts, hashes, render mode, timing, and warnings rather than duplicating the HTML body.

The term “static-first” means the worker first sends `dynamic=false` to ScrapingDog. If the returned HTML has insufficient meaningful text, links, content nodes, or known application-root content, the worker retries once with `dynamic=true` and a bounded wait. It does not use premium residential proxies in this plan.

The term “quality gate” means deterministic measurements over the captured HTML. The quality result contains a score, reasons, meaningful text length, same-origin link count, visible element count, and application-shell signals. It must be stored in run summary metadata so the static-to-dynamic decision can be audited.

## Plan of Work

### Milestone 1: Introduce provider-neutral contracts and a shared ScrapingDog transport

Create `src/server/affiliateImports/affiliateProviderContracts.ts`. Move stable search and capture result shapes out of the Firecrawl-named interface without changing the data needed by discovery or intake.

Define `AffiliateSourceSearchClient` with a `provider` property and `searchSources` method. Define `AffiliateSourceCaptureClient` with a `provider` property, `captureSourcePage`, and `captureScreenshot` methods. A page capture returns raw HTML and safe provider metadata. It does not return locally derived Markdown or branding; those are produced by a separate deterministic artifact extractor in Milestone 2.

Use these required shapes:

    export type AffiliateProviderName = 'SCRAPINGDOG' | 'FIRECRAWL';

    export type AffiliateSourceSearchResult = {
      provider: AffiliateProviderName;
      request: Record<string, unknown>;
      response: Record<string, unknown>;
      rows: Array<{
        url: string;
        title: string | null;
        description: string | null;
        category: string | null;
      }>;
      providerJobId: string | null;
      estimatedCredits: number;
    };

    export type AffiliateSourcePageCapture = {
      provider: AffiliateProviderName;
      request: Record<string, unknown>;
      response: Record<string, unknown>;
      requestedUrl: string;
      finalUrl: string;
      providerStatusCode: number;
      targetStatusCode: number | null;
      rawHtml: string;
      renderMode: 'STATIC' | 'JAVASCRIPT';
      elapsedMs: number;
      estimatedCredits: number;
      warnings: string[];
    };

    export interface AffiliateSourceSearchClient {
      readonly provider: AffiliateProviderName;
      searchSources(query: string, options?: AffiliateSourceSearchOptions): Promise<AffiliateSourceSearchResult>;
    }

    export interface AffiliateSourceCaptureClient {
      readonly provider: AffiliateProviderName;
      captureSourcePage(url: string): Promise<AffiliateSourcePageCapture>;
      captureScreenshot(url: string): Promise<AffiliateSourceScreenshot>;
    }

Refactor `src/server/affiliateImports/firecrawlClient.ts` so its existing class implements these provider-neutral contracts. Keep compatibility exports temporarily if tests or callers still import `AffiliateFirecrawlClient`. Firecrawl capture adapts provider Markdown and branding only for fallback evidence; the primary intake path must always run local derivation from raw HTML so provider changes do not change mapping evidence semantics.

Create `src/server/affiliateImports/scrapingDogTransport.ts`. This low-level server-only module owns the API key, endpoint construction, timeout, redacted request metadata, safe response metadata, and bounded retry behavior for `/scrape`, `/google`, and `/screenshot`. It must never expose or persist the full provider URL containing `api_key`.

Refactor `src/server/affiliateImports/scrapingDogClient.ts` to use the shared transport while preserving the current `ScrapePageClient.fetchPage` signature and behavior. Existing source-specific scraper tests must continue to pass unchanged.

Create `src/server/affiliateImports/scrapingDogAffiliateClient.ts`. Its search method calls `https://api.scrapingdog.com/google` with standard search, United States country, English language, campaign location, requested result count, and page zero. Normalize only `organic_results`: `link` becomes URL, `title` remains title, and `snippet` becomes description. Store a redacted request object and a bounded serializable response object.

Its page capture first calls `https://api.scrapingdog.com/scrape` with `formats=html` and `dynamic=false`. After Milestone 2 provides the quality gate, retry once with `dynamic=true` only when that gate rejects the static response. JavaScript wait is bounded by `SCRAPINGDOG_DYNAMIC_WAIT_MS`, defaults to 2,500 milliseconds, and cannot exceed the provider-supported 35,000 milliseconds.

Its screenshot method calls `https://api.scrapingdog.com/screenshot` with a full-page PNG, quality 80, and `wait_until=networkidle`. Return binary bytes and response metadata directly; do not issue a second public download request for screenshot bytes.

The transport retries one 429 or provider 5xx response with bounded exponential delay and honors a numeric `Retry-After` header when present. It must not retry 400, 401, 403, or target-policy failures. A 202 response that does not include usable capture content is recorded as a retryable provider failure rather than treated as successful HTML.

Add focused tests with mocked fetch responses. Tests prove URL encoding, location mapping, organic result normalization, static and dynamic parameters, screenshot bytes, timeout behavior, retry bounds, and API-key redaction.

### Milestone 2: Derive Markdown and review artifacts locally

Add direct dependencies `turndown` and `@types/turndown`. Continue using the repository’s existing `jsdom` dependency. Do not load external resources or execute scripts in JSDOM.

Create `src/server/affiliateImports/affiliateHtmlArtifacts.ts`. It accepts raw HTML plus the requested URL and returns:

    export type AffiliateHtmlArtifacts = {
      markdown: string;
      textContent: string;
      links: string[];
      images: string[];
      branding: {
        logo: string | null;
        favicon: string | null;
        ogImage: string | null;
        candidates: Array<{ url: string; reason: string }>;
        metadata: Record<string, unknown>;
      };
      metadata: Record<string, unknown>;
      inferredCanonicalUrl: string | null;
      quality: AffiliateHtmlQuality;
    };

Parse the raw document once for metadata, links, images, JSON-LD organization logos, favicon links, Apple touch icons, OpenGraph images, Twitter images, canonical URL, title, description, locale, and application-root signals. Resolve relative URLs against the requested URL. Reject `data:`, `javascript:`, private-network, and malformed URLs from stored link and branding arrays.

Create a cloned content document for Markdown. Remove scripts, styles, templates, `noscript`, embedded application state, navigation, obvious cookie banners, modal overlays, social-share controls, and duplicate hidden elements. Prefer `main` or `[role=main]` when present, but fall back to the body. Do not run Readability as the default and do not remove repeated sibling sections, lists, tables, cards, or headings solely because they repeat.

Configure Turndown with deterministic rules that retain headings, paragraphs, lists, links, useful image alt text, tables, definition-like label/value rows, line breaks, and preformatted text. Drop empty links and tracking pixels. Normalize whitespace without joining labels that were on separate visible lines. Add a version string such as `affiliate-html-artifacts-v1` to derived artifact metadata so future converter changes are auditable.

Implement `evaluateAffiliateHtmlQuality`. The static capture is accepted when it has a useful document title or heading, a bounded minimum amount of meaningful visible text, useful content nodes, and no strong empty-shell signal. Empty `body`, loading-only messages, script-heavy roots with almost no visible text, and known empty app containers fail. A valid short page such as a facility contact or registration page must not fail only because it is short; useful links, headings, metadata, and structured data contribute to quality.

The quality gate returns reasons rather than one Boolean. `ScrapingDogAffiliateClient.captureSourcePage` uses those reasons to decide whether to retry dynamically, and the intake run summary stores both static and final quality measurements.

Move provider-specific logo handling out of `sourceIntake.ts`. `candidateLogoUrls` must consume the provider-neutral branding result. Preserve the five-candidate cap and safe downloader. Candidate reasons should identify the actual DOM evidence, such as `JSON-LD Organization.logo`, `link rel=icon`, `meta property=og:image`, or `image class contains logo`, rather than saying Firecrawl.

Add tests with fixtures representing a static municipal listing, repeated event cards, a JavaScript shell, JSON-LD organization branding, relative links, malformed URLs, a table, and cookie/navigation noise. Snapshot only stable Markdown excerpts; use explicit assertions for critical dates, prices, links, repeated cards, and logo candidates.

### Milestone 3: Add bounded local site discovery

Create `src/server/affiliateImports/sourcePageDiscovery.ts`. This replaces the intake dependency on Firecrawl Map.

For the first selected intake page, combine these sources in order:

1. Sitemap URLs declared in the already retrieved `robots.txt`.
2. The origin’s `/sitemap.xml` when no declared sitemap was found.
3. Child sitemap documents from a sitemap index.
4. Same-origin links extracted from the captured HTML.

All direct sitemap fetches use `fetchBoundedPublicResource` and the existing public-URL safety checks. Follow no more than five sitemap documents, accept no more than 5 MB per document, store no more than 50 unique page suggestions, and remain on the original origin. Do not crawl discovered pages during the same run. Preserve existing canonicalization, tracking-parameter removal, role inference, and page upsert behavior.

Use JSDOM in XML mode or add `fast-xml-parser` as a direct dependency if fixture tests demonstrate that JSDOM cannot safely parse the required sitemap forms. Do not rely on a transitive package without declaring it in `package.json`.

Return a request manifest and response manifest so the existing `PROVIDER_MAP_REQUEST_JSON`, `PROVIDER_MAP_RESPONSE_JSON`, and `DISCOVERED_URLS` artifact kinds remain populated. Set their provider to `LOCAL` and record discovery method counts in metadata. The names are retained for historical export compatibility even though the new map operation is local.

Add tests for a simple sitemap, sitemap index, duplicate URLs, tracking parameters, off-origin URLs, malformed XML, oversized responses, sitemap loops, and HTML-only discovery.

### Milestone 4: Wire ScrapingDog through discovery and intake

Create `src/server/affiliateImports/affiliateProviderFactory.ts`. It reads:

    AFFILIATE_DISCOVERY_PROVIDER=scrapingdog|firecrawl
    AFFILIATE_INTAKE_PROVIDER=scrapingdog|firecrawl
    AFFILIATE_PROVIDER_FALLBACK=none|firecrawl
    AFFILIATE_INTAKE_SCREENSHOT_MODE=first|all|none
    SCRAPINGDOG_TIMEOUT_MS=<milliseconds>
    SCRAPINGDOG_DYNAMIC_WAIT_MS=<milliseconds>

Provider parsing is case-insensitive and rejects unsupported values at startup. New application and deployment work defaults to ScrapingDog because the paid account is active and the user requested the provider switch during implementation. Existing queued rows continue using their recorded provider. `AFFILIATE_PROVIDER_FALLBACK` defaults to `none`; production can explicitly set it to `firecrawl` during the observation period.

Refactor `src/server/affiliateImports/sourceDiscovery.ts` to depend on `AffiliateSourceSearchClient`, not `AffiliateFirecrawlClient`. Rename dependency injection fields from `firecrawlClient` to `searchClient` while temporarily accepting the old test alias if needed. Record `SCRAPINGDOG_GOOGLE_SEARCH` as the discovery source for new pages produced by ScrapingDog. Do not rewrite historical `FIRECRAWL_SEARCH` rows.

Refactor `src/server/affiliateImports/sourceIntake.ts` to depend on `AffiliateSourceCaptureClient` and the local page-discovery service. Queue runs with the selected provider name rather than hard-coded `FIRECRAWL`. For each page:

- Check and persist `robots.txt` before any provider call.
- Capture raw HTML through the selected provider.
- Run local artifact derivation.
- Store redacted provider request and response JSON.
- Store raw HTML, locally generated Markdown, links, images, and branding.
- Capture the screenshot according to the configured screenshot mode.
- Download safe logo candidates.
- Record render mode, quality reasons, elapsed time, estimated provider credits, extractor version, screenshot use, and fallback use in the run summary.

Classification must use locally generated Markdown and links regardless of provider. A provider fallback may occur only after the configured primary provider fails both its allowed static and dynamic attempts. If fallback succeeds, the run remains attributable to its requested primary provider, each fallback artifact says `FIRECRAWL`, and the summary contains the failed primary attempt and fallback reason.

Keep `AffiliateSourceIntakeRuns.provider` as a string. Add a small Prisma migration changing its default from `FIRECRAWL` to `SCRAPINGDOG` only after the benchmark gate passes. Historical rows remain unchanged. Application code still sets the provider explicitly when queueing, so rollback does not depend on the database default.

Update `scripts/process-affiliate-source-intakes.ts` with `--provider`, `--fallback-provider`, `--scrapingdog-timeout`, `--dynamic-wait`, and `--screenshot-mode`. Keep existing Firecrawl and robots timeout options during rollout.

Update `scripts/run-affiliate-source-discovery.ts` and `scripts/run-affiliate-intake-automation.ts` with the provider option. CLI options set environment values before importing server modules. Summary output includes provider, static requests, dynamic retries, screenshots, fallback pages, and estimated credits.

Update `deploy/vm/app.env.example` and `deploy/vm/README.md`. State that `SCRAPINGDOG_API_KEY` is required for primary discovery and intake, while `FIRECRAWL_API_KEY` is optional unless fallback is enabled. Document estimated ScrapingDog costs used by summaries: one credit for a standard static scrape, five for JavaScript rendering, five for standard Google Search, and five for a screenshot. These are estimates for operational reporting, not billing authority.

Do not change the admin API URLs or review component contract. Existing queued rows continue using the provider recorded on the row. New runs use the current provider factory. If the admin UI displays provider labels, make them data-driven rather than Firecrawl-specific.

Update `docs/affiliate-source-intake-execplan.md` with an outcomes/revision note pointing to this provider migration, and update `docs/affiliate-source-discovery-automation-execplan.md` where it states that Firecrawl is required.

### Milestone 5: Benchmark quality and cost before switching defaults

Create `scripts/benchmark-affiliate-intake-providers.ts` and package command `affiliate:intake:benchmark`. The benchmark is read-only: it does not create or modify database rows, storage objects, intakes, mappings, candidates, organizations, or sources. It writes a timestamped JSON and Markdown report beneath ignored `output/affiliate-provider-benchmark/`.

The command accepts `--url` repeatedly, `--urls-file`, or a bounded list of existing intake page URLs. It runs ScrapingDog capture and local derivation. When `FIRECRAWL_API_KEY` is available and `--compare-firecrawl` is supplied, it also captures the same page with Firecrawl for comparison.

Use a representative corpus of at least 30 pages covering municipal sites, SportsEngine, LeagueApps, TeamSideline or similar schedule platforms where policy allows, Wix, Squarespace, static club sites, JavaScript applications, registration pages, repeated event catalogs, rental pages, directory pages, and pages with transparent or relative logo assets.

For each page, report:

- Provider success and elapsed time.
- Static acceptance or dynamic retry.
- Raw HTML byte count.
- Meaningful text and Markdown character counts.
- Same-origin and outbound link counts.
- Known critical URL retention.
- Image and logo-candidate counts.
- Screenshot success.
- Local discovered URL count.
- Estimated credits.
- Warnings and fallback behavior.

The ScrapingDog rollout gate passes when at least 95 percent of policy-allowed benchmark pages yield usable raw HTML, at least 90 percent preserve known critical registration or detail URLs, repeated listing fixtures retain every expected card, logo-candidate recall is at least 90 percent of reviewed official logos, and no API key appears in output or artifacts. Every failure must be listed by URL and reason; averages alone are insufficient.

After the benchmark passes, run one bounded local campaign search and one explicit local intake using ScrapingDog. Review the stored artifacts in the admin panel and export them with the existing intake exporter. Verify directly in the local database that the run created zero `AffiliateImportCandidates` and no approved or published records.

### Milestone 6: Controlled production rollout

Do not perform this milestone without explicit approval to update production configuration and process live queues.

Before rollout, deploy any Prisma default migration, set both primary provider variables to `scrapingdog`, set fallback to `firecrawl` for an initial seven-day observation period, and retain both API keys. Start with one discovery campaign and no more than five intake runs.

Review daily automation summaries for provider failures, dynamic retry rates, screenshot failures, estimated credits, missing logo candidates, and Firecrawl fallback use. Any domain that requires fallback must be recorded with the exact reason and a reproducible intake run ID.

After seven stable days, choose one of three outcomes and record it in this plan:

- Keep Firecrawl fallback because specific supported source classes still require it.
- Disable automatic fallback but retain the package for manual recovery.
- Remove Firecrawl only after no supported workflow depends on its search, map, scrape, PDF, or browser-interaction behavior.

Rollback requires changing provider environment variables back to Firecrawl and restarting the worker. Historical ScrapingDog artifacts remain valid and must not be deleted or rewritten.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`. Preserve unrelated local changes and stage only files belonging to this ExecPlan.

1. Establish and record the focused baseline:

       npx jest --runInBand \
         src/server/affiliateImports/__tests__/firecrawlClient.test.ts \
         src/server/affiliateImports/__tests__/scrapingDogClient.test.ts \
         src/server/affiliateImports/__tests__/sourceDiscovery.test.ts \
         src/server/affiliateImports/__tests__/sourceIntake.test.ts \
         src/server/affiliateImports/__tests__/sourceIntakeArtifacts.test.ts

   Expect all existing tests to pass before implementation. Record exact counts in `Progress`.

2. Install deterministic conversion dependencies:

       npm install turndown
       npm install --save-dev @types/turndown

3. Implement provider contracts, shared transport, ScrapingDog discovery/capture, and local artifact derivation. Run the new tests after every file-level change:

       npx jest --runInBand \
         src/server/affiliateImports/__tests__/scrapingDogTransport.test.ts \
         src/server/affiliateImports/__tests__/scrapingDogAffiliateClient.test.ts \
         src/server/affiliateImports/__tests__/affiliateHtmlArtifacts.test.ts

4. Implement local sitemap and link discovery:

       npx jest --runInBand \
         src/server/affiliateImports/__tests__/sourcePageDiscovery.test.ts

5. Wire the providers into intake, discovery, workers, and configuration:

       npx jest --runInBand \
         src/server/affiliateImports/__tests__/sourceDiscovery.test.ts \
         src/server/affiliateImports/__tests__/sourceIntake.test.ts \
         src/server/affiliateImports/__tests__/sourceIntakeArtifacts.test.ts \
         src/server/affiliateImports/__tests__/automationBaseline.test.ts \
         src/app/api/admin/affiliate-intakes/__tests__/route.test.ts

6. Run the no-write benchmark:

       npm run affiliate:intake:benchmark -- \
         --urls-file scripts/fixtures/affiliate-provider-benchmark-urls.txt \
         --compare-firecrawl

   Expect a report under `output/affiliate-provider-benchmark/` with page-level pass/fail evidence and estimated credits. The command must print that no database or storage writes were made.

7. Queue and process one explicitly selected local intake after its policy is already allowed:

       npm run affiliate:intakes:process -- \
         --once \
         --run-id <local-run-id> \
         --provider scrapingdog \
         --fallback-provider none \
         --screenshot-mode all \
         --summary

   Expected summary fields include `provider: "SCRAPINGDOG"`, captured page count, static and dynamic request counts, screenshot count, fallback count zero, classification, and estimated credits.

8. Export and inspect the stored local run:

       npm run affiliate:intake:export -- --source-key <source-key> --run-id <local-run-id>

   The exported directory must contain `PAGE_HTML`, locally generated `PAGE_MARKDOWN`, links, images, branding, screenshot, logo candidates where present, and redacted provider metadata.

9. Run broad validation:

       npx prisma validate
       npx tsc --noEmit
       npx jest --runInBand src/server/affiliateImports/__tests__
       git diff --check

10. Start the local site and verify the existing admin flow:

       npm run dev:plain

    Open the Affiliate Imports admin page. Confirm that ScrapingDog runs and artifacts are labeled correctly, stored Markdown can be read, screenshots render, logo candidates render, and historical Firecrawl runs remain readable.

## Validation and Acceptance

The implementation is accepted locally when all of the following behavior is observable.

A source-discovery campaign can call ScrapingDog Google Search and persist normalized organic results using the existing duplicate, scoring, policy, and promotion rules. A mocked or real search response never stores the API key. Discovery run summaries identify ScrapingDog and include estimated credits.

An allowed source intake first checks `robots.txt`. A disallowed page produces no ScrapingDog or Firecrawl page request. An allowed static page produces raw HTML and all locally derived review artifacts. A static application shell produces one bounded JavaScript retry. A good static page never pays for a dynamic retry.

Repeated event, league, tryout, and rental cards remain present in generated Markdown and raw HTML. Important official outbound URLs remain in `PAGE_LINKS`. Logo candidates are derived from official page evidence and downloaded through the existing safe resource path.

Local sitemap discovery produces at most 50 safe same-origin suggestions and never recursively captures them in the current run. Malformed, off-origin, unsafe, duplicate, and tracking-only URLs are rejected or normalized with explicit warnings.

Every provider request artifact is redacted. Every stored artifact identifies the provider that produced it. A run using Firecrawl fallback shows the primary ScrapingDog failure, fallback reason, fallback provider artifacts, and estimated provider usage.

The existing admin intake APIs and export script continue to work. Historical Firecrawl artifacts remain readable. Existing approved source scrapers using `ScrapePageClient` continue to pass tests.

No discovery or intake operation creates an event, rental, team, organization, approved affiliate source, mapping, or affiliate candidate. The benchmark performs no database or storage writes.

The rollout is not accepted merely because TypeScript compiles. It requires the representative benchmark thresholds, one reviewed local ScrapingDog intake, exported evidence, focused tests, full affiliate-import tests, `npx tsc --noEmit`, Prisma validation, and `git diff --check`.

## Idempotence and Recovery

Provider configuration is reversible. Existing queued intake rows use their recorded provider. New rows use the configured provider. Re-running the same intake creates a new immutable run while existing content hashes permit file reuse through `sourceIntakeArtifacts.ts`.

Static and dynamic requests are separate audited attempts. A static response is not overwritten when dynamic rendering is attempted; attempt metadata remains in the run summary even though only the selected final HTML becomes `PAGE_HTML`.

If local Markdown derivation fails after raw HTML capture, store raw HTML and provider metadata, mark the page partial, and retain the error. Do not discard the authoritative HTML or silently substitute model-generated text. The run can be retried after fixing the deterministic converter.

If screenshot capture fails, keep text artifacts and mark the run partial with a screenshot warning. If sitemap discovery fails, keep the selected-page capture and classify the run as partial rather than failed.

If ScrapingDog fails and fallback is disabled, record the failure and stop for that page. If fallback is enabled, use Firecrawl once and record it. Never loop between providers.

Production rollback changes `AFFILIATE_DISCOVERY_PROVIDER` and `AFFILIATE_INTAKE_PROVIDER` to `firecrawl`, restarts the worker, and leaves all ScrapingDog evidence intact. Do not revert migrations by deleting historical provider rows.

## Artifacts and Notes

The expected provider sequence for a static page is:

    robots.txt direct fetch
    ScrapingDog /scrape dynamic=false
    local HTML quality accepted
    local Markdown/links/images/branding derivation
    local sitemap/link discovery
    ScrapingDog /screenshot according to screenshot mode

The expected provider sequence for a JavaScript shell is:

    robots.txt direct fetch
    ScrapingDog /scrape dynamic=false
    local HTML quality rejected with reasons
    ScrapingDog /scrape dynamic=true&wait=<bounded value>
    local HTML quality accepted
    local artifact derivation and URL discovery
    ScrapingDog screenshot

An example redacted request artifact is:

    {
      "provider": "SCRAPINGDOG",
      "endpoint": "/scrape",
      "targetUrl": "https://example.org/events",
      "options": {
        "dynamic": false,
        "formats": "html"
      }
    }

It must not include the external provider request URL because that URL contains the API key.

## Interfaces and Dependencies

Use the existing `jsdom` dependency for inert DOM parsing. Add `turndown` and `@types/turndown` for deterministic Markdown generation. Do not add an inference runtime, model weights, Ollama, llama.cpp, or a hosted language-model dependency in this plan.

Keep `src/server/affiliateImports/types.ts` and the existing `ScrapePageClient` stable for approved recurring scrapers. New intake and discovery contracts live in `affiliateProviderContracts.ts`.

`sourceIntake.ts` must accept dependencies in this final shape:

    export type AffiliateSourceIntakeProcessingDependencies = {
      captureClient?: AffiliateSourceCaptureClient;
      fallbackCaptureClient?: AffiliateSourceCaptureClient;
      discoverPages?: typeof discoverAffiliateSourcePages;
      fetchResource?: typeof fetchBoundedPublicResource;
      workerId?: string;
      now?: () => Date;
    };

`sourceDiscovery.ts` must accept:

    type DiscoveryDependencies = {
      searchClient?: AffiliateSourceSearchClient;
      captureClient?: AffiliateSourceCaptureClient;
      fallbackCaptureClient?: AffiliateSourceCaptureClient;
      now?: () => Date;
      fetchResource?: typeof fetchBoundedPublicResource;
      workerId?: string;
    };

The provider factory exposes:

    export const resolveAffiliateDiscoveryProvider: () => AffiliateProviderName;
    export const resolveAffiliateIntakeProvider: () => AffiliateProviderName;
    export const createAffiliateSourceSearchClient: (provider?: AffiliateProviderName) => AffiliateSourceSearchClient;
    export const createAffiliateSourceCaptureClient: (provider?: AffiliateProviderName) => AffiliateSourceCaptureClient;
    export const createAffiliateFallbackCaptureClient: () => AffiliateSourceCaptureClient | null;

The local converter exposes:

    export const deriveAffiliateHtmlArtifacts: (
      rawHtml: string,
      requestedUrl: string,
    ) => AffiliateHtmlArtifacts;

    export const evaluateAffiliateHtmlQuality: (
      rawHtml: string,
      requestedUrl: string,
    ) => AffiliateHtmlQuality;

The local page discovery service exposes:

    export const discoverAffiliateSourcePages: (input: {
      sourceUrl: string;
      robotsText: string;
      capturedLinks: string[];
      fetchResource: typeof fetchBoundedPublicResource;
      limit?: number;
    }) => Promise<AffiliateSourcePageDiscoveryResult>;

The ScrapingDog transport is server-only and owns key handling. No React component, API response, artifact, log, benchmark report, or thrown error may contain `SCRAPINGDOG_API_KEY`.

## Plan Revision Note

Created 2026-07-28 after reviewing the implemented Firecrawl intake pipeline and existing ScrapingDog approved-source client. This plan deliberately treats the work as a provider migration rather than a new intake system, keeps raw HTML authoritative, replaces provider Markdown and Map output with deterministic local processing, and retains Firecrawl only as an explicit, auditable fallback until benchmark evidence supports further removal.
