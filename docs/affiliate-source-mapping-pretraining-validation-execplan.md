# Prove the affiliate mapping agent before training it

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. This plan is the pre-training validation and data-readiness child of `docs/affiliate-source-mapping-slm-execplan.md`. The parent plan owns OVH provisioning, open-weight model serving, adapter training, deployment, and staged production rollout. This plan owns the work that must be completed before any paid training job is allowed: building trustworthy gold examples, extending evaluation to execute real generated scrapers against disposable infrastructure, benchmarking untouched base models, and deciding whether sufficient evidence exists to train.

## Purpose / Big Picture

BracketIQ already has many affiliate source mappings, but a mapping alone is only an output. Supervised model training needs a reproducible pair: the exact HTML, Markdown, links, policy evidence, and other stored artifacts that a worker receives as input, plus the human-approved mapping and normalized candidates that count as the correct output. Training on mappings whose original evidence is missing would teach the model to repeat historical assumptions without proving that their dates, official URLs, locations, classifications, or logo choices were supported.

After this plan is complete, an operator can run an untouched open-weight base model against a frozen private suite of real BracketIQ source captures and see whether the model actually creates safe, executable scrapers. Each applicable result will be generated in an isolated Git worktree, run twice against hash-verified stored pages and disposable PostgreSQL, and compared with candidates approved before the model run. A separate readiness report will say `DO_NOT_TRAIN`, `TRAINING_CANDIDATE`, or `BASE_MODEL_SUFFICIENT` from objective gates. No model weights will be trained merely because historical mappings exist.

The first locked test release contains 35 reviewed examples representing at least 30 registrable domains. The target data release contains 100 training examples, 20 validation examples, and the same 35 permanently held-out test examples. A first meaningful adapter run may begin at the explicit minimum of 80 training, 15 validation, and 30 test examples only when all coverage, provenance, approval, and leakage gates also pass. Five to ten examples may be used for the existing one-example-overfit and pipeline smoke tests, but those tests prove only that adapter weights can change; they do not authorize model promotion.

## Progress

- [x] (2026-07-29 20:37Z) Re-ran the local read-only baseline, historical dataset inventory, and evidence-backfill planner. They made zero public requests and zero database writes.
- [x] (2026-07-29 20:37Z) Confirmed that the current local inventory has 202 sources, 201 active mappings, 194 validated active mappings, 221 intakes, two selected runs with stored artifacts, one source linked to an intake, and zero train-eligible examples.
- [x] (2026-07-29 20:37Z) Confirmed that the current evidence labels are 197 `LEGACY_PARTIAL`, four `STALE`, and one `BLOCKED`, and that the backfill planner proposes 200 new intakes, one existing-intake reuse, and one blocked record.
- [x] (2026-07-29 20:37Z) Confirmed that the deterministic River City control can generate a scraper, run it twice against digest-pinned disposable PostgreSQL, retain one deduplicated review candidate, publish nothing, and clean up its container and temporary worktrees.
- [x] (2026-07-29 20:54Z) Recorded this pre-training validation plan with exact data-size targets, evaluation gates, safety boundaries, and handoff conditions.
- [ ] Define and test the immutable gold-example, gold-release, execution-result, and training-readiness contracts.
- [ ] Produce a deterministic, read-only cohort proposal that selects the 35-example test set before selecting training or validation examples.
- [ ] Re-intake, review, approve, and freeze the first 35 real test examples without exposing their gold outputs to the worker.
- [ ] Extend model evaluation so every executable result runs from stored fixture pages in an isolated worktree and disposable database, twice.
- [ ] Add candidate precision, candidate recall, evidence-citation accuracy, duplicate safety, publication safety, and execution success to hard eligibility.
- [ ] Run the untouched base-model bakeoff on the real OVH host and preserve immutable reports.
- [ ] Build at least 80 approved training examples and 15 approved validation examples, with a target of 100 and 20, while leaving the test release unchanged.
- [ ] Emit the final pre-training readiness decision and either stop because the base model is sufficient, authorize a bounded adapter experiment, or select a different base model.

## Surprises & Discoveries

- Observation: the repository contains many mappings but no automatically usable supervised-training examples.
  Evidence: the 2026-07-29 local dataset dry run reported 202 total rows, 197 `LEGACY_PARTIAL`, four `STALE`, one `BLOCKED`, and `trainEligible: 0`. Validation timestamps do not supply the missing source evidence.

- Observation: the intake count substantially overstates evidence readiness.
  Evidence: the same local baseline reported 221 intakes, but only two had selected runs with stored artifacts, only two had `ALLOWED` compliance, and only one was linked to an affiliate source. The other 219 remained unreviewed.

- Observation: the current model evaluator does not yet prove that generated selectors produce the candidates the model claims they will produce.
  Evidence: `src/server/affiliateImports/agentEvaluation.ts` validates the draft, compares `draft.expectedCandidates` to the gold draft, and calls the deterministic renderer, but it does not execute the generated setup script or inspect persisted candidates. The separate disposable River City command proves that execution path for one invented control only.

- Observation: the current assisted-pilot gate records candidate precision, candidate recall, and evidence-citation accuracy without requiring them to pass.
  Evidence: `evaluateAffiliateMappingModel` includes those metrics in its report, while `assistedPilotEligible` currently gates schema, refusal, policy, target kind, official URL, publish-critical fields, generator pass rate, and hard violations only.

- Observation: one invented control is useful for infrastructure testing but says nothing about real-site generalization.
  Evidence: `training/affiliate-source-mapping/fixtures/control-job-v1.json` uses the invented River City source and `.invalid` URLs. It can test contracts, generation, isolation, deduplication, and refusal mechanics, but it cannot measure accuracy on real organization HTML or Markdown.

- Observation: TEAM coverage is intrinsically scarce in the current source inventory.
  Evidence: the local source inventory contains 157 EVENT, 23 CLUB, 20 RENTAL, and only two TEAM sources. The split must reserve one TEAM domain for the locked test set and one for training or validation rather than letting both leak into one split.

## Decision Log

- Decision: do not train model weights from `LEGACY_PARTIAL` or `STALE` mappings.
  Rationale: these rows lack a trustworthy exact input/output relationship. They remain useful for choosing sources to re-intake, retrieving examples for humans, and finding likely failure modes, but they cannot be promoted into SFT rows until current stored evidence and a human-approved output agree.
  Date/Author: 2026-07-29 / Codex

- Decision: freeze the real test set before constructing the training set.
  Rationale: choosing test cases after seeing model failures would bias the score and make the claimed improvement difficult to trust. Test domains and expected outputs are locked first and are never included in prompts, retrieval examples, fine-tuning, or correction training.
  Date/Author: 2026-07-29 / Codex

- Decision: use 35 examples and at least 30 registrable domains for the first locked test release.
  Rationale: this is large enough to cover the four target kinds, policy refusals, selector and manual mappings, detail pages, JavaScript rendering, evergreen programs, and several platform families while remaining feasible for careful human review. It is not a statistical guarantee; every report must still include per-example results and confidence intervals when comparing close scores.
  Date/Author: 2026-07-29 / Codex

- Decision: target 100 training, 20 validation, and 35 test examples; require at least 80, 15, and 30 before a meaningful adapter experiment.
  Rationale: a narrow schema-constrained task can show a learning signal with fewer examples than a general language task, but a very small set is likely to memorize domains and templates. Counts alone are insufficient: domain separation, target-kind coverage, policy examples, approval, and real execution must also pass.
  Date/Author: 2026-07-29 / Codex

- Decision: compare actual persisted candidates, not the model's `expectedCandidates` assertions, when scoring executable mappings.
  Rationale: a model can write plausible expected output while producing selectors that extract nothing or the wrong fields. The production behavior is the result of running the generated mapping through `mappingExtractor.ts` and `service.ts`, so evaluation must observe that boundary.
  Date/Author: 2026-07-29 / Codex

- Decision: require two review scrapes per executable example.
  Rationale: the first run proves extraction and persistence; the second proves stable deduplication and idempotent setup. Both runs must stay in review mode, leave the mapping unvalidated, and publish no candidate.
  Date/Author: 2026-07-29 / Codex

- Decision: keep raw source evidence and gold outputs private and outside Git.
  Rationale: stored HTML, screenshots, provider envelopes, and expected mappings may contain licensed site content or sensitive operational metadata. Git contains schemas, invented controls, tests, and redacted manifests only. Private releases are identified by immutable hashes and durable object-storage paths.
  Date/Author: 2026-07-29 / Codex

- Decision: do not generate real organization logos as part of this model evaluation.
  Rationale: the worker may identify an official stored asset, an official screenshot crop, or a missing/manual-review disposition. Fabricating branding is a hard violation. BracketIQ-owned generic artwork belongs to a separate image-generation workflow.
  Date/Author: 2026-07-29 / Codex

- Decision: training is optional, not the predetermined outcome.
  Rationale: if an untouched base model passes the complete end-to-end gates with bounded retrieval and deterministic generation, keeping the base avoids adapter maintenance and data risk. Training is justified only when the selected safe base has systematic, learnable errors and the approved corpus is ready.
  Date/Author: 2026-07-29 / Codex

## Outcomes & Retrospective

This plan has been recorded, and the current dataset state has been measured read-only. The repository has enough historical source work to form a strong intake-prioritization backlog, but it has zero examples that pass the implemented training gate today. No paid model training, live intake capture, live queue claim, or public scrape was performed while writing this plan.

The most important implementation gap is now explicit: the model evaluator must execute generated scrapers for every applicable example and compare persisted candidates to gold output. The existing standalone disposable proof demonstrates the necessary safety boundary, so the work is an extraction and composition task rather than an unproven design.

Update this section after each major milestone with the actual cohort counts, rejection reasons, base-model scores, human review time, Sol correction rate, and final `DO_NOT_TRAIN`, `TRAINING_CANDIDATE`, or `BASE_MODEL_SUFFICIENT` outcome.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-site`. This is a Next.js and TypeScript application with Prisma and PostgreSQL. Affiliate scraping code lives under `src/server/affiliateImports`. A source is a public website configured for scraping. A mapping is JSON interpreted by `src/server/affiliateImports/mappingExtractor.ts`. A candidate is a normalized review record persisted by `src/server/affiliateImports/service.ts`. Candidate kinds are `EVENT`, `RENTAL`, `TEAM`, and `CLUB`.

A source intake is a durable capture of public evidence. The relevant database records are `AffiliateSourceIntakes`, `AffiliateSourceIntakePages`, `AffiliateSourceIntakeRuns`, and `AffiliateSourceIntakeArtifacts`. The existing exporter in `scripts/export-affiliate-source-intake.ts` reconstructs a local evidence bundle from stored database and object-storage data without contacting the public site. The bundle includes a manifest, compact source evidence, HTML, Markdown, screenshots, links, images, branding, logo candidates, robots evidence, and provider envelopes when those artifacts were captured.

A gold example is an exact input/output pair approved by a human. Its input is the bounded `AffiliateMappingJobContext` used by the worker plus hash-verified fixture pages required to execute the proposed mapping. Its output is an approved `AffiliateSourceDraft` and the normalized candidates expected after the real extractor and import service run. Gold status does not follow automatically from an old mapping, a `validatedAt` timestamp, or a published candidate.

A registrable domain is the organization-controlled portion of a hostname, such as `example.org` rather than `events.example.org`. Every registrable domain belongs to exactly one of three data splits. The training split changes adapter weights. The validation split guides prompt, hyperparameter, and checkpoint choices. The test split is locked before those choices and is used only to record the untouched-base baseline and the final comparison. Where practical, a hosted platform or repeated template family also stays inside one split so shared markup does not inflate generalization.

The existing code already provides important boundaries:

- `src/server/affiliateImports/agentContracts.ts` validates drafts, worker results, reviews, training examples, and open-weight manifests.
- `src/server/affiliateImports/agentDataset.ts` inventories historical data, labels evidence, and assigns deterministic domain splits.
- `src/server/affiliateImports/agentTrainingRelease.ts` accepts only human-approved `FAITHFUL` or safe `BLOCKED` teaching envelopes and rejects secrets and domain leakage.
- `src/server/affiliateImports/agentEvaluation.ts` scores structured model output but must be extended to consume real execution results.
- `src/server/affiliateImports/agentGenerator.ts` renders allowlisted files from safe generic or manual drafts.
- `src/server/affiliateImports/agentRunner.ts` binds a draft to job identity and evidence and operates in an isolated worktree.
- `src/server/affiliateImports/agentReviewFixtureClient.ts` reads exact local page fixtures by URL, verifies SHA-256, enforces path containment, and makes no network request.
- `scripts/run-affiliate-agent-disposable-scrape-fixture.ts` proves the generated setup and import path against digest-pinned PostgreSQL for one invented example.
- `scripts/evaluate-affiliate-mapping-agent.ts` invokes a fixture worker or private llama.cpp worker against a JSON suite.
- `docs/affiliate-source-mapping-model-bakeoff.md` is the durable not-yet-run base-model result surface.

The affiliate source-builder rules remain authoritative for gold approval. Official outbound action URLs must be preserved. Dates cannot be inferred from scrape time or invented. Venue, address, and city are publish-critical when the source exposes them. Blocked policy is a successful refusal. New mappings remain unvalidated, recurring scraping remains disabled, and real organization logos must come from official evidence or stay missing for manual review.

## Plan of Work

### Milestone 1: Define the gold-release and readiness contracts

Add `src/server/affiliateImports/agentGoldDataset.ts`. Define Zod schemas and exported TypeScript types for `AffiliateMappingGoldExample`, `AffiliateMappingGoldRelease`, `AffiliateMappingEvaluationExecutionResult`, and `AffiliateMappingTrainingReadinessReport`.

`AffiliateMappingGoldExample` must contain a schema version, stable example id, split, registrable domain, optional platform family, target kind or refusal class, evidence origin, worker context, approved draft, expected persisted candidates, fixture-page manifest, and human approval. Evidence origin is `REAL_CAPTURE`, `DERIVED_EVIDENCE_ABLATION`, or `INVENTED_CONTROL`. A derived evidence ablation is a safe-refusal example made by deliberately withholding a required page or artifact from a real capture; it must say exactly what was withheld. Invented controls test mechanics but do not count toward the required real-source totals.

The fixture-page manifest binds every fetchable URL to a stored file, final URL, status code, byte length, and SHA-256. Every artifact cited by the approved draft must exist in the context. Every expected candidate must use an official non-BracketIQ action URL. Scheduled candidates must have a source-evidenced future start. `NO_FIXED_DATE` and `ONGOING` candidates must have a clear display mode and no invented start.

`AffiliateMappingGoldRelease` records release id, creation time, repository commit, prompt and contract revisions, example ids, source-envelope hashes, row hashes, counts by split, target kind, mapping mode, evidence origin, registrable domain, and platform family. It must reject duplicate ids, a domain in more than one split, a test example appearing in retrieval/training metadata, missing human approval, direct email addresses, credentials, private keys, database URLs, and temporary signed URLs.

`AffiliateMappingTrainingReadinessReport` has one of three decisions:

- `DO_NOT_TRAIN` means data, safety, execution, or base-model suitability is insufficient.
- `TRAINING_CANDIDATE` means the chosen base is safe enough to improve, has systematic quality failures, and the minimum corpus is ready.
- `BASE_MODEL_SUFFICIENT` means the untouched base already meets the production-quality gates, so adapter training is not justified yet.

Add `src/server/affiliateImports/__tests__/agentGoldDataset.test.ts`. Test valid real, blocked, derived-insufficiency, and invented-control examples. Test failures for missing approval, unknown evidence hashes, invented dates, internal URLs, generated logos, split leakage, secret leakage, duplicate ids, and counting invented controls toward readiness.

At the end of this milestone, a small invented release validates deterministically and a malformed or leaked release fails before any model or database starts.

### Milestone 2: Select and freeze the real evaluation cohort

Add `scripts/plan-affiliate-mapping-gold-cohort.ts` with package command `affiliate:mapping:gold-plan`. It is read-only by default and must make zero public requests and zero database writes. It consumes the same source, mapping, intake, candidate, setup-script, domain, and platform inventory as `agentDataset.ts`.

The planner selects test first. It proposes 35 examples from at least 30 registrable domains. The proposal must reserve one of the two TEAM domains for test, include at least five CLUB and five RENTAL examples, and fill the remainder with representative EVENT and refusal cases. Across the cohort it must include at least 12 selector mappings, eight manual-candidate mappings, four detail-page or JavaScript-rendered sources, five blocked or insufficient-evidence cases, evergreen and scheduled events, and at least two cases whose correct answer is `CUSTOM_EXTRACTOR_REQUIRED` or an equivalent human escalation.

The planner prioritizes sources with an existing setup script, reviewed candidate history, and a validated mapping because they reduce gold-review work, but it must still mark them unapproved until a current intake capture matches the output. It excludes stale and replaced rows. It records why each source was selected, which exact pages need capture, which existing mapping may be used as a comparison, and which target-kind or platform quota the source satisfies.

Write only a redacted cohort manifest under ignored `output/affiliate-mapping-agent/gold-cohorts/<cohort-id>/` when `--write` is supplied. Do not queue public captures in this command. Add deterministic selection tests in `src/server/affiliateImports/__tests__/agentGoldDataset.test.ts`, including order independence and scarce TEAM allocation.

Review the proposed domains before any capture. Once accepted, write a lock manifest with immutable ids and domain assignments. Replacing a source after lock creates a new cohort version and records the reason; it never silently edits the original.

At the end of this milestone, the repository can print the same proposed test cohort from unchanged inputs, and a reviewer can see exactly why it covers the required source behaviors.

### Milestone 3: Capture and approve the 35-example gold test release

Use the existing admin intake workflow to capture the required listing, detail, registration or booking, policy, branding, and logo pages for one selected source at a time. This is an explicitly authorized live intake operation because it may contact public sites and consume provider credits. Export the stored run before reviewing. Do not substitute ad hoc browsing when the intake is incomplete; update the intake and create a new stored run.

For each source, a human reviewer inspects the stored HTML, Markdown, screenshot, links, robots result, and official action path. The reviewer compares the current evidence to the existing mapping and setup script. If the old mapping still matches, it can become the proposed gold output. If it is incomplete or stale, create a corrected draft from current evidence. If policy blocks the needed path, approve a blocked refusal. If the available evidence cannot support a safe mapping, approve `INSUFFICIENT_EVIDENCE` or `CUSTOM_EXTRACTOR_REQUIRED` rather than guessing.

The human must review the expected persisted candidates field by field, including title, candidate kind, official action URL, source URL, date mode and start, venue, address, city, sport, tags, pricing, divisions, participant mode, capacity, and warnings when applicable. For real logos, approve only an official stored asset, an official screenshot crop, missing, or manual review. Logo normalization and rendered fit remain a separate human task and are not generated by the worker.

Add `scripts/build-affiliate-mapping-gold-release.ts` with package command `affiliate:mapping:gold-release`. It consumes reviewed teaching envelopes and fixture-page manifests, validates the new contracts, and writes an immutable private release under `output/affiliate-mapping-agent/gold-releases/<release-id>/`. The release includes `manifest.json`, split JSONL, fixture manifests, and hashes. Raw HTML, Markdown, screenshots, and other stored evidence remain in the existing intake export or durable private object storage and are referenced by hash rather than copied into Git.

The gold reviewer completes and hashes expected output before model evaluation. During a blind base-model run, the worker receives only the job context and allowed evidence. It never receives `approvedDraft`, `expectedPersistedCandidates`, gold registry paths, another mapping from the same domain, or the test release manifest.

At the end of this milestone, the locked release contains 35 approved test examples from at least 30 domains, every real example has complete stored evidence and human approval, and the release builder reports zero domain leakage and zero forbidden data.

### Milestone 4: Execute every model-produced scraper end to end

Extract the reusable disposable database and worktree lifecycle from `scripts/run-affiliate-agent-disposable-scrape-fixture.ts` into `scripts/lib/affiliate-agent-disposable-evaluation.ts`. Preserve the digest-pinned PostgreSQL 17 image, migration deployment, explicit local storage root, empty ScrapingDog and Google Maps keys, exact worktree cleanup, and final container removal.

Extend `AffiliateAgentReviewFixtureClient` only if the gold fixture manifests require multiple listing and detail pages. It must continue to require exact URL matches, path containment, bounded file size, and correct SHA-256. It must never fall back to a network client when evaluation mode is active.

Add an execution callback to `evaluateAffiliateMappingModel` or create `evaluateAffiliateMappingModelEndToEnd` in `src/server/affiliateImports/agentEvaluation.ts`. For each safe executable draft, the evaluator renders the controlled files into a detached worktree at the recorded base commit, runs the fixed focused tests, performs setup without `--scrape`, then performs two explicit review scrapes against the disposable database.

After each run, query the source, active mapping, scrape runs, candidates, and any unpublished backing event, team, facility, or organization created by the review importer. Normalize the persisted candidates into the same comparison shape as `expectedPersistedCandidates`. Record first-run created count, second-run updated count, total stable candidate identities, rejected rows and reasons, duplicate identities, mapping validation state, auto-scrape state, published count, unexpected target rows, generated file paths, focused-test result, and cleanup result.

Evaluation fails hard if a generated source contacts a URL absent from the fixture manifest, writes outside the allowlist, produces a validated mapping, enables automation, publishes a candidate, changes a public organization, leaves duplicate identities, accesses live data, retains a container, or leaves a generated temporary worktree registration.

Change `assistedPilotEligible` so it also requires 100 percent evidence-citation accuracy, at least 95 percent candidate precision, at least 90 percent candidate recall, at least 80 percent end-to-end executable pass rate among applicable examples, zero duplicate identities, zero published candidates, and zero execution hard violations. Continue to require 100 percent schema, policy, and safe-refusal correctness; at least 90 percent target-kind accuracy; at least 95 percent official-URL accuracy; at least 90 percent publish-critical-field accuracy; at least 80 percent generator pass rate; and zero hard violations.

Add `src/server/affiliateImports/__tests__/agentEvaluationExecution.test.ts`. Test an accurate scraper, an empty selector, a wrong official URL, an invented date, a second-run duplicate, a blocked source that emits code, an unexpected fixture URL, an unauthorized file, a mapping that enables automation, and a candidate that becomes published. Use invented fixtures in Git; do not check real test output into the repository.

At the end of this milestone, evaluation of the invented control proves the whole model-to-database path, and deliberately broken generated mappings fail for the observable behavior they would cause in production.

### Milestone 5: Benchmark untouched open-weight base models

Provision and verify the OVH inference host according to `docs/affiliate-source-mapping-slm-execplan.md` only after the user approves the exact order and price. Complete the open-weight manifest for each candidate, copy locally retainable weights, verify license and notices, and prove cold start with outbound network disabled and no vendor API key.

Run gpt-oss-20b, Qwen3-Coder-30B-A3B-Instruct, and the pinned sub-10B fallback on the same host, one at a time. Use the same locked gold release, 8,192-token context ceiling, 2,048-token output ceiling, prompt/tool contract, temperature zero, fixed seed where supported, one server slot, and q8 key/value cache. Record one complete scored pass and repeat a fixed ten-example reliability subset three times to detect unstable output.

The base-model report includes the structured and end-to-end metrics, per-example failures, peak resident memory, peak swap, minimum free memory, prompt and output throughput, wall time, retries, and timeouts. Sol may review each failure through the existing structured reviewer, but its output cannot revise the locked gold release. Record the material-correction rate separately.

Select only a model that passes the open-weight, offline, security, RAM, swap, and completion-time gates in the parent plan. If all candidates fail a hard policy or infrastructure gate, emit `DO_NOT_TRAIN` and select or evaluate a different base model before collecting adapter results. Do not assume LoRA will repair a base model that cannot reliably follow the output contract or safety boundary.

If the best untouched base already passes every assisted-pilot quality gate, emit `BASE_MODEL_SUFFICIENT`. Continue with the base model and gather real assisted corrections before reconsidering training. If the base has no hard safety violations but misses coherent quality gates such as selector selection, classification, location mapping, or refusal calibration, it may become a `TRAINING_CANDIDATE` after the data milestone passes.

At the end of this milestone, `docs/affiliate-source-mapping-model-bakeoff.md` contains actual OVH measurements and a reproducible untouched-base result rather than model-card estimates.

### Milestone 6: Build the training and validation corpus

After the test release is locked, run the cohort planner again for training and validation. Keep every locked test domain and platform-family restriction excluded. Target 100 training and 20 validation examples; do not authorize a meaningful adapter run below 80 and 15.

The training split must contain the one non-test TEAM source when it is faithful, at least ten CLUB and ten RENTAL examples, a representative EVENT mix, selector and manual mappings, detail pages, JavaScript rendering, scheduled and evergreen programs, and at least twelve blocked or insufficient-evidence examples. The validation split must include at least one example of each target kind available outside test, at least three refusal examples, and both selector and manual mappings.

Real captures are preferred. Derived evidence-ablation examples may supplement refusal training by removing a required page or artifact from a real capture and approving the resulting insufficient-evidence response. They must retain their origin label and cannot replace the required count of real executable mappings. Invented controls remain pipeline tests and do not count toward the 80/15/30 minimum.

Use the same intake, human approval, gold-release, domain-split, and secret-scanning process as the test suite. Existing `LEGACY_PARTIAL` mappings become `FAITHFUL` only after a current intake and candidate run prove they still match. Stale mappings remain excluded. The single current blocked row can become a refusal example after its policy evidence and human approval are complete.

Build the SFT release with `npm run affiliate:mapping:sft-release`. Verify that its manifest hashes and split counts agree with the gold release, that no test domain appears in train or validation, that the system prompt revision matches inference, and that all output drafts are human-approved.

At the end of this milestone, the repository can produce an immutable, private SFT release with at least 80 training and 15 validation examples and the readiness report still references the unchanged locked test release.

### Milestone 7: Make the pre-training decision

Add `scripts/report-affiliate-mapping-training-readiness.ts` with package command `affiliate:mapping:training-readiness`. It accepts the gold-release manifest, SFT-release manifest, selected base-model report, runtime observation, and optional Sol correction summary. It recomputes all hashes and gates rather than trusting labels supplied on the command line.

Emit `DO_NOT_TRAIN` when any required dataset count or coverage is missing, any domain leaks across splits, approval or evidence is incomplete, the test release changed after the base benchmark, the selected base has a hard safety or infrastructure violation, the evaluation did not execute real candidate persistence, or the error analysis does not identify a plausible learnable pattern.

Emit `BASE_MODEL_SUFFICIENT` when the untouched base passes every assisted-pilot quality and infrastructure gate. Emit `TRAINING_CANDIDATE` only when the selected base is safe and operable, misses one or more quality gates through repeated learnable errors, and the minimum training and validation corpus passes.

The report contains no command that launches training. A `TRAINING_CANDIDATE` result is the handoff to Milestone 8 of `docs/affiliate-source-mapping-slm-execplan.md`, where the user still controls paid-job authorization and cost. The base evaluation hash, gold-release hash, SFT-release hash, and readiness-report hash become inputs to the training experiment manifest.

At the end of this milestone, the user has a reproducible answer to both questions: whether the current base model is good enough without training, and whether BracketIQ has enough approved data to justify changing its weights.

## Concrete Steps

Run all commands from `/Users/elesesy/StudioProjects/mvp-site`.

First reproduce the current read-only baseline:

    npm run affiliate:mapping:baseline -- --dry-run
    npm run affiliate:mapping:dataset -- --dry-run
    npm run affiliate:mapping:backfill-plan -- --dry-run

The expected current dataset summary is:

    {
      "total": 202,
      "byEvidenceLabel": {
        "BLOCKED": 1,
        "LEGACY_PARTIAL": 197,
        "STALE": 4
      },
      "trainEligible": 0,
      "databaseWrites": 0,
      "publicRequests": 0
    }

Implement and test the gold contracts and deterministic cohort planner:

    npx jest --runInBand \
      src/server/affiliateImports/__tests__/agentGoldDataset.test.ts
    npm run affiliate:mapping:gold-plan -- --dry-run

The planner must report 35 proposed test examples, at least 30 domains, the required target-kind and mapping-mode coverage, `databaseWrites: 0`, and `publicRequests: 0`. If the available inventory cannot satisfy a quota, it must report the deficit and exit nonzero rather than silently weakening the cohort.

After explicit authorization for intake captures, use the existing admin intake workflow one source at a time. Discover and export stored evidence with:

    npm run affiliate:intake:export -- --live --list --search <name-or-host>
    npm run affiliate:intake:export -- --live --source-key <source-key> --run-id <run-id>

These export commands read stored live data and object storage but make no public request and write no live row. Queueing or refreshing an intake is a separate authorized operation. Record the selected source key, run id, compliance result, pages, artifact kinds, and hashes in each review envelope.

Build the locked private test release:

    npm run affiliate:mapping:gold-release -- \
      --input=<approved-test-envelopes.jsonl> \
      --release=affiliate-mapping-gold-test-v1

Expected output includes:

    {
      "counts": { "test": 35 },
      "realTestExamples": 35,
      "testRegistrableDomains": 30,
      "domainLeakage": 0,
      "forbiddenDataFindings": 0
    }

Implement and run the end-to-end evaluator checks:

    npx jest --runInBand \
      src/server/affiliateImports/__tests__/agentEvaluation.test.ts \
      src/server/affiliateImports/__tests__/agentEvaluationExecution.test.ts \
      src/server/affiliateImports/__tests__/agentReviewFixtureClient.test.ts
    npm run affiliate:mapping:disposable-scrape

The disposable transcript must show two successful runs, one stable candidate identity, an unvalidated mapping, zero published candidates, zero public scrape requests, zero live writes, and successful cleanup.

Run the untouched model suite on the verified private OVH endpoint:

    AFFILIATE_MAPPING_MODEL_TOKEN=<private-token> \
      npm run affiliate:mapping:evaluate -- \
        --worker=llama \
        --suite=<private-gold-test-v1.json> \
        --model-endpoint=http://model:8080 \
        --model-manifest=<model-manifest.json> \
        --model-id=<exact-model-id> \
        --output=<immutable-evaluation-output.json>

Repeat for every candidate with no suite or configuration change. Record runtime observations and select through the existing bakeoff commands:

    npm run affiliate:mapping:bakeoff:record -- <reviewed arguments>
    npm run affiliate:mapping:bakeoff:select -- <candidate reports>

After the test release and base baseline are locked, build training and validation releases:

    npm run affiliate:mapping:gold-release -- \
      --input=<approved-train-validation-envelopes.jsonl> \
      --release=affiliate-mapping-gold-train-v1
    npm run affiliate:mapping:sft-release -- \
      --input=<approved-train-validation-envelopes.jsonl> \
      --release=affiliate-mapping-sft-v1

Produce the no-training/training decision:

    npm run affiliate:mapping:training-readiness -- \
      --gold=<gold-release-manifest.json> \
      --sft=<sft-release-manifest.json> \
      --base-report=<selected-base-report.json> \
      --runtime=<runtime-observation.json> \
      --output=<training-readiness-report.json>

Finish with repository validation:

    npx jest --runInBand src/server/affiliateImports/__tests__
    python3 -m unittest test_training_common.py
    npx prisma validate
    npx tsc --noEmit
    npm run test:ci
    git diff --check

Run the Python command from `training/affiliate-source-mapping`; run every other command from the repository root. Compose and shell checks from the parent plan remain required when deployment files change.

## Validation and Acceptance

The gold contract is accepted when the same approved envelopes produce byte-identical manifests and row hashes, while missing approval, evidence mismatch, leaked secrets, internal action URLs, invented dates, generated logos, duplicate ids, and domain leakage all fail before file output.

The cohort planner is accepted when it deterministically proposes the required 35-example test cohort from unchanged inputs, reports every coverage quota and deficit, assigns each registrable domain to exactly one split, and makes zero public requests and database writes.

The test release is accepted when 35 examples from at least 30 domains have complete real stored evidence and human-approved expected candidates. At least one TEAM, five CLUB, five RENTAL, representative EVENT, selector, manual, detail-page, JavaScript, evergreen, scheduled, blocked, insufficient-evidence, and custom-extractor cases must be present. Derived and invented examples are reported separately and cannot satisfy real-source quotas.

End-to-end evaluation is accepted when every applicable model draft is generated in an isolated worktree, reads only hash-approved fixture pages, runs focused tests, performs setup and two review scrapes against disposable PostgreSQL, and compares persisted candidates to gold. A second run must create no duplicate identity. The mapping must remain unvalidated, automation disabled, published count zero, live writes zero, and public requests zero.

The untouched-base benchmark is accepted when every candidate uses the identical locked suite and configuration on the same verified OVH host, every model and runtime artifact is pinned by hash, and reports contain per-example structured, execution, safety, memory, swap, throughput, and latency results. Expected outputs must never appear in model prompts or retrieval.

The project is training-ready only when at least 80 real approved training examples, 15 approved validation examples, and 30 unchanged held-out test examples pass every provenance and split gate; the selected base is safe and operational; its baseline is recorded; and its failures form coherent learnable categories. The preferred release remains 100, 20, and 35.

The base is sufficient when it reaches 100 percent valid envelopes, safe refusals, policy decisions, and evidence citations; at least 90 percent target-kind accuracy; at least 95 percent official-URL accuracy; at least 90 percent publish-critical-field accuracy; at least 95 percent candidate precision; at least 90 percent candidate recall; at least 80 percent generator and end-to-end execution pass rates; zero duplicate identities; zero publication; zero hard violations; and the parent plan's OVH memory, swap, offline, and wall-time gates.

## Idempotence and Recovery

Audit and cohort-planning commands are read-only by default. Writing an ignored report requires `--write`; queueing or refreshing an intake is a separate explicit action. Re-running a planner against unchanged inputs produces the same example assignments and hashes.

Gold and SFT releases are immutable. Never overwrite a release directory. If an approval, source capture, contract, or expected candidate changes, create a new release id linked to the old release and record the reason. Once a test release has been used for a base benchmark, do not move its examples into training or validation.

Public sites may change after capture. Evaluation continues to use the frozen stored artifacts so base and adapter see the same input. A later freshness review may create a new gold release; it does not rewrite the old score.

Disposable evaluation uses only exact generated container names and temporary worktree parents. Always remove those resources in `finally` blocks, canonicalize macOS temporary paths with `realpath`, and verify no matching Docker container or Git worktree registration remains. Never prune or delete unrelated user worktrees.

If an evaluation crashes, retain its immutable partial report and logs, clean up the exact disposable resources, and retry under a new run id. Do not treat a partial pass as eligible.

If a secret, signed URL, personal email, disallowed source, or test-domain leak is found, quarantine the affected gold release, SFT release, and every derived adapter. Build a corrected release from the unchanged base model; do not patch a trained adapter in place.

Training remains a separate authorized action. A readiness result does not spend money, order an OVH resource, start a GPU job, enable live scraping, validate a mapping, publish a candidate, or push a branch.

## Artifacts and Notes

The local baseline captured on 2026-07-29 reported:

    sources.total = 202
    sources.withSourceEvidence = 5
    sources.linkedToIntake = 1
    mappings.active = 201
    mappings.validatedActive = 194
    intakes.total = 221
    intakes.withSelectedRun = 2
    intakes.withStoredArtifacts = 2
    dataset.trainEligible = 0

The corresponding dry-run dataset manifest reported:

    datasetId = dataset-2026-07-29T20-37-39-702Z-de64b76097b6
    inventorySha256 = 8438c35d91c1d2f8c75652695ee529bc1054e0c04605cd8da4349d394c3bc571
    trainingExamplesSha256 = 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
    evidenceLabels = BLOCKED:1, LEGACY_PARTIAL:197, STALE:4
    trainEligible = 0
    publicRequests = 0
    databaseWrites = 0

The current deterministic database control reports:

    iterations = 2
    sourceCount = 1
    unvalidatedMappingCount = 1
    candidateCount = 1
    publishedCount = 0
    scrapeRunCount = 2
    publicScrapeRequests = 0
    liveDatabaseWrites = 0
    disposed = true

A readiness result should resemble:

    {
      "schemaVersion": 1,
      "decision": "DO_NOT_TRAIN",
      "goldReleaseSha256": "...",
      "sftReleaseSha256": null,
      "baseEvaluationSha256": null,
      "counts": {
        "train": 0,
        "validation": 0,
        "test": 0
      },
      "blockingReasons": [
        "No frozen real test release.",
        "No approved training examples.",
        "No untouched-base benchmark."
      ]
    }

Do not commit real source HTML, Markdown, screenshots, expected drafts, candidate rows, model prompts, or gold suite files. Commit only schemas, scripts, tests with invented `.invalid` fixtures, redacted report templates, and documentation.

## Interfaces and Dependencies

Use the existing Node.js, TypeScript, Zod, Jest, Prisma, PostgreSQL, Docker, and Git worktree tooling. Do not add a training-data platform or database schema until file-backed releases prove that indexed relational state is necessary.

In `src/server/affiliateImports/agentGoldDataset.ts`, expose:

    export type AffiliateMappingGoldExample = {
      schemaVersion: 1;
      exampleId: string;
      split: 'train' | 'validation' | 'test';
      registrableDomain: string;
      platformFamily: string | null;
      evidenceOrigin:
        | 'REAL_CAPTURE'
        | 'DERIVED_EVIDENCE_ABLATION'
        | 'INVENTED_CONTROL';
      context: AffiliateMappingJobContext;
      approvedDraft: AffiliateSourceDraft;
      expectedPersistedCandidates: AffiliateCandidateAssertion[];
      fixturePages: Array<{
        url: string;
        finalUrl: string;
        statusCode: number;
        file: string;
        byteLength: number;
        sha256: string;
      }>;
      humanApproval: {
        approvalId: string;
        approvedByUserId: string;
        approvedAt: string;
      };
    };

    export function buildAffiliateMappingGoldRelease(
      examples: unknown[],
      options: {
        releaseId: string;
        createdAt: Date;
        repositoryCommit: string;
      },
    ): AffiliateMappingGoldRelease;

    export function buildAffiliateMappingTrainingReadinessReport(input: {
      goldRelease: AffiliateMappingGoldRelease;
      sftManifest: AffiliateMappingSftRelease['manifest'] | null;
      baseEvaluation: AffiliateMappingEvaluationReport | null;
      runtimeObservation: AffiliateModelRuntimeObservation | null;
      solCorrectionSummary?: {
        reviewed: number;
        materialCorrections: number;
      };
    }): AffiliateMappingTrainingReadinessReport;

In `src/server/affiliateImports/agentEvaluation.ts`, add:

    export type AffiliateMappingEvaluationExecutionResult = {
      exampleId: string;
      focusedTestsPassed: boolean;
      generatedPaths: string[];
      firstRunCandidateCount: number;
      secondRunCandidateCount: number;
      stableCandidateCount: number;
      duplicateIdentityCount: number;
      publishedCandidateCount: number;
      mappingValidated: boolean;
      autoScrapeEnabled: boolean;
      persistedCandidates: AffiliateCandidateAssertion[];
      publicRequests: number;
      liveDatabaseWrites: number;
      cleanupPassed: boolean;
      hardViolations: string[];
      errors: string[];
    };

    export interface AffiliateMappingEvaluationExecutor {
      execute(input: {
        example: AffiliateMappingGoldExample;
        draft: AffiliateSourceDraft;
        repositoryCommit: string;
      }): Promise<AffiliateMappingEvaluationExecutionResult>;
    }

`evaluateAffiliateMappingModel` must accept an optional executor for invented unit tests and require an executor for real bakeoff runs. `scripts/evaluate-affiliate-mapping-agent.ts` must refuse `--worker=llama` unless the suite is a validated immutable gold release and end-to-end execution is enabled.

Continue using `AffiliateAgentReviewFixtureClient` for evaluation fetches and `AffiliateMappingModelClient` for model inference. Do not expose a general shell tool, public network fallback, live database credential, object-storage credential, model vendor API, or gold-output read tool to the worker.

## Plan Revision Note

Created 2026-07-29 after the user asked how to test the affiliate mapping model before training and whether the existing mappings were sufficient. The read-only audit showed zero train-eligible examples despite 201 active mappings. This plan therefore freezes a real gold test suite first, extends evaluation to the actual scraper and persistence boundary, benchmarks untouched open-weight models, builds a separately approved training corpus, and makes training conditional on an explicit readiness result rather than on raw mapping count.
