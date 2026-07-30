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
- [x] (2026-07-29 21:02Z) Defined and tested the immutable gold-example, gold-release, execution-result, and training-readiness contracts in `agentGoldDataset.ts`; the focused suite passes 5 tests and TypeScript passes.
- [x] (2026-07-29 21:12Z) Implemented and tested the deterministic, read-only 35-example test-cohort planner. The actual local proposal covers 35 distinct domains, one TEAM, five CLUB, five RENTAL, 24 EVENT, 12 selector, 22 manual, four detail/JavaScript, five refusal/insufficiency, two custom-extractor review, five evergreen, and 15 scheduled cases with zero deficits, public requests, or database writes.
- [x] (2026-07-29 22:06Z) Explicitly locked the exact saved proposal `affiliate-mapping-test-d9de7ef53d2c82d1` without recomputing membership. The lock records proposal hash `d9de7ef53d2c82d17acd39f65f1b5eeade8d8060231a7ba964cf61bb28e2ba53`, its original repository commit, the 35 test-domain assignments, platform families, lock timestamp, and the approving user's stable internal id.
- [x] (2026-07-29 21:15Z) Implemented the immutable private gold-release writer. It validates approved JSONL before creating a directory, rejects unsafe release ids and tampered hashes, writes split JSONL plus per-example fixture manifests and `release.sha256`, and refuses to overwrite an existing release.
- [x] (2026-07-29 21:17Z) Re-ran all affiliate-agent suites plus Prisma and TypeScript validation after the data-contract, planner, and release-writer changes: 17 suites and 69 tests passed; `prisma validate`, `tsc --noEmit`, and `git diff --check` exited successfully.
- [x] (2026-07-29 22:19Z) Started live capture on the verified OVH runtime with the first locked example, `03-international-badminton-programs`. Two bounded runs captured all 13 required pages with zero robots blocks, zero failed pages, and 133 exported artifacts whose local bytes match their recorded hashes. Run `b991b5ad-3474-42b1-ba00-2ef04e27e50c` captured 10 pages and is `PARTIAL` only because nine Squarespace favicon candidates were not images; run `4ad49939-9432-4871-b932-2f589d41f82a` captured the remaining three pages and is `SUCCEEDED`.
- [x] (2026-07-29 23:31Z) Ran the complete locked 35-source cohort through the existing ScrapingDog intake path on OVH, one source at a time and in batches of at most 10 pages. The immutable run report records 31 terminal-complete source results, four failed source results, 51 processed runs, and no source left queued or running. Team Lillard was recorded as policy-blocked without a public fetch.
- [x] (2026-07-30 00:02Z) Exported the available intake runs and verified 74 manifests containing 1,306 artifacts and 89,198,851 artifact bytes. Every local artifact exists and matches its recorded SHA-256; there are zero missing files and zero hash mismatches.
- [x] (2026-07-30 00:02Z) Audited exact locked-URL coverage instead of trusting source-level terminal labels. The unchanged ScrapingDog pass resolved 108 required pages with ScrapingDog content and 15 with robots-block evidence, reused two required pages that only have older Firecrawl content, and left 12 pages unresolved, including the intentionally unfetched Team Lillard home page. Twenty-seven sources have complete current-provider evidence, two otherwise-complete sources rely on older Firecrawl evidence, one source is explicitly policy-blocked, and five sources have capture issues.
- [x] (2026-07-30 01:46Z) Paused all 44 live discovery campaigns and verified that no discovery or intake run remains queued or running. Indexing cannot restart through the scheduled campaign worker until an operator explicitly reactivates a campaign.
- [x] (2026-07-30 01:46Z) Implemented bounded source-specific remediation: a 4 MiB robots limit for the Gresham-Barlow responses, a canonical `www` retry after a target 404, explicit 401/403 registration-access evidence instead of stealth scraping, cross-intake evidence ownership, current-provider evidence checks, and certificate-review stops. The focused suite passes 36 tests, TypeScript passes, and `git diff --check` passes.
- [x] (2026-07-30 01:46Z) Replaced 29 accidentally local-backed live artifact rows from the first repair pass and recaptured the affected Lake Oswego and Portland Ultimate pages into DigitalOcean Spaces. The live database now has zero affiliate-intake artifacts backed by a null-bucket `File`.
- [x] (2026-07-30 01:46Z) Refreshed Aspire NW Volleyball and Union County Youth Soccer with ScrapingDog evidence, confirmed current ScrapingDog evidence on the reused Soccer Chance Academy page, and reran the complete locked cohort. The final report has 34 complete sources, one Sherwood certificate review, and zero failed sources.
- [x] (2026-07-30 02:37Z) Deployed the exact current capture helpers to the OVH application container, verified their hashes against the current branch, and reran the complete locked cohort against the live database with Spaces as the active storage provider. Report `capture-progress-current-audit.json`, SHA-256 `1bdd37cc010b500e3553090955776d9cd4b33339519db4be2edaa72d7dd839e3`, independently confirms 34 complete sources, one review-required source, and zero failed sources.
- [x] (2026-07-30 02:37Z) Reverified every locally exported evidence bundle: 79 manifests reference 1,369 artifacts, with zero missing files, zero SHA-256 mismatches, and zero size mismatches.
- [x] (2026-07-30 05:51Z) Created and explicitly locked revised cohort `affiliate-mapping-test-aa6aa626e3f2367c`, proposal hash `aa6aa626e3f2367c4a62f045067b4dfe24ed6347ae9eb6eb2944941ad3292667`. The immutable diff from the original cohort changes only the repository/hash metadata, Sherwood's required page from the invalid apex endpoint to `https://www.sherwoodsoccer.org/`, and the recorded TLS reason. The original proposal and lock remain unchanged.
- [x] (2026-07-30 16:58Z) Deployed revised cohort `affiliate-mapping-test-aa6aa626e3f2367c` to the verified live OVH application container, captured the corrected Sherwood `www` page through ScrapingDog, exported its 14-artifact live run, and completed the full 35-source audit. The immutable report records 35 complete sources, zero failed sources, and zero review-required sources; its SHA-256 is `b6c35da1196266c242d0a470b0d838f32b643de27399634ed62d632e932eb232`.
- [x] (2026-07-30 17:45Z) Created and approved immutable non-test capture plan `affiliate-mapping-training-capture-5ff608652317e904`, hash `5ff608652317e90403df484c9567c345a1189cdd3a8a5b672f4d7eee05af638c`, after excluding every held-out domain, platform family, and cross-domain evidence page. It contains 87 executable mappings across 79 domains and 310 required pages: 60 EVENT, 16 CLUB, 10 RENTAL, and one TEAM.
- [x] (2026-07-30 20:18Z) Ran all 87 approved non-test capture candidates through the live ScrapingDog intake path with Spaces storage. The final report records 71 complete sources, 12 failed sources, and four review-required sources. To prevent stale URLs and provider failures from monopolizing the queue, the coordinator now permits three total attempts per batch by default, down from as many as 11, and records that limit in the immutable report.
- [x] (2026-07-30 20:21Z) Pulled the complete live evidence export and verified 297 manifests, 8,148 referenced artifacts, and 440,558,789 bytes with zero missing files, hash mismatches, or size mismatches. Re-exported the already-captured Sherwood run with an explicit `live` evidence label without making another public request.
- [x] (2026-07-30 20:21Z) Re-exported the live historical dataset at repository commit `c4dfe9b454f1e753714eb8ce2a5fdded0553d5b5`. It contains 203 sources and 199 capture candidates, but still reports `trainEligible: 0`: capture evidence alone does not create a human-approved gold input/output envelope.
- [x] (2026-07-30 20:57Z) Narrowed the mapping-agent target contract to `EVENT`, `RENTAL`, and `CLUB`. The prompt, draft schema, intake hints, cohort planner, capture planner, gold dataset, and SFT release all reject or exclude legacy `TEAM` work while the global importer retains backward-compatible TEAM support. Six focused suites pass 42 tests and `npx tsc --noEmit` exits successfully.
- [x] (2026-07-30 20:57Z) Completed a read-only live dependency audit for the one published affiliate-created canonical team. Its only reference is source candidate `b29e3db5-c608-40be-8393-516a4a4adeb6`; it has zero memberships, event snapshots, invites, join requests, staff links, chats, bills, documents, finance rows, question rows, or legacy `UserData.teamIds` references. No live row was changed.
- [x] (2026-07-30 21:15Z) Added and tested an explicit immutable membership-revision path. It preserves every retained example byte-for-byte, requires one named replacement for each named removal, and leaves the prior proposal and lock unchanged.
- [x] (2026-07-30 21:15Z) Generated live no-TEAM proposal `affiliate-mapping-test-7e930a8a04b0dc2f`, hash `7e930a8a04b0dc2fc1eb00568648118bb862d533945fd31e774d1426006e8788`, at repository commit `402278822c021c1dbb653e9bb6a4b5b3702d067a`. It preserves 34 examples exactly, removes only `timbers-army-fc-community-teams`, adds already-captured `westside-metros-fc-club-events`, covers 35 domains and 136 required pages with six CLUB, five RENTAL, and 24 EVENT examples, and has zero deficits, TEAM examples, public requests, or database writes.
- [ ] Explicitly approve and lock `affiliate-mapping-test-7e930a8a04b0dc2f`, then write its formal 35-of-35 evidence audit without making new public requests.
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

- Historical observation, superseded 2026-07-30: TEAM coverage was intrinsically scarce in the original source inventory.
  Evidence: the local source inventory contained 157 EVENT, 23 CLUB, 20 RENTAL, and only two TEAM sources. That scarcity drove the original split, but TEAM is no longer an affiliate-agent target and neither source may enter a replacement cohort or training release.

- Observation: the existing draft schema protects model output, but a gold release needs additional safeguards that are not properties of a draft alone.
  Evidence: `agentGoldDataset.ts` now rejects test rows marked for retrieval or training, source evidence outside the frozen context, missing list/detail fixtures, past approved scheduled dates, evergreen rows with invented starts, cross-split domains, duplicate ids, and forbidden data before it computes release hashes.

- Historical observation, superseded 2026-07-30: reserving a scarce TEAM source id was not enough to prevent test leakage when another source on the same organization domain was selected.
  Evidence: the first local dry run reserved `rose-city-futsal-community-teams` but selected a different `rosecityfutsal.com` source. Replacement planning now excludes TEAM sources before selection instead of reserving them for another split.

- Observation: structural parsing of a stored release is not enough to prove that its manifest still describes its examples.
  Evidence: `assertAffiliateMappingGoldReleaseIntegrity` now recomputes example ids, source-envelope hashes, row hashes, fixture-manifest paths, fixture-manifest hashes, and total count. The regression test tampers with a row hash and verifies that the release fails before use.

- Observation: the local baseline used to choose the cohort no longer describes the live OVH intake population.
  Evidence: the lock still correctly freezes the approved 35 source/domain assignments, but the pre-write OVH audit found all 35 live source rows and 30 already-linked intakes after newer production automation. Capture preparation therefore reconciles by source key and canonical page identity rather than trusting the proposal's older `PROPOSE_INTAKE` counts.

- Observation: a successful page capture can still produce a `PARTIAL` run for harmless artifact warnings.
  Evidence: the first live gold run captured all 10 requested pages with no blocked or failed page. Its only nine warnings were skipped Squarespace default favicon URLs whose responses were not image content. The exported artifact bytes all match their manifest hashes, so this warning is retained for human review rather than treated as missing evidence.

- Observation: source-level completion can overstate locked-page evidence coverage when a required URL belongs to another intake.
  Evidence: `oregon-youth-soccer-sanctioned-tournaments` was reported complete after six owned pages were captured, but `https://soccerchanceacademy.us/super-cup` was merely recorded as reused from another intake and still has no HTML or Markdown artifact. Exact locked-URL auditing therefore reports six of seven pages, not seven of seven.

- Observation: the unchanged ScrapingDog setup exposed four repeatable capture failures.
  Evidence: the Gresham-Barlow robots response exceeds the configured 524,288-byte bound for two pages; Lake Oswego's two non-`www` Parks & Recreation URLs return ScrapingDog HTTP 404; five Portland Ultimate registration URLs return ScrapingDog HTTP 400 with a stealth-mode suggestion; and the non-`www` Sherwood Soccer robots check fails because its TLS certificate is expired.

- Observation: existing-evidence reuse does not guarantee that the evidence came from the current provider.
  Evidence: the Aspire NW Volleyball home page and Union County Youth Soccer detail page have Firecrawl-only content artifacts. The cohort runner did not refresh them because it found existing HTML or Markdown.

- Observation: artifact export integrity is stronger than run success labels.
  Evidence: 74 exported manifests include successful, partial, blocked, and failed attempts. Across 1,306 referenced artifacts, every local file exists and every SHA-256 matches, even though some source URLs remain unresolved.

- Observation: a valid artifact database row is not sufficient evidence that its object is durable.
  Evidence: the first tunnel-based repair pass inherited `STORAGE_PROVIDER=local`, creating 29 live artifact rows whose `File.bucket` was null. The corrected coordinator now rejects backing files from the wrong active provider, artifact reuse checks storage-provider compatibility and object existence, and all 29 rows and 26 orphaned files were removed before Spaces-backed recapture.

- Observation: the five Portland Ultimate registration actions are public links but require authentication before their content can be read.
  Evidence: bounded direct requests consistently return 401. The intake now records a small `PAGE_ACCESS_STATUS` artifact with `AUTHENTICATION_REQUIRED` and does not spend ScrapingDog credits or attempt to evade the gate.

- Observation: a certificate failure cannot be repaired safely by weakening TLS verification.
  Evidence: Sherwood Soccer's robots request reports an expired certificate. The coordinator emits `ROBOTS_REVIEW_REQUIRED`, queues no public capture, and leaves the source outside the frozen gold release pending an operator decision.

- Observation: Sherwood's healthy canonical hostname is not the same URL that the immutable cohort requires.
  Evidence: on 2026-07-30 the OVH runtime received HTTP 200 for `https://www.sherwoodsoccer.org/robots.txt`, and the live affiliate source uses the `www` URL for both `baseUrl` and `listUrl`. The exact locked page is the apex `https://sherwoodsoccer.org/`, which still fails certificate verification. Same-domain content at `www` cannot silently satisfy a different locked URL key.

- Observation: the existing non-test mapping inventory is too small and too imbalanced to authorize meaningful adapter training even before capture failures are removed.
  Evidence: the historical leakage-safe plan contains 87 executable mappings, of which 86 have supported no-TEAM target kinds, against a minimum of 95. It contains only 16 CLUB and ten RENTAL examples, and after live capture only 71 supported sources are complete: 51 EVENT, 13 CLUB, and seven RENTAL. The live dataset therefore correctly remains at zero train-eligible examples.

- Observation: retry policy, not normal ScrapingDog latency, caused most of the bulk-capture delay.
  Evidence: the original coordinator allowed `max(5, batch page count + 1)` attempts, so a failed 10-page batch could run 11 times. The live continuation used a tested three-attempt ceiling and completed all 87 source decisions while preserving provider, policy, and storage behavior.

- Observation: one affiliate TEAM candidate was published live, but it has no downstream product use.
  Evidence: candidate `b29e3db5-c608-40be-8393-516a4a4adeb6` published canonical team `0f9d1b6c-ee99-4e30-ae6a-fff041f20312`. A read-only audit found the candidate as its only reference and zero rows in every direct membership, event, invite, chat, billing, document, finance, question, moderation, and legacy user-array path. A separate `rose-city-futsal-community-teams` source remains active with automatic scraping enabled but has no TEAM candidate. Disabling or archiving either live record remains an explicit cleanup action, not part of data preparation.

- Observation: unconstrained cohort regeneration creates unnecessary recapture work after a target-contract change.
  Evidence: the first valid no-TEAM proposal reselected six sources, including three with known failed or review-required captures, even though 34 members of the approved cohort remained valid. The explicit membership-revision path instead retains all 34 examples byte-for-byte and replaces only the obsolete TEAM source with a two-page CLUB source whose live ScrapingDog capture is already complete.

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

- Decision (superseded 2026-07-30): reserve scarce TEAM coverage by registrable domain, not merely by source row.
  Rationale: multiple source rows can share one organization website. Allowing any row from the held-back TEAM domain into test would prevent that domain from supplying the non-test TEAM example later and would create split leakage.
  Date/Author: 2026-07-29 / Codex

- Decision: the affiliate mapping agent creates only `EVENT`, `RENTAL`, and `CLUB` outputs.
  Rationale: BracketIQ represents these organizations as clubs in general, so creating affiliate team records adds a second organization-like entity and teaches the wrong product model. TEAM stays in the global importer and database for backward compatibility, but agent schemas, prompts, cohort selection, capture selection, gold validation, and training release construction fail closed against TEAM. Prior cohort files and locks remain immutable historical evidence; a newly hashed no-TEAM cohort requires separate approval.
  Date/Author: 2026-07-30 / User and Codex

- Decision: replace the obsolete held-out TEAM example by explicit membership revision rather than full cohort reselection.
  Rationale: the other 34 examples, their capture pages, and their evidence are still valid. Preserving them exactly minimizes provider work and makes the proposed contract change auditable as one removal and one addition. `westside-metros-fc-club-events` is the replacement because both of its exact required pages already have a complete live ScrapingDog capture.
  Date/Author: 2026-07-30 / Codex

- Decision: live cohort capture may reuse newer OVH intakes, but it must not silently approve an unreviewed domain.
  Rationale: the user authorized public capture requests and provider credits, not an override of site terms or robots policy. The cohort capture command adds exact locked pages and queues only an intake already marked `ALLOWED`; explicit blocked sources are recorded without capture, and unreviewed intakes stop at `COMPLIANCE_REVIEW_REQUIRED`.
  Date/Author: 2026-07-29 / Codex

- Decision: preserve and report current ScrapingDog failures rather than changing the capture path.
  Rationale: the user explicitly directed this cohort to use the existing ScrapingDog setup and asked for issues to be reported without fixes. A brief post-pass diagnostic change was reverted, an alternate-provider attempt was stopped, and neither is counted in the unchanged-setup coverage totals. The live store retains its append-only diagnostic artifacts, but they are not eligible for the locked release unless the user later accepts them.
  Date/Author: 2026-07-29 / User and Codex

- Decision: accept only current-provider evidence whose backing object belongs to the active storage provider.
  Rationale: source-level readiness must survive process and host boundaries. A content artifact with a non-empty size is ineligible when its `File` row points at local storage during a Spaces-backed live capture, and reusable content must pass an object-head check before a new run references it.
  Date/Author: 2026-07-30 / Codex

- Decision: treat authenticated registration actions as explicit access-status evidence rather than scrape failures.
  Rationale: 401 and 403 responses describe a stable source limitation. Recording that limitation is useful training evidence; retrying through stealth or alternate providers would be wasteful and could cross the intended access boundary.
  Date/Author: 2026-07-30 / Codex

- Decision: never bypass a failed TLS certificate for robots or policy review.
  Rationale: an expired certificate prevents a trustworthy policy fetch. The safe result is a review-required source, not a disabled certificate check or an inferred allow decision.
  Date/Author: 2026-07-30 / Codex

- Decision: do not silently rewrite the approved Sherwood capture URL to the working `www` hostname.
  Rationale: required page URLs are included in the proposal hash. Replacing the apex URL with `www` changes the immutable test input even though both hosts share a registrable domain. The correction must produce a new cohort version and receive explicit approval, unless the exact locked apex endpoint is repaired and captured instead.
  Date/Author: 2026-07-30 / Codex

- Decision: limit evidence-capture batches to three total attempts by default.
  Rationale: one initial request plus two retries is enough to distinguish transient provider failures from persistent stale URLs without allowing one source to consume eleven full batch attempts. The limit is recorded in the report and can be overridden explicitly for a deliberate diagnostic run.
  Date/Author: 2026-07-30 / User and Codex

## Outcomes & Retrospective

Milestones 1, the original proposal-and-lock portion of Milestone 2, and the offline release-writer portion of Milestone 3 are complete. The repository can now validate a private gold example, deterministically construct and verify a release manifest, preserve explicitly approved held-out cohorts without recomputing them, prepare bounded live capture batches, and write an immutable private release once approved examples exist. The revised planner reports rather than weakens deficits, excludes TEAM work, and records exact capture-page requirements.

The original redacted local proposal remains persisted as `affiliate-mapping-test-d9de7ef53d2c82d1`, hash `d9de7ef53d2c82d17acd39f65f1b5eeade8d8060231a7ba964cf61bb28e2ba53`, under ignored `output/affiliate-mapping-agent/gold-cohorts/affiliate-mapping-test-d9de7ef53d2c82d1/proposal.json`. It calls for 137 stored page captures across the 35 sources; one selected source has an existing intake match, 33 need proposed intakes, and one is an existing blocked-policy record. Approved revision `affiliate-mapping-test-aa6aa626e3f2367c`, hash `aa6aa626e3f2367c4a62f045067b4dfe24ed6347ae9eb6eb2944941ad3292667`, preserves the same membership, assignments, and coverage while correcting only Sherwood's required page to its canonical `www` endpoint and recording why.

The original test cohort is locked and its remediated ScrapingDog pass is complete. Of 137 required page references, 115 have current ScrapingDog HTML or Markdown, 15 have supported robots-block evidence, and five protected registration actions have explicit authentication-required evidence. Team Lillard is the separate source-level blocked-refusal example and intentionally has no page capture. The original current-code audit completed at `2026-07-30T02:37:01.401Z` with 34 complete sources, one review-required source, zero failed sources, and report SHA-256 `1bdd37cc010b500e3553090955776d9cd4b33339519db4be2edaa72d7dd839e3`. The explicitly approved revised cohort replaced only Sherwood's invalid apex page with its canonical `www` page and now has a live 35-of-35 complete report with SHA-256 `b6c35da1196266c242d0a470b0d838f32b643de27399634ed62d632e932eb232`.

Replacement proposal `affiliate-mapping-test-7e930a8a04b0dc2f` is ready to lock but remains unapproved. Its only membership diff from the approved revised cohort is removal of `timbers-army-fc-community-teams` and addition of `westside-metros-fc-club-events`; all 34 retained example objects are byte-for-byte unchanged. The removed example required three pages and the replacement requires two, reducing the total from 137 to 136. The replacement's exact two pages already have a complete live ScrapingDog run, so no new public request should be needed after approval; the formal locked-cohort audit is still required.

The exported evidence remains internally sound. The latest local verification covers 297 manifests, 8,148 referenced artifacts, and 440,558,789 bytes with zero missing files, hash mismatches, or size mismatches. A direct live object audit found zero unreadable or wrong-provider files among the evidence selected for the locked cohort, and the live database contains zero affiliate-intake artifacts whose backing `File.bucket` is null. No discovery or intake job remains active, and all 44 discovery campaigns are paused.

Capture is no longer the primary blocker, but training is not authorized. The current live dataset still has zero train-eligible gold examples because the approved historical mappings have not yet been converted into exact human-approved input/output envelopes tied to these runs. The old leakage-safe non-test plan was eight executable mappings below the 95-example real-source minimum before capture; only 71 no-TEAM sources completed, comprising 51 EVENT, 13 CLUB, and seven RENTAL. The replacement no-TEAM test cohort must be approved before its held-out domains can be used to regenerate the training capture plan. Then the complete captures need approved gold outputs and enough new CLUB/RENTAL examples to reach the minimum. No model training has started.

The most important implementation gap is now explicit: the model evaluator must execute generated scrapers for every applicable example and compare persisted candidates to gold output. The existing standalone disposable proof demonstrates the necessary safety boundary, so the work is an extraction and composition task rather than an unproven design.

Update this section after each major milestone with the actual cohort counts, rejection reasons, base-model scores, human review time, Sol correction rate, and final `DO_NOT_TRAIN`, `TRAINING_CANDIDATE`, or `BASE_MODEL_SUFFICIENT` outcome.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-site`. This is a Next.js and TypeScript application with Prisma and PostgreSQL. Affiliate scraping code lives under `src/server/affiliateImports`. A source is a public website configured for scraping. A mapping is JSON interpreted by `src/server/affiliateImports/mappingExtractor.ts`. A candidate is a normalized review record persisted by `src/server/affiliateImports/service.ts`. The global importer retains legacy candidate kinds `EVENT`, `RENTAL`, `TEAM`, and `CLUB`; the mapping agent may emit only `EVENT`, `RENTAL`, and `CLUB`.

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

The planner selects test first. It proposes 35 examples from at least 30 registrable domains, excludes legacy TEAM sources, includes at least five CLUB and five RENTAL examples, and fills the remainder with representative EVENT and refusal cases. Across the cohort it must include at least 12 selector mappings, eight manual-candidate mappings, four detail-page or JavaScript-rendered sources, five blocked or insufficient-evidence cases, evergreen and scheduled events, and at least two cases whose correct answer is `CUSTOM_EXTRACTOR_REQUIRED` or an equivalent human escalation.

The planner prioritizes sources with an existing setup script, reviewed candidate history, and a validated mapping because they reduce gold-review work, but it must still mark them unapproved until a current intake capture matches the output. It excludes stale and replaced rows. It records why each source was selected, which exact pages need capture, which existing mapping may be used as a comparison, and which target-kind or platform quota the source satisfies.

Write only a redacted cohort manifest under ignored `output/affiliate-mapping-agent/gold-cohorts/<cohort-id>/` when `--write` is supplied. Do not queue public captures in this command. Add deterministic selection tests in `src/server/affiliateImports/__tests__/agentGoldDataset.test.ts`, including order independence and legacy TEAM exclusion.

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

The real executable training-plus-validation pool must contain no TEAM sources. Its minimum 95-example planning target is 60 EVENT, 20 CLUB, and 15 RENTAL examples; the hard readiness floor remains at least eleven CLUB and eleven RENTAL examples if later evidence supports a different safe composition. The training split must include at least ten CLUB and ten RENTAL examples, a representative EVENT mix, selector and manual mappings, detail pages, JavaScript rendering, scheduled and evergreen programs, and at least twelve blocked or insufficient-evidence examples. The validation split must include each supported agent target kind available outside test, at least three refusal examples, and both selector and manual mappings.

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
    npm run affiliate:mapping:gold-plan -- --dry-run --summary

To persist the redacted proposal after reviewing the full dry-run output:

    npm run affiliate:mapping:gold-plan -- --write

Only after a human accepts the exact domains and source rows, create the immutable lock with a stable internal user id rather than an email address:

    npm run affiliate:mapping:gold-plan -- \
      --write --lock --approved-by=<stable-user-id>

The planner must report 35 proposed test examples, at least 30 domains, the required target-kind and mapping-mode coverage, `databaseWrites: 0`, and `publicRequests: 0`. If the available inventory cannot satisfy a quota, it must report the deficit and exit nonzero rather than silently weakening the cohort.

After explicit authorization for intake captures, use the existing admin intake workflow one source at a time. Discover and export stored evidence with:

    npm run affiliate:intake:export -- --live --list --search <name-or-host>
    npm run affiliate:intake:export -- --live --source-key <source-key> --run-id <run-id>

These export commands read stored live data and object storage but make no public request and write no live row. Queueing or refreshing an intake is a separate authorized operation. Record the selected source key, run id, compliance result, pages, artifact kinds, and hashes in each review envelope.

When running the locked cohort against a live database reached through an explicit tunnel, declare the object-storage boundary as part of the command:

    npm run affiliate:mapping:gold-capture-cohort -- \
      --apply \
      --approve-existing \
      --export-current-database \
      --storage-provider=spaces

The coordinator rejects evidence backed by the wrong active provider. Do not omit the storage provider for a live tunnel capture, and do not use `local` storage for live artifact rows.

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

The replacement test release is accepted when 35 examples from at least 30 domains have complete real stored evidence and human-approved expected candidates. It must contain no TEAM examples and at least five CLUB, five RENTAL, representative EVENT, selector, manual, detail-page, JavaScript, evergreen, scheduled, blocked, insufficient-evidence, and custom-extractor cases. Derived and invented examples are reported separately and cannot satisfy real-source quotas.

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

The Milestone 1 focused validation reported:

    PASS src/server/affiliateImports/__tests__/agentGoldDataset.test.ts
    Test Suites: 1 passed, 1 total
    Tests: 5 passed, 5 total
    npx tsc --noEmit: exited 0

The superseded original Milestone 2 focused validation and actual local dry run reported:

    Test Suites: 1 passed, 1 total
    Tests: 9 passed, 9 total
    examples = 35
    registrableDomains = 35
    targetKinds = CLUB:5, EVENT:24, RENTAL:5, TEAM:1
    mappingModes = MANUAL_CANDIDATES:22, NONE:1, SELECTOR:12
    detailOrJavascript = 4
    refusalOrInsufficiency = 5
    customExtractorReview = 2
    evergreen = 5
    scheduled = 15
    deficits = 0
    publicRequests = 0
    databaseWrites = 0

The persisted redacted proposal records:

    cohortId = affiliate-mapping-test-d9de7ef53d2c82d1
    proposalSha256 = d9de7ef53d2c82d17acd39f65f1b5eeade8d8060231a7ba964cf61bb28e2ba53
    repositoryCommit = b286dda30c03e372e1e3a3fd3014808c04f55b45
    totalCapturePages = 137
    existingIntakeMatches = 1
    proposedIntakes = 33
    blockedRecords = 1
    locked = true

The unchanged-setup ScrapingDog cohort pass and exact locked-URL audit reported:

    sources = 35
    requiredPages = 137
    scrapingDogContentPages = 108
    robotsBlockedPages = 15
    olderFirecrawlOnlyPages = 2
    unresolvedPages = 12
    currentProviderCompleteSources = 27
    olderProviderReuseSources = 2
    policyBlockedSources = 1
    captureIssueSources = 5
    processedRuns = 51
    reportedRunStatuses = BLOCKED:2, FAILED:23, PARTIAL:17, SUCCEEDED:9

The private export integrity audit reported:

    manifests = 74
    artifacts = 1306
    artifactBytes = 89198851
    missingFiles = 0
    sha256Mismatches = 0

The broader post-implementation validation reported:

    Test Suites: 17 passed, 17 total
    Tests: 69 passed, 69 total
    npx prisma validate: valid
    npx tsc --noEmit: exited 0
    git diff --check: exited 0

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

Revised 2026-07-29 to record completion of Milestone 1. The revision adds the implemented contract guarantees, focused test evidence, and the continuing fact that no real approved gold examples or paid/live operations exist yet.

Revised 2026-07-29 to record the completed deterministic cohort planner and its quota-complete local dry run. The revision also records why scarce TEAM coverage is reserved by whole registrable domain and separates proposal generation from explicit human locking.

Revised 2026-07-29 after persisting the redacted proposal. The revision records the immutable proposal identity, capture workload, intake/backfill counts, and continuing unapproved/unlocked state so a later operator can resume without recreating or accidentally treating the proposal as gold data.

Revised 2026-07-29 after implementing the immutable gold-release writer. The revision records the additional integrity checks, private split/fixture output format, overwrite protection, and the fact that no real release can be built until the cohort is reviewed, locked, captured, and human-approved.

Revised 2026-07-29 after broader validation to preserve the exact passing affiliate-agent, Prisma, TypeScript, and diff-check evidence at the stopping point before any live intake operation.

Revised 2026-07-29 after explicit cohort approval and the first OVH capture. The revision records the immutable lock identity, the changed live intake population, the compliance-preserving capture command, both first-example run ids, complete 13-page coverage, and verified private exports without treating captured evidence as human-approved gold output.

Revised 2026-07-29 after completing the locked-cohort ScrapingDog pass and exact URL audit. The revision records current-provider coverage, older Firecrawl-only reuse, policy blocks, five source-level capture issues, the cross-intake false-positive completion, verified export hashes, the user's direction not to fix or substitute failed captures, and the continuing `DO_NOT_TRAIN` state.

Revised 2026-07-30 after the user removed TEAM from affiliate-agent scope. The revision preserves both prior immutable cohorts as historical evidence, records the live read-only TEAM dependency audit, narrows prompt/schema/cohort/capture/gold/SFT boundaries to EVENT, RENTAL, and CLUB, and requires a separately approved no-TEAM replacement cohort before regenerating the training plan.

Revised 2026-07-30 after generating the exact replacement proposal. The revision records the immutable one-for-one membership change, its live inventory and proposal hashes, existing complete replacement evidence, zero deficits, and the remaining explicit approval-and-lock checkpoint.
