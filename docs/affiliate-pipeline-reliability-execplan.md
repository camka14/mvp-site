# Make affiliate discovery and agent processing bounded and reliable

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current while the work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

The affiliate pipeline must continue discovery when one campaign run becomes stale, start mapper agents only after they own real work, reject non-catalog sport values before independent review, and complete daily scraping even when its summary email cannot be delivered. After this change, an operator can run the focused tests and see that a stale campaign cannot starve other campaigns, an idle mapper does not launch Codex, an unsupported sport becomes a terminal human-review result without a scraper package, and a revoked Gmail token is reported without failing a completed daily scrape.

## Progress

- [x] (2026-08-06 16:25Z) Audited the live queues, the stopped agent fleet, the discovery timer, the stale campaign run, and the failed daily scraper.
- [x] (2026-08-06 16:25Z) Identified the daily scraper failure as a revoked Gmail refresh token during summary delivery.
- [x] (2026-08-06 17:32Z) Implemented bounded stale discovery recovery, made recovered campaigns due again, and skipped due campaigns with queued or running work when selecting the next campaign.
- [x] (2026-08-06 17:32Z) Added the atomic mapper claim gate, idle wait loop, `--no-export` claim mode, persistent Compose mapper commands, and configurable idle interval.
- [x] (2026-08-06 17:32Z) Added the schema-version-1 terminal human-review result for unsupported sports, persisted it without an approval transition, and added disposable exact-catalog validation before normal review completion.
- [x] (2026-08-06 17:32Z) Made daily summary email delivery non-fatal and exposed `emailError` in the command result.
- [x] (2026-08-06 17:32Z) Updated focused tests, mapper instructions, the intake completion contract, the source-rollout goal, and agent deployment documentation.
- [x] (2026-08-06 17:32Z) Passed focused Jest, targeted ESLint, full TypeScript validation, Compose syntax validation, and whitespace checks.
- [x] (2026-08-06 18:05Z) Fixed review findings: organization sport repair now aggregates per organization, the mapper reconciles orphan intakes and active capture runs before idle, unsupported source sport labels reach the admin review panel, and the completion contract matches the result schema.
- [x] (2026-08-06 18:22Z) Added the one-active-mapping-job database invariant, pre-index duplicate audit and reconciliation, unique-conflict handling in mapping and capture flows, and a concurrent exact-intake claim regression test.
- [x] (2026-08-06 18:38Z) Extended duplicate cleanup to retire claimable mapping-package approvals for discarded jobs and clear their reviewer leases.

## Surprises & Discoveries

- Observation: Discovery campaigns exist and are overdue, but no new run is queued.
  Evidence: Production has 210 active campaigns and 139 due campaigns. The highest-priority due campaign, `Indianapolis Metro Sports Sources`, has run `4fd6637b-f3f6-435e-af8a-e89fa3a98988` stuck in `RUNNING` since 2026-07-31. `queueDueAffiliateSourceDiscoveryRuns` returns immediately when that first campaign has an active run, so it never examines the other due campaigns.

- Observation: Empty mapper containers spent substantial Codex usage because a one-shot command ran under Docker `restart: unless-stopped`.
  Evidence: Ten containers restarted 1,900 times and reported at least 41.9 million tokens after the live mapping queue was empty.

- Observation: Unsupported sports are safely blocked but take the most expensive route.
  Evidence: The mapper instructions preserve unsupported source labels in a complete package, and the reviewer later rejects the same package. Production has 445 mapping jobs in human review for `SPORT_NOT_IN_CATALOG` and zero published candidates with non-catalog sports.

- Observation: The daily scrape source work succeeded before systemd reported failure.
  Evidence: The 2026-08-06 service journal reports `Failed to refresh Gmail access token: Token has been expired or revoked` from `sendSummaryEmail`. Source exceptions are already isolated in `runDueAffiliateScrapes`.

- Observation: The apparent producer-repair backlog is bounded terminal work, not an unprocessed queue.
  Evidence: Thirty-one mappings exhausted three repair attempts. Five more ended on terminal evidence such as missing or partial intakes, past events, or absent defensible location evidence. Automatic requeue would cause repeated usage without new evidence.

- Observation: The existing Compose file already uses a paused `restart: no` default, but each mapper still launched the one-shot goal directly.
  Evidence: The implementation changed only mapper commands to `affiliate:intakes:codex-loop` and kept reviewer and coverage commands unchanged; the loop itself now waits after `{"claimed":false}`.

- Observation: An empty mapping claim does not prove that the mapping queue is idle.
  Evidence: Queue status can report orphan `READY_FOR_MAPPING` intakes or queued/running capture runs while the atomic mapping claim returns false. The loop now processes capture work, claims an orphan by exact intake ID, retries claimable jobs, and waits without emitting an idle event while pending work remains.

- Observation: The mapper loop was also exposed to a shared queue-service race.
  Evidence: A read-only production query found no current intake with more than one `QUEUED`, `CLAIMED`, or `REVIEW_REQUIRED` job, but the exact-intake path had no database invariant and could create duplicates between its intake read and job insert. The new migration audits and retires pre-existing duplicates before creating the partial unique index.

- Observation: Duplicate mapping cleanup also needs to clean the approval queue.
  Evidence: An approval row uses `subjectKey` to reference a mapping job. Retiring a discarded mapping job alone leaves a `QUEUED` or `CLAIMED` approval claimable even though its mapping job is no longer `REVIEW_REQUIRED`. The migration now marks those approvals `FAILED` and clears `claimedAt`, `leaseExpiresAt`, and `reviewerId`.

- Observation: The existing sport-quality and human-review queue code already provided the correct downstream data shape.
  Evidence: The completion path now reuses `inspectAffiliateSportQuality`, and the human-review summary is stored under `resultSummary.humanReviewRequired` for the existing review panel and guidance functions.

## Decision Log

- Decision: Recover stale discovery runs before queue selection and iterate past campaigns that already have a queued or running run.
  Rationale: Recovery restores the blocked campaign. Iteration prevents any future active campaign from starving unrelated due work.
  Date/Author: 2026-08-06 / Codex

- Decision: Require each mapper loop to claim a mapping job atomically before it launches Codex.
  Rationale: A read-only count followed by launch has a race when ten containers check together. The existing conditional claim is the established race boundary.
  Date/Author: 2026-08-06 / Codex

- Decision: Reconcile queue state after an empty mapper claim before declaring the mapper idle.
  Rationale: The claim command cannot claim an intake that has no mapping job, and capture work can still be active. Exact-intake claims repair orphan rows while the intake processor drains eligible capture runs.
  Date/Author: 2026-08-06 / Codex

- Decision: Add a terminal `HUMAN_REVIEW_REQUIRED` ingestion result for an unsupported or ambiguous source sport.
  Rationale: The source label belongs in evidence, not in candidate `sportName`. This lets the mapper stop before it authors code, runs duplicate scrapes, or invokes a reviewer.
  Date/Author: 2026-08-06 / Codex

- Decision: Do not map generic `Soccer` to `Grass Soccer` or generic `Volleyball` to `Indoor Volleyball`.
  Rationale: Surface variants are separate products. The source must provide the surface evidence.
  Date/Author: 2026-08-06 / Codex

- Decision: Keep the three-attempt producer-repair limit.
  Rationale: The limit is working as a circuit breaker. Exhausted or evidence-terminal rows require a human or new evidence, not another automatic retry.
  Date/Author: 2026-08-06 / Codex

- Decision: Treat daily summary email delivery as a secondary outcome.
  Rationale: A revoked email credential must be visible, but it must not change a completed scrape batch into a failed systemd job.
  Date/Author: 2026-08-06 / Codex

- Decision: Merge repaired candidate sports into one locked organization update.
  Rationale: Multiple repaired candidates can reference one organization. One update per candidate lets the last candidate erase earlier repairs and valid catalog sports.
  Date/Author: 2026-08-06 / Codex

- Decision: Enforce one active mapping job per intake with a partial unique PostgreSQL index.
  Rationale: Every caller receives the same invariant. The claim flow handles the unique-conflict winner by loading the existing active job and using the existing conditional lease update. Capture completion also treats a conflict as another worker having created the job.
  Date/Author: 2026-08-06 / Codex

- Decision: Retire only claimable mapping-package approvals attached to discarded jobs.
  Rationale: `QUEUED` and `CLAIMED` approvals can consume reviewer work after their mapping job is failed. Terminal approval history remains unchanged, while active leases and reviewer ownership are cleared.
  Date/Author: 2026-08-06 / Codex

## Outcomes & Retrospective

Implementation is complete. The local source now recovers stale discovery runs, prevents idle Codex launches, stops unsupported sports before package authoring, validates normal review packages against the disposable catalog, and reports email delivery failures without failing completed scrapes. No production process, timer, container, or database row was changed by this plan.

Validation passed 90 focused Jest tests, `npx tsc --noEmit`, `npx prisma validate`, targeted ESLint for all changed TypeScript files, `docker compose config --quiet`, and `git diff --check`. The focused email test prints the expected concise error log while returning a successful result and releasing the advisory lock. The review-fix tests also prove organization sport merging, mapper reconciliation, API label propagation, visible admin source-sport rendering, unique-conflict handling, one-winner concurrent exact claims, and approval cleanup migration ordering. Read-only production audits found no current active duplicate intake IDs and no claimable mapping-package approvals pointing to non-`REVIEW_REQUIRED` jobs.

## Context and Orientation

`src/server/affiliateImports/sourceDiscovery.ts` queues and processes source-discovery campaign runs. Its automation function runs from the production systemd timer every 15 minutes. A discovery run is a provider search for one campaign. A stale run is a row left in `RUNNING` long after its worker exited.

`scripts/run-affiliate-intake-codex-goal.ts` starts one Codex mapping goal. `deploy/affiliate-agents/compose.yml` defines ten mapper containers. The claim operation in `src/server/affiliateImports/sourceMappingQueue.ts` atomically assigns one mapping job and prevents two workers from owning it.

`src/server/affiliateImports/codexIngestionResult.ts` defines the result JSON accepted from a mapper. `scripts/complete-affiliate-source-mapping.ts` verifies that result and writes the terminal queue state. `src/server/affiliateImports/sportQuality.ts` compares package candidates and their source organization with exact current `Sports.name` values.

`src/server/affiliateImports/scheduledScrapes.ts` runs due approved sources and sends one daily summary email. The source loop already records per-source failures. The summary email currently throws through the top-level command.

The repo-backed skills in `.agents/skills/ingest-affiliate-intakes/SKILL.md` and `.agents/skills/review-affiliate-approvals/SKILL.md` are operational instructions used by the producer and reviewer agents. They must match the executable validation rules.

## Plan of Work

First, change discovery orchestration. Add a bounded stale-run recovery function that marks old `RUNNING` rows failed with a clear recovery reason and makes their campaigns due again. Call it once after the advisory automation lock is acquired. Change due-campaign selection to examine campaigns in priority order and skip campaigns that already have active runs instead of returning immediately.

Second, add a persistent mapper loop. The loop calls the existing claim command with a stable worker ID before it starts Codex. When the claim returns `claimed: false`, the loop waits for the configured interval. When a claim succeeds, it starts the existing goal command, waits for it to finish, and then repeats. Update the mapper Compose commands to use this loop. Keep reviewers and coverage unchanged.

Third, change sport handling. Extend the mapper result schema with `HUMAN_REVIEW_REQUIRED` and a structured human-review reason that contains `SPORT_NOT_IN_CATALOG` and the preserved source labels. This result must not contain a branch, commit, generated package, candidates, or review scrapes. Update queue completion to persist the human-review state without creating an approval job. Before accepting any normal `REVIEW_REQUIRED` package, run `inspectAffiliateSportQuality` against the disposable review database and reject the completion unless every candidate and source organization sport is an exact current catalog name. Update agent instructions so unsupported source labels are preserved only in evidence and the mapper stops before package authoring.

Fourth, repair the existing unpublished candidate sport utility without guessing surfaces. Remove generic Soccer and Volleyball aliases. Keep only deterministic aliases that do not invent a surface. Update its tests and comments.

Fifth, contain summary email failures. Add `emailError` to `RunDueAffiliateScrapesResult`, catch email exceptions after the result is assembled, log one concise error, and let the command exit successfully. Keep primary database and scrape failures fatal.

Finally, update focused tests and this plan. Do not deploy, restart services, run live repair commands, or alter production rows without a new explicit operational instruction.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Apply the source changes with `apply_patch`. Run the focused test set:

    npx jest --runInBand src/server/affiliateImports/__tests__/sourceDiscovery.test.ts src/server/affiliateImports/__tests__/scheduledScrapes.test.ts src/server/affiliateImports/__tests__/codexIngestionResult.test.ts src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts src/server/affiliateImports/__tests__/codexCliGoal.test.ts src/server/affiliateImports/__tests__/sportQuality.test.ts src/server/affiliateImports/__tests__/affiliateSportRepair.test.ts src/server/affiliateImports/__tests__/affiliateIntakeCodexLoop.test.ts

Run targeted lint on each changed TypeScript file. Because this task changes shared queue and result contracts, run:

    npx tsc --noEmit

Before any commit, run:

    git diff --check
    git status --short

## Validation and Acceptance

The discovery test must prove that a stale `RUNNING` row is failed and that an active highest-priority campaign does not prevent the next due campaign from being queued.

The mapper-loop test must prove that `claimed: false` does not launch Codex and that one successful atomic claim launches exactly one goal.

The ingestion-result tests must accept a structured unsupported-sport human-review result and reject one that claims a package, candidate, or scrape. The source completion path must persist `HUMAN_REVIEW_REQUIRED` without creating or reopening an approval job. A normal review package with `Volleyball` or `Soccer` must fail producer-side sport validation.

The sport-repair tests must prove that generic Soccer and Volleyball stay unresolved while exact surface-specific names remain repairable.

The scheduled-scrape test must mock a rejected email send and prove that the scrape result resolves with `emailSent: false`, a non-empty `emailError`, and a released advisory lock.

No test or command may contact a live provider or write the production database.

## Idempotence and Recovery

Stale discovery recovery uses conditional updates on rows that are still `RUNNING`, so a repeated automation pass cannot fail the same row twice. Due-campaign selection creates at most one active run per campaign through the existing active-run check.

Mapper claims use the existing conditional database update. A mapper process that stops after claiming will resume its own unexpired lease on its next loop. An unsuccessful claim does not start Codex.

Human-review sport completion is terminal and does not create a reviewer job. It can be reconsidered only after a human changes the catalog or adds source evidence and explicitly requeues it.

Email failure containment changes only the command result and log. The next daily timer can run normally even if the credential remains invalid.

## Artifacts and Notes

Live failure evidence from the 2026-08-06 daily run:

    [affiliate:scrape:due] failed Error: Failed to refresh Gmail access token: Token has been expired or revoked.
    at sendSummaryEmail (.../scheduledScrapes.ts:772:3)

Live discovery starvation evidence:

    campaign: Indianapolis Metro Sports Sources
    run: 4fd6637b-f3f6-435e-af8a-e89fa3a98988
    status: RUNNING
    started: 2026-07-31 09:56:39 PM Pacific
    other due campaigns: 138

## Interfaces and Dependencies

In `src/server/affiliateImports/sourceDiscovery.ts`, expose a stale discovery recovery function that accepts the current time and an optional stale threshold and returns compact recovered-run records. `runAffiliateIntakeAutomation` must include those records in its result.

In a small mapper-loop module, define pure parsing and interval helpers used by `scripts/run-affiliate-intake-codex-loop.ts`. The loop must use `scripts/claim-affiliate-source-mapping.ts --no-export` as the atomic launch gate.

In `src/server/affiliateImports/codexIngestionResult.ts`, the new human-review result must carry structured reason codes and source sport labels. It must remain schema version 1 because the change is additive and older result documents remain valid.

In `src/server/affiliateImports/scheduledScrapes.ts`, `RunDueAffiliateScrapesResult` must expose `emailError: string | null` together with `emailSent`.

Revision note: 2026-08-06. Created after the live queue and journal audit. The plan replaces the unsafe proposal to requeue all producer repairs with bounded retry preservation because production evidence showed those repairs had already been attempted.

Revision note: 2026-08-06 17:32Z. Implemented the plan locally. Added stale discovery recovery and campaign iteration, the claim-gated mapper loop, terminal unsupported-sport results, disposable exact-catalog validation, non-fatal daily email delivery, focused regressions, and synchronized agent/deployment instructions. No live writes, provider calls, process changes, deployment, or production restart were performed.

Revision note: 2026-08-06 18:05Z. Addressed the review findings locally. Organization sport repair now merges one aggregate per organization, the mapper loop reconciles orphan and capture work, source sport labels are visible in the admin review flow, and the written completion contract is restricted to the schema-supported unsupported-sport result. No live writes, provider calls, process changes, deployment, or production restart were performed.

Revision note: 2026-08-06 18:22Z. Addressed the remaining concurrency blocker locally. Added the partial unique active-job index with transactional duplicate reconciliation, handled `P2002` races in both exact mapping claims and capture completion, and added the concurrent claim regression. The production duplicate audit was read-only and returned no rows. No live writes, process changes, deployment, or production restart were performed.

Revision note: 2026-08-06 18:38Z. Addressed the stale-approval cleanup finding locally. The same migration now retires `QUEUED` and `CLAIMED` mapping-package approvals attached to discarded duplicate jobs and clears their lease fields and reviewer ownership before index creation. No live writes, process changes, deployment, or production restart were performed.
