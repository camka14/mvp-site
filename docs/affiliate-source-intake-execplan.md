# Build A Database-Backed Affiliate Source Intake Pipeline

This ExecPlan is a living document. It must be maintained under the requirements in `PLANS.md` at the repository root.

## Purpose / Big Picture

Before this change, affiliate source research starts in Markdown lists, browser sessions, screenshots, and local output files. An approved `AffiliateScrapeSources` row cannot run until a parser mapping already exists, so it is the wrong place to hold pre-mapping research. After this change, the Affiliate imports admin tab can hold a database-backed backlog of sites, group the related pages for each site, record policy review, queue bounded Firecrawl captures, and review the resulting raw evidence and logo candidates without creating candidates or published listings.

The stored snapshot must be reproducible. Raw provider requests and responses, HTML, markdown, links, screenshots, and downloaded logo candidates are stored through the existing `File` and storage-provider abstractions. A read-only export command gives a parsing agent one manifest and a local ignored snapshot directory without making another network request. The agent still creates normal checked-in mappings, tests, and idempotent setup scripts. A person promotes the intake into the existing source workflow only after policy, identity, logo, mapping, and sample output have been reviewed.

The observable first milestone is an administrator importing several related URLs for one organizer, approving or blocking policy review, queueing an inspection, and reopening the same evidence after a page refresh. The inspection creates no `AffiliateImportCandidates`. A local agent can export the successful run by source key and parse the exact stored bytes.

## Progress

- [x] (2026-07-15) Reviewed the existing source, mapping, run, candidate, scheduler, file, and storage-provider code.
- [x] (2026-07-15) Verified the configured Firecrawl account with a bounded San Francisco Rec & Park map and scrape. The landing page returned metadata and branding but not a current inventory.
- [x] (2026-07-15) Revised this plan after review to add source-page grouping, SSRF protection, explicit policy review, queued execution, provider-envelope preservation, logo candidate downloads, bulk import, and agent export.
- [x] (2026-07-15) Added additive Prisma models, generated client code, and applied/recorded the migration against the local `mvp` database only.
- [x] (2026-07-15) Implemented URL safety, policy and robots checks, bounded Firecrawl retrieval, immutable artifact storage, retention, and capture classification.
- [x] (2026-07-15) Implemented ordered queued processing, protected admin APIs, CSV/TSV bulk import, cleanup, and read-only agent export commands.
- [x] (2026-07-15) Added the admin source-intake list, create/import/policy flows, page review, queued inspection, polling, and stored-artifact review UI.
- [x] (2026-07-15) Completed unit, API, component, Firecrawl smoke, export, Prisma, and authenticated desktop/mobile browser validation without live writes or candidate creation.
- [x] (2026-07-19) Made live intake exports the primary evidence handoff for scraper implementation. The exporter now supports live DB/Spaces reads, URL lookup, intake discovery, and portable source-provenance files.

## Surprises & Discoveries

- Observation: `AffiliateScrapeRuns` is post-mapping execution history. `runAffiliateSourceScrape` resolves an active mapping before creating a run and can write candidates.
  Evidence: `src/server/affiliateImports/service.ts` calls `resolveActiveMapping` before creating `AffiliateScrapeRuns`.
- Observation: one organizer commonly has several useful URLs, while a directory URL may lead to many unrelated organizations. A single `listUrl` cannot represent both cases without duplicates.
  Evidence: the San Francisco backlog contains root, sport, tryout, league, registration, rental, and directory pages for the same organizations.
- Observation: `File` plus `getStorageProvider()` already supports local development storage and DigitalOcean Spaces, so large raw captures do not need Postgres byte columns.
  Evidence: `prisma/schema.prisma` defines `File`; `src/lib/storageProvider.ts` exposes put, get, head, and delete operations.
- Observation: the current scheduled affiliate scrape implementation already demonstrates a PostgreSQL advisory lock and a separate runnable script.
  Evidence: `src/server/affiliateImports/scheduledScrapes.ts` and `scripts/run-due-affiliate-scrapes.ts`.
- Observation: Firecrawl branding returns logo and related image URLs, while screenshots are provider-hosted values. Those remote URLs are evidence, not durable BracketIQ assets, and must be downloaded before they expire or change.
  Evidence: the Firecrawl scrape and branding response contract.
- Observation: Node's request lookup hook may request all DNS answers. A pinned DNS lookup must return an array when `options.all` is set or HTTPS fails with `Invalid IP address: undefined`.
  Evidence: the first local capture smoke run failed until `createPinnedAddressLookup` honored both lookup result shapes.
- Observation: Firecrawl v4 validates its integration identifier, and `cli` is the supported value for this server-side workflow.
  Evidence: the second local capture smoke run rejected a custom integration string before the client was corrected.
- Observation: provider branding may contain `data:` image URLs and map results may include noisy query variants. Neither should become a network download or automatic capture.
  Evidence: the successful `example.com` smoke run returned a data URL and 50 query variants; data URLs are now filtered and mapped URLs remain unchecked suggestions.

## Decision Log

- Decision: keep intake separate from `AffiliateScrapeSources`, `AffiliateScrapeRuns`, and `AffiliateImportCandidates`.
  Rationale: intake is untrusted pre-mapping evidence and must never execute mappings or create publishable rows.
  Date/Author: 2026-07-15 / Codex
- Decision: one intake represents one site or organization; child page rows represent its related URLs.
  Rationale: related league, tryout, rental, registration, policy, and logo pages need one identity and one eventual source organization.
  Date/Author: 2026-07-15 / Codex
- Decision: persist artifact metadata in Postgres and artifact bytes through `File` and `getStorageProvider()`.
  Rationale: this makes captures queryable and auditable without bloating Postgres with repeated HTML and images.
  Date/Author: 2026-07-15 / Codex
- Decision: store both the complete provider request/response envelope and useful derived artifacts.
  Rationale: future parsers need exact provider metadata and fields that the first implementation may not understand yet.
  Date/Author: 2026-07-15 / Codex
- Decision: require explicit human policy review before Firecrawl capture and still enforce `robots.txt` per requested page at runtime.
  Rationale: provider success is not permission, and robots alone does not cover terms or visible anti-bot restrictions.
  Date/Author: 2026-07-15 / Codex
- Decision: queue captures and process them outside the initiating admin request.
  Rationale: rendering, screenshots, multiple selected pages, and downloads can outlive an HTTP request. Durable queue state also supports several admin clicks in order.
  Date/Author: 2026-07-15 / Codex
- Decision: parsing agents receive a read-only exported snapshot and cannot promote, publish, or mutate intake records through that interface.
  Rationale: mapping code remains reviewable in Git, while network evidence remains reproducible and centrally stored.
  Date/Author: 2026-07-15 / Codex
- Decision: the database becomes the operational backlog source of truth; Markdown registries become generated reports or import inputs.
  Rationale: maintaining status independently in DB and documents would drift.
  Date/Author: 2026-07-15 / Codex

## Outcomes & Retrospective

The first milestone is implemented. The admin Affiliate imports tab now has a separate database-backed Source Intake section for untrusted pre-mapping research. Intakes can be created or bulk imported, policy-reviewed, grouped into related pages, queued for bounded inspection, and reopened with stored screenshots, Markdown, HTML, links, images, branding, robots evidence, and complete provider request/response artifacts. The worker, cleanup, and read-only export commands use the same persistence and storage abstractions as the application.

A local `example.com` smoke intake completed a real Firecrawl capture and exported 12 stored artifacts plus a manifest. The database check confirmed that it remained unlinked to an organization or approved affiliate source and created zero affiliate candidates. The authenticated admin page rendered the intake and artifacts on desktop and mobile-width viewports. The additive migration was applied only to the local `mvp` database; no live database data or schema was changed.

Focused tests, scoped lint, Prisma validation and migration status, the full TypeScript check, and `git diff --check` pass in the final working tree.

## Context and Orientation

The approved affiliate pipeline lives in `prisma/schema.prisma` and `src/server/affiliateImports/service.ts`. `AffiliateScrapeSources` is an approved configuration, `AffiliateScrapeMappings` is a versioned parser, `AffiliateScrapeRuns` records mapped executions, and `AffiliateImportCandidates` holds normalized reviewable output. The protected route `src/app/api/admin/affiliate-sources/[id]/scrape/route.ts` invokes that pipeline and must not be reused for intake.

An intake is a proposed site or organizer. An intake page is one related public URL and has a role such as `HOME`, `LISTING`, `DETAIL`, `REGISTRATION`, `RENTAL`, `DIRECTORY`, `POLICY`, or `LOGO`. An intake run is a queued bounded capture of selected intake pages. An artifact is one immutable metadata record for stored bytes from a run. Identical bytes may reuse one `File` row across run-specific artifact rows.

Raw artifacts are private operational evidence. Only Razumly-admin routes may stream them. The agent export command runs server-side with the configured database and storage credentials and writes only into ignored `output/affiliate-intakes/...` paths.

## Plan of Work

### Milestone 1: Add source, page, run, and artifact persistence

Add four additive Prisma models in `prisma/schema.prisma`.

`AffiliateSourceIntakes` represents one proposed site or organization. It stores identity and workflow state: ID, timestamps, name, unique source key, region, base URL, status, compliance status, target-kind hints, notes, suggested classification JSON, optional organization/source links, selected logo artifact ID, last run ID, creator, policy reviewer, policy review date, terms URL, and policy notes. Accepted lead statuses are `DRAFT`, `REVIEW_REQUIRED`, `READY`, `BLOCKED`, `APPROVED`, `PROMOTED`, and `FAILED`. Accepted compliance statuses are `UNREVIEWED`, `NEEDS_REVIEW`, `ALLOWED`, and `BLOCKED`.

`AffiliateSourceIntakePages` represents one related URL. It stores intake ID, URL, canonical URL, a globally unique URL key, page role, target-kind hints, status, discovery source, robots result, robots check date/notes, and metadata. Page roles are stored as strings but validated in the server. Canonicalization removes fragments, default ports, and tracking parameters while retaining query parameters that change inventory.

`AffiliateSourceIntakeRuns` represents one queued capture. It stores intake ID, requested page IDs, requester, provider, status, queue/start/finish/claim timestamps, attempt count, worker ID, provider job IDs, discovered URL count, captured page count, error, and summary JSON. Accepted states are `QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, `BLOCKED`, and `FAILED`.

`AffiliateSourceIntakeArtifacts` is run-specific metadata referencing a `File`. It stores intake, page, and run IDs; kind; source/final URL; provider; HTTP status; content hash; deterministic per-run dedupe key; file ID; MIME type; byte size; retention date; pin state; and metadata JSON. Kinds include `ROBOTS`, operation-specific provider map/scrape request and response JSON, `DISCOVERED_URLS`, `PAGE_MARKDOWN`, `PAGE_HTML`, `PAGE_LINKS`, `PAGE_SCREENSHOT`, `PAGE_BRANDING`, `PAGE_IMAGES`, `LOGO_CANDIDATE`, and `POLICY_NOTE`.

Artifact rows are unique by their per-run dedupe key. Before uploading bytes, the service searches prior artifacts for the same intake, kind, content hash, and source URL and reuses that artifact's `File` row. New runs still receive their own artifact rows so their manifests remain complete.

Create a new dated migration and run it only against the local database during this task. Generate the Prisma client after migration.

### Milestone 2: Implement safe bounded capture

Create `src/server/affiliateImports/sourceIntakeUrlSafety.ts`. It validates only `http:` and `https:` URLs, rejects embedded credentials, localhost and local-domain names, private/reserved IP literals, DNS results in unsafe ranges, and unsafe redirect targets. Direct robots retrieval must use bounded timeouts and response sizes and validate every redirect. Tests cover IPv4, IPv6, DNS, redirect, credential, and protocol cases.

Create `src/server/affiliateImports/firecrawlClient.ts`. It reads `FIRECRAWL_API_KEY` only on the server and exposes map and scrape operations. It returns both a stable normalized result and the complete serializable provider response. Capture requests do not authenticate, submit forms, write text, click controls, or execute custom JavaScript. Map requests stay on the target origin, ignore fragments and common tracking query parameters, and return at most 50 URLs. Page scraping requests markdown, raw HTML, links, images, branding, and a screenshot.

Create `src/server/affiliateImports/sourceIntake.ts`. It provides intake/page CRUD, bulk upsert, policy review, queueing, job claiming, processing, artifact reads, and review context. Capture processing requires `complianceStatus = ALLOWED`. It directly retrieves and stores the origin `robots.txt`, evaluates each requested page path, and does not call Firecrawl for disallowed pages. `UNREVIEWED`, `NEEDS_REVIEW`, and `BLOCKED` intakes cannot call Firecrawl.

The discovery pass maps up to 50 URLs and captures the explicitly selected pages, with a maximum of ten pages per run. Newly mapped URLs are stored as page suggestions with `discoverySource = FIRECRAWL_MAP`; they are not automatically captured in the same run unless they were already selected. This creates a deliberate two-step workflow for directories and large sites: discover links, then select useful pages for the next bounded run.

Persist the complete provider request and response JSON before extracting derived artifacts. Download screenshot URLs and branding/image logo candidates immediately through the safe downloader. Logo candidates store source URL, dimensions when available, MIME type, provider field, and a confidence reason. Intake never normalizes or assigns an organization logo; that remains part of the source-builder workflow after human review.

Limits are ten captured pages per run, 50 mapped URLs, 5 MB per text/JSON artifact, 3 MB per image artifact, 20 MB total stored bytes per run, a 30-second provider timeout per page, and two provider requests in flight per worker. Limit violations produce a `PARTIAL` or `FAILED` run with explicit summary warnings.

Classification is a suggestion only: `EVENT_CATALOG`, `RENTAL`, `CLUB`, `DIRECTORY`, `MARKETPLACE`, `AUTH_REQUIRED`, `NO_CURRENT_INVENTORY`, or `UNKNOWN`. Store evidence URLs, reasons, and confidence. It must not change compliance or promote a source.

### Milestone 3: Add queue processing, APIs, bulk intake, and agent export

Add `scripts/process-affiliate-source-intakes.ts` and the package command `npm run affiliate:intakes:process`. It claims queued runs oldest-first, uses an advisory lock or atomic claim update to prevent duplicate processing, supports `--once`, `--limit`, and `--run-id`, and exits non-zero only for worker-level failures. A failed source capture remains recorded without stopping later queued runs.

Add Razumly-admin-only routes under `src/app/api/admin/affiliate-intakes`:

- `GET /api/admin/affiliate-intakes` lists leads with page counts, latest run, and artifact summary.
- `POST /api/admin/affiliate-intakes` creates one intake and initial pages.
- `POST /api/admin/affiliate-intakes/import` bulk-upserts JSON, CSV, TSV, or pasted tab-separated rows and reports created, updated, duplicate, and rejected counts.
- `GET/PATCH /api/admin/affiliate-intakes/[id]` returns review context and updates workflow/policy fields.
- `POST /api/admin/affiliate-intakes/[id]/pages` adds or updates related pages.
- `POST /api/admin/affiliate-intakes/[id]/inspect` validates compliance and selected page IDs, creates a `QUEUED` run, and returns HTTP 202.
- `GET /api/admin/affiliate-intakes/[id]/artifacts/[artifactId]` verifies ownership and streams one artifact to a Razumly admin.

Add `scripts/export-affiliate-source-intake.ts`. The production evidence path is `npm run affiliate:intake:export -- --live --url <public-url>`, with `--source-key <key>` and optional `--run-id <id>` available for exact selection. `--list --search <text>` discovers intake keys without downloading artifacts. The exporter defaults to the latest successful, partial, or blocked run and writes `manifest.json`, `source-evidence.json`, `SOURCE-EVIDENCE.md`, and safely named artifact files beneath `output/affiliate-intakes/<source-key>/<run-id>/`. The manifest includes intake identity, pages, policy state, capture options, provider metadata, artifact hashes, source URLs, and local relative paths. It never writes DB rows, invokes Firecrawl, or includes credentials.

The eventual parsing agent uses that export and the existing affiliate source-builder skill. It creates or updates checked-in parser code, mapping tests, source setup script, package command, and source documentation. The checked-in setup script and source-registry note must cite `source-evidence.json`: intake source key, run ID, capture timestamp, provider, inspected page URLs, and relevant artifact kinds. Store the same compact object in the source row's existing JSON `metadata.sourceEvidence`; this is provenance metadata, not a new schema. Promotion into `AffiliateScrapeSources` remains a human-controlled later action.

### Milestone 4: Add the admin intake experience

Create a dedicated `AdminAffiliateSourceIntakePanel` rendered above approved sources in `AdminAffiliateImportsPanel`.

The list shows name, region, page count, policy state, intake state, suggested type, latest run, and actions. The create modal supports one source plus multiple initial URLs. A bulk import modal accepts pasted TSV/CSV or a file. The policy review modal records terms URL, visible anti-bot notes, decision, reviewer, and review date. Capture is disabled until policy is allowed.

The review modal shows the selected pages, robots results, mapped URL suggestions, capture warnings, markdown preview, raw-artifact download actions, screenshot thumbnails, and logo candidates. Page suggestions can be assigned a role and selected for a later bounded capture. Selecting a logo candidate records only `selectedLogoArtifactId`; it does not update an organization.

Clicking Inspect queues the run and immediately shows queued/loading state. The UI polls while any visible run is queued or running, so several clicked sources remain visibly queued until completed. It does not process jobs in the browser.

### Milestone 5: Retention and backlog ownership

Keep all artifacts from the latest five runs for an intake, all pinned artifacts, and all artifacts referenced by a selected logo or promoted source. Unpinned artifacts from older runs receive a 90-day retention date. Add a dry-run cleanup service and script, but do not schedule or delete live data during this task. File bytes are deleted only when no artifact row references the `File` record.

Add a one-time import path for the current Portland and San Francisco source backlogs. The implementation task validates import locally but does not write the live database. After rollout, DB status is authoritative; documentation may be generated from DB for review and Git history.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` and preserve unrelated local changes.

1. Add the Prisma models and migration, then generate the client.

       npx prisma migrate dev --name add_affiliate_source_intake_pipeline
       npx prisma generate

2. Add the Firecrawl dependency and server services.

       npm install @mendable/firecrawl-js

3. Run focused tests while implementing.

       npx jest --runInBand src/server/affiliateImports/__tests__/sourceIntakeUrlSafety.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/sourceIntake.test.ts
       npx jest --runInBand src/app/api/admin/affiliate-intakes/__tests__
       npx jest --runInBand src/app/admin/__tests__/AdminAffiliateSourceIntakePanel.test.tsx

4. Run one explicit local smoke capture after policy approval, process it with `--once`, export it, and verify that no candidates exist for the intake.

       npm run affiliate:intakes:process -- --once
       npm run affiliate:intake:export -- --live --url https://sfrecpark.org/1186/Adult-Sports-Leagues

5. Run broad validation before handoff.

       npx tsc --noEmit
       git diff --check

6. Start the local site and verify the admin flow in desktop and mobile-sized browser viewports.

       npm run dev

## Validation and Acceptance

Acceptance is complete when an admin can import one site with several related pages, record an allowed policy decision, queue a bounded inspection, and reopen the stored evidence after refresh without another provider call. An explicitly disallowed page produces a blocked page result and zero Firecrawl calls for that page. Unsafe URLs and redirects are rejected before direct network access. Non-admin artifact requests and cross-intake artifact IDs return forbidden or not found.

Several admin clicks must remain queued in order and complete independently. Re-running unchanged pages creates a new run manifest and run-specific artifact rows while reusing identical stored file bytes. The agent export must reproduce the selected stored run without public-site or Firecrawl requests and contain raw provider envelopes, derived page artifacts, screenshot files, downloaded logo candidates, and portable provenance. Reading the live DB and Spaces is allowed because those systems hold the captured evidence. Existing `/api/admin/affiliate-sources/[id]/scrape` behavior and candidate tests must continue to pass.

No intake operation may create an `AffiliateScrapeSources`, `AffiliateScrapeMappings`, `AffiliateScrapeRuns`, `AffiliateImportCandidates`, `Organizations`, `Events`, `Teams`, or `Facilities` row.

## Idempotence and Recovery

Intake creation is idempotent by source key. Page creation is idempotent by canonical URL key and cannot silently move a page between intakes. Bulk import reports conflicts for human resolution. Each inspection creates a new run, and one run cannot be processed twice because claiming is atomic. Within a run, deterministic artifact dedupe keys prevent duplicate rows. Across runs, content hashes permit `File` reuse without erasing run history.

If object upload succeeds but database persistence fails, log the storage key in the failed run summary. The cleanup dry run reports unreferenced intake-prefixed objects and unreferenced `File` rows. Provider errors and size/rate limits retain completed policy and earlier page artifacts and mark the run `PARTIAL` or `FAILED`.

## Artifacts and Notes

The existing SF Rec & Park smoke output is exploratory only and not a production source mapping:

    Source: https://sfrecpark.org/1186/Adult-Sports-Leagues
    Robots result: selected page allowed; current-events and search routes disallowed.
    Firecrawl result: metadata and branding returned; body did not expose a current inventory.
    Expected suggestion: NO_CURRENT_INVENTORY or DIRECTORY pending review.

## Interfaces and Dependencies

`src/server/affiliateImports/firecrawlClient.ts` exposes normalized and raw responses:

    export type FirecrawlCaptureResult = {
      request: Record<string, unknown>;
      response: Record<string, unknown>;
      normalized: {
        finalUrl: string;
        statusCode: number | null;
        markdown: string | null;
        rawHtml: string | null;
        links: unknown;
        images: unknown;
        branding: unknown;
        screenshotUrl: string | null;
        metadata: Record<string, unknown>;
      };
    };

    export interface AffiliateFirecrawlClient {
      mapSourceUrls(url: string, options?: { limit?: number; search?: string }): Promise<{ request: Record<string, unknown>; response: Record<string, unknown>; links: unknown[] }>;
      scrapeSourcePage(url: string): Promise<FirecrawlCaptureResult>;
    }

`src/server/affiliateImports/sourceIntake.ts` exposes:

    export const bulkUpsertAffiliateSourceIntakes: (rows: AffiliateSourceIntakeImportRow[], userId: string) => Promise<AffiliateSourceIntakeImportResult>;
    export const reviewAffiliateSourceIntakePolicy: (id: string, review: AffiliateSourcePolicyReview, userId: string) => Promise<AffiliateSourceIntakeRow>;
    export const queueAffiliateSourceIntakeRun: (id: string, pageIds: string[], userId: string) => Promise<AffiliateSourceIntakeRunRow>;
    export const processNextAffiliateSourceIntakeRun: (options?: { runId?: string; workerId?: string }) => Promise<AffiliateSourceIntakeRunResult | null>;
    export const getAffiliateSourceIntakeContext: (id: string) => Promise<AffiliateSourceIntakeContext>;
    export const readAffiliateSourceIntakeArtifact: (intakeId: string, artifactId: string) => Promise<StorageGetResult>;

All routes call `requireRazumlyAdmin`. Client components never import Firecrawl or storage credentials. The only new provider dependency is `@mendable/firecrawl-js`.

## Plan Revision Note

Created 2026-07-15 and revised the same day after review. The revision changes the unit of ownership from one URL to one site with child pages, adds explicit compliance and network safety, preserves complete provider envelopes and downloaded logo candidates, uses durable queued processing, defines a read-only agent export, and makes the database the operational backlog source of truth.
