# Separate organization approval from event location failures

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

A valid affiliate organization should be able to enter BracketIQ's disabled review state even when some events extracted from its site do not identify a usable venue. After this change, mapping approval evaluates the organization and source package independently from individual event location failures. During every manual or automatic scrape, an event without a resolvable source-backed location is omitted while the scrape run records the exact reason for administrators. An event may use the source organization's location only when the mapping records stored evidence that the event is held there; the runtime never guesses merely because the organization is nearby.

The behavior is observable in the Affiliate Imports admin panel. A scrape with one valid club and one unlocatable event keeps the club candidate, rejects the event, and shows the rejected count and reason on the source row after the page reloads. A mapped event explicitly marked as occurring at the source organization receives that organization's verified location and coordinates.

## Progress

- [x] (2026-08-01 21:00Z) Audited the reviewer decisions, exact producer commits, scrape candidate gate, coordinate resolver, run logs, and Affiliate Imports admin source table.
- [x] (2026-08-01 21:15Z) Added an explicit evidence-backed source-organization location mode to mapping and candidate contracts.
- [x] (2026-08-01 21:20Z) Reject only unlocatable event candidates during the scrape and persist location-resolution evidence in candidate metadata.
- [x] (2026-08-01 21:25Z) Show the latest scrape's rejected candidates and reasons persistently on the admin source table.
- [x] (2026-08-01 21:30Z) Updated producer and reviewer skills so a bad event does not reject a valid organization package.
- [x] (2026-08-01 21:35Z) Added a dry-run-first producer repair queue and automatic reviewer-queue reopening after a repaired result.
- [x] (2026-08-01 21:50Z) Passed 83 focused tests, TypeScript, the full `test:ci` suite, route coverage, and a production build.
- [x] (2026-08-01 22:00Z) Committed and pushed `40ba2fb9`, passed main CI and the protected image publish, deployed the immutable image to OVH, requeued 67 narrowly eligible packages, and restarted both Luna workers with zero stale leases.

## Surprises & Discoveries

- Observation: candidate-level rejection and admin message formatting already exist.
  Evidence: `runAffiliateSourceScrape` stores `rejectedCount`, `rejectionSummary`, and up to 25 `rejectedCandidates` in `AffiliateScrapeRuns.logs`; `AdminAffiliateImportsPanel` formats the same fields after an operator-triggered scrape.

- Observation: the admin source table does not load the latest run logs, so failures disappear after a reload and scheduled scrape failures are not visible there.
  Evidence: `listAffiliateSources` returns mapping metadata but does not load `lastScrapeRunId`; the source row renders only `lastScrapedAt`.

- Observation: review scrapes currently save unlocatable events because the pre-persistence candidate gate validates dates and deadlines only. Unpublished event rows then receive `[0, 0]` from `buildAffiliateEventData`.
  Evidence: `candidateImportRejectionReasons` has no location rules, and `buildAffiliateEventData` uses `coordinates ?? [0, 0]` unless publication is attempted.

- Observation: four of five independently audited mapping rejections had otherwise safe unlisted/disabled/unvalidated setup code and were rejected solely because their producer scripts explicitly refuse `--live`.
  Evidence: the exact commits for Gridiron Houston, All American Youth Football, Afrim's Winter Softball, and Big City Pickle contain an unconditional `process.argv.includes('--live')` error while their setup rows preserve the intended safety state.

- Observation: the local machine's `DATABASE_URL_LIVE` still points at a DigitalOcean database endpoint that is not reachable from the current IP, so the new live repair preview cannot be run locally.
  Evidence: `npm run affiliate:mapping:retry-rejected -- --live` failed read-only with Prisma `P1001`; the same preview will run from the OVH application host after deployment.

- Observation: the OVH application database is the internal non-TLS Postgres service, while the shared live-environment helper defaults live URLs without `sslmode=disable` to TLS.
  Evidence: the first production preview failed read-only with Prisma `P1011`; rerunning with the existing OVH URL plus `sslmode=disable` succeeded without exposing or changing credentials.

- Observation: the deployment interrupted the intake automation invocation that was already executing inside the old app container.
  Evidence: systemd recorded exit 137 at the exact container recreation time; the timer stayed active, and manually restarting the service on the new healthy container resumed capture processing.

## Decision Log

- Decision: use an explicit `SOURCE_ORGANIZATION` location mode plus a non-empty evidence note instead of automatically copying organization coordinates.
  Rationale: the same organizer can run events at many facilities. An explicit mapping assertion is reviewable and prevents a nearby organization pin from being mistaken for an event venue.
  Date/Author: 2026-08-01 / Codex

- Decision: reject unlocatable events during scrape normalization, not during organization-package approval.
  Rationale: the scrape is the boundary that sees each current extracted row. Rejecting there keeps invalid events out of candidate and backing event tables while allowing a valid organization/source to be reviewed and applied.
  Date/Author: 2026-08-01 / Codex

- Decision: store candidate failures in existing scrape-run logs and expose those logs through the existing admin source endpoint.
  Rationale: the existing JSON log already supports counts, summaries, and row-level reasons, so no database migration or new rejection table is needed.
  Date/Author: 2026-08-01 / Codex

- Decision: city-only event text is not a specific venue unless the mapping explicitly selects the verified source-organization location.
  Rationale: geocoding a metropolitan area creates a plausible but misleading map pin. Events need an address, a venue with locality, or an evidence-backed source-organization fallback.
  Date/Author: 2026-08-01 / Codex

## Outcomes & Retrospective

Implementation, validation, and live rollout are complete. No migration was needed. Commit `40ba2fb9` is healthy on OVH, and both public health endpoints report success. The repair preview found 67 eligible package rejections (1 whole-package event-location rejection and 66 local-only setup-script rejections) while excluding 61 unrelated producer defects; all 67 eligible jobs were requeued with repair history preserved. The resulting mapping queue had 257 claimable jobs with zero active or stale leases before workers restarted. The reviewer then acquired exactly one lease under the new contract, and the producer goal started with the new event-location objective. Both the 15-minute intake timer and daily scrape timer are active.

## Context and Orientation

An affiliate source is a configured website in `AffiliateScrapeSources`. Its mapping is parsed by `src/server/affiliateImports/mappingExtractor.ts` into candidate inputs. `src/server/affiliateImports/service.ts` filters candidates, saves accepted candidates, creates unpublished backing targets, and stores each scrape result in `AffiliateScrapeRuns`. A source organization is the private organization linked by `AffiliateScrapeSources.organizationId`.

The independent Luna reviewer applies a whole source package through `scripts/complete-affiliate-approval.ts`. Its rules live in `.agents/skills/review-affiliate-approvals`. The producer's rules live in `.agents/skills/ingest-affiliate-intakes`. The current reviewer contract incorrectly treats every bad event location as a reason to reject the entire package.

The Affiliate Imports UI is `src/app/admin/AdminAffiliateImportsPanel.tsx`. It loads sources from `src/app/api/admin/affiliate-sources/route.ts`, which calls `listAffiliateSources`. The source row has a last-scraped timestamp but no persistent run result.

## Plan of Work

Extend the mapping and candidate types in `src/server/affiliateImports/types.ts` with a location source mode. `SOURCE_ORGANIZATION` requires an evidence note. Carry these fields through `mappingExtractor.ts` and candidate raw payloads so an independent reviewer can see why the fallback is allowed.

Add an asynchronous location-normalization step to `runAffiliateSourceScrape`. For events with a source address or venue, resolve only those specific inputs through the existing Google Places/geocoding path. Do not accept a city-center result by itself. For events with `SOURCE_ORGANIZATION`, verify the evidence note, load the source organization, and use its existing valid coordinates or resolve its own address/location. Copy the organization name/address/locality into missing event display fields and persist the resolution mode and coordinates in the candidate raw payload. Reject unresolved events before candidate persistence and backing event creation. Clubs remain independent; rentals retain their existing publication gate unless separately changed.

Update `buildAffiliateEventData` to reuse the verified candidate resolution stored during the scrape. This avoids a second API call and prevents the backing unpublished event from falling back to `[0, 0]` for accepted candidates.

Extend `listAffiliateSources` to load the sources' last scrape runs in one query and return a compact result containing status, error, rejected count, summary, and rejected rows. Render that result in the source table so both manual and scheduled failures remain visible after reload.

Revise both repository-local agent skills, their contracts, the generated reviewer objective, and durable scraping documentation. The producer must inspect stored evidence before selecting source-organization fallback, must generate approval-compatible live setup code without executing it live, and must expect bad events to be omitted by review scrapes. The reviewer must approve a valid organization/source package when stable review scrapes consistently reject its invalid events and must reject only package-level defects.

Add a dry-run-first repair command for terminal mapping packages whose rejection requires producer regeneration. It must preserve reviewer history, reset the mapping job and intake for the producer, and reset the unique approval row only after a new review-required result is completed. This prevents old local-only packages from returning unchanged to the reviewer.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` and preserve the unrelated untracked legacy Portland files.

Run focused validation while implementing:

    npm test -- --runInBand src/server/affiliateImports/__tests__/mappingExtractor.test.ts src/server/affiliateImports/__tests__/service.test.ts src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts src/app/admin/__tests__/AdminAffiliateImportsPanel.test.tsx
    npx tsc --noEmit
    git diff --check

Before deployment run:

    npm run test:ci
    npm run build
    git diff --cached --check

## Validation and Acceptance

Tests must prove that a scrape containing a valid club and an event without address/venue keeps the club, rejects the event, creates no backing event, and records an admin-readable reason. Another test must prove that `SOURCE_ORGANIZATION` is accepted only with evidence and valid organization coordinates, fills missing event location fields, and creates a non-zero-coordinate backing event. A city-only event without the explicit fallback must fail.

The source API and UI tests must prove that a stored scheduled-run rejection remains visible after loading the admin page and identifies the candidate title and reason. Reviewer goal tests must prove Luna is told not to reject a valid organization package solely because scrape-level event rows were rejected.

Live acceptance requires one repaired source package to apply as an unlisted, disabled, unvalidated organization/source while its unlocatable events appear only in scrape-run failure logs. No rejected event may create an `AffiliateImportCandidates` or `Events` row.

## Idempotence and Recovery

Location validation is read-only except for the existing candidate, event, run-log, and source last-run writes. Repeated scrapes use the same dedupe keys and overwrite the same run summary shape. Organization fallback is explicit and deterministic. A failed geocode rejects only the current candidate and leaves the source organization unchanged.

The repair command will default to dry-run and update only rows whose current terminal state and decision still match the selected repair category. Prior decisions remain in result history. If a producer repair fails, the job remains failed or review-required without publishing anything.

## Artifacts and Notes

The intended flow is:

    organization package review
        -> apply private organization, disabled source, unvalidated mapping
        -> scrape current rows
        -> accept located events
        -> reject unlocatable events into AffiliateScrapeRuns.logs
        -> show the failures on the Affiliate Imports source row

## Interfaces and Dependencies

`AffiliateCandidateInput` and the mapping schema will expose a location source enum and evidence note. `runAffiliateSourceScrape` will use the existing `geocodeAddressToCoordinates`, `normalizeAffiliateCoordinates`, and location-query helpers. No new package or database migration is required.

`listAffiliateSources` will return `lastScrapeRun` with a compact stable shape. The admin component will render this field without adding a new route.

Revision note (2026-08-01): Created after confirming that whole-package mapping rejection was blocking valid organizations and that existing scrape-run logs can own event-level failures without a schema change.
