# Let Luna expand stored directories into automatically captured organization intakes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

BracketIQ already captures approved source URLs into `AffiliateSourceIntakes`, turns successful HTML/Markdown captures into mapping jobs, and lets the Luna Codex goal turn those jobs into review-ready organization packages. The missing link is directory expansion: when stored evidence is an aggregator or directory, Luna needs a safe way to submit the official organization URLs it found so those URLs enter the same capture and mapping pipeline without an operator starting another campaign.

After this change, a Luna worker can claim one directory intake, read only its stored artifacts, write a bounded JSON list of evidenced official organization URLs, and run one command. A shared service will canonicalize and deduplicate every URL, reuse existing policy decisions, create or reuse the durable intake, and immediately queue ScrapingDog capture only when the domain has a current `ALLOWED` policy. Unknown domains remain review-required and blocked domains remain blocked. Luna records the parent mapping job as `EXPANDED`, checks the queue again, waits while queued/running captures finish, and maps the child intakes that capture successfully. The goal is exhausted only when neither mapping work nor allowed capture work remains.

## Progress

- [x] (2026-07-31) Audited the discovery promotion, intake capture, mapping lease, completion-result, queue-status, and Luna goal contracts.
- [x] (2026-07-31) Chose existing intake/page/run records as the durable URL queue rather than adding another table or coupling Luna to campaign cursors.
- [x] (2026-07-31) Implemented the shared proposal schema and deterministic enqueue service.
- [x] (2026-07-31) Routed campaign promotion through the shared enqueue service and added a JSON-file CLI for Luna.
- [x] (2026-07-31) Added the `EXPANDED` terminal result and capture-aware queue exhaustion contract.
- [x] (2026-07-31) Updated the repository-local Luna skill and operator goal documentation.
- [x] (2026-07-31) Added focused tests, passed Jest, TypeScript, ESLint, and diff checks, and prepared the scoped changes for commit.

## Surprises & Discoveries

- Observation: `AffiliateSourceIntakePages.urlKey` is globally unique, so exact canonical URL deduplication already has a database-enforced identity.
  Evidence: `prisma/schema.prisma` defines the unique page key and `sourceIntake.ts` rejects a page already owned by another intake.

- Observation: successful or partial captures with stored HTML/Markdown already transition an intake to `READY_FOR_MAPPING` and create `AffiliateSourceMappingJobs` automatically.
  Evidence: `processNextAffiliateSourceIntakeRun` performs both transitions after artifact persistence.

- Observation: campaign promotion contains all the required policy and capture behavior, but it is private to `sourceDiscovery.ts`.
  Evidence: `promoteDiscoveryResult` creates/reuses intakes, creates a policy preflight, applies `ALLOWED`/`BLOCKED`, and queues an intake run.

- Observation: the existing Luna goal can report completion while ScrapingDog work is still queued or running because queue status reads only intakes and mapping jobs.
  Evidence: `sourceMappingQueueStatus.ts` has no intake-run rows in its input or stopping condition.

- Observation: discovery classification hints are more granular than intake target kinds; for example, one result can contain `CLUB`, `TRYOUT`, and `EVENT` together.
  Evidence: `sourceDiscoveryRules.ts` emits opportunity taxonomy values while `sourceIntake.ts` persists only `EVENT`, `RENTAL`, `CLUB`, and legacy `TEAM`. The shared service now deterministically maps event-like hints to `EVENT`, directories to `CLUB`, and rejects `TEAM`-only proposals.

## Decision Log

- Decision: Use `AffiliateSourceIntakes`, `AffiliateSourceIntakePages`, and `AffiliateSourceIntakeRuns` as the durable discovery-to-capture queue.
  Rationale: these records already provide persistence, unique URL keys, compliance status, provider selection, capture retries, and automatic mapping-job creation. A new proposal table would duplicate state and create another handoff to operate.
  Date/Author: 2026-07-31 / Codex

- Decision: Expose one shared deterministic enqueue service to both campaign promotion and Luna instead of allowing Luna to edit discovery campaigns.
  Rationale: campaigns remain responsible for broad search and cursor scheduling; the shared service owns the narrower invariant of turning one evidenced URL into one policy-governed intake.
  Date/Author: 2026-07-31 / Codex

- Decision: Add `EXPANDED` as a terminal mapping result for directory jobs.
  Rationale: a directory that yielded official child URLs completed useful work but did not produce a conventional source package. Marking it `FAILED` would misclassify the result and pollute failure reporting; marking it `REVIEW_REQUIRED` would require fake mapping artifacts.
  Date/Author: 2026-07-31 / Codex

- Decision: Do not auto-approve new domain policies.
  Rationale: the existing compliance boundary requires an explicit current `ALLOWED` policy. Automatically fetching with ScrapingDog before that decision would bypass the established safety contract.
  Date/Author: 2026-07-31 / Codex

- Decision: Bound directory recursion at two expansion levels and reject self-links.
  Rationale: this lets a national directory lead to a regional directory and then to official clubs while preventing unbounded aggregator loops.
  Date/Author: 2026-07-31 / Codex

- Decision: Derive the required next depth from stored parent-page provenance rather than trusting the submitted number.
  Rationale: a worker must not bypass the two-level bound by labeling a child-of-child directory as depth one.
  Date/Author: 2026-07-31 / Codex

## Context and Orientation

`src/server/affiliateImports/sourceDiscovery.ts` runs campaign searches and currently contains a private `promoteDiscoveryResult` implementation. `src/server/affiliateImports/sourceIntake.ts` owns intake/page creation, policy review, capture queueing, and capture processing. `src/server/affiliateImports/sourceMappingQueue.ts` leases mapping work and records terminal states. `src/server/affiliateImports/codexCliGoal.ts` builds the Luna x-high Codex objective. The repository-local instructions Luna follows are `.agents/skills/ingest-affiliate-intakes/SKILL.md`, `.agents/skills/ingest-affiliate-intakes/references/completion-contract.md`, and `docs/affiliate-source-rollout-agent-goal.md`.

The new service will live in `src/server/affiliateImports/sourceUrlIntake.ts`. An "enqueue proposal" is a JSON object containing the official URL and organization name plus optional region, target-kind hints, sport hints, and parent directory provenance. "Promotion" means creating or reusing an intake and applying the existing policy; it does not mean approving an organization, mapping, candidate, or training example.

The CLI will live at `scripts/enqueue-affiliate-source-urls.ts` and be exposed as `npm run affiliate:intakes:enqueue-urls -- --live --input=<json> --result=<result-json> --job=<job-id> --worker=<worker-id>`. Reading proposals from a file avoids shell quoting errors. The script verifies that the parent job is currently claimed by that worker and that every proposal points back to the claimed directory intake. It writes a schema-validated `EXPANDED` completion result to the requested result path so Luna can pass it directly to the normal completion command.

## Plan of Work

First, add strict Zod schemas and a service that accepts a bounded set of proposals. For each proposal, it will validate a public HTTP(S) URL, canonicalize it, reject a parent/self link, enforce maximum expansion depth, look for an existing intake page, approved scrape source, or organization website, and create/reuse an intake only when safe. It will store provenance on the intake page metadata. It will find or create the domain-policy preflight, mirror `BLOCKED` and current `ALLOWED` policies onto the intake, and queue an intake capture for current allowed policies. It will return per-URL outcomes and aggregate counts without aborting the whole file because one row is bad.

Second, refactor discovery-result promotion to call that service and then update the discovery result with the returned intake and status. Existing campaign behavior must remain observable: unknown policy creates an intake for review, allowed policy queues capture, blocked policy blocks, and duplicates stay linked without creating a second intake.

Third, add the CLI with parent-job ownership verification and compact JSON output. Its only live writes are intake/page/policy/capture-queue records allowed by the active Luna goal. It does not browse directory pages; URLs must come from stored intake artifacts and carry evidence URLs. It is idempotent across repeated files.

Fourth, extend the Codex completion schema and mapping queue with terminal `EXPANDED`. An expanded result records proposal totals and needs no branch, commit, source package, logo, candidates, or review scrapes. It must have at least one submitted proposal and no error message. The completion script stores this result with authority `directory-expanded`.

Fifth, extend queue status with queued and running allowed intake captures. `complete` remains false while either exists. Update Luna’s goal text and skill contract so a directory job is expanded, completed, and followed by repeated automation/status checks until child captures produce mapping jobs or all allowed captures reach terminal states.

Finally, add focused unit tests for validation, deduplication, allowed-policy capture queueing, unknown/blocked policy outcomes, depth/self-link rejection, campaign delegation, expanded result validation, and capture-aware exhaustion. Run these Jest files serially, run TypeScript checking, check whitespace, inspect the scoped diff, and commit only the intended files.

## Concrete Steps

Run all commands from `/Users/elesesy/StudioProjects/mvp-site`.

1. Implement schemas and service, then test them:

       npm test -- --runInBand src/server/affiliateImports/__tests__/sourceUrlIntake.test.ts

2. Test the refactored discovery path and completion contracts:

       npm test -- --runInBand src/server/affiliateImports/__tests__/sourceDiscovery.test.ts src/server/affiliateImports/__tests__/codexIngestionResult.test.ts src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts

3. Test queue exhaustion and goal construction:

       npm test -- --runInBand src/server/affiliateImports/__tests__/sourceMappingQueueStatus.test.ts src/server/affiliateImports/__tests__/codexCliGoal.test.ts

4. Run repository checks:

       npx tsc --noEmit
       git diff --check

5. Stage only the files named by this plan, verify the staged diff, and commit:

       git diff --cached --check
       git commit -m "Add automatic affiliate directory expansion"

## Validation and Acceptance

The feature is accepted when all of the following are demonstrated by tests or CLI dry execution:

- submitting the same canonical URL twice creates no duplicate intake or page;
- an already-approved current domain queues at most one ScrapingDog intake run;
- an unknown domain creates a review-required policy/intake but no capture;
- a blocked domain creates no capture and leaves the intake blocked;
- a source/organization duplicate is reported and not recreated;
- a self-link or proposal beyond depth two is rejected;
- an `EXPANDED` result cannot be recorded without at least one submitted URL and cannot masquerade as a review-ready mapping;
- queue status remains incomplete for queued/running allowed capture runs and becomes complete after those runs are terminal and no mapping work remains;
- campaign auto-promotion still has its previous behavior through the shared service;
- Luna’s generated objective names the enqueue command and its new stopping counts;
- no new directory source is automatically approved, no organization/candidate is published, and no training record is promoted.

## Idempotence and Recovery

The page `urlKey`, intake `sourceKey`, active-run lookup, and domain `policyKey` make enqueueing safe to repeat. The CLI processes rows independently and reports rejected rows, so an operator can correct only those rows and resubmit. A current active capture run is reused rather than duplicated. A child URL that already belongs to another intake is returned as a duplicate. If the process stops after intake creation but before policy/capture handling, rerunning the same proposal reuses the page/intake and resumes the policy decision.

No rollback migration is required because this plan adds no database fields or tables. To disable the behavior, stop invoking the enqueue command; existing review-required or queued intake rows remain visible and operable through the current admin pipeline.

## Artifacts and Notes

Expected proposal file shape:

    {
      "schemaVersion": 1,
      "parentJobId": "mapping-job-id",
      "parentIntakeId": "directory-intake-id",
      "proposals": [
        {
          "url": "https://official-club.example/",
          "organizationName": "Official Club",
          "region": "Portland, Oregon",
          "targetKindHints": ["CLUB"],
          "sportHints": ["Soccer"],
          "evidenceUrl": "https://directory.example/clubs",
          "depth": 1
        }
      ]
    }

Expected aggregate outcomes distinguish `CREATED_CAPTURE_QUEUED`, `CREATED_REVIEW_REQUIRED`, `CREATED_BLOCKED`, `REUSED_CAPTURE_QUEUED`, `DUPLICATE`, and `REJECTED` so Luna and operators can see whether useful child work was created.

## Interfaces and Dependencies

`src/server/affiliateImports/sourceUrlIntake.ts` must export:

    type AffiliateSourceUrlProposalBatch
    type AffiliateSourceUrlEnqueueOutcome
    affiliateSourceUrlProposalBatchSchema
    enqueueAffiliateSourceUrlProposals(batch, userId, dependencies?)

The service may depend on the existing Prisma delegates, URL-safety functions, discovery policy-key function, and source-intake create/review/queue functions. It must accept injectable time and preflight fetch dependencies for deterministic tests.

`src/server/affiliateImports/sourceMappingQueueStatus.ts` will accept intake-run rows in addition to intakes and jobs, and its public result will include `queuedCaptureRuns`, `runningCaptureRuns`, and `activeCaptureRuns`.

## Outcomes & Retrospective

Implementation is complete without a schema migration. `sourceUrlIntake.ts` now owns shared canonicalization, origin-aware duplicate checks, parent-evidence verification, depth enforcement, policy reuse/preflight, and idempotent capture queueing. Campaign promotion delegates to it, and `affiliate:intakes:enqueue-urls` verifies the Luna lease and writes a schema-validated `EXPANDED` result artifact. Mapping queue status now waits for allowed queued/running captures, and Luna's goal/skill contract tells it to process those captures and continue mapping their child jobs.

Validation completed on 2026-07-31: six focused Jest suites passed with 30 tests, `npx tsc --noEmit --pretty false` passed, scoped ESLint passed, and `git diff --check` passed. Live deployment, running the updated Luna goal, and reviewing policies for newly discovered domains remain operational follow-up; this implementation does not auto-approve any domain or publish any organization/source/candidate.
