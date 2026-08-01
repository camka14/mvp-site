# Recover rejected affiliate packages and review unresolved logos

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

The affiliate mapping and approval agents are processing live work, but many otherwise valid organization packages are not reaching the live review state. The largest systemic blocker is that producer setup scripts explicitly reject the `--live` flag used by the guarded approval boundary. A second group has no verified official logo and needs a deliberate producer-side logo review instead of being silently abandoned. After this work, new generated setup scripts will support guarded live application, affected terminal jobs can be returned to the producer exactly once with durable repair history, and Luna will re-inspect stored official logo evidence before the independent reviewer sees each repaired package again.

The result is observable in three places: focused tests prove the retry classifier and generated setup contract; the live retry preview identifies only the intended rejected packages; and the live mapping and approval queue reports show repaired packages moving from rejected status through producer repair and independent review without publishing organizations or enabling automatic scraping.

## Progress

- [x] (2026-08-01 23:00Z) Measured the live failures and confirmed that 74 rejected jobs cite unsupported guarded live setup, 65 of them as the only blocking reason; manual-logo review appears in 58 rejected jobs.
- [x] (2026-08-01 23:05Z) Paused the OVH approval loop and returned its single interrupted claim to `QUEUED` so it cannot continue issuing terminal rejections during repair.
- [x] (2026-08-01 23:10Z) Audited the generated setup template, guarded live application command, mapping repair classifier, approval requeue behavior, and official-logo approval gates.
- [x] (2026-08-01 23:20Z) Updated generated setup code and agent instructions so guarded `--live` support and producer-side manual-logo resolution are required.
- [x] (2026-08-01 23:25Z) Extended retry eligibility and claim output to select manual-logo producer repairs and expose durable `repairContext` without recycling unrelated rejection states.
- [ ] Run focused Jest tests, TypeScript, and diff checks; commit and push the scoped repair. (Completed: 33 focused tests, TypeScript, and diff check pass. Remaining: repository CI, commit, and push.)
- [ ] Update both OVH agent checkouts, restart the producer and reviewer, and verify their generated goals contain the repaired contract.
- [ ] Preview and apply the live requeue, then verify repaired jobs are claimed and re-reviewed without leaked leases.
- [ ] Record final queue counts, newly approved organizations, unresolved logos, and any packages that still need human evidence.

## Surprises & Discoveries

- Observation: the live application boundary intentionally executes the exact setup script stored in the producer commit with `--live --scrape`; it then checks that the organization is unlisted, its page is disabled, automation is disabled, and the mapping remains unvalidated.
  Evidence: `scripts/apply-approved-affiliate-mapping-jobs.ts` materializes the producer commit, executes its setup script, and validates the resulting live rows before marking a mapping approved.

- Observation: the deterministic generated setup template still says it is local-only and throws whenever `--live` is present, despite the current ingestion goal requiring guarded live support.
  Evidence: `src/server/affiliateImports/agentTemplates/sourceFiles.ts` emits `Generated agent setup scripts are local-only until human review.`.

- Observation: retrying a failed mapping job does not need a new approval row. When the repaired producer finishes the same mapping job as `REVIEW_REQUIRED`, `finishAffiliateSourceMappingClaim` resets an existing `REJECTED` or `DEFERRED` approval row back to `QUEUED`.
  Evidence: `src/server/affiliateImports/sourceMappingQueue.ts` preserves `mappingRepairHistory` and resets the matching terminal approval during a repaired completion.

- Observation: a mapping with `logoDisposition = MANUAL_REVIEW` cannot be safely approved because the guarded live application also requires the resulting organization to have a logo file.
  Evidence: `src/server/affiliateImports/approvalQueue.ts` rejects approval of manual-logo results, while `scripts/apply-approved-affiliate-mapping-jobs.ts` rejects a live organization with no `logoId`.

- Observation: the first live retry preview selected 163 of 165 rejected approvals because it combined stale approval text with the mapping job's current error. Some selected jobs currently failed with terminal reasons such as `Already-finished intake` but retained an older review mentioning a refused `--live` setup.
  Evidence: the preview was run without `--apply`, so no live rows changed; inspection of selected rows showed the newer mapping failure and older approval text described different attempts.

## Decision Log

- Decision: Keep the independent official-logo gate and send manual-logo packages back to the producer for evidence review instead of weakening approval to accept logo-less organizations.
  Rationale: the user asked to review the manual logos, and the producer is the component authorized to normalize and commit source assets. The reviewer must remain read-only and independent.
  Date/Author: 2026-08-01 / Codex

- Decision: Repair historical local-only packages by requeueing their original mapping jobs rather than bypassing the setup script's `--live` guard in the application command.
  Rationale: omitting `--live` while pointing the child at production would defeat an explicit safety declaration in the exact producer commit. A repaired producer commit is auditable and preserves the guarded application contract.
  Date/Author: 2026-08-01 / Codex

- Decision: Preserve terminal decisions and repair attempts in `mappingRepairHistory`, and allow one operator-controlled retry pass rather than silently looping rejected packages.
  Rationale: repeated automatic retries can spend indefinitely on sites with no supportable official logo or location evidence. Durable history keeps the process inspectable and lets later retries require new evidence or an explicit operator action.
  Date/Author: 2026-08-01 / Codex

- Decision: When a failed mapping job has a current `errorMessage`, classify retry eligibility from that error alone; use approval evidence only when the current error is empty.
  Rationale: the mapping job represents the latest producer attempt. Letting an older approval decision override it can recycle terminal failures and create an unnecessarily broad retry cohort.
  Date/Author: 2026-08-01 / Codex

## Outcomes & Retrospective

Implementation is in progress. The live reviewer is paused, its interrupted claim was returned to the queue, and no package has yet been requeued under the new repair contract.

The local repair implementation now passes 33 focused tests plus TypeScript and
diff validation. Generated setup scripts select the live database only through
the shared guarded helper, retry classification recognizes manual-logo work,
and mapping claims expose the latest repair context to Luna.

## Context and Orientation

An affiliate source intake is stored HTML, Markdown, screenshot, link, branding, logo, and policy evidence for one website. `AffiliateSourceMappingJobs` leases one intake to the producer agent. A successful producer result contains a source-specific commit, exactly two stable disposable review scrapes, and a logo disposition. `AffiliateApprovalJobs` gives an independent reviewer a durable lease over that package.

`src/server/affiliateImports/agentTemplates/sourceFiles.ts` renders deterministic setup scripts for generated mappings. A setup script owns the private review organization, disabled source, active but unvalidated mapping, optional logo file, and one review scrape. `scripts/apply-approved-affiliate-mapping-jobs.ts` is the guarded live application boundary: it materializes the exact producer commit, runs the setup script against live with `--live --scrape`, and refuses to mark the package approved unless all unpublished and disabled postconditions hold.

`src/server/affiliateImports/mappingPackageRepair.ts` classifies terminal mapping-package rejections that require another producer pass. `scripts/retry-rejected-affiliate-mapping-packages.ts` previews or applies those selections. Applying a retry changes only the selected mapping job and intake back to producer-ready states and records the prior reviewer decision in `mappingRepairHistory`. When the producer completes the repaired job, `src/server/affiliateImports/sourceMappingQueue.ts` resets its matching terminal approval row to `QUEUED`.

Manual-logo packages are not approvable as-is. `MANUAL_REVIEW` means the producer could not verify and commit an official normalized logo. The producer must inspect stored `LOGO_CANDIDATE`, `PAGE_BRANDING`, `PAGE_IMAGES`, screenshots, HTML, CSS references, and metadata. It may normalize or crop an official mark but must not invent one. If no official mark can be proved, the package remains unpublishable and its exact evidence gap must be reported.

## Plan of Work

First, change `renderAffiliateGeneratedSetup` in `src/server/affiliateImports/agentTemplates/sourceFiles.ts` so generated setup scripts import `configureAffiliateLiveDatabaseEnvironment`, use `DATABASE_URL_LIVE` only when `--live` is explicitly present, select Spaces storage in that mode, and continue to keep organizations unlisted, pages disabled, automation disabled, and mappings unvalidated. Update `src/server/affiliateImports/__tests__/agentGenerator.test.ts` so the old local-only throw fails the test and the guarded live configuration is required.

Second, extend `AffiliateMappingProducerRepairReason` and `affiliateMappingProducerRepairEligibility` in `src/server/affiliateImports/mappingPackageRepair.ts` with a manual-logo repair reason. Eligibility must require the existing rejected approval and failed mapping states, a schema-valid producer result whose logo disposition is `MANUAL_REVIEW`, and a reviewer decision that identifies the unresolved official-logo evidence. It must not classify unrelated image, parser, policy, or organization defects as a manual-logo retry. Add tests in `src/server/affiliateImports/__tests__/mappingPackageRepair.test.ts`.

Third, update the ingestion skill, completion contract, source rollout goal, and `src/server/affiliateImports/codexCliGoal.ts` so a requeued manual-logo repair instructs Luna to exhaust stored official branding evidence, inspect the actual images, normalize an official asset or official screenshot crop, and create a new source-scoped commit. If no official mark can be verified, Luna must record the evidence gap and stop that package from cycling. Update the approval instructions so `MANUAL_REVIEW` is treated as producer repair when stored official evidence may resolve it, or as a human evidence gap when it cannot; the reviewer still may not edit producer work.

Fourth, validate locally. Run the focused generator, mapping repair, mapping queue, approval queue, goal, and approval-selection tests. Run TypeScript and diff checks. Stage only the scoped files, commit, and push `main` over the HTTPS repository remote.

Fifth, stop both VM agents at a lease-safe point, preserve the producer worktree changes, update both checkouts to the pushed revision, and restart the producer and reviewer goals. Verify their process arguments contain the guarded live and manual-logo repair instructions.

Finally, run the live retry command first without `--apply`. Compare its selected job count and repair reasons with the measured rejected population. Apply only after the preview is correct. Verify that selected mapping jobs become `QUEUED`, their intakes become `READY_FOR_MAPPING`, and their prior review decisions remain in `mappingRepairHistory`. Let the producer claim repaired jobs and the reviewer reconsider only new producer commits. Report any manual logos still unresolved because the stored evidence contains no official mark.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

Inspect the focused code and tests:

    rg -n "local-only|refuses --live|MANUAL_REVIEW|mappingRepairHistory" src/server/affiliateImports scripts

Run focused validation after editing:

    npm test -- --runInBand src/server/affiliateImports/__tests__/agentGenerator.test.ts src/server/affiliateImports/__tests__/mappingPackageRepair.test.ts src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts src/server/affiliateImports/__tests__/approvalQueue.test.ts src/server/affiliateImports/__tests__/codexCliGoal.test.ts src/server/affiliateImports/__tests__/codexApprovalGoal.test.ts src/server/affiliateImports/__tests__/codexIngestionApproval.test.ts
    npx tsc --noEmit --pretty false
    git diff --check

Preview the live retry from the OVH application container after deployment:

    DATABASE_URL_LIVE="$DATABASE_URL&sslmode=disable" npm run affiliate:mapping:retry-rejected -- --live

Apply the verified selection:

    DATABASE_URL_LIVE="$DATABASE_URL&sslmode=disable" npm run affiliate:mapping:retry-rejected -- --live --apply

Then verify both queues:

    DATABASE_URL_LIVE="$DATABASE_URL&sslmode=disable" npm run affiliate:mapping:queue-status -- --live
    DATABASE_URL_LIVE="$DATABASE_URL&sslmode=disable" npm run affiliate:approvals:queue-status -- --live

## Validation and Acceptance

The generated setup test must prove that a generated script handles `--live` by calling the shared live-database environment helper and selecting Spaces storage, while continuing to write only an unlisted organization, disabled source, and unvalidated mapping. The generated script must never enable automatic scraping or publish its organization.

The retry-classifier test must prove that live-setup, event-location, and manual-logo producer defects are eligible, while unrelated parser/policy defects are not. A manual-logo retry must require both a `MANUAL_REVIEW` producer result and a logo-specific reviewer decision.

The live preview is accepted when every selected row has `REJECTED` approval, `FAILED` mapping, and one of the named repair reasons. Applying it must not create organizations, sources, mappings, candidates, events, or files; it may only change mapping/intake queue state and append repair history. After restart, active leases must belong to the expected producer and reviewer identities and `claimedWithoutLease` must remain zero.

The overall recovery is accepted when the 65 packages blocked only by local-only setup are reprocessed with new commits, manual-logo packages are inspected against stored official evidence, and the approval queue begins producing new guarded approvals. Packages with genuinely missing official marks or unusable event locations may remain unresolved, but their reasons must be specific and they must not loop automatically.

## Idempotence and Recovery

The retry command defaults to preview and requires both `--live` and `--apply` to mutate the live queue. Its transaction rechecks every row before changing it. A crash after some rows are reset is safe: those rows are ordinary queued producer work and the remaining rejected rows can be previewed again. `mappingRepairHistory` preserves prior decisions across producer completion.

The approval loop is paused during implementation so it cannot create new terminal failures under the old contract. If deployment or tests fail, leave the reviewer stopped and the producer running; no existing live source is published or enabled by this work. If an agent is stopped while holding a lease, release only its exact claimed row after confirming the worker identity.

## Artifacts and Notes

The baseline live database snapshot at the start of this plan contained 161 rejected approval jobs and 212 failed mapping jobs. Seventy-four rejected jobs mentioned a local-only or `--live` refusal, and 65 had no other blocking issue. Fifty-eight rejected jobs mentioned manual-logo review, thirteen mentioned missing location/coordinates, twelve mentioned missing scrape evidence, and ten mentioned unavailable producer files or commits. Counts overlap when one package has several issues.

## Interfaces and Dependencies

`configureAffiliateLiveDatabaseEnvironment(liveDatabaseUrl, env?)` in `src/server/affiliateImports/agentRepository.ts` is the only helper generated setup scripts should use to select the live database. `STORAGE_PROVIDER` must be `spaces` during guarded live application.

`affiliateMappingProducerRepairEligibility(input)` returns `{ eligible, reason, repairReason }`. At completion it must recognize `LIVE_SETUP_UNSUPPORTED`, `EVENT_LOCATION_PACKAGE_REJECTION`, and `MANUAL_LOGO_REVIEW` without broad substring matches that recycle unrelated failures.

`npm run affiliate:mapping:retry-rejected` remains the operator command. It is read-only unless both `--live` and `--apply` are present.

Revision note (2026-08-01): Created this plan after the live rejection audit identified guarded setup incompatibility as the primary blocker and manual-logo review as the second largest repair cohort.
