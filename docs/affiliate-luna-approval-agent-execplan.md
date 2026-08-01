# Add an independent Luna approval agent for affiliate intakes and source packages

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

BracketIQ currently pauses newly discovered domains at policy review and mapping packages at source review. After this change, a second Codex CLI process pinned to Luna x-high can independently inspect those approval items, apply evidence-backed decisions, and keep the capture-to-mapping pipeline moving without waiting for the operator to approve every routine item. The reviewer remains separate from the ingestion worker and leaves a durable decision record.

The reviewer may allow or block an intake domain after checking stored robots and policy evidence, and may apply a review-ready source package to the live database after independently checking its commit, stored evidence, tests, duplicate-safe scrapes, official logo, and unpublished state. It may defer or reject uncertain work. It never publishes organizations or candidates, enables recurring scraping, validates mappings, approves training data, or approves work produced under its own reviewer identity.

## Progress

- [x] (2026-07-31) Read the skill-creator instructions and initialized the repository-local `review-affiliate-approvals` skill.
- [x] (2026-07-31) Audited the existing domain-policy review, mapping-result approval, and live application paths.
- [x] (2026-07-31) Added a durable affiliate approval queue, migration, and generated Prisma client.
- [x] (2026-07-31) Added deterministic reconcile, claim, status, evidence-refresh, and completion services and CLIs.
- [x] (2026-07-31) Added the Luna x-high reviewer goal launcher and finished the repository-local skill contract.
- [x] (2026-07-31) Added a low-cost polling loop that launches Luna only when approval work is claimable and awaits the goal process before checking again.
- [x] (2026-07-31) Added focused tests, validated the skill, and passed repository-wide checks.
- [x] (2026-07-31) Prepared the scoped implementation commit without staging unrelated VM scrape-timer and legacy-source work.

## Surprises & Discoveries

- Observation: the current mapping application script already enforces useful live safety checks: one evidence-matched source, an official logo, an unlisted organization, disabled automation, an unvalidated mapping, a successful review scrape, and the expected candidate count.
  Evidence: `scripts/apply-approved-affiliate-mapping-jobs.ts` performs these checks before marking the mapping job approved.

- Observation: child intakes created by directory expansion do not necessarily have an `AffiliateSourceDiscoveryResults` row, while `applyAffiliateSourceDomainPolicy` currently finds affected intakes only through discovery results.
  Evidence: `sourceUrlIntake.ts` creates child intake/page records directly, but `sourceDiscovery.ts` derives policy-linked intake IDs from discovery-result rows.

- Observation: the existing mapping reviewer is recommendation-only and consumes the open-weight worker-result contract, not the Codex ingestion-result contract.
  Evidence: `agentReview.ts` sets an explicit recommendation-only authority notice and `codexIngestionResult.ts` defines a different result shape.

- Observation: the local Mac checkout does not currently expose a runnable Codex CLI, so the launcher can be dry-run here but a live goal cannot be executed from this machine.
  Evidence: `affiliate:approvals:codex-goal:dry-run` reported `cliAvailable: false`; the VM remains the intended runtime.

- Observation: the official Codex manual documents `codex exec` as the supported non-interactive interface, `workspace-write` as the preferred explicit sandbox for unattended edits, and persisted goals as stable.
  Evidence: the current Codex manual's CLI, non-interactive, and configuration sections were checked before finalizing the launcher arguments.

## Decision Log

- Decision: Create a separate durable `AffiliateApprovalJobs` queue instead of overloading mapping-job status or embedding leases inside policy JSON.
  Rationale: policy and mapping approvals need one auditable lease protocol, independent reviewer identity, crash recovery, and terminal dispositions. Reusing policy status or mapping worker fields would lose provenance and make concurrency fragile.
  Date/Author: 2026-07-31 / Codex

- Decision: Support `DOMAIN_POLICY` and `MAPPING_PACKAGE` subjects initially.
  Rationale: these are the gates that stop newly discovered sites from capture and review-ready packages from becoming disabled live sources. Candidate publication, organization publication, recurring schedule enablement, mapping validation, and training approval remain separate higher-impact decisions.
  Date/Author: 2026-07-31 / Codex

- Decision: Require a different reviewer identity from the producer identity recorded in a mapping package.
  Rationale: an agent should not independently approve its own work. The deterministic completion service enforces this even if the prompt is ignored.
  Date/Author: 2026-07-31 / Codex

- Decision: Let Luna choose `ALLOW`, `BLOCK`, or `DEFER` for domain policy and `APPROVE`, `REJECT`, or `DEFER` for mapping packages, but validate every decision through a strict JSON schema and server-side preconditions.
  Rationale: the model handles evidence interpretation while code owns identities, allowed transitions, and side effects.
  Date/Author: 2026-07-31 / Codex

- Decision: Keep queue polling deterministic and model-free, and launch Luna only when `claimableJobs` is greater than zero.
  Rationale: an always-running Luna session would waste tokens while idle. A small process can reconcile/query PostgreSQL cheaply, hold an advisory lock, and invoke the persisted Luna goal only when there is actual approval work to drain.
  Date/Author: 2026-07-31 / Codex

- Decision: Hold the PostgreSQL advisory lock for the entire child goal process and await that process before querying or launching again.
  Rationale: this directly enforces the operator's requirement that the checker remain dormant until the active Luna goal has finished. A focused deferred-promise test proves that the post-goal queue query cannot run early.
  Date/Author: 2026-07-31 / Codex

- Decision: Refresh policy evidence through a bounded, SSRF-safe repository command before Luna makes a terminal domain decision.
  Rationale: the initial intake preflight stored robots evidence and likely policy URLs, but did not capture the policy bodies Luna needs to distinguish allow, block, and defer safely.
  Date/Author: 2026-07-31 / Codex

## Outcomes & Retrospective

The implementation now has one durable queue for domain-policy and mapping-package reviews, a strict reviewer-result contract, independent-producer enforcement, bounded policy evidence capture, guarded live application, and a model-free outer loop that cannot relaunch while its Luna child goal is running.

Validation passed on 2026-07-31:

- All 28 focused affiliate approval/discovery tests passed.
- The full Jest suite passed with its existing expected console warnings.
- `npx tsc --noEmit --pretty false` passed.
- Targeted ESLint passed.
- `npm run prisma:check` passed and regenerated the tracked client.
- The repository-local skill passed `quick_validate.py` using an ephemeral PyYAML runtime.
- The Luna goal dry-run produced `gpt-5.6-luna`, `xhigh`, the stable reviewer identity, the skill, and `codex exec`; live execution remains for the authenticated VM.

Operational follow-up after commit/deploy is to apply the migration, verify `codex login status` on the VM, dry-run the goal there, then start `npm run affiliate:approvals:loop -- --live --worker=codex-luna-approval-vm-1 --interval-seconds=300`. The loop's advisory lock remains held until each spawned goal exits.

## Context and Orientation

`src/server/affiliateImports/sourceDiscovery.ts` applies domain policies and queues captures. `src/server/affiliateImports/sourceIntake.ts` records intake compliance reviews. `src/server/affiliateImports/codexIngestionResult.ts` validates Luna ingestion packages. `src/server/affiliateImports/codexIngestionApproval.ts` selects mapping packages that are structurally eligible for live application. `scripts/apply-approved-affiliate-mapping-jobs.ts` applies one eligible setup script live while keeping the resulting organization unpublished, automation disabled, and mapping unvalidated.

An approval job is a durable database row that points to either a domain-policy key or a mapping-job ID. `QUEUED` and expired `CLAIMED` rows are available work. `APPROVED`, `BLOCKED`, `REJECTED`, `DEFERRED`, and `FAILED` rows are terminal. A reviewer claims one row at a time with a stable worker identity and lease.

The skill lives at `.agents/skills/review-affiliate-approvals`. The launcher lives at `scripts/run-affiliate-approval-codex-goal.ts` and pins `gpt-5.6-luna` with x-high reasoning, persisted goals, no interactive approval prompts, and the repository-local skill.

## Plan of Work

Add `AffiliateApprovalJobs` to `prisma/schema.prisma` with subject type/key uniqueness, lease fields, reviewer identity, decision JSON, error, and timestamps. Add a deployable SQL migration. No foreign-key relation is required because the subject may be a policy key or mapping-job ID.

Create `src/server/affiliateImports/approvalQueue.ts`. Reconciliation creates missing queued jobs for `NEEDS_REVIEW` domain policies and `REVIEW_REQUIRED` mapping jobs. Claiming atomically leases the oldest eligible row. Status summarizes claimable, active, malformed, and terminal work. Completion validates a strict reviewer result, verifies the claim owner and subject identity, prevents mapping self-approval, and applies only the permitted subject-specific side effects.

For an allowed domain, extend `applyAffiliateSourceDomainPolicy` so it finds every matching intake by canonical policy key, including directory-expansion children without discovery-result rows, records the review, and queues capture. For a blocked domain it marks all matching intakes blocked. A deferred decision changes only the approval job.

For an approved mapping package, reuse the existing live apply command and its safety gates, but require the reviewer result artifact and reviewer identity. Rejecting records the exact blocking reason and terminates the mapping package without turning it into training data. Deferring leaves the mapping package review-required but prevents an automatic approval loop.

Add scripts and package commands for reconcile, queue status, claim/export, complete, and the Codex approval goal. The claim output identifies the subject and tells Luna which stored evidence/export command to inspect. The completion command reads one JSON file and records one terminal outcome.

Add `scripts/run-affiliate-approval-loop.ts` as the cheap outer loop. Each polling cycle acquires a PostgreSQL advisory lock, reconciles missing approval jobs, reads queue status, and launches the Luna goal only when claimable work exists. It waits for the goal process to finish, then checks again because approvals may have queued captures or exposed additional work. `--once` supports a system timer; persistent mode uses a bounded configurable polling interval. The loop itself never asks a model to inspect an empty queue.

Finish the skill with concise core instructions and a detailed approval contract reference. Generate and validate its `agents/openai.yaml`. Update the ingestion goal so it reports policy-review work as pending reviewer work rather than asking the operator for routine decisions.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-site`.

    npm run prisma:validate
    npm test -- --runInBand src/server/affiliateImports/__tests__/approvalQueue.test.ts src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts src/server/affiliateImports/__tests__/sourceDiscovery.test.ts
    npx tsc --noEmit --pretty false
    python3 /Users/elesesy/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/review-affiliate-approvals
    git diff --check

Before committing, stage only the files named in this plan, run `git diff --cached --check`, and preserve unrelated VM timer and legacy-source changes already present in the worktree.

## Validation and Acceptance

Tests must demonstrate that reconciliation is idempotent, claims are atomic, expired claims can be recovered, and malformed or active claims prevent false exhaustion. A domain reviewer must be able to allow a directory child intake that has no discovery-result row and observe a capture run queued. Blocking must never queue capture. Deferral must have no subject side effects.

A mapping approval must fail when reviewer and producer identities match, when the ingestion package is malformed, when the logo remains manual-review, or when required validation is absent. A structurally eligible independent approval may invoke the existing live application path, but tests must replace that process boundary with a deterministic stub. Rejection and deferral must not publish or create a positive training example.

The generated Luna objective must name the reviewer skill, all queue commands, both subject types, the independent-review rule, and the prohibited publication/training/automation actions. The skill validator, focused Jest suites, TypeScript, ESLint, Prisma validation, and diff checks must pass.

## Idempotence and Recovery

Approval reconciliation uses a unique subject type/key pair, so repeated runs create no duplicates. Claim updates are conditional on status and lease expiry. If Luna stops after claim, the lease eventually expires and another reviewer may reclaim it. Completion is conditional on the claimed reviewer and current subject state. Re-running a completed decision returns the existing terminal row without reapplying side effects.

Domain-policy application already upserts the policy and intake history; capture queueing reuses an active run. Mapping live application is idempotent through source setup scripts and changes the mapping job from `REVIEW_REQUIRED` to `APPROVED` exactly once.

## Artifacts and Notes

The reviewer result is compact JSON containing schema version, approval job ID, subject type/key, reviewer ID, decision, confidence, evidence references, checks, rationale, and blocking issues. It never contains credentials, raw cookies, signed URLs, or full provider envelopes.

## Interfaces and Dependencies

`src/server/affiliateImports/approvalResult.ts` exports the strict result schema and TypeScript type. `src/server/affiliateImports/approvalQueue.ts` exports reconciliation, claim, status summarization, and completion functions. `src/server/affiliateImports/codexApprovalGoal.ts` builds the Luna x-high objective and CLI arguments.

The public commands are:

    npm run affiliate:approvals:reconcile -- --live
    npm run affiliate:approvals:queue-status -- --live
    npm run affiliate:approvals:claim -- --live --worker=<reviewer-id>
    npm run affiliate:approvals:complete -- --live --job=<approval-job-id> --result=<review-json>
    npm run affiliate:approvals:codex-goal -- --live --worker=<reviewer-id>
    npm run affiliate:approvals:loop -- --live --interval-seconds=300

Revision note (2026-07-31): Created the plan after auditing existing intake policy and mapping-package approval boundaries. The design uses a separate durable approval queue so reviewer identity and side effects remain independently auditable.

Revision note (2026-07-31): Recorded the completed queue, bounded policy evidence, independent Luna skill/goal, single-child polling invariant, and validation results. Deployment and authenticated VM execution remain intentionally separate from this code commit.
