# Make affiliate mapping packages independently reviewable

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

The affiliate mapping agent currently produces source packages in one isolated OVH checkout, while the independent approval agent runs in another checkout. The reviewer cannot resolve the producer commit or inspect the producer's disposable review-scrape database, so otherwise valid mappings are rejected for missing evidence. After this change, the reviewer can inspect the exact committed package through a read-only producer checkout, verify the two claimed review scrapes in the shared disposable database, continue to inspect production only for safety, and apply an approved package from the exact producer commit without merging or publishing it.

The observable outcome is that a mapping package with an official logo and valid evidence can move from `REVIEW_REQUIRED` to `APPROVED` through the Luna reviewer without being rejected merely because the producer and reviewer use separate workspaces. Previously rejected official-logo packages whose only blockers were the broken handoff can be requeued with their original decision preserved in mapping-job history. Packages with manual-review logos or genuine source defects remain blocked.

## Progress

- [x] (2026-08-01 18:40Z) Audited the live mapping, approval, discovery, and capture queues and identified the producer-workspace/disposable-database mismatch.
- [x] (2026-08-01 18:45Z) Paused only `bracketiq-affiliate-approval-agent` so it cannot record more handoff-caused rejections; the ingestion agent and campaign timers remain running.
- [x] (2026-08-01 19:05Z) Implemented a read-only producer-package inspector and exact-commit materialization helper.
- [x] (2026-08-01 19:10Z) Added a mapping-package evidence command that verifies the live result envelope, producer commit/file scope, disposable review-scrape records, candidate sample, and pre-application live safety state without writes.
- [x] (2026-08-01 19:15Z) Updated reviewer skill, goal, deterministic approval preflight, guarded exact-commit application, and focused tests to keep disposable validation separate from live safety checks.
- [x] (2026-08-01 19:20Z) Added a guarded dry-run-first requeue command for official-logo packages rejected or deferred because of the old handoff.
- [x] (2026-08-01 20:05Z) Passed 22 focused tests, TypeScript, targeted ESLint, the skill validator, the complete CI/coverage suite, the production build, and diff validation.
- [x] (2026-08-01 20:10Z) Committed the scoped handoff repair; push remains before deployment.
- [ ] Deploy the exact tested application image, create a clean reviewer checkout with the producer checkout mounted read-only, and restart the approval loop.
- [ ] Requeue the handoff-only cohort and prove at least one package completes review without a missing-commit or missing-review-scrape rejection.

## Surprises & Discoveries

- Observation: both agent containers already share the disposable PostgreSQL network and load `DATABASE_URL=bracketiq-affiliate-codex-postgres/affiliate_codex`, while `DATABASE_URL_LIVE=postgres/bracketiq` points at production.
  Evidence: both containers report those database hosts from their mounted `.env.local`, and the two Nashville review-scrape IDs missing from production both exist in the disposable database.

- Observation: the producer branch is intentionally not pushed, and the approval container has no mount for the producer checkout.
  Evidence: the mapper is at local branch `codex/affiliate-ingestion-live`, while the reviewer is at an older `main`; the latest review explicitly says `git cat-file` cannot resolve the producer commit.

- Observation: live application also assumes the setup script exists in the reviewer checkout, so merely teaching Luna to inspect the producer path would not make approval executable.
  Evidence: `scripts/apply-approved-affiliate-mapping-jobs.ts` resolves the setup script relative to `process.cwd()` before executing it.

- Observation: 130 existing mapping reviews have an official logo disposition and were rejected or deferred under the broken handoff. Fifty-nine rejected packages still have `MANUAL_REVIEW` logos and must not be automatically requeued.
  Evidence: live approval/mapping joins report 74 deferred `OFFICIAL_ASSET`, 55 rejected `OFFICIAL_ASSET`, one rejected `OFFICIAL_SCREENSHOT_CROP`, and 59 rejected `MANUAL_REVIEW` packages.

- Observation: requiring the future live source to exist before `APPROVE` is circular because the approval completion command is the boundary that creates it.
  Evidence: recent reviewer results rejected packages for missing live safety rows even though `apply-approved-affiliate-mapping-jobs.ts` creates the rows only after an approval decision and then enforces the safety postconditions.

- Observation: 64 terminal decisions name both the unavailable package and missing live review scrapes, while 63 older deferred decisions name only the unavailable setup script and one records the unresolved commit in `evidenceReferences` instead of `blockingIssues`.
  Evidence: the first live retry preview selected 64 rows with the narrow two-part wording rule; a grouped decision audit accounted for all 130 official-logo rows and showed that all three forms describe the same producer/reviewer handoff.

## Decision Log

- Decision: mount the producer checkout read-only into the reviewer container instead of pushing hundreds of source commits to GitHub.
  Rationale: the ingestion authority intentionally forbids pushes, the commits already exist durably on the VM, and a read-only mount exposes only the producer repository needed for independent inspection. It does not give the reviewer permission to edit the producer's work.
  Date/Author: 2026-08-01 / Codex

- Decision: distinguish validation evidence from production safety evidence.
  Rationale: the two duplicate-safe scrapes are intentionally performed in a disposable database, while publication, automation, mapping-validation, and existing-object checks must use production. Querying production for disposable run IDs is categorically wrong and caused the rejection loop.
  Date/Author: 2026-08-01 / Codex

- Decision: apply an approved setup from an archive of the exact producer commit rather than from the producer's moving working tree.
  Rationale: the mapper continues committing new packages. Materializing `git archive <commit>` into an ephemeral directory guarantees the applied script and its supporting files match the reviewed commit even after the branch advances.
  Date/Author: 2026-08-01 / Codex

- Decision: requeue only official-logo packages whose old decision contains the known infrastructure evidence blockers and whose producer commit and disposable runs now verify.
  Rationale: blanket retries would incorrectly recycle genuine rejections and manual-logo work. The retry must be dry-run-first, preserve the prior decision in mapping-job history, and be idempotent.
  Date/Author: 2026-08-01 / Codex

- Decision: treat `NOT_APPLIED` as the expected live pre-approval state.
  Rationale: the reviewer must reject a conflicting or already-published live object, but it cannot require a future disabled source to exist before the guarded approval boundary creates and verifies it.
  Date/Author: 2026-08-01 / Codex

## Outcomes & Retrospective

The local implementation and all validation gates are complete. Twenty-two focused tests, TypeScript, targeted ESLint, whitespace validation, the repository-local skill validator, the complete Jest/coverage suite, and the production build pass. Commit, deployment, VM mount recreation, and live requeue acceptance remain. The approval loop is paused, so no new incorrect review decisions are being recorded. Mapping and capture work continue to populate the queue.

## Context and Orientation

`AffiliateSourceMappingJobs` stores the producer's compact result in `resultSummary.result`. That result contains the producer identity, branch, exact 40-character commit, generated paths, logo disposition, candidate count, and two disposable review-scrape IDs with stable hashes. `scripts/complete-affiliate-source-mapping.ts` validates this result and records it in the live queue without applying the package live.

`AffiliateApprovalJobs` is the independent review queue. `src/server/affiliateImports/approvalQueue.ts` reconciles, claims, and completes approvals. `src/server/affiliateImports/codexApprovalGoal.ts` constructs the Luna x-high objective. `.agents/skills/review-affiliate-approvals` defines the evidence and authority contract. `scripts/apply-approved-affiliate-mapping-jobs.ts` is the guarded boundary that may apply an approved setup to production while keeping its organization unlisted, mapping unvalidated, and recurring scrape disabled.

The producer checkout on OVH is `/home/bracketiq/mvp-site-codex-luna-test`. The clean reviewer checkout will be mounted at `/workspace`; the producer checkout will be mounted read-only at `/producer-workspace`. Both containers can reach `bracketiq-affiliate-codex-postgres`, which is disposable validation data, and the private production PostgreSQL network. Secrets remain in the existing read-only environment-file mount and must never be printed.

## Plan of Work

Create `src/server/affiliateImports/producerPackageEvidence.ts` with pure path validation plus small Git process boundaries. It must verify that the exact producer commit exists, every generated path is repository-relative and exists in that commit, and the commit's changed-file list contains the generated package paths. It must report blob hashes and may materialize the exact commit into a temporary directory for guarded application.

Create `scripts/report-affiliate-mapping-package-evidence.ts` and a package command. With `--live --job=<mapping-job-id>`, it reads the mapping result from production, uses `AFFILIATE_PRODUCER_REPOSITORY_ROOT` to inspect the producer commit, and uses the original disposable `DATABASE_URL` to verify both review-scrape rows. It must report source IDs, run statuses/counts, stable claimed hashes, and current disposable candidates without writing either database. It must never mistake disposable run IDs for production run IDs.

Update `codexApprovalGoal.ts`, the reviewer skill, its approval contract, and the approval ExecPlan so Luna runs the evidence command for each mapping claim. The reviewer must inspect files with `git -C /producer-workspace show <commit>:<path>` or the evidence command, run focused tests against the read-only producer tree when useful, inspect disposable candidates for content correctness, and use production only for the unpublished/disabled/unvalidated safety state.

Update `scripts/apply-approved-affiliate-mapping-jobs.ts` to take the producer root from `AFFILIATE_PRODUCER_REPOSITORY_ROOT`, verify the reviewed commit, archive it to a temporary directory, link the already-installed `node_modules`, run the exact setup script there, and remove the temporary directory in `finally`. Existing live postconditions remain mandatory.

Create a dry-run-first retry service and CLI for mapping approval rows. Selection requires a mapping subject, `REJECTED` or `DEFERRED` approval state, a valid `REVIEW_REQUIRED` ingestion result with an official logo disposition, known handoff-blocker text, verified producer evidence, and both disposable run rows. Applying archives the old decision into `resultSummary.approvalReviewHistory`, restores a rejected mapping job to `REVIEW_REQUIRED`, keeps its intake `REVIEW_REQUIRED`, and resets the unique approval row to `QUEUED`. Manual-logo packages remain untouched.

On OVH, preserve the old dirty reviewer checkout, create a new clean checkout at the exact tested main commit, install dependencies, and recreate only the approval container with the same user, capabilities, networks, Codex state, and environment mounts plus the producer checkout read-only at `/producer-workspace`. Restart the approval loop only after the evidence command succeeds for a known previously rejected package.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site` and preserve the unrelated untracked legacy Portland files.

Run focused validation while implementing:

    npm test -- --runInBand src/server/affiliateImports/__tests__/producerPackageEvidence.test.ts src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts src/server/affiliateImports/__tests__/approvalQueue.test.ts
    npx tsc --noEmit
    git diff --check

Before deployment run:

    npm run test:ci
    npm run build
    git diff --cached --check

The production retry must first run without `--apply` and print only the 130 currently expected official-logo handoff failures. After the reviewer container can verify one sample package, rerun with `--apply` and confirm those jobs become claimable without touching the 59 manual-logo rows.

## Validation and Acceptance

Tests must prove that generated paths cannot escape the producer repository, a missing commit or missing commit path fails evidence verification, an advancing producer `HEAD` does not change materialization of an older commit, and the exact archived setup path is selected. The evidence report must distinguish live mapping metadata from disposable scrape rows and fail when either scrape is absent, unsuccessful, or has the wrong count.

Goal tests must assert that Luna is explicitly instructed to use the producer evidence command, read-only producer root, disposable database for review scrapes, and production for safety state. The reviewer must remain prohibited from editing producer work, publishing, enabling automation, validating a mapping, pushing, or approving training data.

Retry tests must prove that only known handoff failures with official logos are eligible, manual-review logos remain terminal, prior decisions are preserved, repeated dry runs do not write, and repeated apply runs do not duplicate history or queue entries.

Live acceptance requires one formerly rejected official-logo package to produce a reviewer decision that cites a resolvable producer commit and two found disposable scrapes. An `APPROVE` decision must apply the exact commit and leave the created organization unlisted, its page disabled, recurring scraping disabled, and mapping unvalidated. It need not publish the organization or candidates.

## Idempotence and Recovery

Evidence reporting is read-only. Exact-commit archives are created under the operating system temporary directory and removed in `finally`; rerunning produces the same blobs. Retry preview is read-only, and apply updates only rows that still match the expected terminal state. The old approval decision is appended once before reset. A subsequent apply sees the row as queued or claimed and skips it.

If the new reviewer container fails, stop and remove only that named container, then restart the preserved old configuration without starting its loop. The mapper and campaign services do not need to stop. If approval application fails after the setup script runs, its existing idempotent source setup and live safety checks permit retry, while the approval row remains claimed until lease recovery.

## Artifacts and Notes

The handoff is intentionally asymmetric:

    producer checkout (read/write for mapper)
        -> read-only Git commit and files for reviewer
        -> disposable PostgreSQL for duplicate-safe scrape evidence
        -> production PostgreSQL only for queue state and guarded unpublished application

No Docker socket, host root, production filesystem, or write access to the producer checkout is granted to the reviewer.

## Interfaces and Dependencies

`src/server/affiliateImports/producerPackageEvidence.ts` must export a structured inspection result and functions to inspect and materialize a producer commit. It may use Node's `child_process`, `crypto`, `fs`, `os`, and `path`; no new package is required.

`scripts/report-affiliate-mapping-package-evidence.ts` is exposed as:

    npm run affiliate:approvals:package-evidence -- --live --job=<mapping-job-id>

The producer root comes from `AFFILIATE_PRODUCER_REPOSITORY_ROOT` and is required for live mapping review. The disposable database URL is captured before `configureAffiliateLiveDatabaseEnvironment` changes Prisma's active URL.

The guarded retry is exposed as:

    npm run affiliate:approvals:retry-handoff -- --live
    npm run affiliate:approvals:retry-handoff -- --live --apply

Revision note (2026-08-01): Created after live evidence proved the reviewer was querying the wrong repository and database. The design preserves independent review while making the producer's exact immutable evidence available.
