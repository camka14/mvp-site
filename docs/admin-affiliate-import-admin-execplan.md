# Affiliate Import Admin And Automatic Import ExecPlan

## Purpose

The affiliate admin page currently combines source intake, configured scrape sources, and discovered candidates into one long page. This makes the initial source-review workflow difficult to scan and makes it unclear which work is still manual. After this change, the admin can switch between three focused sub-tabs: Source Intake, Sources, and Candidates.

The first scrape of a newly configured source remains a review step. It fetches the source, stores discovered candidates, and creates hidden target records for inspection without publishing them. Later scheduled scrapes for a source that is active, mapped, and automatic-scraping-enabled update existing targets and publish eligible new or changed targets automatically. The scheduler still sends its summary email, and the Candidates tab remains the place to review failures, rejected rows, or sources that were intentionally left manual.

The behavior is observable at `/admin`: the three sub-tabs load independently, the Sources tab can queue a manual scrape, and the scheduler path no longer leaves successfully imported scheduled candidates waiting for a manual Publish action.

## Repository orientation

The admin page is assembled in `src/app/admin/AdminDashboardClient.tsx` and the affiliate UI lives in `src/app/admin/AdminAffiliateImportsPanel.tsx` plus `src/app/admin/AdminAffiliateSourceIntakePanel.tsx`. The source and candidate API routes are under `src/app/api/admin/affiliate-sources`, `src/app/api/admin/affiliate-intakes`, and `src/app/api/admin/affiliate-discoveries`. `src/server/affiliateImports/service.ts` fetches a mapped source, validates and deduplicates rows, stores candidates, and materializes target records. `src/server/affiliateImports/scheduledScrapes.ts` selects due sources and invokes that service. The Prisma models for sources, mappings, runs, and candidates are already present in `prisma/schema.prisma`.

## Decisions

The UI state is client-side tab state inside the existing affiliate panel. The sub-tabs are `Source Intake`, `Sources`, and `Candidates`; the active tab is preserved while the panel is open but does not require a new route or database column.

Manual admin scrapes call the existing service with a review-only mode. Scheduled scrapes call the service with an explicit automatic-import mode. The mode is an option on the service call, not inferred from a missing user ID, because a missing user ID is not a reliable business signal.

Automatic import publishes only rows that pass the existing candidate validation. Rejected rows remain represented in the scrape run logs and do not create public targets. Existing published targets are updated in place by the existing deduplication and upsert logic. Existing discovered rows that are re-seen by an automatic scrape become published only when the source is in automatic-import mode and the candidate is valid; manually reviewed or manually deleted rows must not be recreated as published without a new valid source row.

The existing `autoScrapeEnabled` and `activeMappingId` fields are sufficient to opt a source into scheduled automatic import. No new schema field is required unless implementation discovers that the initial-review completion state cannot be represented safely by current source status or metadata. Sources without an active mapping, without an organization where one is required, or with automatic scraping disabled remain review-only.

## Implementation milestones

1. Add focused sub-tab state and render only the selected panel. Keep the existing source scrape queue, candidate selection, published/discovered filter, candidate modal, and intake controls intact. Move the intake panel into the Source Intake tab, the source table and scrape result into Sources, and the candidate table and candidate detail modal into Candidates. Show a small count in each tab where the existing API data provides one.

2. Add an explicit `importMode` or equivalent typed option to `runAffiliateSourceScrape`. Preserve the current manual behavior as the default. In automatic mode, pass `state: 'PUBLISHED'` for event targets, `visibility: 'PUBLIC'` for team targets, `status: 'ACTIVE'` for rental facilities, and `status: 'LISTED'` with `publicPageEnabled: true` for club organizations. Candidate rows created or updated by this mode must be marked `PUBLISHED` after the target upsert succeeds, and the run logs must report created, updated, rejected, and automatically published counts separately where useful.

3. Update `runDueAffiliateScrapes` to invoke automatic mode for due sources. Keep lightweight checks, advisory locking, retry behavior, and email summaries unchanged except for reporting automatic publication and the remaining pending-review count. Do not auto-publish a source that is disabled, inactive, unmapped, missing its required organization, or rejected by candidate validation.

4. Add regression tests for the service's manual/default mode and automatic mode for at least one event and one non-event target. Add scheduler coverage proving a due source uses automatic mode and a non-due source is not scraped. Add component coverage proving each sub-tab renders its own content and that switching tabs does not lose candidate selection or scrape queue state unexpectedly.

5. Run focused Jest suites, `npx tsc --noEmit`, `git diff --check`, and the local admin smoke test. Verify manually that a first admin scrape leaves a discovered candidate for review, while a scheduled automatic scrape creates or updates the public target without requiring a second manual publish action.

## Progress

- [x] Inspect the current admin panel, routes, service, and scheduler.
- [x] Implement the three affiliate admin sub-tabs.
- [x] Implement explicit scheduled automatic-import mode.
- [x] Add regression tests.
- [x] Run typecheck, focused tests, and diff validation.

## Acceptance criteria

The `/admin` affiliate section has exactly three visible sub-tabs named `Source Intake`, `Sources`, and `Candidates`, and each tab shows only its related workflow. Existing intake creation/import, manual source scraping, candidate classification, delete, publish, and published-candidate views continue to work.

The first manual scrape of a mapped source creates discovered candidates and hidden target records for review. A due source selected by the scheduler with `autoScrapeEnabled=true`, `status=ACTIVE`, and an active mapping automatically updates or publishes valid target records. Invalid, past, blocked, or otherwise rejected rows are never published and remain explained in the scrape run summary. Re-running the same scheduled scrape is idempotent and does not create duplicate candidates or target records.

## Decision log

The initial implementation intentionally avoids a migration. The existing source enablement and mapping fields already define whether a source is eligible for scheduled work; the missing distinction is the execution mode passed from the caller. If a future workflow needs an explicit “initial review completed” gate, add that field in a separate migration rather than silently treating every automatic source as approved.
