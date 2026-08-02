# Require event divisions and scale affiliate agents safely

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` current while work proceeds.
Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

BracketIQ can run more than one affiliate mapper or reviewer without assigning
the same queue item twice. An operator can set a mapper count or reviewer count
instead of changing code. Each accepted event must also have at least one
valid, source-supported division before the mapper can send its package for
review. The reviewer receives a deterministic division report and must return
bad divisions to the producer.

The behavior is visible in three ways. Concurrent queue tests prove that two
workers receive different jobs. The mapper completion command refuses an event
with no valid division. The approval loop starts the configured number of
reviewers and does not start a new pool until every active reviewer exits.

## Progress

- [x] (2026-08-02 17:49Z) Measured live throughput for one mapper and one reviewer.
- [x] (2026-08-02 17:53Z) Confirmed both queues already use conditional database claims and two-hour leases.
- [x] (2026-08-02 18:00Z) Added shared agent-count parsing, stable worker IDs, pool execution, and concurrent claim tests.
- [x] (2026-08-02 18:02Z) Added a deterministic event-division quality gate to mapper completion and reviewer evidence.
- [x] (2026-08-02 18:03Z) Updated mapper and reviewer goals, skills, and contracts.
- [x] (2026-08-02 18:04Z) Added configurable reviewer pools and an isolated-workspace mapper pool command.
- [x] (2026-08-02 18:07Z) Passed 8 focused suites with 44 tests, TypeScript, diff checks, and both skill validators.
- [ ] Commit and push the scoped files without the user's unrelated work.
- [ ] Update the two VM checkouts, preserve in-flight claims, and start mapper 2 in a separate Git worktree.
- [ ] Verify two unique mapper IDs, unchanged reviewer count, and no duplicate active claims.

## Surprises & Discoveries

- Observation: The reviewer is faster than the mapper over the recent useful windows.
  Evidence: The last hour showed 6 reviewer completions and 5 mapper completions. The last three hours showed 9.67 reviewer completions per hour and 7 mapper completions per hour. The six-hour mapper total included 20 fast failures and was not a useful success-rate comparison.

- Observation: Queue assignment was already race-safe, but there was no concurrent regression test.
  Evidence: `claimNextAffiliateSourceIntakeForMapping` and `claimNextAffiliateApproval` both select a candidate and then use a conditional `updateMany`. A losing worker retries when the update count is zero.

- Observation: Parallel mappers cannot share one writable Git checkout.
  Evidence: Each mapper creates and commits a source package. Concurrent edits, tests, and commits in one worktree would mix source packages even though the database jobs are different.

- Observation: Existing candidate rows already contain normalized division objects.
  Evidence: `candidatePersistenceData` stores `rawPayload.normalizedImport.divisions`, which contains the values produced by `buildAffiliateDivisionDetails`.

## Decision Log

- Decision: Keep the existing conditional claim commands as the only task-assignment tools.
  Rationale: They already implement the required race boundary. A second queue API would duplicate correct logic and create two assignment paths.
  Date/Author: 2026-08-02 / Codex

- Decision: Require a separate Git workspace for each mapper.
  Rationale: Database leases prevent duplicate jobs but cannot prevent two coding agents from changing the same files or Git index.
  Date/Author: 2026-08-02 / Codex

- Decision: Allow reviewers to share the reviewer checkout but give each reviewer a unique progress file.
  Rationale: Reviewers do not edit producer packages. Per-reviewer progress files avoid concurrent writes to one JSONL file.
  Date/Author: 2026-08-02 / Codex

- Decision: Require all canonical division fields on every accepted event division.
  Rationale: The source display name preserves the organization's wording. The separate gender, rating, division, skill, and age fields make the event usable by BracketIQ filters and registration logic.
  Date/Author: 2026-08-02 / Codex

- Decision: Keep one reviewer for the first live scale change and add mapper 2.
  Rationale: The measured reviewer throughput exceeds mapper throughput. Adding a reviewer now would increase idle review capacity instead of relieving the bottleneck.
  Date/Author: 2026-08-02 / Codex

## Outcomes & Retrospective

The repository now contains the division gate and both pool controls. Focused
tests and TypeScript pass at the current checkpoint. The live VM change remains
until the scoped commit is pushed and both agent checkouts can load it. The
first live scale setting will be two mappers and one reviewer.

## Context and Orientation

An intake is stored HTML, Markdown, screenshots, and related evidence for one
source site. A mapping job turns one intake into code and disposable scrape
results. An approval job reviews either a domain policy or a completed mapping
package. A claim is a conditional database update that assigns one job to one
worker for a fixed lease period.

`src/server/affiliateImports/sourceMappingQueue.ts` owns mapper claims.
`src/server/affiliateImports/approvalQueue.ts` owns reviewer claims.
`src/server/affiliateImports/agentPool.ts` validates agent counts and runs a
fixed pool. `scripts/run-affiliate-intake-codex-pool.ts` starts mapper goals in
separate workspaces. `scripts/run-affiliate-approval-loop.ts` starts the
configured reviewer pool and keeps one outer PostgreSQL advisory lock.

`src/server/affiliateImports/eventDivisionQuality.ts` reads normalized division
objects from disposable candidate rows. `scripts/complete-affiliate-source-mapping.ts`
uses it as a hard producer gate. `scripts/report-affiliate-mapping-package-evidence.ts`
shows the same report to reviewers.

## Plan of Work

Keep the queue services unchanged except for tests because their conditional
claims are already correct. Use `agentPool.ts` to validate counts from one
through eight, build stable worker IDs, reject duplicate IDs, and wait for all
children in a pool.

Run mapper goals through Codex headless `exec` mode. Accept
`--agent-count`, `--worker-prefix`, and one `--workspace` per mapper in
`scripts/run-affiliate-intake-codex-pool.ts`. Reject a count greater than the
number of distinct Git workspaces. The VM must create a second Git worktree on
a separate branch and mount it in the second mapper container.

Accept `--agent-count` and `--worker-prefix` in the approval loop. Keep legacy
`--worker` valid only when the count is one. Start all reviewers in one cycle,
wait for all of them, reconcile once, and then inspect the queue. Do not start
a replacement reviewer while the current pool is active.

For every disposable `EVENT` candidate, inspect
`rawPayload.normalizedImport.divisions`. Require at least one division. Require
each division to contain a source display name, `gender` in `M`, `F`, or `C`,
`ratingType` in `AGE` or `SKILL`, and non-empty `divisionTypeId`,
`skillDivisionTypeId`, and `ageDivisionTypeId`. Reject duplicate keys within one
event. Do not apply this requirement to `CLUB` or `RENTAL` candidates.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Run the focused tests:

    npm test -- --runInBand \
      src/server/affiliateImports/__tests__/agentPool.test.ts \
      src/server/affiliateImports/__tests__/approvalLoop.test.ts \
      src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts \
      src/server/affiliateImports/__tests__/approvalQueue.test.ts \
      src/server/affiliateImports/__tests__/eventDivisionQuality.test.ts \
      src/server/affiliateImports/__tests__/codexCliGoal.test.ts \
      src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts \
      src/server/affiliateImports/__tests__/producerPackageEvidence.test.ts

Run the static checks:

    npx tsc --noEmit
    git diff --check

For two local mapper workspaces, use:

    npm run affiliate:intakes:codex-pool -- \
      --live --container-isolated --agent-count=2 \
      --worker-prefix=codex-luna-vm \
      --workspace=/workspace/mapper-1 \
      --workspace=/workspace/mapper-2

For two reviewers, use either the CLI option:

    npm run affiliate:approvals:loop -- \
      --live --container-isolated --agent-count=2 \
      --worker-prefix=codex-luna-approval-vm

or set `AFFILIATE_APPROVAL_AGENT_COUNT=2` and
`AFFILIATE_APPROVAL_REVIEWER_PREFIX=codex-luna-approval-vm`.

## Validation and Acceptance

The focused Jest command must pass all listed suites. The concurrent mapper
test must return `job_1` and `job_2` to different worker IDs. The concurrent
reviewer test must return two different approval IDs. The approval-loop test
must show that the queue status is not checked again until both child reviewer
promises resolve.

The event-division test must reject an empty division array and an incomplete
canonical classification. A valid `Adult Open` division must pass. TypeScript
must exit with code zero.

On the VM, `affiliate:mapping:queue-status -- --live` must show different active
worker IDs when both mappers have work. No mapping job or approval job may have
two owners. The reviewer count stays one for the first scale change.

## Idempotence and Recovery

Repeated queue claims are safe because only one conditional update can change
a claimable row. Expired leases return to the normal claim path. Never reset a
live claim to add capacity.

The mapper pool can restart a failed worker in its same workspace after the
lease expires or after an explicit claim release. Do not delete a worktree that
contains an unpushed source commit. Scaling down must stop only the highest
numbered idle worker after confirming it has no active lease.

If the reviewer pool fails, the outer loop exits and releases its advisory
lock. Restart it with the same count. Existing approval leases remain valid and
will recover after expiry.

## Artifacts and Notes

The initial live throughput sample was:

    window    mapper useful completions/hour    reviewer completions/hour
    1 hour    5                                  6
    3 hours   7                                  9.67

The six-hour mapper sample contained 20 failures and must not be used as a
successful intake-rate estimate.

## Interfaces and Dependencies

`src/server/affiliateImports/agentPool.ts` exports:

    parseAffiliateAgentCount(value, fallback?): number
    buildAffiliateAgentIds(prefix, count): string[]
    runAffiliateAgentPool({ agentIds, runAgent }): Promise<Array<{ agentId, result }>>

`src/server/affiliateImports/eventDivisionQuality.ts` exports:

    analyzeAffiliateEventDivisionQuality(rows): AffiliateEventDivisionQuality
    inspectAffiliateEventDivisionQuality({ queryable, sourceId }): Promise<AffiliateEventDivisionQuality>

The code uses existing dependencies only: Node child processes, Zod contracts,
Prisma for live queue rows, and `pg` for the disposable validation database.

Revision note, 2026-08-02: Created this plan after live rate measurement and
implementation. It records why mapper 2 is the first capacity increase and why
each mapper requires an isolated Git workspace.
