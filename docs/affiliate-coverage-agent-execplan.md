# Introduce the affiliate coverage and capture-recovery agent

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current while work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

BracketIQ already has deterministic discovery campaigns, an intake capture worker, mapping agents, and an independent review agent. The missing role is a worker that asks whether a market has enough source coverage, creates focused follow-up campaigns when it finds a gap, and manually checks campaign intake pages that the provider could not capture. After this change, a Luna goal can claim one coverage task at a time, create bounded league, tournament, association, or other focused campaigns, attach durable manual browser evidence to a failed intake, and continue until its queue is empty.

The new worker does not replace deterministic search or capture code. It does not map sources, approve mappings, publish organizations, or bypass access controls. It makes planning decisions through guarded commands. The existing discovery and mapping workers continue to own provider execution and scraper repair.

## Progress

- [x] (2026-08-03 16:23Z) Audited current discovery profiles, campaign storage, intake failure evidence, mapper and reviewer lease patterns, and Luna goal launchers.
- [x] (2026-08-03 16:23Z) Initialized the repository-backed `plan-affiliate-discovery-campaigns` skill with UI metadata and a references folder.
- [x] (2026-08-03 17:08Z) Added focused league, tournament, and general event query profiles and advanced the deterministic query strategy to version 5.
- [x] (2026-08-03 17:08Z) Added persistent coverage jobs, an additive migration, atomic reconciliation and claiming, completion validation, and queue summaries.
- [x] (2026-08-03 17:08Z) Added idempotent campaign creation, durable manual browser evidence, and mapper-repair handoff commands.
- [x] (2026-08-03 17:08Z) Added the Luna max and fast goal launcher, single-goal supervisor loop, and package commands.
- [x] (2026-08-03 17:08Z) Completed the skill contract and focused tests. Skill validation, Prisma validation, ESLint, TypeScript, the dry run, and the production build pass.
- [x] (2026-08-04) Removed the fast-mode and fast-service-tier invocation overrides. Kept Luna at `max` reasoning effort.

## Surprises & Discoveries

- Observation: League and tournament discovery exists, but one combined profile performs all event, league, and tournament searches.
  Evidence: `src/server/affiliateImports/sourceDiscoveryRules.ts` uses one `leagues-tournaments-events` query profile whose types are `EVENT`, `LEAGUE`, and `TOURNAMENT`.

- Observation: Final organizations already support `League Operator` and `Tournament Host` tags.
  Evidence: `scripts/sync-affiliate-organization-tags.ts` seeds and infers both system tags.

- Observation: The existing automation has bounded work per invocation but no persisted task for a reasoning agent to assess one market or one failed capture without racing another worker.
  Evidence: discovery runs and mapping jobs have claims, but there is no coverage-assessment job model.

- Observation: A market reassessment must include results from focused child campaigns, not only the parent template campaign.
  Evidence: the claimed context now resolves all campaigns whose metadata names the parent and aggregates their recent runs and results.

- Observation: The production build regenerates the tracked Prisma client and requires the new generated coverage-job model.
  Evidence: `npm run build` passed `prisma:check`, regenerated the client, and completed the Next.js production build.

## Decision Log

- Decision: Keep provider search and intake capture deterministic while giving the agent authority to create validated campaigns.
  Rationale: The agent should decide what coverage is missing. Existing code should still enforce query limits, provider selection, URL safety, deduplication, and policy rules.
  Date/Author: 2026-08-03 / Codex

- Decision: Give failed campaign intake captures priority over market assessments.
  Rationale: A failed page can hide an organization that was already discovered. Recovering it is cheaper and more direct than running more searches.
  Date/Author: 2026-08-03 / Codex

- Decision: Store manual HTML, Markdown, links, branding, and an optional screenshot as `MANUAL_BROWSER` evidence in a supplemental intake run.
  Rationale: Agent notes are not reproducible training or mapping input. Durable artifacts preserve provenance and allow the mapper to work without another public request.
  Date/Author: 2026-08-03 / Codex

- Decision: Route broken approved-source selectors to the mapping queue rather than editing them in the coverage agent.
  Rationale: Campaign planning and scraper implementation have different validation and approval boundaries.
  Date/Author: 2026-08-03 / Codex

- Decision: Do not add a hard provider-credit cap.
  Rationale: The user has a 200,000-credit ScrapingDog Lite plan and current usage is well below it. Per-campaign bounds, duplicate prevention, and queue exhaustion remain required.
  Date/Author: 2026-08-03 / Codex

- Decision: Supervise the Coverage Agent with one PostgreSQL advisory lock and one active Luna goal.
  Rationale: The loop must not start a second goal while the first goal owns queue work. A database lock also prevents two supervisor processes from launching duplicate goals.
  Date/Author: 2026-08-03 / Codex

## Outcomes & Retrospective

The Coverage Agent is implemented locally. It can create bounded focused campaigns, distinguish league operators from tournament hosts, reassess parent and focused campaign results, recover one failed public intake capture with durable evidence, and create a real mapper repair job when selectors have drifted. Its leased queue and supervisor prevent duplicate work.

Five focused Jest suites pass with 36 tests. The skill validator, Prisma schema validation, targeted ESLint, `tsc --noEmit`, launcher dry run, `git diff --check`, generated Prisma client check, and Next.js production build pass. No runtime, timer, campaign, provider request, live database, process, or deployment changed during implementation.

## Context and Orientation

`src/server/affiliateImports/sourceDiscoveryRules.ts` produces deterministic searches from a campaign. `src/server/affiliateImports/sourceDiscovery.ts` creates campaigns, queues runs, calls the configured provider, scores results, and promotes safe results into `AffiliateSourceIntakes`. `src/server/affiliateImports/sourceIntake.ts` captures up to ten selected pages and stores immutable artifacts through `sourceIntakeArtifacts.ts`. `src/server/affiliateImports/sourceMappingQueue.ts` and `approvalQueue.ts` show the lease pattern used to prevent two agents from claiming the same item.

A coverage job is a persistent unit of agent work. `MARKET_COVERAGE` asks the agent to assess one existing regional campaign and create focused follow-up campaigns when evidence shows a gap. `FAILED_INTAKE_CAPTURE` asks the agent to inspect one failed or useful partial intake run and attempt a single manual public-page recovery. A lease is temporary ownership of that job. A conditional database update is the race boundary.

The Codex goal uses Luna with maximum reasoning, matching the mapper and reviewer. It does not request fast mode or a specific service tier. Its repository-backed skill is `.agents/skills/plan-affiliate-discovery-campaigns/SKILL.md`.

## Plan of Work

First, split the combined event search profile in `sourceDiscoveryRules.ts` into separate general event, league-operator, and tournament-operator profiles. Add association, organizer, cup, championship, series, and sanctioned competition terms where they improve operator discovery. Keep result scoring and campaign limits deterministic.

Second, add `AffiliateCoverageAgentJobs` to `prisma/schema.prisma` and a new additive migration. Each row stores subject type and key, status, claim lease, worker identity, attempt count, context, result, error, and completion time. The unique subject pair prevents duplicate work.

Third, create `src/server/affiliateImports/coverageAgentQueue.ts`. Reconciliation creates one versioned market assessment per template campaign and one repair job for the latest failed or useful partial intake run. Claiming resumes the worker's current lease before selecting another job and uses a guarded update. Context export includes only the campaign, sports, recent runs and results, or the failed intake, selected pages, run summary, and artifact metadata needed for the task.

Fourth, add a governed campaign command. It accepts a JSON proposal for the claimed market job, validates sports and source types, calculates a stable fingerprint, reuses an identical campaign, creates a focused active campaign when absent, and queues its first run. It must not call the provider in the command itself. The goal runs the campaign through the existing deterministic discovery command. A `CAMPAIGNS_CREATED` completion returns the same assessment to `QUEUED`, so the agent reclaims fresh results and continues until it can prove coverage or request human review.

Fifth, add a manual evidence command for a claimed failed-capture job. It reads agent-provided HTML and an optional screenshot from local files, validates that the page belongs to the failed intake, derives Markdown and page metadata locally, stores a supplemental `MANUAL_BROWSER` run and artifacts, and returns the intake to the mapping queue. It must not accept policy-blocked pages, login material, cookies, credentials, CAPTCHA output, or evidence from another host without a separate governed replacement-URL action.

Sixth, add queue, reconcile, claim, campaign-create, manual-evidence, and complete scripts plus package commands. Add `codexCoverageGoal.ts` and `run-affiliate-coverage-codex-goal.ts`. The goal must reconcile, check status, claim one job, finish it, and repeat until claimable jobs and active leases are zero.

Finally, replace the initialized skill placeholders with concise workflow instructions and a detailed completion contract. Add a supervisor loop that keeps one goal active at a time. Add Jest coverage for profile generation, race-safe claims, idempotent campaigns, manual evidence validation, completion states, mapper repair, the supervisor wait boundary, and goal text. Validate the skill, Prisma schema, TypeScript, focused tests, and changed-file whitespace.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Run focused tests with:

    npx jest --runInBand \
      src/server/affiliateImports/__tests__/sourceDiscoveryRules.test.ts \
      src/server/affiliateImports/__tests__/sourceDiscoveryCampaignTemplates.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentQueue.test.ts \
      src/server/affiliateImports/__tests__/coverageAgentLoop.test.ts \
      src/server/affiliateImports/__tests__/codexCoverageGoal.test.ts

Validate the skill with:

    python3 /Users/elesesy/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
      .agents/skills/plan-affiliate-discovery-campaigns

Validate the schema and TypeScript with:

    npx prisma validate
    npx prisma generate
    npx tsc --noEmit

Exercise the launcher without starting Codex or touching live state with:

    npm run affiliate:coverage:codex-goal:dry-run

The dry run must print the Luna model, maximum reasoning, service tier `null`, fast mode `false`, local commands, stable worker ID, and a goal that stops only when the coverage queue is empty.

## Validation and Acceptance

The query test must prove that selecting `EVENT`, `LEAGUE`, and `TOURNAMENT` produces three focused query profiles rather than one combined query. The queue test must prove that two workers receive different jobs and that a worker resumes its own unexpired lease. Reconciliation must not create duplicate jobs on a second pass.

Campaign creation must reject a job of the wrong subject type, unsupported source types, nonexistent sports, and a campaign outside the claimed market. Submitting the same valid proposal twice must return the same campaign and queue at most one active run.

Manual evidence must reject a blocked page, an unrelated page, empty or low-quality HTML, and a claimant mismatch. A valid fixture must create a supplemental run with `MANUAL_BROWSER` artifacts, mark the intake ready for mapping, and create no duplicate active mapping job.

The skill validator, focused Jest tests, Prisma validation, TypeScript, and `git diff --check` must pass. This plan does not authorize live migration deployment, provider calls, process restarts, or service enablement.

## Idempotence and Recovery

Reconciliation uses unique subject keys and can run repeatedly. Campaign fingerprints make repeated proposals safe. Manual evidence uses the job and page identity in artifact dedupe keys. If the agent cannot recover a page safely, it completes the job as `HUMAN_REVIEW_REQUIRED` with a concrete reason. Expired leases can be reclaimed. Active leases cannot be stolen.

The migration is additive. Rolling back application code leaves the new table and optional campaign fingerprint unused. Do not drop live data as part of rollback.

## Artifacts and Notes

The implementation must preserve unrelated existing changes in `AGENTS.md`, `scripts/data/legacy-portland-affiliate-source-configs.json`, and `scripts/setup-legacy-portland-affiliate-sources.ts`.

## Interfaces and Dependencies

`src/server/affiliateImports/coverageAgentQueue.ts` must export functions equivalent to:

    reconcileAffiliateCoverageJobs(options): Promise<ReconcileSummary>
    summarizeAffiliateCoverageQueue(options): Promise<CoverageQueueSummary>
    claimNextAffiliateCoverageJob(options): Promise<CoverageClaim | null>
    createAffiliateCoverageCampaign(input): Promise<CampaignCreationResult>
    storeAffiliateManualBrowserEvidence(input): Promise<ManualEvidenceResult>
    completeAffiliateCoverageJob(input): Promise<CoverageJob>

Use existing Prisma, `createId`, discovery campaign validation, URL safety, HTML artifact derivation, intake artifact persistence, and mapping job patterns. Do not introduce a second provider client, browser framework, queue service, or storage system.

Revision note: Created 2026-08-03 to implement the user-approved Coverage Agent, focused league and tournament operator discovery, and manual recovery of failed campaign intake captures. Updated 2026-08-03 after implementation to record focused-child reassessment, mapper repair handoff, single-goal supervision, generated-client requirements, and final validation.
