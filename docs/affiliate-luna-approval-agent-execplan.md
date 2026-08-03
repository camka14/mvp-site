# Add an independent Luna approval agent for affiliate intakes and source packages

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

BracketIQ currently pauses newly discovered domains at policy review and mapping packages at source review. After this change, a second Codex CLI process pinned to Luna max in fast mode can independently inspect those approval items, apply evidence-backed decisions, and keep the capture-to-mapping pipeline moving without waiting for the operator to approve every routine item. The reviewer remains separate from the ingestion worker and leaves a durable decision record.

The reviewer may allow or block an intake domain after checking stored robots and policy evidence. It blocks only an explicit prohibition that applies to the target public path. It allows capture when the bounded check finds no explicit prohibition, including when policy resources are missing or inaccessible. The reviewer may apply a review-ready source package to the live database after it independently checks the commit, stored evidence, tests, duplicate-safe scrapes, logo evidence, and unpublished state. When a bounded review establishes that no official logo is present, the reviewer may explicitly accept the logo absence without weakening any other package check. It may defer or reject uncertain mapping work. It never publishes organizations or candidates, enables recurring scraping, validates mappings, approves training data, or approves work produced under its own reviewer identity.

## Progress

- [x] (2026-07-31) Read the skill-creator instructions and initialized the repository-local `review-affiliate-approvals` skill.
- [x] (2026-07-31) Audited the existing domain-policy review, mapping-result approval, and live application paths.
- [x] (2026-07-31) Added a durable affiliate approval queue, migration, and generated Prisma client.
- [x] (2026-07-31) Added deterministic reconcile, claim, status, evidence-refresh, and completion services and CLIs.
- [x] (2026-07-31) Added the Luna reviewer goal launcher and finished the repository-local skill contract.
- [x] (2026-07-31) Added a low-cost polling loop that launches Luna only when approval work is claimable and awaits the goal process before checking again.
- [x] (2026-07-31) Added focused tests, validated the skill, and passed repository-wide checks.
- [x] (2026-07-31) Prepared the scoped implementation commit without staging unrelated VM scrape-timer and legacy-source work.
- [x] (2026-08-01) Repaired the producer-to-reviewer handoff so exact commits and disposable review scrapes are independently verifiable across isolated containers; requeued 116 handoff-only decisions and completed one formerly rejected package through guarded live approval.
- [ ] (2026-08-01) Repair generated guarded-live setup compatibility, requeue producer-fixable terminal packages, and route unresolved manual-logo packages through a fresh producer evidence pass before independent re-review.
- [x] (2026-08-02) Made verified logo absence an explicit non-blocking mapping approval state and added deterministic recovery that returns logo-only terminal packages to the independent reviewer queue.
- [x] (2026-08-01) Upgraded the approval launcher to `max` reasoning and persisted Codex fast mode through `service_tier="fast"` and `features.fast_mode=true`.
- [ ] (2026-08-02) Require independent source-derived description review and add an armed one-time mapping rereview cohort that waits for current producer and reviewer work to finish.
- [x] (2026-08-01) Changed domain review to default allow when no explicit target-path prohibition exists and added a guarded deferred-policy requeue with decision-history preservation.
- [x] (2026-08-01) Previewed and requeued 249 live deferred domain policies without restarting the approval loop. The same cutoff then returned zero eligible deferred policies.
- [x] (2026-08-02) Added configurable reviewer pools, unique reviewer IDs, concurrent claim tests, worker-specific progress files, and required valid-event-division review.
- [x] (2026-08-02) Required reviewers to accept an evidenced city or region centroid when an organization has no street address and to return a missing defensible fallback as `ORGANIZATION_LOCATION_INVALID` producer repair.

## Surprises & Discoveries

- Observation: every current mapping job in `HUMAN_REVIEW_REQUIRED` was marked by the Luna reviewer, not by the legacy pre-reviewer workflow.
  Evidence: the 2026-08-03 live audit found 82 terminal jobs, all with a `humanReviewRequired` envelope and reviewer ID `codex-luna-approval-vm-1`. Luna deferred 76 for insufficient evidence and rejected six that then exceeded the automatic producer-repair limit.

- Observation: the mapping application script enforces useful live safety checks: one evidence-matched source, an official logo or an explicit accepted-logo-absence flag, an unlisted organization, disabled automation, an unvalidated mapping, a successful review scrape, and the expected candidate count.
  Evidence: `scripts/apply-approved-affiliate-mapping-jobs.ts` performs these checks before marking the mapping job approved.

- Observation: child intakes created by directory expansion do not necessarily have an `AffiliateSourceDiscoveryResults` row, while `applyAffiliateSourceDomainPolicy` currently finds affected intakes only through discovery results.
  Evidence: `sourceUrlIntake.ts` creates child intake/page records directly, but `sourceDiscovery.ts` derives policy-linked intake IDs from discovery-result rows.

- Observation: the existing mapping reviewer is recommendation-only and consumes the open-weight worker-result contract, not the Codex ingestion-result contract.
  Evidence: `agentReview.ts` sets an explicit recommendation-only authority notice and `codexIngestionResult.ts` defines a different result shape.

- Observation: the local Mac checkout does not currently expose a runnable Codex CLI, so the launcher can be dry-run here but a live goal cannot be executed from this machine.
  Evidence: `affiliate:approvals:codex-goal:dry-run` reported `cliAvailable: false`; the VM remains the intended runtime.

- Observation: the official Codex manual documents `codex exec` as the supported non-interactive interface, `workspace-write` as the preferred explicit sandbox for unattended edits, and persisted goals as stable.
  Evidence: the current Codex manual's CLI, non-interactive, and configuration sections were checked before finalizing the launcher arguments.

- Observation: the deployed reviewer looked for producer commits in its own checkout and disposable review-scrape IDs in production, causing systematic false rejections.
  Evidence: every official-logo rejection or deferral cited commit/package and review-scrape visibility, while the claimed runs exist in `bracketiq-affiliate-codex-postgres` and the commits exist in the mapper checkout.

- Observation: 65 rejected packages were blocked only because the exact setup script refused guarded `--live` application, while 58 rejected packages cited unresolved manual-logo evidence.
  Evidence: the live approval-job audit on 2026-08-01 grouped blocking issues across all terminal mapping-package reviews.

- Observation: 249 domain-policy approvals were deferred even though most bounded checks completed and the common resource outcomes were missing or inaccessible policy pages, not explicit capture prohibitions.
  Evidence: the live audit found 249 `DEFERRED` `DOMAIN_POLICY` jobs linked to `NEEDS_REVIEW` policies. Of those jobs, 245 recorded both robots and terms checks. Stored policy-resource outcomes were dominated by HTTP 404, 200, and 403 responses.

- Observation: a reviewer pool can preserve the original no-relaunch invariant.
  Evidence: the outer loop holds one advisory lock and now awaits every reviewer promise in the active pool before it reconciles or checks the queue again.

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

- Decision: Verify immutable producer files through a read-only producer mount and review scrapes through the disposable database.
  Rationale: independent review requires access to producer evidence, not duplication into the reviewer's checkout or production. Production remains authoritative for safety state and guarded application only.
  Date/Author: 2026-08-01 / Codex

- Decision: Let Luna choose `ALLOW`, `BLOCK`, or `DEFER` for domain policy and `APPROVE`, `REJECT`, or `DEFER` for mapping packages, but validate every decision through a strict JSON schema and server-side preconditions.
  Rationale: the model handles evidence interpretation while code owns identities, allowed transitions, and side effects.
  Date/Author: 2026-07-31 / Codex

- Decision: Keep queue polling deterministic and model-free, and launch Luna only when `claimableJobs` is greater than zero.
  Rationale: an always-running Luna session would waste tokens while idle. A small process can reconcile/query PostgreSQL cheaply, hold an advisory lock, and invoke the persisted Luna goal only when there is actual approval work to drain.
  Date/Author: 2026-07-31 / Codex

- Decision: Hold the PostgreSQL advisory lock for the entire child goal process and await that process before querying or launching again.
  Rationale: this directly enforces the operator's requirement that the checker remain dormant until the active Luna goal has finished. A focused deferred-promise test proves that the post-goal queue query cannot run early.
  Date/Author: 2026-07-31 / Codex

- Decision: interpret the child boundary as one fixed reviewer pool instead of one process.
  Rationale: this permits a configurable reviewer count while preserving the operator requirement that the checker not launch another cycle until all current reviewers finish.
  Date/Author: 2026-08-02 / Codex

- Decision: treat a missing or incomplete event division as a concrete producer defect.
  Rationale: the package evidence command now reports deterministic division quality. The reviewer can return the package for repair instead of guessing a classification or approving an unusable event.
  Date/Author: 2026-08-02 / Codex

- Decision: Refresh policy evidence through a bounded, SSRF-safe repository command before Luna makes a terminal domain decision.
  Rationale: the initial intake preflight stored robots evidence and likely policy URLs, but did not capture the policy bodies Luna needs to distinguish allow, block, and defer safely.
  Date/Author: 2026-07-31 / Codex

- Decision: Allow public capture unless stored evidence contains an explicit prohibition that applies to the target path.
  Rationale: most public sites do not publish a capture policy. Missing, inaccessible, silent, or ambiguous policy resources are not explicit prohibitions. The reviewer still runs a bounded check, records its outcomes, and honors path-specific robots or policy restrictions.
  Date/Author: 2026-08-01 / Codex

- Decision: Send `MANUAL_REVIEW` logo packages back to the producer when stored official evidence may be repairable, and defer only when no official mark can be verified.
  Rationale: the independent reviewer must not edit producer files, while approving a logo-less package would violate the guarded live application checks. A producer repair preserves evidence, image normalization, and commit ownership.
  Date/Author: 2026-08-01 / Codex

- Decision: Supersede logo-as-mandatory approval with an explicit `logoAbsenceAccepted` check after a bounded logo review.
  Rationale: an otherwise-valid organization and mapping remain useful without a logo. The reviewer still searches stored and official-site evidence, returns a package to the producer when an official mark is found but not packaged, and records a distinct auditable absence flag when no mark exists. Missing or contradictory evidence still defers; confirmed absence does not.
  Date/Author: 2026-08-02 / Codex

- Decision: run the Luna approval goal with `model_reasoning_effort=max`, `service_tier="fast"`, and `features.fast_mode=true`.
  Rationale: approvals benefit from the strongest configured reasoning effort, while the fast service tier reduces review latency. Keeping all three settings in the tested argument vector and preflight output makes the runtime mode auditable.
  Date/Author: 2026-08-01 / Codex

- Decision: Store an armed full-review cohort as a non-claimable approval control row and advance it from the existing model-free loop.
  Rationale: The existing unique subject type/key pair provides durable idempotency without adding a second queue table. A custom waiting status keeps the control row out of Luna claims. The loop can wait for strict producer, capture, and approval completion before it atomically requeues approved mappings.
  Date/Author: 2026-08-02 / Codex

## Outcomes & Retrospective

The implementation now has one durable queue for domain-policy and mapping-package reviews, a strict reviewer-result contract, independent-producer enforcement, bounded policy and logo evidence capture, guarded live application with an explicit missing-logo exception, deterministic division evidence, and a configurable reviewer pool. The model-free outer loop cannot relaunch until every reviewer in its active pool exits.

The domain reviewer now defaults to `ALLOW` after a bounded check finds no explicit prohibition for the target public path. A missing or inaccessible policy resource is a recorded check outcome, not a reason to defer. The guarded requeue preserves the earlier decision in policy evidence before it returns the approval to `QUEUED`.

Validation passed on 2026-08-01:

- All 34 focused approval, result-schema, policy-evidence, goal, and requeue tests passed.
- `npx tsc --noEmit --pretty false` passed.
- Targeted ESLint passed.
- The repository-local reviewer skill passed `quick_validate.py`.
- The longest valid reviewer ID produced a 3,884-character objective, below the 4,000-character limit.

Live verification passed on 2026-08-01:

- Both behavior commits passed exact-SHA GitHub CI.
- The fixed-cutoff dry-run selected 249 `DEFERRED` `DOMAIN_POLICY` approvals linked to `NEEDS_REVIEW` policies.
- Apply mode requeued all 249 rows and preserved each prior decision in policy evidence history.
- A second dry-run with the same cutoff and an expected count of zero found no eligible deferred policy.
- The subject-and-status grouping showed that all 21 remaining deferred approvals were mapping packages.
- Luna allowed `lacity.gov` after four policy resources returned HTTP 403 because none contained an explicit prohibition for the target public path. It set all terminal policy checks to true and recorded no blocking issue.

Validation passed on 2026-07-31:

- All 28 focused affiliate approval/discovery tests passed.
- The full Jest suite passed with its existing expected console warnings.
- `npx tsc --noEmit --pretty false` passed.
- Targeted ESLint passed.
- `npm run prisma:check` passed and regenerated the tracked client.
- The repository-local skill passed `quick_validate.py` using an ephemeral PyYAML runtime.
- The Luna goal dry-run produced `gpt-5.6-luna`, `max`, service tier `fast`, fast mode `true`, the stable reviewer identity, the skill, and `codex exec`; live execution remains for the authenticated VM.

Operational follow-up after commit/deploy is to apply the migration, verify `codex login status` on the VM, dry-run the goal there, then start `npm run affiliate:approvals:loop -- --live --worker=codex-luna-approval-vm-1 --interval-seconds=300`. The loop's advisory lock remains held until each spawned goal exits.

## Context and Orientation

`src/server/affiliateImports/sourceDiscovery.ts` applies domain policies and queues captures. `src/server/affiliateImports/sourceIntake.ts` records intake compliance reviews. `src/server/affiliateImports/codexIngestionResult.ts` validates Luna ingestion packages. `src/server/affiliateImports/codexIngestionApproval.ts` selects mapping packages that are structurally eligible for live application. `scripts/apply-approved-affiliate-mapping-jobs.ts` applies one eligible setup script live while keeping the resulting organization unpublished, automation disabled, and mapping unvalidated.

An approval job is a durable database row that points to either a domain-policy key or a mapping-job ID. `QUEUED` and expired `CLAIMED` rows are available work. `APPROVED`, `BLOCKED`, `REJECTED`, `DEFERRED`, and `FAILED` rows are terminal. A reviewer claims one row at a time with a stable worker identity and lease.

The optional `--force-mapping-review-cohort=<key>` loop flag creates one non-claimable `MAPPING_FULL_REVIEW_COHORT` control row. It records its arm time as the mapping cutoff. It remains `WAITING_FOR_MAPPING_DRAIN` while producer leases, mapping/capture work, first-pass mapping reviews, or approval work remain. It changes to `ENQUEUED_FOR_REVIEW` after one transaction returns cutoff-eligible approved mapping packages to the reviewer. Reusing the same key cannot enqueue them twice.

The skill lives at `.agents/skills/review-affiliate-approvals`. The launcher lives at `scripts/run-affiliate-approval-codex-goal.ts` and pins `gpt-5.6-luna` with max reasoning, persisted fast mode, persisted goals, no interactive approval prompts, and the repository-local skill.

## Plan of Work

Add `AffiliateApprovalJobs` to `prisma/schema.prisma` with subject type/key uniqueness, lease fields, reviewer identity, decision JSON, error, and timestamps. Add a deployable SQL migration. No foreign-key relation is required because the subject may be a policy key or mapping-job ID.

Create `src/server/affiliateImports/approvalQueue.ts`. Reconciliation creates missing queued jobs for `NEEDS_REVIEW` domain policies and `REVIEW_REQUIRED` mapping jobs. Claiming atomically leases the oldest eligible row. Status summarizes claimable, active, malformed, and terminal work. Completion validates a strict reviewer result, verifies the claim owner and subject identity, prevents mapping self-approval, and applies only the permitted subject-specific side effects.

For an allowed domain, extend `applyAffiliateSourceDomainPolicy` so it finds every matching intake by canonical policy key, including directory-expansion children without discovery-result rows, records the review, and queues capture. For a blocked domain it marks all matching intakes blocked. A deferred decision changes only the approval job.

For an approved mapping package, reuse the existing live apply command and its safety gates, but require the reviewer result artifact and reviewer identity. Rejecting records the exact blocking reason and terminates the mapping package without turning it into training data. Deferring leaves the mapping package review-required but prevents an automatic approval loop.

Add scripts and package commands for reconcile, queue status, claim/export, complete, and the Codex approval goal. The claim output identifies the subject and tells Luna which stored evidence/export command to inspect. The completion command reads one JSON file and records one terminal outcome.

Add `scripts/run-affiliate-approval-loop.ts` as the cheap outer loop. Each polling cycle acquires a PostgreSQL advisory lock, reconciles missing approval jobs, reads queue status, and launches the Luna goal only when claimable work exists. It waits for the goal process to finish, then checks again because approvals may have queued captures or exposed additional work. `--once` supports a system timer; persistent mode uses a bounded configurable polling interval. The loop itself never asks a model to inspect an empty queue.

Add `src/server/affiliateImports/domainPolicyRequeue.ts` and a guarded CLI. It selects only `DEFERRED` `DOMAIN_POLICY` approvals linked to `NEEDS_REVIEW` policies. It limits selection to rows updated before an operator-supplied cutoff. Apply mode also requires an exact expected count. Before reset, it appends the prior reviewer, decision, attempt count, and finish time to the policy evidence history. It then resets only the approval lease and terminal decision fields.

Include the explicit-prohibition-only standard in every claimed domain subject. The claim command runs as a fresh process for each job. This makes the active policy standard visible to a reviewer goal that started before a checkout update, without stopping or restarting that goal.

Finish the skill with concise core instructions and a detailed approval contract reference. Generate and validate its `agents/openai.yaml`. Update the ingestion goal so it reports policy-review work as pending reviewer work rather than asking the operator for routine decisions.

## Concrete Steps

Run from `/Users/elesesy/StudioProjects/mvp-site`.

    npm run prisma:validate
    npm test -- --runInBand src/server/affiliateImports/__tests__/approvalQueue.test.ts src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts src/server/affiliateImports/__tests__/sourceDiscovery.test.ts
    npm test -- --runInBand src/server/affiliateImports/__tests__/domainPolicyRequeue.test.ts
    npx tsc --noEmit --pretty false
    python3 /Users/elesesy/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/review-affiliate-approvals
    git diff --check

Before committing, stage only the files named in this plan, run `git diff --cached --check`, and preserve unrelated VM timer and legacy-source changes already present in the worktree.

## Validation and Acceptance

Tests must demonstrate that reconciliation is idempotent, claims are atomic, expired claims can be recovered, and malformed or active claims prevent false exhaustion. A domain reviewer must be able to allow a directory child intake that has no discovery-result row and observe a capture run queued. Blocking must never queue capture. Deferral must have no subject side effects.

The deferred-policy requeue must select no mapping packages. Dry-run mode must make no writes. Apply mode must stop before any write when the expected count does not match. A successful reset must preserve the prior policy decision in evidence history and keep the policy in `NEEDS_REVIEW` for the next reviewer claim.

A mapping approval must fail when reviewer and producer identities match, when the ingestion package is malformed, when a manual-logo package lacks `logoAbsenceAccepted`, when an official-logo package lacks `officialLogoVerified`, or when required validation is absent. A manual-logo package may pass only after an independent bounded review explicitly accepts the absence. A structurally eligible independent approval may invoke the existing live application path, but tests must replace that process boundary with a deterministic stub. Rejection and deferral must not publish or create a positive training example.

The generated Luna objective must name the reviewer skill, all queue commands, both subject types, the independent-review rule, and the prohibited publication/training/automation actions. The skill validator, focused Jest suites, TypeScript, ESLint, Prisma validation, and diff checks must pass.

## Idempotence and Recovery

Approval reconciliation uses a unique subject type/key pair, so repeated runs create no duplicates. Claim updates are conditional on status and lease expiry. If Luna stops after claim, the lease eventually expires and another reviewer may reclaim it. Completion is conditional on the claimed reviewer and current subject state. Re-running a completed decision returns the existing terminal row without reapplying side effects.

Domain-policy application already upserts the policy and intake history; capture queueing reuses an active run. Mapping live application is idempotent through source setup scripts and changes the mapping job from `REVIEW_REQUIRED` to `APPROVED` exactly once.

The deferred-policy requeue uses the approval row's current `DEFERRED` state, policy `NEEDS_REVIEW` state, cutoff, and exact expected count. A repeated apply with the same expected count fails because the first run removed the rows from the candidate set. This prevents an accidental second reset. The preserved policy evidence history records every successful reset.

## Artifacts and Notes

The reviewer result is compact JSON containing schema version, approval job ID, subject type/key, reviewer ID, decision, confidence, evidence references, checks, rationale, and blocking issues. It never contains credentials, raw cookies, signed URLs, or full provider envelopes.

## Interfaces and Dependencies

`src/server/affiliateImports/approvalResult.ts` exports the strict result schema and TypeScript type. `src/server/affiliateImports/approvalQueue.ts` exports reconciliation, claim, status summarization, and completion functions. `src/server/affiliateImports/codexApprovalGoal.ts` builds the Luna max/fast objective and CLI arguments.

The public commands are:

    npm run affiliate:approvals:reconcile -- --live
    npm run affiliate:approvals:queue-status -- --live
    npm run affiliate:approvals:claim -- --live --worker=<reviewer-id>
    npm run affiliate:approvals:complete -- --live --job=<approval-job-id> --result=<review-json>
    npm run affiliate:approvals:package-evidence -- --live --job=<mapping-job-id>
    npm run affiliate:approvals:requeue-deferred-policies -- --live --cutoff=<ISO-timestamp> --expected-count=<count>
    npm run affiliate:approvals:requeue-deferred-policies -- --live --cutoff=<ISO-timestamp> --expected-count=<count> --apply
    npm run affiliate:approvals:codex-goal -- --live --worker=<reviewer-id>
    npm run affiliate:approvals:loop -- --live --interval-seconds=300

Arm one queue-gated full review without interrupting current work:

    npm run affiliate:approvals:loop -- --live --interval-seconds=300 --force-mapping-review-cohort=description-quality-v1

Revision note (2026-07-31): Created the plan after auditing existing intake policy and mapping-package approval boundaries. The design uses a separate durable approval queue so reviewer identity and side effects remain independently auditable.

Revision note (2026-07-31): Recorded the completed queue, bounded policy evidence, independent Luna skill/goal, single-child polling invariant, and validation results. Deployment and authenticated VM execution remain intentionally separate from this code commit.

Revision note (2026-08-01): Recorded the cross-container evidence mismatch and the required read-only producer/disposable-database handoff repair.

Revision note (2026-08-01): Recorded the guarded-live setup and manual-logo recovery cohort and the producer-repair routing decision.

Revision note (2026-08-02): Superseded the mandatory-logo gate with an explicit accepted-absence state and added reviewer-queue recovery for earlier logo-only terminal decisions.

Revision note (2026-08-01): Upgraded the Luna approval process to max reasoning in persisted fast mode and made those settings explicit in the launcher's tests and preflight output.

Revision note (2026-08-02): Added independent description-quality review and the durable one-time full-mapping rereview flag. The cohort remains waiting until the current queues are strictly idle.

Revision note (2026-08-01): Changed domain policy to allow capture unless an explicit prohibition applies to the target public path. Added a cutoff and count guarded requeue that preserves prior decisions before it resets deferred policy reviews.

Revision note (2026-08-01): Added the current domain decision standard to each claim payload so a long-running reviewer receives the updated rule at the job boundary.

Revision note (2026-08-01): Recorded the guarded live requeue of 249 deferred policies and the first successful explicit-prohibition-only review.

Revision note (2026-08-02): Added configurable reviewer pools, unique claim identities, pool-wide wait behavior, worker-specific progress files, and mandatory valid-event-division review.
