# Automate affiliate source discovery, intake capture, and mapping handoff

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. This plan builds on the implemented intake pipeline described by `docs/affiliate-source-intake-execplan.md`, but it repeats the current architecture and all decisions needed to complete this work so a new contributor can execute it without prior context.

## Purpose / Big Picture

BracketIQ currently accepts affiliate source URLs that an administrator enters or bulk imports, captures durable evidence for those URLs, and later turns reviewed evidence into source-specific scrape mappings. After this change, an administrator can define a bounded search campaign such as “soccer, volleyball, and basketball clubs and events in the Portland metro area,” run it immediately or on a schedule, and watch new official sports websites flow into Source Intake without assembling URL lists manually.

Discovery must not be an unrestricted crawler. Each campaign has an explicit region, selected sports, selected opportunity types, query and result limits, and a schedule. The discovery worker uses Firecrawl web search to find leads, stores every accepted, duplicate, and rejected result for audit and cost control, groups related URLs into one site intake, and starts the existing intake capture automatically only when the domain already has a current allowed policy decision. A previously unseen domain stops in policy review before Firecrawl page capture. Once capture succeeds, the intake enters a `READY_FOR_MAPPING` queue that a mapping agent can claim and export read-only. The agent creates code and tests in Git; it cannot publish candidates or mutate the live database.

The existing Affiliate Imports layout remains unchanged at the top level: `Source Intake`, `Sources`, and `Candidates`. Discovery campaigns and search results belong inside the existing `Source Intake` tab because they are untrusted leads, not approved scrape sources. The `Sources` tab remains the home for approved mappings and schedules, and the `Candidates` tab remains the home for first-pass review and exceptional recurring rows.

The implementation is successful when a Portland test campaign discovers a previously unknown official sports site, stores the search provenance, creates one deduplicated intake with appropriate child pages, pauses for policy review, automatically captures the intake after approval, and exposes it to the mapping claim/export command. Re-running the same campaign must not create another intake, another active capture for the same intake, or another approved source. Existing mapped sources must continue to run scheduled scrapes in automatic mode only after their first mapping was validated.

## Progress

- [x] (2026-07-21) Reviewed the implemented intake models, Firecrawl wrapper, queued intake worker, admin Affiliate Imports sub-tabs, mapping validation field, and automatic recurring scrape path.
- [x] (2026-07-21) Recorded the discovery, compliance, intake, mapping handoff, first-pass approval, and recurring automation boundaries in this ExecPlan.
- [x] (2026-07-21) Added additive campaign, run, result, reusable domain-policy, and mapping-claim persistence in migration `20260721120000_add_affiliate_source_discovery_automation`; applied it to the local database.
- [x] (2026-07-21) Extended the Firecrawl wrapper with bounded web-only search, exact provider request/response capture, and the explicit `undici` runtime dependency required by the production provider client.
- [x] (2026-07-21) Implemented deterministic query generation, public-suffix-aware URL normalization, shared-tenant handling, duplicate detection, scoring, source/sport hints, result retention, and directory classification.
- [x] (2026-07-21) Implemented atomic campaign execution, high-confidence intake promotion, reusable policy inheritance and history, allowed-only capture queueing, advisory locking, due-campaign scheduling, retries, and summary email reporting.
- [x] (2026-07-21) Added Razumly-admin APIs and Source Intake controls for campaign creation/editing, run-now/pause, result filtering, bulk promotion/rejection, domain blocking, intake attachment, policy review, and run/result audit context.
- [x] (2026-07-21) Added `affiliate:mapping:claim`, which atomically leases one `READY_FOR_MAPPING` intake and invokes the existing read-only evidence export without allowing publication or operational source mutation.
- [x] (2026-07-21) Added explicit first-pass approval, baseline metrics, validated mapping enforcement, automatic recurring publication, and drift guards that disable automatic scraping and retain exceptional output for review without disabling sources for ordinary transient failures.
- [x] (2026-07-21) Added provider-neutral discovery/intake commands, idempotent paused Portland and San Francisco campaign setup, production Docker runtime inputs, and tracked VM systemd service/timer units. Dry-run and paused-worker smoke tests performed zero provider calls and zero writes.
- [x] (2026-07-21) Completed focused tests, Prisma validation/generation/migration status, TypeScript, route coverage, production build, login-boundary browser smoke, and `git diff --check`. The full repository Jest run still has unrelated failures in existing rental checkout, event date-floor, and weekly billing/refund tests; all 74 tests covering this implementation pass.

## Surprises & Discoveries

- Observation: `@mendable/firecrawl-js` version 4.30.0 is already installed and its `Firecrawl.search(query, options)` API supports web search, result limits, geographic location, included and excluded domains, timeout, and optional result scraping. The local `FirecrawlAffiliateClient` exposes only map and scrape today.
  Evidence: `node_modules/@mendable/firecrawl-js/dist/index.d.ts` defines `SearchRequest` and `SearchData`, while `src/server/affiliateImports/firecrawlClient.ts` defines only `mapSourceUrls` and `scrapeSourcePage`.

- Observation: the intake system already has the correct evidence boundary. It stores complete provider request/response artifacts, HTML, Markdown, links, images, branding, screenshots, and robots results without creating organizations, approved sources, mappings, candidates, events, teams, or facilities.
  Evidence: `AffiliateSourceIntakes`, `AffiliateSourceIntakePages`, `AffiliateSourceIntakeRuns`, and `AffiliateSourceIntakeArtifacts` exist in `prisma/schema.prisma`; `processNextAffiliateSourceIntakeRun` performs queued capture in `src/server/affiliateImports/sourceIntake.ts`.

- Observation: full intake capture currently requires `complianceStatus = ALLOWED`. This is intentional and must not be bypassed by discovery automation.
  Evidence: `queueAffiliateSourceIntakeRun` throws until the policy is reviewed and allowed.

- Observation: recurring approved-source scrapes already call `runAffiliateSourceScrape` with `importMode: 'AUTOMATIC'`, while an admin scrape defaults to `REVIEW`. The remaining lifecycle gap is enforcing that the active mapping was validated by a reviewed first pass before a source can enter automatic scheduling.
  Evidence: `src/server/affiliateImports/scheduledScrapes.ts` passes `importMode: 'AUTOMATIC'`; `AffiliateScrapeMappings.validatedAt` and `AffiliateScrapeSources.autoScrapeEnabled` already exist.

- Observation: the current admin layout already has `Source Intake`, `Sources`, and `Candidates` sub-tabs. Discovery should enhance Source Intake instead of adding or rearranging the top-level tabs.
  Evidence: `src/app/admin/AdminAffiliateImportsPanel.tsx` owns the three sub-tabs and renders `AdminAffiliateSourceIntakePanel` in the first.

- Observation: the production runner previously copied the built Next application but not the TypeScript server modules and scripts required by a standalone `tsx` automation command.
  Evidence: the runner now copies `src`, `scripts`, and `tsconfig.json`; the automation systemd service executes the same package command used locally inside the application container.

- Observation: the default Turbopack production build stopped making progress in this checkout, while the supported Webpack production build completed successfully. The first Webpack attempt also confirmed that sandboxed builds cannot fetch configured Google Fonts without network permission.
  Evidence: `npx next build --webpack` completed all 126 static pages after network access was allowed. Its initial Firecrawl warning was resolved by declaring `undici` directly.

- Observation: authenticated admin browser verification requires a real operator browser session; synthesizing or reading browser session material is outside the verification boundary. Component tests therefore verify the complete Source Intake UI, while the real browser smoke verified the running app's login boundary.
  Evidence: the local server rendered `/login` from an unauthenticated `/admin` navigation; `AdminAffiliateSourceDiscoveryPanel.test.tsx` and `AdminAffiliateSourceIntakePanel.test.tsx` pass under Mantine.

## Decision Log

- Decision: use deterministic search campaigns rather than an autonomous agent to discover URLs.
  Rationale: query generation, result limits, canonicalization, duplicate detection, regional filtering, and retries must be repeatable and cheap. An agent is valuable for source-specific mapping but adds cost and nondeterminism to a task that can be expressed as rules.
  Date/Author: 2026-07-21 / Codex

- Decision: search first without scraping result pages.
  Rationale: URL, title, description, query, and rank are enough to reject obvious duplicates and irrelevant results. Firecrawl page credits should be spent only after a result becomes an intake and passes policy review.
  Date/Author: 2026-07-21 / Codex

- Decision: store discovery campaigns, runs, and results in the database, including rejected and duplicate results.
  Rationale: retained results prevent repeated provider charges, explain why a URL was omitted, and make the database the operational backlog rather than requiring Markdown lists to stay synchronized manually.
  Date/Author: 2026-07-21 / Codex

- Decision: treat one official site or organization as one intake with multiple child pages.
  Rationale: home, events, registration, tryout, rental, policy, and logo pages usually belong to one organization and must be reviewed together. A distinct official domain discovered through a directory becomes its own intake.
  Date/Author: 2026-07-21 / Codex

- Decision: an unknown domain requires one explicit policy decision before full Firecrawl capture; an unexpired allowed domain policy may be reused for later pages and intakes on the same registrable domain.
  Rationale: robots success is not permission and does not cover terms or visible anti-bot restrictions. Requiring the same policy review for every URL on an already reviewed domain would make automation needlessly manual.
  Date/Author: 2026-07-21 / Codex

- Decision: automatically create an intake only for a high-confidence result, but retain medium-confidence results for admin review and low-confidence results as suppressed audit records.
  Rationale: this prevents the intake queue from filling with social profiles, news stories, stale pages, unrelated directories, and sites outside the campaign region while preserving the evidence needed to tune scoring.
  Date/Author: 2026-07-21 / Codex

- Decision: keep discovery controls and results inside the existing Source Intake tab.
  Rationale: the user has already implemented the desired admin tab hierarchy. Discovery results remain untrusted intake inputs and do not belong beside approved Sources or normalized Candidates.
  Date/Author: 2026-07-21 / Codex

- Decision: the mapping agent claims one completed intake atomically and receives only a read-only evidence export.
  Rationale: mapping code, setup scripts, tests, documentation, and normalized logos should be reviewed in Git. The agent must not mutate live operational records, publish candidates, or bypass first-pass approval.
  Date/Author: 2026-07-21 / Codex

- Decision: first-pass approval is mandatory before automatic recurring imports, and structural drift returns a source to review.
  Rationale: a mapping that parsed one page incorrectly should not automatically publish that mistake. Once a representative first pass is approved, ordinary new and updated rows can be automatic while unusual count or field changes remain visible.
  Date/Author: 2026-07-21 / Codex

- Decision: expose one provider-neutral automation command and keep deployment scheduling as a thin adapter.
  Rationale: the same job must run locally, on the current production environment, and on the tracked VM deployment without putting timers inside the Next.js web process.
  Date/Author: 2026-07-21 / Codex

- Decision: structural drift disables `autoScrapeEnabled` until an administrator explicitly approves a new baseline; ordinary request or provider failures leave the prior approval intact.
  Rationale: a source whose output shape changed must not continue publishing on the next timer tick, while transient outages should recover automatically without needless reapproval.
  Date/Author: 2026-07-21 / Codex

## Outcomes & Retrospective

Implementation is complete locally. Migration status reports all 163 migrations applied. The idempotent campaign setup produced exactly two paused campaigns: `Portland Metro Sports Sources` (`455429c2-175d-4519-9166-ef284cd8cf0b`) and `San Francisco Bay Area Sports Sources` (`3ce22fe7-00c4-44bc-b49c-cbb2013c0687`). Running setup twice retained those IDs. The bounded campaign dry run used the documented `--max-queries=2 --max-results=5` overrides, generated two deterministic query plans, and made zero provider requests and zero database writes. Running the combined automation worker while both campaigns were paused acquired its advisory lock and processed zero discovery and intake runs. The local database therefore ended with two campaigns, zero discovery runs, zero discovery results, and zero mapping jobs.

The focused verification set passes 12 suites and 74 tests. Prisma schema/client checks, `prisma migrate status`, `npx tsc --noEmit`, API route coverage across 289 route files, `git diff --check`, and the Webpack production build all pass. The complete repository coverage command reaches unrelated pre-existing failures in organization rental checkout and weekly event billing/refund tests, so it does not reach its chained route-coverage command; running the route-coverage command separately passes. Browser verification reached the expected login boundary without an authenticated operator session, while both new admin panels have passing rendered-component interaction tests.

No paid Firecrawl search was executed because the campaigns default to paused and the operator did not explicitly authorize provider-credit consumption. The implementation is ready for the administrator to inspect the paused campaigns, enable one, and use `Run` for the first bounded live search. That first run remains policy-gated and cannot capture an unknown domain until its policy is reviewed.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-site`. Preserve unrelated local changes and inspect `git status --short --branch` before each milestone. This is a Next.js App Router application using TypeScript, Mantine, Prisma, and PostgreSQL. Server-only affiliate modules live in `src/server/affiliateImports`. Razumly-admin APIs live under `src/app/api/admin`, and the admin UI lives under `src/app/admin`.

There are three distinct data stages. A discovery result is a URL returned by a bounded web search and has not yet been trusted. A source intake is a proposed organization or site whose policy and page evidence are stored for review. An approved scrape source is a configured `AffiliateScrapeSources` row with an active versioned `AffiliateScrapeMappings` parser. Do not collapse these stages.

The implemented intake pipeline begins with `AffiliateSourceIntakes` in `prisma/schema.prisma`. Each intake owns `AffiliateSourceIntakePages`; each queued capture creates an `AffiliateSourceIntakeRuns` row; immutable evidence is indexed by `AffiliateSourceIntakeArtifacts` and stored through the existing `File` and storage-provider abstractions. `src/server/affiliateImports/sourceIntake.ts` owns intake creation, page upsert, policy review, queueing, capture, run claiming, artifact persistence, and review context. `scripts/process-affiliate-source-intakes.ts` processes queued runs. `scripts/export-affiliate-source-intake.ts` creates a read-only evidence snapshot for an agent.

`src/server/affiliateImports/firecrawlClient.ts` wraps Firecrawl with server-only credentials. It currently maps links within a known site and captures known pages. This plan adds web search to that wrapper but does not allow Firecrawl search to scrape every result. Search provider results are untrusted strings and must pass the same canonicalization and URL-safety rules as manually entered intake pages.

`src/app/admin/AdminAffiliateImportsPanel.tsx` renders the three existing sub-tabs. `src/app/admin/AdminAffiliateSourceIntakePanel.tsx` owns the Source Intake experience. Discovery campaign controls and search results should be extracted into a child component such as `src/app/admin/AdminAffiliateSourceDiscoveryPanel.tsx` and rendered above or beside the existing intake list within Source Intake. Do not enlarge `AdminAffiliateImportsPanel.tsx` with campaign implementation details.

Approved source execution is separate. `src/server/affiliateImports/service.ts` runs a mapping and persists normalized candidates and their backing unpublished or published event, team, facility, or organization targets. `src/server/affiliateImports/scheduledScrapes.ts` identifies due sources and runs them with automatic import. This plan must preserve manual review for the initial scrape and use `AffiliateScrapeMappings.validatedAt` plus `AffiliateScrapeSources.autoScrapeEnabled` as the approval boundary.

A registrable domain is the stable organization-level domain after removing ordinary subdomains, such as treating `events.example.org` and `www.example.org` as `example.org`. Use a maintained public-suffix-aware package rather than splitting hostnames on periods. Host-specific platforms whose subdomains represent unrelated customers must retain the customer hostname as the policy key; document those exceptions in metadata and tests.

## Plan of Work

### Milestone 1: Persist discovery campaigns, runs, results, and reusable policy decisions

Add four additive Prisma models to `prisma/schema.prisma` and create one migration named `add_affiliate_source_discovery_automation`. Use strings for workflow status values, consistent with the existing intake models, and validate accepted values in server code.

`AffiliateSourceDiscoveryCampaigns` represents a bounded recurring search definition. It stores `id`, timestamps, `name`, `region`, optional Firecrawl `location`, selected canonical `sportIds`, selected source-type hints, `status`, `autoCreateIntakes`, `searchIntervalMinutes`, `lastRunAt`, `nextRunAt`, `maxQueriesPerRun`, `maxResultsPerQuery`, optional creator ID, and JSON metadata. Accepted statuses are `ACTIVE`, `PAUSED`, and `ARCHIVED`. Default new campaigns to `PAUSED` so saving a campaign does not consume provider credits until an administrator enables or runs it.

`AffiliateSourceDiscoveryRuns` represents one execution. It stores `id`, timestamps, `campaignId`, `status`, queue/start/finish/claim timestamps, attempt count, worker ID, generated query count, returned result count, new result count, duplicate count, rejected count, created intake count, provider job IDs, error text, and bounded JSON containing the exact generated queries, provider request options, and compact provider responses. Accepted statuses are `QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, and `FAILED`.

`AffiliateSourceDiscoveryResults` represents the latest campaign-level view of one canonical search URL. It stores `id`, timestamps, `campaignId`, `latestRunId`, original and canonical URL, globally stable URL key, registrable-domain policy key, title, description, the query and rank that most recently found it, seen count, score, source-type hints, sport hints, status, reason codes, optional matching intake/source/organization IDs, and compact provider metadata. Add a unique constraint on `(campaignId, urlKey)`. Accepted statuses are `NEW`, `INTAKE_CREATED`, `REVIEW_REQUIRED`, `DUPLICATE`, `REJECTED`, and `BLOCKED`. Re-running a campaign updates `lastSeenAt`, increments `seenCount`, and refreshes evidence instead of inserting another result.

`AffiliateSourceDomainPolicies` represents a reusable decision for one registrable domain or documented platform tenant hostname. It stores the policy key, status, reviewed-by user, reviewed date, expiry date, terms URL, robots summary, visible restriction notes, and evidence JSON. Accepted statuses are `NEEDS_REVIEW`, `ALLOWED`, and `BLOCKED`. Default expiry is 180 days for allowed decisions; blocked decisions do not expire automatically. When a policy expires, new intake capture stops until it is reviewed again, but prior artifacts and approved scrape sources remain intact.

Do not add foreign-key cascades that could delete intakes or approved sources when a campaign is removed. Campaign archival is the normal lifecycle action. Add indexes for due active campaigns, queued runs, result status and score, policy status and expiry, and intake/source linkage.

Add repository-level constants and validators in a new `src/server/affiliateImports/sourceDiscoveryTypes.ts`. Tests must prove invalid statuses, empty regions, empty sport/type selection, excessive limits, and intervals below one day are rejected before database writes.

At the end of this milestone, Prisma generation and migration succeed locally, and a seed fixture can create a paused Portland campaign without affecting existing intake or approved-source tables.

### Milestone 2: Add bounded Firecrawl search and deterministic discovery rules

Extend `AffiliateFirecrawlClient` in `src/server/affiliateImports/firecrawlClient.ts` with `searchSources`. The method accepts one query plus `limit`, optional `location`, included domains, and excluded domains. It calls Firecrawl `search` with `sources: ['web']`, no `scrapeOptions`, a bounded timeout, and `integration: 'affiliate-source-discovery'`. Return both the complete serializable request/response envelope and normalized web rows containing URL, title, description, and provider category. Cap the limit at 20 and never enable result-page scraping through this method.

Create `src/server/affiliateImports/sourceDiscoveryRules.ts` for pure, deterministic behavior. It defines query generation, result normalization, scoring, classification hints, and rejection reasons. It must have no Prisma, storage, network, or environment dependencies so Jest can cover it comprehensively.

Generate queries from campaign region, current calendar year, selected canonical sport names, and selected source types. Use a fixed vocabulary with type groups such as club/academy, league/registration, tournament, tryout, camp/clinic, open play/open gym/pickup, and facility/court/field/gym rental. Rotate templates across runs when the full sport-by-type matrix exceeds `maxQueriesPerRun`; persist the cursor in campaign metadata so later runs cover the omitted combinations. Always include at least one broad regional sports directory query per campaign run.

Apply Firecrawl's `location` option when the campaign provides it, but retain the region text in the query because provider location is a ranking hint, not a geographic guarantee. Use the configured canonical sports rows rather than a hard-coded list. Store the exact sport IDs and names used in the run summary for reproducibility.

Normalize each returned URL with `canonicalizeAffiliateIntakeUrl` and pass it through `sourceIntakeUrlSafety`. Reject non-HTTP URLs, embedded credentials, local/private targets, unsupported file types, known social-only domains, app-store links, search result pages, and tracking redirects. Preserve query parameters only when they identify different public inventory; remove ordinary analytics parameters through the existing canonicalizer.

Score normalized results from 0 to 100. Positive signals include an exact region phrase, city/state tokens, a selected sport, organization terms, opportunity terms, a public registration/booking action, the current or next year, and a likely official domain. Negative signals include a different region, old year without a current year, news/article language, social profiles, PDFs with no parent site, generic national content, login-only wording, and unsupported marketplaces. Keep scoring reasons as stable machine-readable codes plus human-readable text.

Start with thresholds of 75 for automatic intake creation and 45 for admin review. Below 45 is rejected. These values are configuration constants, not database columns, until real result audits justify per-campaign thresholds. Never mark policy as allowed based on score.

At the end of this milestone, a pure test fixture for Portland soccer produces bounded queries, prefers an official club and registration page, rejects a Facebook result, identifies a known source as duplicate, and returns the same score and reason codes on repeated execution.

### Milestone 3: Execute campaigns and promote qualified results into Source Intake

Create `src/server/affiliateImports/sourceDiscovery.ts`. It owns campaign CRUD, due-run queueing, atomic run claiming, query execution, result persistence, deduplication against current data, intake promotion, policy application, and summaries. Follow the advisory-lock and oldest-first queue patterns already used by `scheduledScrapes.ts` and `sourceIntake.ts`.

Before creating an intake, compare the canonical URL and registrable domain against `AffiliateSourceIntakePages`, `AffiliateSourceIntakes.baseUrl`, `AffiliateScrapeSources.baseUrl`, `AffiliateScrapeSources.listUrl`, and `Organizations.website`. Exact existing pages are duplicates. A new relevant path on an existing unpromoted intake is added as a child page with `discoverySource = FIRECRAWL_SEARCH` and does not create another intake. A relevant path on an approved source is recorded as a duplicate/source suggestion for admin review; do not silently alter its active mapping. A matching organization website without an intake or source may create one intake linked to that organization only after admin review confirms identity.

For a high-confidence new site, call the existing `createAffiliateSourceIntake` service. Derive a stable source key from the campaign region, normalized site name, and policy key. Add the best result as `HOME` or `LISTING`, and add other high-confidence results from the same policy key as child pages up to the existing 50-page intake limit. Infer `REGISTRATION`, `RENTAL`, `DIRECTORY`, `POLICY`, and `LISTING` roles through the existing page-role rules. Store campaign ID, discovery run ID, search query, rank, score, and reason codes in each page's metadata and set `discoverySource = FIRECRAWL_SEARCH`.

Check `AffiliateSourceDomainPolicies` after intake creation. A current `BLOCKED` decision marks the result and intake blocked and queues no capture. A current `ALLOWED` decision copies its auditable policy reference to the intake, sets the intake compliance state to allowed, and automatically queues one intake run for up to ten highest-confidence active pages. An unknown, expired, or `NEEDS_REVIEW` decision leaves the intake at `REVIEW_REQUIRED` and creates no Firecrawl capture. The admin's existing policy action must upsert the domain policy and then queue the intake automatically when allowed, removing the second manual Inspect click for discovery-created intakes.

Do not infer allowed policy from `robots.txt`. Add a separate bounded preflight that records robots availability and likely terms URLs without requesting Firecrawl page capture, then surfaces that evidence in the policy modal. Robots-disallowed paths become blocked page evidence. Ambiguous terms remain `NEEDS_REVIEW`. A single policy decision applies only to the recorded policy key and cannot be inherited across unrelated tenants on a shared platform.

After a capture run reaches `SUCCEEDED` or useful `PARTIAL`, set the intake status to `READY_FOR_MAPPING` when it contains at least one PAGE_HTML or PAGE_MARKDOWN artifact and no current mapping/source link. A blocked or failed capture remains reviewable and is not queued for mapping. Do this transition inside intake-run completion so it survives browser closure and process restarts.

Add `scripts/run-affiliate-source-discovery.ts` and package command `affiliate:discovery:run`. It supports `--dry-run`, `--once`, `--limit`, `--campaign=<id>`, `--summary`, and `--live`. Dry run generates queries and duplicate decisions without calling Firecrawl or writing rows. `--live` requires `DATABASE_URL_LIVE`, configures managed-Postgres TLS using the established server helper, and uses Spaces for stored intake artifacts. Add a second orchestration command, `affiliate:intake:automation`, that claims a bounded number of discovery runs, promotes results, queues allowed intakes, and processes a bounded number of queued intake captures. Both commands use PostgreSQL advisory locks so overlapping invocations exit successfully with `lockAcquired: false`.

Add email summary output using the existing email module and the default recipient `samuel.r@razumly.com`. The summary includes campaigns run, provider queries, new results, review results, duplicates, rejected results, created intakes, policy-gated intakes, queued captures, completed captures, ready-for-mapping count, failures, and an admin URL. Send one summary per automation invocation only when there was work, a failure, or an intake needing policy review.

At the end of this milestone, a local mocked campaign can run twice and produce one intake, one current result row with `seenCount = 2`, zero duplicate active intake runs, and a summary that distinguishes new, duplicate, rejected, and policy-gated results.

### Milestone 4: Add discovery controls within the existing Source Intake tab

Create `src/app/admin/AdminAffiliateSourceDiscoveryPanel.tsx` and render it inside `AdminAffiliateSourceIntakePanel` without changing the three top-level Affiliate Imports sub-tabs. Keep campaign state and result state out of `AdminAffiliateImportsPanel.tsx`.

The panel shows compact campaign rows with name, region, selected sports, selected source types, active/paused state, cadence, last run, next run, and counts for new, review, intake-created, duplicate, rejected, and blocked results. Commands use familiar controls: a Play icon for Run now, a pause/resume toggle, an edit action, and a result review action. Several campaign runs can be queued; queued and running rows remain visibly busy until completion.

The campaign editor requires region, at least one sport, and at least one source type. It exposes a Firecrawl location string, cadence, query limit, result limit, and `autoCreateIntakes`. New campaigns save paused. Do not expose arbitrary query templates in the initial UI; deterministic templates remain versioned code so behavior is testable.

The results view supports status, campaign, sport, source type, score, domain, and text filters. Each result shows the title, canonical domain, URL, query, score reasons, duplicate match, policy state, and linked intake. Admin actions are Create intake, Add to existing intake, Reject, Block domain, Retry classification, and Open source. Bulk actions may create high-confidence intakes or reject selected rows, but cannot mark unknown policy allowed.

Expand the existing intake policy modal to show the inherited or proposed domain policy key, prior policy history, expiry, robots preflight, likely terms URLs, and all discovery results that would inherit the decision. Allowing a policy automatically queues the intake's selected pages. Blocking a policy blocks all unpromoted results and intakes on that exact policy key but does not delete evidence or disable already approved sources without a separate explicit action.

Add admin-only routes under `src/app/api/admin/affiliate-source-discovery`: campaign list/create/update, campaign run queueing, result list/update/bulk action, and run context. Continue to use `requireRazumlyAdmin` on every route. Validate payloads with Zod and return 202 for queued work. Do not perform provider calls in route handlers.

At the end of this milestone, an authenticated admin can create a paused campaign, run it, refresh the browser, inspect persisted results, create an intake, approve policy, and see the intake move through queued capture to ready for mapping. A non-admin receives 403, and the browser never receives Firecrawl or storage credentials.

### Milestone 5: Provide an atomic, read-only mapping-agent handoff

Add `claimNextAffiliateSourceIntakeForMapping` to a new `src/server/affiliateImports/sourceMappingQueue.ts`. It atomically selects the oldest `READY_FOR_MAPPING` intake, changes its status to `MAPPING_IN_PROGRESS`, records a lease owner and lease expiry in intake metadata, and returns only the intake ID and source key. If no intake is available, it returns null. A lease expired for more than two hours may be reclaimed; an active lease cannot be claimed twice.

Add `scripts/claim-affiliate-source-mapping.ts` and package command `affiliate:mapping:claim`. The command supports `--live`, `--worker=<name>`, optional `--intake=<id>`, and `--release`. Claiming immediately invokes the existing read-only intake exporter and prints the absolute path to the generated `manifest.json` and `source-evidence.json`. It does not invoke an LLM, make public web requests, create an organization, create a scrape source, or write candidates.

The later mapping agent uses the exported evidence and `$affiliate-scrape-source-builder`. It creates or updates checked-in setup code, source-specific mapping or extractor code, focused tests, package command, official normalized logo, and source-registry entry. It runs the first scrape in `REVIEW` mode against a local database. On completion it marks the mapping job `REVIEW_REQUIRED` with branch, commit, test, candidate-count, and withheld-row metadata. Because mapping attempts need history, add a small `AffiliateSourceMappingJobs` model only in this milestone rather than overloading intake notes. A job stores intake ID, status, claim/lease fields, attempt count, worker, branch, commit, result summary, error, and timestamps. Accepted statuses are `QUEUED`, `CLAIMED`, `REVIEW_REQUIRED`, `APPROVED`, and `FAILED`.

Do not make the application invoke Codex or another LLM as part of the web request or discovery worker. The mapping worker is a separate process that consumes this queue. The first implementation may run it manually or from an external task runner; the queue and evidence contract remain the same when agent dispatch becomes automated.

At the end of this milestone, two concurrent claim attempts receive different intakes or one intake plus null, the claimed evidence export can be reproduced without network access, and no approved source or candidate rows are created by claim/export alone.

### Milestone 6: Enforce first-pass approval and safe recurring automatic imports

Use existing `AffiliateScrapeMappings.validatedAt` and `AffiliateScrapeSources.autoScrapeEnabled` rather than adding another approval flag. A mapping created by an agent remains inactive or has `validatedAt = null`; its first scrape runs with `importMode: 'REVIEW'`. The admin approves representative candidates in the existing Candidates tab and uses an explicit source action, `Approve mapping and enable automatic imports`, which sets `validatedAt`, records a compact baseline in source metadata, and enables automatic scraping.

The baseline records active mapping ID and version, candidate count, listing kinds, required-field completeness, rejected count, and a hash of normalized field names. Extend `scheduledScrapes.ts` so the due-source query requires an active mapping with non-null `validatedAt`. Before automatic publication, compare the current scrape to the approved baseline. Return the run to review and create no new public targets when the result count drops to zero after a nonzero baseline, grows above twice the baseline plus five, more than 25 percent of rows lose publish-critical URL/date/location fields, listing kinds change unexpectedly, or rejected rows exceed 50 percent. Updating existing published targets may proceed only when their dedupe key and listing kind remain stable and publish-critical fields remain valid.

Record drift reasons in `AffiliateScrapeRuns.logs`, set a source metadata flag such as `automationReviewRequired`, and include the source in the daily summary. The admin can approve a new baseline after reviewing the mapping and candidate output. Do not automatically disable the source permanently for one provider timeout or HTTP failure; ordinary failures remain retryable scheduled-run failures.

At the end of this milestone, an unvalidated source cannot be selected by the automatic scheduler, a validated stable source creates or updates public rows automatically, and a fixture whose count drops from ten to zero produces review-required output with zero newly published rows.

### Milestone 7: Schedule and verify the complete automation loop

Keep scheduling outside the Next.js web process. The canonical entrypoint is `npm run affiliate:intake:automation -- --live --summary`. It uses advisory locks and campaign cadence, so it is safe to invoke every 15 minutes even though ordinary discovery campaigns run weekly or monthly. A frequent invocation drains capture queues promptly without repeatedly charging search credits.

For the tracked VM deployment, add `deploy/vm/systemd/bracketiq-affiliate-intake-automation.service` and `.timer`. The service runs the command inside the deployed application container with the production environment; the timer runs every 15 minutes with randomized delay and persistent catch-up after downtime. Document installation, logs, manual start, disable, and rollback in `deploy/vm/README.md`. If production is still on DigitalOcean App Platform when this milestone ships, use the same command in its supported scheduled-job mechanism or a protected operator runner; do not add an in-process `setInterval` fallback.

Seed no active campaigns in the migration. Add an idempotent setup script that creates paused Portland and San Francisco campaign templates from the canonical sport IDs and source types. The administrator reviews limits and enables each campaign from Source Intake. This prevents a deployment from immediately consuming Firecrawl credits.

Run a local smoke campaign with a mocked Firecrawl client first. Then, with explicit operator approval and a configured key, run one real campaign limited to two queries and five results per query. Confirm the provider was called at most twice, no result page was scraped during search, duplicates were recognized, unknown policy prevented capture, and approval queued only the selected intake pages.

At the end of this milestone, the complete loop survives process restart, overlapping timer invocations, repeated search results, provider failure, and one blocked domain without losing later work.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

1. Before editing, inspect the working tree and current migration state.

       git status --short --branch
       npx prisma migrate status

2. Add the discovery and domain-policy models and migration, then regenerate Prisma.

       npx prisma migrate dev --name add_affiliate_source_discovery_automation
       npx prisma generate

3. Implement and test pure discovery rules before database orchestration.

       npx jest --runInBand src/server/affiliateImports/__tests__/sourceDiscoveryRules.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/firecrawlClient.test.ts

4. Implement persistence, campaign execution, policy inheritance, intake promotion, and locking.

       npx jest --runInBand src/server/affiliateImports/__tests__/sourceDiscovery.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/sourceIntake.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/scheduledScrapes.test.ts

5. Implement protected routes and the Source Intake discovery panel.

       npx jest --runInBand src/app/api/admin/affiliate-source-discovery
       npx jest --runInBand src/app/admin/__tests__/AdminAffiliateSourceDiscoveryPanel.test.tsx
       npx jest --runInBand src/app/admin/__tests__/AdminAffiliateSourceIntakePanel.test.tsx

6. Exercise a dry-run campaign. Dry run must print deterministic queries and duplicate decisions, report zero provider calls, and make no database changes.

       npm run affiliate:discovery:run -- --campaign=<local-campaign-id> --dry-run --summary

   Expected summary shape:

       {
         "lockAcquired": true,
         "providerQueries": 0,
         "plannedQueries": 2,
         "databaseWrites": 0
       }

7. Exercise one bounded real local campaign only when `FIRECRAWL_API_KEY` is configured.

       npm run affiliate:discovery:run -- --campaign=<local-campaign-id> --once --max-queries=2 --max-results=5 --summary
       npm run affiliate:intakes:process -- --limit=10 --summary

8. Claim and export one ready intake without invoking public network access.

       npm run affiliate:mapping:claim -- --worker=local-validation

   The command prints the claimed intake, lease expiry, manifest path, and source-evidence path. Verify that approved-source and candidate counts did not change.

9. Start the local site and verify the existing Affiliate Imports > Source Intake tab on desktop and mobile widths.

       npm run dev

10. Run broad validation after focused tests pass.

       npx prisma validate
       npx tsc --noEmit
       npm run test:ci
       git diff --check

Do not run live campaigns, enable live campaign schedules, approve live domain policies, or dispatch mapping agents during implementation unless the user explicitly requests those external writes after reviewing the local result.

## Validation and Acceptance

The data layer is accepted when the same canonical result returned in two campaign runs produces one campaign result with incremented `seenCount`, one intake or duplicate link, and no duplicate active capture. A new path on an existing intake becomes a child page. A path on an approved source is retained as a source suggestion and does not change the active mapping.

The compliance boundary is accepted when an unknown domain creates a review-required intake and performs zero Firecrawl page capture calls. Allowing the exact domain policy queues capture automatically. A current blocked policy queues nothing. An allowed policy for one tenant on a shared platform does not allow another tenant unless the policy key explicitly covers it.

The provider boundary is accepted when Firecrawl search uses web results only, respects query and result caps, persists its exact request and compact response evidence, and never passes `scrapeOptions`. Page map and capture remain the responsibility of the existing intake worker after policy approval.

The admin experience is accepted when the three existing top-level affiliate sub-tabs remain `Source Intake`, `Sources`, and `Candidates`; campaign controls and results appear within Source Intake; queued work survives refresh; and error, duplicate, rejected, blocked, policy-review, intake-created, and ready-for-mapping states are distinguishable without opening raw JSON.

The agent boundary is accepted when a mapping worker atomically claims one ready intake, exports stored evidence without public requests, and cannot publish or write approved-source records through the claim/export path. Its first mapping remains unvalidated and runs in review mode.

Recurring automation is accepted when only a non-null validated mapping on an enabled active source may run automatically. Stable rows automatically create or update public targets. Structural drift holds new publication, records reasons, and appears in Candidates and the email summary. Manual admin scrapes continue to use review mode.

The scheduler is accepted when overlapping invocations produce one lock owner, a missed timer runs after restart, paused campaigns consume no search credits, and disabling the timer stops new discovery without affecting the web application, approved sources, existing intakes, or stored artifacts.

## Idempotence and Recovery

Campaign setup uses stable IDs or unique names and upserts. Discovery results are unique by campaign and canonical URL key. Intake pages remain globally unique through the existing URL key. Search result retries update evidence and counts rather than creating new rows. Intake capture queueing checks for an existing `QUEUED` or `RUNNING` run with the same requested pages before inserting another run.

Run claiming and mapping claiming are atomic and leased. A worker crash leaves the row reclaimable after lease expiry. Provider errors mark the run partial or failed and retain completed results. Retrying a failed run does not erase its earlier audit record. Search and capture limits are evaluated before provider calls and before artifact writes.

Campaigns are paused or archived, not deleted. Rejecting a result does not delete it. Blocking a policy does not delete evidence or automatically delete an approved organization/source. Rollback of the feature consists of disabling the automation timer and pausing campaigns; existing intake and source workflows continue to work. The additive tables may remain unused during rollback.

Schema migration rollback is not automatic. If an unreleased local migration must be discarded, use Prisma's normal local development workflow only after confirming it has not been applied outside the disposable local database. Once deployed, roll forward with a corrective migration.

## Artifacts and Notes

Keep one compact JSON fixture for discovery rule tests containing official, duplicate, stale, social, directory, rental, and out-of-region results. It must use invented domains or controlled test fixtures, not snapshots whose public content will drift.

The initial real smoke campaign should remain intentionally small:

    Region: Portland, Oregon metropolitan area
    Sports: Soccer
    Source types: CLUB, TRYOUT, EVENT
    Queries per run: 2
    Results per query: 5
    Automatic intake creation: enabled
    Campaign status after verification: PAUSED

Record the real smoke run ID, provider query count, result status counts, intake IDs, policy decisions, capture run IDs, and mapping export path here after implementation. Do not include credentials, provider-signed artifact URLs, or raw private environment values.

## Interfaces and Dependencies

In `src/server/affiliateImports/firecrawlClient.ts`, extend the interface with:

    export type FirecrawlSourceSearchOptions = {
      limit?: number;
      location?: string;
      includeDomains?: string[];
      excludeDomains?: string[];
    };

    export type FirecrawlSourceSearchResult = {
      request: Record<string, unknown>;
      response: Record<string, unknown>;
      rows: Array<{
        url: string;
        title: string | null;
        description: string | null;
        category: string | null;
      }>;
      providerJobId: string | null;
    };

    export interface AffiliateFirecrawlClient {
      searchSources(query: string, options?: FirecrawlSourceSearchOptions): Promise<FirecrawlSourceSearchResult>;
      mapSourceUrls(url: string, options?: { limit?: number; search?: string }): Promise<FirecrawlMapResult>;
      scrapeSourcePage(url: string): Promise<FirecrawlCaptureResult>;
    }

In `src/server/affiliateImports/sourceDiscoveryRules.ts`, expose pure functions:

    export const generateAffiliateSourceDiscoveryQueries: (
      campaign: AffiliateSourceDiscoveryCampaignInput,
      sports: Array<{ id: string; name: string }>,
      cursor?: number,
    ) => { queries: AffiliateSourceDiscoveryQuery[]; nextCursor: number };

    export const evaluateAffiliateSourceDiscoveryResult: (
      input: AffiliateSourceDiscoveryEvaluationInput,
    ) => AffiliateSourceDiscoveryEvaluation;

In `src/server/affiliateImports/sourceDiscovery.ts`, expose server functions:

    export const createAffiliateSourceDiscoveryCampaign: (input, userId) => Promise<Campaign>;
    export const listAffiliateSourceDiscoveryCampaigns: () => Promise<CampaignSummary[]>;
    export const queueAffiliateSourceDiscoveryRun: (campaignId, userId?) => Promise<Run>;
    export const processNextAffiliateSourceDiscoveryRun: (options?) => Promise<RunResult | null>;
    export const listAffiliateSourceDiscoveryResults: (filters) => Promise<ResultPage>;
    export const promoteAffiliateSourceDiscoveryResult: (resultId, userId) => Promise<Intake>;
    export const applyAffiliateSourceDomainPolicy: (policyKey, review, userId) => Promise<PolicyResult>;
    export const runAffiliateIntakeAutomation: (options?) => Promise<AutomationSummary>;

Reuse `canonicalizeAffiliateIntakeUrl` and URL safety from the existing intake modules rather than creating a second canonicalization implementation. Add a public-suffix-aware dependency only if the current dependency tree has no safe registrable-domain helper; pin its version and test shared-platform exceptions.

All new API routes use `requireRazumlyAdmin`. All provider and database operations remain server-only. The web UI calls protected JSON routes and never imports Firecrawl, database, storage, email, or mapping-agent credentials.

The mapping agent contract remains the existing `$affiliate-scrape-source-builder` skill and `affiliate:intake:export` evidence format. This plan adds a queue claim around that export; it does not change candidate field names or allow the agent to redesign affiliate schemas.

## Plan Revision Note

Created 2026-07-21 after confirming that the Affiliate Imports sub-tab layout and the database-backed source intake pipeline are already implemented. This plan intentionally adds discovery automation inside Source Intake, preserves explicit policy review for unknown domains, reuses the current intake artifact and recurring scrape systems, and delays any LLM invocation until a complete intake is ready for source-specific mapping.
