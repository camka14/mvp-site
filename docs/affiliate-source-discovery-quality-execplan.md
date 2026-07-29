# Improve affiliate source discovery precision before resuming campaigns

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` from the repository root.

## Purpose / Big Picture

BracketIQ's automated source discovery currently finds many useful sports websites, but it also assigns high scores to directories, stale event pages, out-of-region organizations, and pages whose sport or purpose does not match the search that found them. Some of those rows have already created raw intake records automatically. After this change, discovery can still retain broad leads for review, but only direct, local, correctly classified source pages can create intakes automatically. The change is demonstrated by focused Jest tests and by re-scoring the exported New York, Los Angeles, Chicago, and Houston benchmark without making live database changes.

## Progress

- [x] (2026-07-29 07:00Z) Paused all 44 live campaigns, disabled the automation timer and service, and confirmed no queued or running discovery or intake jobs remain.
- [x] (2026-07-29 07:20Z) Exported and independently reviewed 2,010 discovery results from New York, Los Angeles, Chicago, and Houston.
- [x] (2026-07-29 07:45Z) Audited the evaluator, query generator, URL canonicalizer, organization matcher, and run counters.
- [x] (2026-07-29 08:25Z) Added regression tests for intermediary hosts, locality gates, profile alignment, sport aliases, dates, URL normalization, and campaign-scoped shared-platform matching.
- [x] (2026-07-29 08:35Z) Implemented direct-source classification, explicit automatic-promotion gates, city-aware queries, sport aliases, and stale/closed opportunity handling.
- [x] (2026-07-29 08:45Z) Moved the broad directory query to the end of the full campaign cycle and added mutually exclusive run outcomes.
- [x] (2026-07-29 09:00Z) Re-scored all 2,010 exported rows from the four metros with the database-free benchmark.
- [x] (2026-07-29 09:10Z) Passed 37 focused Jest tests, `npx tsc --noEmit`, and `git diff --check`.

## Surprises & Discoveries

- Observation: The additive score can promote an Eventbrite directory to 95 and Yelp pages to 89 because generic region, sport, action, organization, and year terms stack without requiring a canonical source.
  Evidence: The four-metro review found 50 Yelp rows in `REVIEW_REQUIRED`.

- Observation: Campaign metadata already stores covered cities, but query generation and evaluation only use the single campaign location/region string.
  Evidence: Los Angeles metadata includes Long Beach while all generated queries were anchored to Los Angeles.

- Observation: The broad directory query is appended to every bounded run.
  Evidence: Completed metros executed the same directory query eight times during one 70-query sport/profile cycle.

- Observation: Shared SaaS hosts can match organizations from another region.
  Evidence: BlueSombrero and TopScore results in Chicago and Houston matched Oregon organizations through website-domain containment.

- Observation: A known-host denylist alone was insufficient because participant search results also included ticketing, forum, camp marketplace, and multi-tenant event-index pages.
  Evidence: Benchmark sample inspection found Ticketmaster, Meetup, Tapatalk, IMLeagues, US Sports Camps, UTR Sports, and TopScore among rows that initially passed the new structural gates.

## Decision Log

- Decision: Keep the existing Prisma models and importer contracts.
  Rationale: The quality defects are rule, matching, and summary defects; the current JSON metadata and summary fields can store the additional evidence and metrics.
  Date/Author: 2026-07-29 / Codex

- Decision: Preserve non-canonical directories as reviewable intermediary leads instead of deleting them.
  Rationale: Directories can be useful for second-hop discovery, but they must never auto-create canonical source intakes.
  Date/Author: 2026-07-29 / Codex

- Decision: Require explicit promotion gates in addition to the numeric score.
  Rationale: Raising a single threshold cannot distinguish a useful low-copy official homepage from a keyword-rich marketplace or stale event page.
  Date/Author: 2026-07-29 / Codex

- Decision: Validate against the ignored local exports before re-enabling any live campaign.
  Rationale: The exports are a repeatable benchmark and avoid spending provider credits or mutating the paused live backlog during implementation.
  Date/Author: 2026-07-29 / Codex

- Decision: Keep shared registration hosts eligible only for manual review unless they are already represented by an exact campaign-scoped intake relationship.
  Rationale: Tenant pages can be legitimate, but provider snippets do not reliably prove which organization or region owns a generic platform page.
  Date/Author: 2026-07-29 / Codex

## Outcomes & Retrospective

Implementation is complete. The live campaigns remain paused and this work did not delete, reclassify, or create any live discovery or intake rows.

The benchmark replayed 2,010 persisted rows. The old stored distribution was 1,227 review-required, 726 rejected, and 57 duplicate rows. Under the new rules, 143 rows are automatic-promotion eligible, 1,049 require review, and 818 are rejected. The benchmark classified 307 rows as intermediaries and 381 as unsupported. All four required safety assertions passed: zero intermediary, stale/closed, state-only, or broad-directory rows were eligible for automatic promotion.

The implementation deliberately remains conservative. Known marketplaces and search platforms are retained for manual second-hop research, while direct official pages still need city, queried sport, queried profile, and the profile's public action before automatic intake creation. Exact normalized URLs and campaign/region scoping replace domain-substring organization and intake matching.

## Context and Orientation

`src/server/affiliateImports/sourceDiscoveryRules.ts` creates search queries and evaluates each search result. It currently returns a numeric score, status, source-type hints, sport hints, and reason codes. `src/server/affiliateImports/sourceDiscovery.ts` persists those evaluations, detects existing pages/sources/organizations, automatically creates intakes, and writes run summaries. `src/server/affiliateImports/sourceIntakeUrlSafety.ts` canonicalizes URLs before keys are generated. Campaign templates and their covered-city metadata live in `src/server/affiliateImports/sourceDiscoveryCampaignTemplates.ts`.

An intermediary is a page such as Yelp, Wikipedia, Reddit, an article, or a general marketplace that can point toward a real source but is not itself the official organization, event, or rental source. A promotion gate is a required condition, separate from numeric score, that must be true before discovery may create an intake automatically.

The benchmark files are under `output/affiliate-discovery-review-2026-07-28/`. They are ignored working artifacts and must not be written back to the live database during this plan.

## Plan of Work

First, extend the discovery query and evaluation inputs so each result knows the intended profile, the campaign location, and all covered cities. Generate each covered city's queries intentionally while keeping campaign cursors deterministic. Emit the broad directory query only at the end of a complete sport/profile cycle.

Second, change result evaluation to recognize sport aliases and profile-specific action terms. Add direct locality evidence, intermediary-host classification, stale/closed occurrence detection, and explicit promotion gates. Direct official pages that lack keyword-heavy snippets should remain reviewable instead of being discarded solely by the old 45-point cutoff.

Third, normalize tracking parameters before URL keys are generated. Tighten existing organization matching so shared platforms require a tenant/path match and ordinary domains require an exact normalized origin or URL; domain containment must not join unrelated regions.

Fourth, update discovery orchestration so automatic intake creation requires both the score threshold and evaluator approval. Add exclusive per-run summary counts while preserving existing database columns for compatibility.

Finally, add a local benchmark script that reads the exported JSON and evaluates rows with the new rules. Compare automatic-promotion candidates, intermediary classifications, sport matches, and rejected rows before and after. The benchmark must not connect to Prisma or mutate any database.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Run focused tests while implementing:

    npm test -- --runInBand src/server/affiliateImports/__tests__/sourceDiscoveryRules.test.ts src/server/affiliateImports/__tests__/sourceDiscovery.test.ts src/server/affiliateImports/__tests__/sourceIntakeUrlSafety.test.ts

Run the local benchmark:

    npm run affiliate:discovery:benchmark -- --input output/affiliate-discovery-review-2026-07-28

Run final verification:

    npx tsc --noEmit
    git diff --check

## Validation and Acceptance

The evaluator must hard-reject unsupported social/search hosts, retain known intermediary pages without allowing automatic promotion, and prevent a keyword-rich Yelp or Eventbrite directory from creating an intake. A direct local official source with matching sport and profile evidence must remain eligible. Generic soccer, volleyball, sand volleyball, futsal, flag football, ice hockey, field hockey, and Ultimate text must map to the intended canonical sport when found through that sport's query.

URLs that differ only by `utm_*`, `srsltid`, `gclid`, `fbclid`, or equivalent search tracking parameters must produce one canonical key. Shared-host organization matching must not link a Chicago or Houston tenant page to an Oregon organization.

Completed campaign cycles must execute the broad directory query once. Run summaries must expose exclusive counts that add up to the returned rows processed during that run.

The benchmark must show zero auto-promotion eligibility for the known Yelp, Reddit, Wikipedia, generic Eventbrite, stale, closed, and out-of-region examples while retaining the reviewed strong local leads for manual review or direct-source promotion.

## Idempotence and Recovery

All code and benchmark operations are local and repeatable. The benchmark reads exported JSON and writes only terminal output. Live campaigns remain paused throughout this work. If a rule proves too strict, update the evaluator and rerun the same benchmark; do not resume live discovery until the comparison is acceptable.

## Artifacts and Notes

The baseline report is `output/affiliate-discovery-review-2026-07-28/review-summary.md`. Baseline totals are 3,054 provider returns, 2,010 unique persisted results, 1,227 review-required rows, 726 rejected rows, 57 duplicates, and 265 automatically created intakes.

## Interfaces and Dependencies

`evaluateAffiliateSourceDiscoveryResult` will continue returning the current evaluation fields and will add explicit classification and promotion evidence without changing Prisma schema. `generateAffiliateSourceDiscoveryQueries` will remain deterministic for a campaign, sports list, and cursor. `canonicalizeAffiliateIntakeUrl` remains the single URL normalization path used by both intake and discovery keys.

The implementation uses existing dependencies only, including `tldts`, Prisma, Jest, and Node. No new external service or schema migration is required.

Revision note: Initial plan created after the four-metro review identified scoring, locality, date, sport-alias, canonicalization, shared-host matching, and metric defects.

Revision note: Updated after implementation with completed milestones, additional intermediary-host findings, benchmark totals, and final validation evidence.
