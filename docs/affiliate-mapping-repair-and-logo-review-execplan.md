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
- [x] (2026-08-01 23:12Z) Ran 33 focused tests, repository CI, TypeScript, and diff validation; committed and pushed the repair plus the current-failure classifier safeguard to `main`.
- [x] (2026-08-01 23:19Z) Updated both OVH agent checkouts, restored disk capacity, restarted the producer and reviewer, and verified their generated goals contain the guarded-live, event-location, division/pricing, and manual-logo contracts.
- [x] (2026-08-01 23:20Z) Previewed and requeued exactly 91 live packages: 59 manual-logo reviews, 29 guarded-live setup repairs, and 3 event-location package repairs. Queue reports showed zero expired leases and zero claims without leases before agent restart.
- [x] (2026-08-02 00:05Z) Audited the restarted live decisions and the queue transitions. Confirmed that fixable producer defects are still terminal `REJECTED`, evidence deferrals never return to the producer, and a valid organization can still be stranded when its invalid child events were persisted instead of filtered.
- [x] (2026-08-02 00:35Z) Added a strict producer-repair versus human-review disposition, atomic producer requeue, explicit `HUMAN_REVIEW_REQUIRED` state, and a three-pass automatic repair limit.
- [x] (2026-08-02 00:40Z) Extended historical classification across rejected and deferred packages while preserving old producer-evidence handoff failures for their evidence-verified reviewer retry.
- [x] (2026-08-02 00:45Z) Updated producer and reviewer goals, skills, and contracts so repairs address every issue, add regression coverage, and generalize newly discovered failure classes without weakening gates.
- [x] (2026-08-02 00:50Z) Passed 51 focused tests, repository CI, TypeScript, and diff validation.
- [x] (2026-08-02 00:20Z) Applied the historical live classification: 20 intact packages returned to independent review, 83 incomplete or evidence-invalid packages returned to the producer, and 3 exhausted-logo packages became explicit human-review work.
- [x] (2026-08-02 00:21Z) Verified the new live review cycle on Iron Courts Phoenix: one structured rejection atomically requeued the mapping with four reason codes and full reviewer feedback.
- [x] (2026-08-02 00:22Z) Restarted both OVH goals with the updated skills and zero core-dump limits. Producer and reviewer each held one valid lease; both queues reported zero claims without leases.
- [x] (2026-08-02 00:38Z) Added a Razumly-admin Affiliate imports view for explicit `HUMAN_REVIEW_REQUIRED` mapping jobs, including source identity, structured reason codes, blocking issues, attempt count, and a direct path into the stored intake evidence.
- [x] (2026-08-02 00:38Z) Replaced the 15-minute intake-automation email with intake/discovery/mapping totals in the existing once-daily affiliate operations email, while keeping the 15-minute capture worker unchanged.
- [x] (2026-08-02 00:38Z) Passed 30 focused tests, TypeScript, scoped ESLint, all 4,110 repository tests, and the 315-route coverage gate.
- [x] (2026-08-02 01:34Z) Recovered the four abandoned live intake capture attempts by preserving each failed attempt and queueing one auditable replacement; no worker or timer was restarted.
- [x] (2026-08-02 01:30Z) Added a reviewer-owned supplemental logo-evidence capture that verifies an official page reference, stores the page and image in the intake artifact system, and hands normalization back to the producer.
- [x] (2026-08-02 01:32Z) Added automatic stale intake-run lease recovery, late-worker overwrite protection, focused tests, and updated producer/reviewer contracts so this queue state cannot remain indefinitely.
- [x] (2026-08-02 01:32Z) Passed 32 focused tests, TypeScript, scoped ESLint, and diff validation for stale-run recovery and supplemental official-logo capture.
- [x] (2026-08-02 02:05Z) Replaced the mandatory-logo approval gate with an explicit accepted-absence check and extended historical recovery so logo-only terminal packages return to the independent reviewer rather than the producer or a human-only queue.
- [ ] Record final queue counts, newly approved organizations, unresolved logos, and any packages that still need human evidence.

## Surprises & Discoveries

- Observation: the live application boundary intentionally executes the exact setup script stored in the producer commit with `--live --scrape`; it then checks that the organization is unlisted, its page is disabled, automation is disabled, and the mapping remains unvalidated.
  Evidence: `scripts/apply-approved-affiliate-mapping-jobs.ts` materializes the producer commit, executes its setup script, and validates the resulting live rows before marking a mapping approved.

- Observation: the deterministic generated setup template still says it is local-only and throws whenever `--live` is present, despite the current ingestion goal requiring guarded live support.
  Evidence: `src/server/affiliateImports/agentTemplates/sourceFiles.ts` emits `Generated agent setup scripts are local-only until human review.`.

- Observation: retrying a failed mapping job does not need a new approval row. When the repaired producer finishes the same mapping job as `REVIEW_REQUIRED`, `finishAffiliateSourceMappingClaim` resets an existing `REJECTED` or `DEFERRED` approval row back to `QUEUED`.
  Evidence: `src/server/affiliateImports/sourceMappingQueue.ts` preserves `mappingRepairHistory` and resets the matching terminal approval during a repaired completion.

- Observation: the former guarded application path made every `MANUAL_REVIEW` logo terminal even when the rest of the package was valid.
  Evidence: before the 2026-08-02 policy change, `approvalQueue.ts` rejected every manual-logo result and the live application command required `logoId`. The replacement requires an explicit `logoAbsenceAccepted` reviewer check and passes a one-use guarded application flag only for that decision.

- Observation: the first live retry preview selected 163 of 165 rejected approvals because it combined stale approval text with the mapping job's current error. Some selected jobs currently failed with terminal reasons such as `Already-finished intake` but retained an older review mentioning a refused `--live` setup.
  Evidence: the preview was run without `--apply`, so no live rows changed; inspection of selected rows showed the newer mapping failure and older approval text described different attempts.

- Observation: the approval agent had exited because the OVH root filesystem was 99% full. Thirteen producer crash core dumps consumed roughly 35 GB; intake/output evidence remained separate and was not removed.
  Evidence: exact-file inspection showed `core.10672` through `core.9991` at roughly 2.3 to 2.8 GB each. Removing only those core dumps restored 28 GB free and reduced root usage to 61%.

- Observation: the producer goal requires an interactive terminal and exits when launched as a detached non-TTY Docker exec.
  Evidence: the non-TTY launch reported `The Codex ingestion goal requires an interactive terminal`; launching it through `script` supplied a pseudo-terminal and produced the expected live Luna goal process.

- Observation: `DEFER` is currently terminal for the approval row but leaves the mapping job at `REVIEW_REQUIRED`; queue reconciliation sees the existing approval row and never reopens it, so historical guarded-live deferrals cannot be repaired.
  Evidence: `completeAffiliateApproval` does not change mapping state for `DEFER`, while `reconcileAffiliateApprovalQueue` only creates an approval row when none exists.

- Observation: the first six authoritative decisions after restart included four concrete producer defects and two old guarded-live incompatibilities. The producer defects were missing event-location filtering and invalid division, price, or capacity interpretation; the old guarded-live packages were deferred even though current producer code can repair them.
  Evidence: the stored decisions for Iron Courts Phoenix, Metropolitan Tennis Group, Milwaukee Sports & Social, Missouri Wolverines, San Antonio Runners SC, and Michigan Youth Flag Football distinguish those failure classes.

- Observation: the written producer and reviewer contracts already say that invalid child events must be excluded and logged while a valid organization remains eligible. The live failures happened because the producer persisted the invalid child events, so the package-level reviewer correctly rejected the submitted package even though its organization identity was coherent.
  Evidence: the ingestion completion contract and approval contract both make missing event location a per-event exclusion rather than an organization rejection when the organization itself has sufficient evidence.

- Observation: the first structured historical preview found three terminal producer messages that had already exhausted stored logo evidence, but the legacy reviewer decisions only said `MANUAL_REVIEW` and did not distinguish a missed logo from a proven evidence gap.
  Evidence: New York Elite Volleyball, NY Stingers, and NYC Parks Pickleball Courts each record `MANUAL_LOGO_REVIEW repair cannot be resolved` with the specific first-party artifacts inspected. The historical classifier now maps that producer evidence to `NO_VERIFIABLE_OFFICIAL_LOGO` human review.

- Observation: 103 historical terminal reviews mention the old producer-evidence handoff, but current read-only verification split them into 20 intact packages and 14 concrete package defects; the remainder no longer matches a terminal mapping state or schema-valid review package.
  Evidence: the guarded handoff preview verified producer commits and disposable scrapes for 20 packages. Fourteen failed exact evidence checks such as a generated path absent from the producer commit, missing setup script, changed candidate count, or missing disposable scrape and therefore require producer repair rather than reviewer recycling. Sixty-nine have no schema-valid review package and must be rebuilt by the producer from the original intake; 87 terminal approvals point at mapping jobs that have already moved to another state and must not be reset.

## Decision Log

- Decision (superseded 2026-08-02): Keep the independent official-logo gate and send manual-logo packages back to the producer for evidence review instead of weakening approval to accept logo-less organizations.
  Rationale: the user asked to review the manual logos, and the producer is the component authorized to normalize and commit source assets. The reviewer must remain read-only and independent.
  Date/Author: 2026-08-01 / Codex

- Decision: Allow an otherwise-valid manual-logo package to be approved only when the independent reviewer completes the bounded logo search and sets `logoAbsenceAccepted = true`.
  Rationale: missing branding is not severe enough to discard a valid organization or mapping. The explicit flag preserves auditability; an official mark found during review still returns to the producer for normalization, while inaccessible or contradictory evidence still defers.
  Date/Author: 2026-08-02 / Codex

- Decision: Repair historical local-only packages by requeueing their original mapping jobs rather than bypassing the setup script's `--live` guard in the application command.
  Rationale: omitting `--live` while pointing the child at production would defeat an explicit safety declaration in the exact producer commit. A repaired producer commit is auditable and preserves the guarded application contract.
  Date/Author: 2026-08-01 / Codex

- Decision: Preserve terminal decisions and repair attempts in `mappingRepairHistory`; use the guarded operator command only to classify historical terminal rows, while new concrete defects automatically receive up to three producer passes.
  Rationale: historical rows predate structured dispositions and need one explicit migration. New fixable failures should move without operator intervention, while the retry cap prevents indefinite spending on unresolved sites.
  Date/Author: 2026-08-01 / Codex

- Decision: When a failed mapping job has a current `errorMessage`, classify retry eligibility from that error alone; use approval evidence only when the current error is empty.
  Rationale: the mapping job represents the latest producer attempt. Letting an older approval decision override it can recycle terminal failures and create an unnecessarily broad retry cohort.
  Date/Author: 2026-08-01 / Codex

- Decision: Require every non-approved mapping review to declare either `PRODUCER_REPAIR` or `HUMAN_REVIEW_REQUIRED`, with machine-readable reason codes.
  Rationale: `REJECT` and `DEFER` describe review conclusions but not queue ownership. A separate disposition lets the queue automatically repair deterministic producer defects while making evidence gaps visibly terminal and non-retryable.
  Date/Author: 2026-08-02 / Codex

- Decision: Automatically requeue `PRODUCER_REPAIR` results from the approval completion transaction, but escalate a package to `HUMAN_REVIEW_REQUIRED` after three recorded repair attempts.
  Rationale: fixable packages should not wait for an operator command, while a bounded retry budget prevents malformed or impossible packages from looping and spending agent capacity indefinitely.
  Date/Author: 2026-08-02 / Codex

- Decision: Keep invalid-event handling separate from organization acceptance. A producer must exclude and log an event lacking a usable address, coordinates, or documented organization-location fallback; that event cannot cause rejection of an otherwise supported organization/source package.
  Rationale: organization discovery and event ingestion are different data-quality boundaries. The scraper can later surface event failures in the admin flow without discarding a valid organization.
  Date/Author: 2026-08-02 / Codex

- Decision: Surface terminal human-review work as a fourth Affiliate imports sub-tab and reuse the existing source-intake evidence modal for investigation.
  Rationale: intake pages, artifacts, sources, candidates, and terminal mapping issues belong to one operational workspace. Reusing the protected evidence viewer avoids duplicating private artifact access or exposing evidence through a public route.
  Date/Author: 2026-08-02 / Codex

- Decision: Stop all automatic intake emails from the 15-minute automation run and append a rolling 24-hour intake digest to the existing daily affiliate scrape email.
  Rationale: the daily scheduler already has a Postgres advisory lock, a configured recipient, and a single 05:00 America/Los_Angeles timer. Combining the summaries produces one daily operational email without changing capture cadence or adding another scheduler.
  Date/Author: 2026-08-02 / Codex

- Decision: Let the independent reviewer capture supplemental official-logo evidence, but never normalize, assign, or commit the logo itself.
  Rationale: a bounded capture can turn a manual browsing observation into durable provenance-backed intake evidence without crossing the producer/reviewer identity boundary. The producer remains responsible for visual normalization, setup changes, tests, and the source-scoped commit.
  Date/Author: 2026-08-02 / Codex

- Decision: Recover an abandoned intake run by marking the stale attempt failed and creating a fresh queued run rather than resetting the same row.
  Rationale: a replacement row preserves worker, timing, and failure history while preventing a late result from the abandoned worker from overwriting the replacement attempt.
  Date/Author: 2026-08-02 / Codex

## Outcomes & Retrospective

The repair is deployed to both OVH agent checkouts. The earlier live requeue reset 91
producer-fixable packages while preserving their prior decisions in repair
history: 59 require manual official-logo evidence review, 29 require a new
guarded-live setup commit, and 3 require event-location package repair. The 74
remaining rejected packages were not recycled at that checkpoint because their
latest failure did not match the then-supported repair reasons.

The expanded recovery pass subsequently categorized the remaining handoff-era
mapping approvals. Twenty packages with intact producer commits and disposable
scrapes returned directly to the reviewer. Fourteen packages with exact evidence
failures and 69 packages without a schema-valid review result returned to the
producer as `PACKAGE_VALIDATION_FAILED`. Three packages whose stored evidence
proved no supportable official logo exists remain `HUMAN_REVIEW_REQUIRED` in
the live database until the new recovery code is deployed and applied. The
updated retry classifier returns those logo-only rows to the independent
reviewer for explicit accepted-absence decisions.

The first new-contract live rejection proved the automatic loop. Iron Courts
Phoenix was returned to the producer with `LIVE_SETUP_UNSUPPORTED`,
`EVENT_LOCATION_INVALID`, `EVENT_DIVISION_CLASSIFICATION_INVALID`, and
`EVENT_PRICING_INVALID`; the mapping job was `QUEUED`, not terminal `FAILED`,
and its repair history contains the complete reviewer rationale and issues.
This preserves the valid organization identity while requiring the producer to
exclude and log child events that cannot support a location.

The four intake captures stranded under dead worker IDs were repaired in one
live transaction. Their original rows are terminal `FAILED` with the stale
worker and replacement-run ID retained in the error and summary; four new rows
are `QUEUED` with the same intake, requested pages, requester, and provider. The
existing 15-minute worker was not manually started or restarted.

Manual-logo review now has a governed evidence-acquisition path. A reviewer who
owns the active approval claim may identify an official public page and exact
logo URL. The command recaptures the page through ScrapingDog, enforces intake
policy scope and robots, proves the page references that image, validates the
bounded image response, and stores both page provenance and a `LOGO_CANDIDATE`
under a new intake run. The reviewer must then return the package to the
producer; it cannot normalize, assign, or commit the asset itself.

The local repair implementation passes 33 focused tests, repository CI,
TypeScript, and diff validation. Generated setup scripts select the live
database only through the shared guarded helper, retry classification recognizes
manual-logo work without allowing stale reviews to override current failures,
and mapping claims expose the latest repair context to Luna. At the post-rollout
checkpoint the producer queue had 370 claimable jobs plus one active lease, 3
human-review jobs, and zero lease-less claims. The reviewer had 33 queued jobs
plus one active lease and zero lease-less claims. Final approved-organization
counts remain pending as they work through those queues.

## Context and Orientation

An affiliate source intake is stored HTML, Markdown, screenshot, link, branding, logo, and policy evidence for one website. `AffiliateSourceMappingJobs` leases one intake to the producer agent. A successful producer result contains a source-specific commit, exactly two stable disposable review scrapes, and a logo disposition. `AffiliateApprovalJobs` gives an independent reviewer a durable lease over that package.

`src/server/affiliateImports/agentTemplates/sourceFiles.ts` renders deterministic setup scripts for generated mappings. A setup script owns the private review organization, disabled source, active but unvalidated mapping, optional logo file, and one review scrape. `scripts/apply-approved-affiliate-mapping-jobs.ts` is the guarded live application boundary: it materializes the exact producer commit, runs the setup script against live with `--live --scrape`, and refuses to mark the package approved unless all unpublished and disabled postconditions hold.

`src/server/affiliateImports/mappingPackageRepair.ts` classifies terminal mapping-package rejections that require another producer pass. `scripts/retry-rejected-affiliate-mapping-packages.ts` previews or applies those selections. Applying a retry changes only the selected mapping job and intake back to producer-ready states and records the prior reviewer decision in `mappingRepairHistory`. When the producer completes the repaired job, `src/server/affiliateImports/sourceMappingQueue.ts` resets its matching terminal approval row to `QUEUED`.

`MANUAL_REVIEW` means the producer could not verify and commit an official normalized logo. The producer must inspect stored `LOGO_CANDIDATE`, `PAGE_BRANDING`, `PAGE_IMAGES`, screenshots, HTML, CSS references, and metadata. It may normalize or crop an official mark but must not invent one. The independent reviewer repeats a bounded evidence and official-site check. If it finds an official mark, it returns the package for producer repair; if the completed search finds none, it may approve the otherwise-valid package with `logoAbsenceAccepted = true`.

## Plan of Work

Extend the strict mapping approval schema with a queue disposition and reason codes. Mapping `APPROVE` results omit the disposition. Mapping `REJECT` results must select `PRODUCER_REPAIR` for concrete mapping, setup, logo, event-location, division, price, capacity, or duplicate-safety defects, unless the retry limit has been exhausted. Mapping `DEFER` is reserved for insufficient or conflicting evidence and must select `HUMAN_REVIEW_REQUIRED`. Domain approvals remain unchanged.

Change mapping approval completion so a `PRODUCER_REPAIR` decision atomically appends the full reviewer feedback to `mappingRepairHistory`, resets the same mapping job to `QUEUED`, and returns its intake to `READY_FOR_MAPPING`. A human disposition sets the mapping job to an explicit terminal `HUMAN_REVIEW_REQUIRED` status and records why it must not retry. Count this status separately in the mapping queue report. On the fourth attempted repair, override automatic requeue with a durable retry-limit escalation.

Broaden the historical recovery command to inspect both rejected and deferred approvals. It must preview every terminal row as producer repair, reviewer retry, or human review; requeue known fixable setup and package defects; return logo-only terminal rows to the reviewer; and mark unclassifiable or evidence-dependent rows as `HUMAN_REVIEW_REQUIRED` rather than leaving them silently stranded. Claims must expose all reason codes, reviewer rationale, and blocking issues to the responsible agent.

Update the producer goal and ingestion/source-builder skills so repairs address every blocking issue and add a source-specific regression test. When a review reveals a reusable failure class not already stated in the skill or contract, the producer must add a generalized rule in its source-scoped commit. Reinforce that unsupported child events are filtered and logged without rejecting a valid organization, and that division names follow source terminology while gender, age, skill, price, grouping, and capacity use canonical fields correctly. Update the reviewer goal and skill so concrete producer defects request repair, while only real evidence gaps stop for a human.

Validate the schema, approval completion, historical classifier, claim context, queue summary, goals, and instructions with focused Jest tests and TypeScript. Deploy only after local checks pass. Stop the two VM loops at lease-safe points, update their checkouts, preview then apply the historical categorization, restart one producer and one reviewer, and verify that repairs recycle automatically while human rows remain unclaimable.

The earlier generated-setup and manual-logo work below remains completed context for this expanded recovery plan.

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

The retry-classifier test must prove that live-setup, event-location, division, pricing, capacity, and verified-logo packaging defects are eligible for producer repair; logo-only terminal packages return to the reviewer; and unrelated evidence gaps are assigned to human review. A producer logo repair still requires a concrete `OFFICIAL_LOGO_REPAIR_REQUIRED` decision showing that an official mark was found.

Approval completion tests must prove that a structured producer-repair rejection is requeued with durable feedback, a human-review disposition is never claimable, an explicit accepted-logo-absence approval is allowed, a silent manual-logo approval is rejected, and the retry limit prevents a fourth automatic producer pass. Schema tests must reject non-approved mapping results without a disposition, reject dispositions on domain or approved results, and reject simultaneous verified-logo and accepted-absence checks.

The live preview is accepted when every selected row has `REJECTED` approval, `FAILED` mapping, and one of the named repair reasons. Applying it must not create organizations, sources, mappings, candidates, events, or files; it may only change mapping/intake queue state and append repair history. After restart, active leases must belong to the expected producer and reviewer identities and `claimedWithoutLease` must remain zero.

The overall recovery is accepted when the 65 packages blocked only by local-only setup are reprocessed with new commits, manual-logo packages are inspected against stored and bounded official-site evidence, and the approval queue begins producing new guarded approvals. Genuinely missing official marks may be explicitly accepted; unusable event locations and incomplete or contradictory evidence remain specific blocking reasons and must not loop automatically.

## Idempotence and Recovery

The retry command defaults to preview and requires both `--live` and `--apply` to mutate the live queue. Its transaction rechecks every row before changing it. A crash after some rows are reset is safe: producer repairs become ordinary queued producer work, logo-only rows become ordinary queued reviewer work, and remaining terminal rows can be previewed again. `mappingRepairHistory` or `approvalRetryHistory` preserves prior decisions across the transition.

The approval loop is paused during implementation so it cannot create new terminal failures under the old contract. If deployment or tests fail, leave the reviewer stopped and the producer running; no existing live source is published or enabled by this work. If an agent is stopped while holding a lease, release only its exact claimed row after confirming the worker identity.

## Artifacts and Notes

The baseline live database snapshot at the start of this plan contained 161 rejected approval jobs and 212 failed mapping jobs. Seventy-four rejected jobs mentioned a local-only or `--live` refusal, and 65 had no other blocking issue. Fifty-eight rejected jobs mentioned manual-logo review, thirteen mentioned missing location/coordinates, twelve mentioned missing scrape evidence, and ten mentioned unavailable producer files or commits. Counts overlap when one package has several issues.

## Interfaces and Dependencies

`configureAffiliateLiveDatabaseEnvironment(liveDatabaseUrl, env?)` in `src/server/affiliateImports/agentRepository.ts` is the only helper generated setup scripts should use to select the live database. `STORAGE_PROVIDER` must be `spaces` during guarded live application.

`affiliateMappingProducerRepairEligibility(input)` returns producer eligibility plus `disposition`, `reasonCodes`, and the primary legacy `repairReason`. It recognizes structured decisions first, classifies historical setup, location, division, pricing, capacity, validation, duplicate, and logo failures, returns logo-absence policy rows as `REVIEWER_RETRY`, preserves old reviewer-handoff failures for their evidence-verified retry, and assigns unclassifiable terminal work to human review.

`npm run affiliate:mapping:retry-rejected` remains the operator command. It is read-only unless both `--live` and `--apply` are present.

Revision note (2026-08-01): Created this plan after the live rejection audit identified guarded setup incompatibility as the primary blocker and manual-logo review as the second largest repair cohort.

Revision note (2026-08-02): Expanded the plan after observing that restarted rejections and deferrals remained terminal. Added structured repair ownership, bounded automatic requeue, explicit human-review state, historical deferred recovery, and skill-learning requirements.

Revision note (2026-08-02): Superseded the mandatory official-logo gate. Added explicit accepted logo absence, guarded missing-logo application, and reviewer retry for historical logo-only terminal packages.
