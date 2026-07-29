# Deploy and train an open-weight affiliate source mapping agent

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root. This plan builds on the implemented intake and mapping handoff in `docs/affiliate-source-intake-execplan.md` and `docs/affiliate-source-discovery-automation-execplan.md`, and on the operating rules in `docs/affiliate-source-rollout-agent-goal.md`. It repeats the architecture and decisions needed for this project so a contributor can execute this plan without relying on prior conversation.

## Purpose / Big Picture

BracketIQ has a durable source-intake system, a database-backed mapping contract, and a queue that can hand one reviewed website to an external mapping worker. Today a developer or Codex agent still reads the stored HTML and Markdown, decides how the site maps to BracketIQ, creates or repairs the source setup code, runs the scraper, and prepares the result for review.

After this plan is implemented, a dedicated model running on a BracketIQ-controlled OVH server can claim that work indirectly through a trusted controller, read the stored intake evidence and relevant repository documentation, propose a structured source mapping, generate the ordinary setup and test files, and prove the result in an isolated worktree. A stronger Codex Sol reviewer then checks the evidence, code diff, test output, and extracted candidates. The system preserves a human approval boundary: neither the worker model nor Sol can publish candidates, modify the live affiliate source records, enable schedules, push branches, or fabricate dates and organization logos.

The steady-state production target is an OVHcloud VPS-4 with 8 vCores, 24 GB RAM, and 200 GB NVMe storage. On 2026-07-29 OVHcloud US advertised this configuration starting at $23.37 per month, including daily backup; the implementation must record the real checkout price, tax, region, and renewal terms before ordering. The model runs quantized on CPU through `llama.cpp`, one job at a time, with bounded artifact retrieval and an 8,192-token maximum context target. The first production candidates are `gpt-oss-20b` in its native MXFP4 quantization, which is designed to run within 16 GB of memory, and Qwen3-Coder-30B-A3B-Instruct in a reviewed four-bit GGUF quantization, whose model file is expected to consume approximately 17 to 19 GB before runtime buffers. `gpt-oss-20b` is the safer memory default; Qwen3-Coder becomes the preferred worker only if it fits without sustained swap and wins the BracketIQ mapping evaluation.

Open weights are a non-negotiable eligibility gate. The complete inference weights must be downloadable and retainable on BracketIQ-controlled infrastructure; the license must permit commercial use, modification, fine-tuning, creation of derivative checkpoints, and deployment without a vendor inference API. The runtime and training path must use inspectable source code, and the implementation records the exact license, notices, upstream revision, artifact hashes, and redistribution obligations. Both initial candidates publish weights under Apache License 2.0, but that fact must be rechecked for the exact repository and revision selected. A closed or API-only model may assist as the separately recorded Sol reviewer, but it cannot become the production worker or be required for worker inference.

Training and occasional larger-model comparisons use short-lived OVH AI Training jobs rather than the permanent VPS. The initial training target is one L40S worker with 48 GB GPU memory and 80 GB host memory, currently advertised at $1.69 per hour and billed per minute. A two-hour smoke run establishes throughput and projected cost before a full adapter run. The first training phase updates LoRA adapter weights from approved BracketIQ examples, then merges the promoted adapter into an unchanged copy of the open base checkpoint to create a versioned BracketIQ derivative checkpoint. That merged checkpoint is quantized for the production VPS and can be reproduced without a model vendor. The normal infrastructure target is below $30 per month for the persistent worker and below $50 in a month that includes a routine training burst; a larger one-time training experiment requires explicit approval.

Success is observable when a reviewed intake moves from `READY_FOR_MAPPING` to a model-produced branch or patch, the proposed mapping validates against the existing Zod schema, a local review-mode scrape produces accurate candidates without duplicates, Sol emits a structured review, and an administrator can inspect the complete evidence chain before approving anything. A second demonstration must show that a blocked or insufficient intake is refused rather than converted into an unsafe scraper.

## Progress

- [x] (2026-07-29 18:34Z) Reviewed `PLANS.md`, the affiliate source-builder skill and import contract, the implemented intake export, the mapping queue, the mapping schema, the source rollout goal, and the existing automation ExecPlan.
- [x] (2026-07-29 18:34Z) Recorded the initial dedicated-model direction, model bakeoff, historical evidence reconstruction, QLoRA training, Sol review loop, logo restrictions, security boundary, rollout gates, and recovery behavior in this ExecPlan.
- [x] (2026-07-29 18:46Z) Revised the infrastructure direction to a persistent OVH VPS-4 near $23.37 per month, CPU-quantized inference, and short-lived OVH L40S training jobs, with a normal combined monthly infrastructure target near $50.
- [x] (2026-07-29 18:58Z) Made downloadable and modifiable open weights a hard model-eligibility gate and required each promoted adapter to be merged into a versioned BracketIQ-controlled derivative checkpoint before production deployment.
- [ ] Re-audit the current local and live source, mapping, intake, evidence, and mapping-job counts and save a redacted baseline report.
- [x] (2026-07-29 19:24Z) Defined and tested the versioned `AffiliateSourceDraft`, worker-result, reviewer-result, training-example, and open-weight model-manifest contracts, including blocked-source, evidence-backed-date, official-URL, logo-provenance, licensing, and offline-start gates.
- [ ] Build the read-only historical dataset inventory and dry-run evidence-matching/backfill tooling.
- [ ] Build the deterministic mapping generator, isolated job worktree runner, and evaluation harness without connecting a model.
- [ ] Provision and harden the OVH VPS-4, deploy the CPU model server privately, and record its exact CPU flags, RAM, swap, image, model revision, measured throughput, and monthly price.
- [ ] Run the fixed base-model bakeoff and select the worker model using the acceptance scorecard.
- [ ] Connect the selected base model to the isolated mapping runner and complete a no-training pilot.
- [ ] Add the Codex Sol reviewer and capture structured corrections without allowing automatic approval or publication.
- [ ] Build the reviewed training dataset, run the first parameter-efficient adapter experiment, and promote an adapter only if it beats the frozen base model.
- [ ] Run the staged shadow, assisted, and limited-production pilots and confirm that the steady-state OVH inference server remains reliable inside the 24 GB RAM ceiling.

## Surprises & Discoveries

- Observation: the repository already has the queue boundary needed by an external model worker.
  Evidence: `src/server/affiliateImports/sourceMappingQueue.ts` atomically claims `AffiliateSourceMappingJobs`, and `scripts/claim-affiliate-source-mapping.ts` immediately invokes the read-only intake exporter. Claiming does not create an organization, source, mapping, scrape run, candidate, event, team, facility, or public club.

- Observation: the current mapping contract is constrained enough to make structured generation safer than unconstrained code generation for most sources.
  Evidence: `src/server/affiliateImports/types.ts` validates `AffiliateScrapeMapping` with Zod and supports selector fields, detail-page rules, dedupe fields, transforms, and manual candidates. Custom TypeScript is an exception when that JSON contract cannot represent the source safely.

- Observation: the local database audit immediately before this plan found far more existing mappings than evidence-linked training pairs.
  Evidence: the 2026-07-29 local snapshot contained 202 configured sources and 201 active mappings. Of those active mappings, 103 used manual candidates, 95 used selectors, and 3 used neither ordinary selectors nor manual candidates. Only 5 source rows had `metadata.sourceEvidence`, and only 1 source was linked to an intake. These figures are a planning baseline only and must be regenerated before dataset construction because database state can change.

- Observation: most existing active mappings were validated, but validation alone does not prove that the original input evidence is recoverable or that the mapping remains correct.
  Evidence: the same local snapshot contained 194 active mappings with a non-null `validatedAt`. The historical reconstruction milestone therefore distinguishes review status from evidence quality and site freshness.

- Observation: organization image work is mostly an asset-discovery and normalization problem, not a generative-image problem.
  Evidence: the source-builder rules require an official logo, official rendered brand mark, or a manually reviewed absence. They prohibit invented logos and random placeholders. Image generation is appropriate only for BracketIQ-owned illustrations or generic product art.

- Observation: OVHcloud's current low-cost VPS range provides enough memory for a quantized 20B mixture-of-experts model without approaching the user's $50 monthly ceiling.
  Evidence: on 2026-07-29 the OVHcloud US VPS page advertised VPS-4 with 8 vCores, 24 GB RAM, 200 GB NVMe, and daily backup starting at $23.37 per month. VPS-3 has only 12 GB RAM and would force the production worker into a materially smaller model.

- Observation: OVH has a same-price dedicated alternative when availability and one-time setup cost are acceptable.
  Evidence: on 2026-07-29 the OVH Eco catalog advertised Kimsufi KS-2 starting at $23 per month plus a $23 installation fee, with 8 cores, 16 threads, 32 GB to 64 GB RAM, and NVMe options. It is older hardware and is not a VPS, but 32 GB dedicated RAM provides more model headroom if VPS-4 cannot run the winning quantized model reliably.

- Observation: OVH's metered AI Training product can separate rare GPU work from permanent inference cost.
  Evidence: on 2026-07-29 OVHcloud US advertised an L40S training worker with 48 GB GPU memory and 80 GB host memory at $1.69 per hour, billed per minute. Ten training hours would cost approximately $16.90 before storage and tax.

- Observation: a production model that fits in RAM is not necessarily acceptable; CPU completion time must be measured on the exact VPS.
  Evidence: `gpt-oss-20b` is documented to run within 16 GB of memory and Qwen3-Coder-30B-A3B has only about 3.3B active parameters per token, but prompt ingestion still touches large model structures and depends on CPU and memory bandwidth. The asynchronous mapping workflow tolerates minutes, not an unbounded multi-hour or swap-thrashing job.

- Observation: both current production candidates publish downloadable model weights under Apache License 2.0.
  Evidence: the official `openai/gpt-oss-20b` and `Qwen/Qwen3-Coder-30B-A3B-Instruct` repositories each include an Apache 2.0 license, which permits modification and distribution of derivative works subject to its notice and license conditions. The exact model revision and every bundled component still require a recorded license review before download or promotion.

- Observation: parameter-efficient fine-tuning changes trainable adapter weights rather than updating every tensor in the base checkpoint.
  Evidence: LoRA freezes the published base while learning low-rank parameters. Merging the approved adapter into a clean copy of the base produces a modified derivative checkpoint that BracketIQ can hash, retain, quantize, and serve independently. This is real task-specific weight training, but it is not full-parameter fine-tuning or pretraining from scratch.

- Observation: the current worktree contains unrelated organization-claiming, generated Prisma, source-discovery, and MFA changes.
  Evidence: `git status --short --branch` on 2026-07-29 showed those modified and untracked paths. Implementation of this plan must begin in an isolated worktree or carefully scoped branch and must not absorb those changes.

## Decision Log

- Superseded decision: start with an H200-class persistent VM and Qwen3-Coder-Next.
  Rationale: this was the initial direction when the user prioritized the strongest immediately available worker. It was superseded after the user set an approximately $50 monthly budget and explicitly allowed short-lived larger training infrastructure while requiring the final model to run on a small OVH server.
  Date/Author: 2026-07-29 / User and Codex

- Decision: use an OVHcloud VPS-4 with 24 GB RAM as the primary steady-state target and keep persistent infrastructure below $30 per month before tax and optional storage.
  Rationale: the current starting price is less than half the monthly ceiling, the included 200 GB NVMe disk can hold the quantized model and job worktrees, and 24 GB provides a credible minimum for a 16 GB-class model plus the controller. The model processes asynchronous jobs, so CPU latency is acceptable when bounded and measured.
  Date/Author: 2026-07-29 / User and Codex

- Decision: compare `gpt-oss-20b` native MXFP4 and Qwen3-Coder-30B-A3B-Instruct four-bit GGUF on the exact production VPS.
  Rationale: `gpt-oss-20b` has documented 16 GB deployment memory and strong agentic structured-output support, leaving safer operating headroom. Qwen3-Coder is specialized for code and activates about 3.3B parameters per token, but its 17-to-19-GB quantized weights make the 24 GB host tighter. End-to-end mapping quality, peak resident memory, swap, and job completion time decide the winner.
  Date/Author: 2026-07-29 / Codex

- Decision: require a downloadable, modifiable open-weight base and a license that permits BracketIQ to train, merge, retain, and deploy a derivative checkpoint.
  Rationale: the worker must remain operable without a hosted vendor model API and BracketIQ must control its trained artifacts. Eligibility requires complete downloadable inference weights, a recorded permissive license review, reproducible revisions and hashes, and an inspectable self-hosted runtime/training stack. An API-only, noncommercial, no-derivatives, or inaccessible-weight model is ineligible regardless of benchmark quality.
  Date/Author: 2026-07-29 / User and Codex

- Decision: use `llama.cpp` rather than vLLM for steady-state inference.
  Rationale: `llama.cpp` supports quantized mixture-of-experts models on CPU, exposes an OpenAI-compatible server with schema-constrained JSON and tool calling, and does not require a persistent GPU. vLLM remains available for short-lived GPU bakeoff or training validation only.
  Date/Author: 2026-07-29 / Codex

- Decision: cap steady-state context at 8,192 tokens initially, use quantized key/value cache, and retrieve artifact chunks instead of loading whole sites into one prompt.
  Rationale: the models advertise much larger context windows, but the 24 GB production host does not have memory or prompt-processing budget for them. The intake already separates Markdown, HTML, screenshots, links, and metadata into addressable artifacts.
  Date/Author: 2026-07-29 / Codex

- Decision: use short-lived OVH L40S AI Training workers for adapter training, starting with a two-hour cost and throughput smoke test.
  Rationale: 48 GB GPU memory is appropriate for parameter-efficient tuning of the production-sized candidates, OVH bills training per minute, and the GPU can disappear after durable artifacts are copied. A default $20 compute cap permits roughly 11.8 hours at the current advertised rate; exceeding it requires user approval.
  Date/Author: 2026-07-29 / Codex

- Decision: train task-specific LoRA weights through the selected model's supported memory-efficient recipe, then merge a promoted adapter into the open base to create a custom derivative checkpoint.
  Rationale: this is weight training, not prompt-only customization or retrieval alone. QLoRA is the expected Qwen path, while `gpt-oss-20b` must use its supported MXFP4-compatible fine-tuning recipe. Training every base parameter is deliberately deferred because the project has hundreds, not millions, of approved examples and one 48 GB training GPU; a full-parameter run would materially increase memory, cost, overfitting, and catastrophic-forgetting risk without evidence that it would outperform a merged adapter. The immutable base and unmerged adapter remain available for reproduction and rollback.
  Date/Author: 2026-07-29 / User and Codex

- Decision: do not fine-tune the model on changing Markdown documentation as if those files were permanent facts.
  Rationale: source-builder instructions, mapping fields, registry notes, and operational procedures will evolve. The worker must retrieve the current checked-in versions at job time. Training examples may teach how to use context, but the current repository remains authoritative.
  Date/Author: 2026-07-29 / Codex

- Decision: make the ordinary model output a constrained `AffiliateSourceDraft` before it writes code.
  Rationale: target kind, policy disposition, source evidence, mapping JSON, expected candidates, logo evidence, and unresolved warnings can be validated deterministically. Generic selector mappings and manual candidates can then be rendered from templates. Arbitrary TypeScript is reserved for a separately reviewed `CUSTOM_EXTRACTOR_REQUIRED` path.
  Date/Author: 2026-07-29 / Codex

- Decision: preserve live intake evidence as the only primary website input.
  Rationale: stored HTML, Markdown, screenshots, links, branding, images, robots results, provider envelopes, and hashes make the work reproducible. If a required page is missing, the worker asks the trusted controller to queue an intake refresh. It does not silently browse around the evidence or bypass a policy decision.
  Date/Author: 2026-07-29 / Codex

- Decision: run the model server and the job controller as separate security principals.
  Rationale: the inference server needs model weights and CPU/RAM access but no database, object-storage, GitHub, Codex, or deployment credentials. The trusted controller may claim/export a job and create an isolated worktree, but the model-facing sandbox receives only the evidence bundle, the allowed repository snapshot, and short-lived job identity.
  Date/Author: 2026-07-29 / Codex

- Decision: keep Codex Sol as an independent reviewer and teacher, not as an unrecorded fallback inside the worker prompt.
  Rationale: a separate review produces measurable correction data, prevents the worker from grading itself, and allows human-approved Sol corrections to become later training examples. Sol may be closed or externally hosted because it is an optional reviewer, but the trained open-weight worker must continue operating when Sol is unavailable. Sol review does not automatically approve a mapping, push code, touch the live database, publish candidates, or directly update model weights.
  Date/Author: 2026-07-29 / Codex

- Decision: update training in reviewed batches rather than after every job.
  Rationale: immediate online learning would amplify erroneous worker or reviewer output and make behavior irreproducible. Each dataset release receives a manifest, human approval, held-out evaluation, model adapter version, and rollback target.
  Date/Author: 2026-07-29 / Codex

- Decision: label historical examples as `FAITHFUL`, `LEGACY_PARTIAL`, `STALE`, or `BLOCKED`, and train only from approved `FAITHFUL` examples at full weight.
  Rationale: an old mapping without its original source may have been correct historically but cannot automatically be treated as a gold input/output pair. Re-intake reconstructs current evidence, while the label preserves the distinction between exact evidence, useful partial history, obsolete site structure, and prohibited sources.
  Date/Author: 2026-07-29 / Codex

- Decision: split evaluation by registrable domain and site platform rather than randomly splitting rows.
  Rationale: random rows from the same organization or CMS template would make evaluation appear better than real performance. Entire domains and representative platforms must remain unseen during training.
  Date/Author: 2026-07-29 / Codex

- Decision: do not use generative images for real organization logos.
  Rationale: a generated logo could misrepresent an organization or create trademark and trust problems. The agent may select and normalize an official asset or flag the logo for manual review. BracketIQ-owned artwork may use Codex or another image-generation service through a separate workflow.
  Date/Author: 2026-07-29 / Codex

- Decision: keep human approval and the existing `validatedAt` plus `autoScrapeEnabled` gates.
  Rationale: model quality may reduce manual mapping work, but it does not broaden authority. New mappings remain unvalidated, first scrapes remain in `REVIEW`, and recurring automation remains disabled until the existing approval flow succeeds.
  Date/Author: 2026-07-29 / Codex

## Outcomes & Retrospective

Planning is complete; implementation has not started. The plan deliberately uses the already implemented intake, evidence export, mapping queue, candidate review, and recurring scrape approval boundaries. The proposed new work is a model-serving and evaluation layer around those contracts, plus a historical-evidence reconstruction pipeline.

The primary infrastructure unknown is empirical: whether Qwen3-Coder-30B-A3B-Instruct can remain below the 24 GB VPS memory ceiling without sustained swap and finish a representative mapping job in acceptable asynchronous time. `gpt-oss-20b` is the memory-safe default, but the actual VPS bakeoff determines whether its scraper-generation quality is sufficient. The second major unknown is dataset quality. The existing mappings are useful inventory, but most do not yet have a provenance-linked intake and therefore cannot be treated as gold pairs without reconstruction and review.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-site`. This is a Next.js App Router application using TypeScript, Prisma, and PostgreSQL. Affiliate-import server modules live in `src/server/affiliateImports`. Source setup scripts live in `scripts`. The authoritative source registry is `docs/admin-affiliate-scrape-sources.md`.

A source intake is a durable, policy-reviewed capture of a proposed website. The relevant Prisma records are `AffiliateSourceIntakes`, `AffiliateSourceIntakePages`, `AffiliateSourceIntakeRuns`, and `AffiliateSourceIntakeArtifacts`. The exporter in `scripts/export-affiliate-source-intake.ts` writes a reproducible bundle under `output/affiliate-intakes/<source-key>/<run-id>/`. That ignored directory includes `manifest.json`, `source-evidence.json`, `SOURCE-EVIDENCE.md`, and stored HTML, Markdown, screenshots, links, images, branding, logo candidates, robots evidence, and provider envelopes.

An approved scrape source is an `AffiliateScrapeSources` row associated with a versioned `AffiliateScrapeMappings` row. The mapping is parsed by `affiliateScrapeMappingSchema` in `src/server/affiliateImports/types.ts`. Ordinary mappings describe a repeated `itemSelector`, field selectors, extraction modes, transforms, optional detail-page rules, dedupe fields, or `manualCandidates`. The importer converts the mapped rows to unpublished review candidates of kind `EVENT`, `RENTAL`, `TEAM`, or `CLUB`.

The mapping queue is already present. `AffiliateSourceMappingJobs` stores the intake, status, lease, worker, attempt count, optional branch and commit, a JSON result summary, errors, and timestamps. `src/server/affiliateImports/sourceMappingQueue.ts` owns claim, release, and finish behavior. `npm run affiliate:mapping:claim -- --worker=<name>` claims an eligible intake and exports its evidence. The new system must reuse this queue and may initially store worker, model, evaluation, Sol-review, and dataset eligibility details inside the existing `resultSummary` JSON. Do not add schema fields unless implementation proves that a value needs indexed querying or relational integrity.

The affiliate source-builder skill and its import contract remain authoritative. The worker must preserve official outbound action URLs, never invent dates, map location fields independently when the source exposes them, attach compact `metadata.sourceEvidence`, keep setup scripts idempotent, run locally before any live operation, and leave new recurring automation disabled. An intake whose robots or policy decision blocks the needed path is a successful refusal example, not a prompt to evade the restriction.

The model system has four logical parts. The trusted controller owns queue claims, evidence export, worktree creation, deterministic generation, tests, and job completion. The inference server accepts prompts and tool results and returns model tokens; it has no operational credentials. The unprivileged agent sandbox lets the worker inspect only the job bundle and the isolated repository snapshot, then returns a structured draft or patch. The Sol reviewer independently reads the same evidence plus the worker result and emits an approval recommendation or corrections. A human remains the final approver.

A base model is the unchanged published model checkpoint. An open-weight model exposes the complete inference weights for download and supplies a license that permits the intended use and modification; this plan additionally requires commercial derivative deployment rights and no vendor inference dependency. An adapter is a comparatively small set of trained parameters layered over that checkpoint. QLoRA means loading the base model in four-bit form and training only low-rank adapter parameters using bfloat16 computation. A merged derivative checkpoint is a separately versioned copy of the base with the promoted adapter weights incorporated; it is the production source checkpoint before quantization. A held-out evaluation set contains complete domains and platforms excluded from training; it is the evidence that an adapter generalizes rather than memorizes familiar sites.

## Plan of Work

### Milestone 1: Freeze contracts and capture the reproducible baseline

Create `src/server/affiliateImports/agentContracts.ts`. Define Zod schemas and exported TypeScript types for `AffiliateSourceDraft`, `AffiliateMappingWorkerResult`, `AffiliateMappingReview`, `AffiliateMappingTrainingExample`, and `OpenWeightModelManifest`. Give every contract a `schemaVersion` and reject unknown versions.

`OpenWeightModelManifest` records the upstream repository, immutable revision, model family, weight artifact hashes, tokenizer and prompt-template revisions, license identifier and hash, required notices, commercial-use review, modification and derivative-distribution review, runtime and training code revisions, quantization provenance, and whether the production artifact starts without a vendor API key or network connection. The manifest fails eligibility unless complete inference weights are locally retainable and every required permission is affirmatively reviewed. Do not treat a marketing label such as "open" as evidence.

`AffiliateSourceDraft` must contain the intake ID, source key, run ID, artifact hashes used, a policy disposition, target kind, proposed organization metadata, implementation mode, mapping proposal, expected candidate assertions, official logo evidence, warnings, and unresolved questions. Its implementation mode is one of `GENERIC_MAPPING`, `MANUAL_CANDIDATES`, `CUSTOM_EXTRACTOR_REQUIRED`, `BLOCKED`, or `INSUFFICIENT_EVIDENCE`. Only the first two modes may flow through the ordinary deterministic generator. `CUSTOM_EXTRACTOR_REQUIRED` creates a review request before code is written.

The policy disposition is `ALLOWED`, `BLOCKED`, or `NEEDS_REVIEW`. A blocked or review-required source cannot contain an executable mapping. The draft must cite the exact `source-evidence.json` fields and artifact hashes that support classification, URLs, dates, locations, prices, divisions, tags, and logo selection.

Add `scripts/audit-affiliate-mapping-agent-baseline.ts` with dry-run behavior only. It reports source counts, active mapping modes, target kinds, validation state, source-evidence coverage, intake linkage, candidate history, available setup scripts, and mapping-job status. It writes a redacted JSON report under ignored `output/affiliate-mapping-agent/baselines/<timestamp>/` and prints a compact summary. It must not contact public sites or modify the database.

Add focused tests under `src/server/affiliateImports/__tests__/agentContracts.test.ts`. Test valid generic, manual, blocked, insufficient-evidence, and custom-extractor drafts, plus failures for an invented scheduled date without cited evidence, missing official action URL, generated logo disposition, and mapping output attached to a blocked source.

At the end of this milestone, a contributor can validate hand-written fixtures against the new contracts and reproduce the current data-readiness baseline without changing any source.

### Milestone 2: Inventory and reconstruct historical training pairs

Create `src/server/affiliateImports/agentDataset.ts` and `scripts/export-affiliate-mapping-training-data.ts`. The exporter is read-only and defaults to `--dry-run`. It joins configured sources, active and historical mappings, source organizations, setup scripts, validation state, compact source evidence, linked intakes, mapping jobs, and representative candidate outcomes. It stores no credentials, temporary signed storage URLs, or unpublished personal data in the dataset.

Every candidate training row receives one evidence label:

- `FAITHFUL` means a reviewed intake captures the source pages used by the mapping, the site structure still matches, the mapping and candidate results were reviewed, and the relevant setup code and provenance agree.
- `LEGACY_PARTIAL` means an existing mapping or fixture is useful but the original evidence is incomplete or the current page differs in a way that prevents an exact pair.
- `STALE` means the site, source, mapping, or dated content no longer represents a valid current example.
- `BLOCKED` means the source policy or required path disallows the mapping workflow.

Create `scripts/plan-affiliate-source-evidence-backfill.ts`. It matches legacy sources to existing intakes by exact source key, canonical page URL, organization website, and registrable domain, in that order. The default command emits a proposed match report only. It must never infer that two unrelated organizations on a shared hosted platform are the same source. Ambiguous matches remain unmatched.

For an unmatched permitted source, the report proposes a new intake and the minimum listing, detail, registration, policy, and branding pages needed to reconstruct evidence. It does not fetch those pages. An administrator must approve and queue capture through the existing intake workflow. Blocked sources are recorded as refusal examples. A current capture may demonstrate that a historical selector is stale; it does not prove what the old HTML looked like, so that row remains `LEGACY_PARTIAL` unless an old checked-in fixture or stored artifact provides the missing input.

Export versioned JSONL beneath ignored `output/affiliate-mapping-agent/datasets/<dataset-id>/`. Commit only schemas, small invented fixtures, manifests without source content, and scripts. Store durable private dataset objects in BracketIQ-controlled object storage under a versioned prefix. The manifest records repository commit, database environment, query timestamp, example IDs, evidence labels, registrable domains, detected platforms, artifact hashes, redaction version, and train/validation/test assignment.

Split whole registrable domains, and where practical whole hosted platforms or CMS template families, across train, validation, and test sets. Never place pages from one organization in both train and test. Keep at least 30 diverse sources in the initial test suite, including every target kind, selector mappings, manual candidates, detail-page mappings, JavaScript-rendered pages, blocked pages, insufficient evidence, and two custom-extractor-required cases.

Sol may help reconstruct a proposed gold result, but a human must approve a row before it becomes `FAITHFUL`. Historical existence and `validatedAt` alone are not approval for model training.

At the end of this milestone, the dataset manifest explains exactly which existing mappings are trainable, which need intake, which are stale or blocked, and why. Running the exporter twice against unchanged inputs produces identical example hashes and assignments.

### Milestone 3: Build deterministic generation and evaluation before adding a model

Create `src/server/affiliateImports/agentGenerator.ts`. For `GENERIC_MAPPING` and `MANUAL_CANDIDATES`, it validates the draft and renders an idempotent source setup module, a focused mapping fixture/test, compact `metadata.sourceEvidence`, and the source-registry note fragment from versioned templates under `src/server/affiliateImports/agentTemplates`. It must not generate a schema migration or edit the generic import contract.

The generator must produce stable output from the same draft. It must merge source metadata rather than replace compliance, cadence, fingerprint, or parser values. It must leave `autoScrapeEnabled = false` and `validatedAt = null`. It must create no candidates unless the generated setup command is explicitly run with its documented `--scrape` boundary.

Create `src/server/affiliateImports/agentEvaluation.ts` and `scripts/evaluate-affiliate-mapping-agent.ts`. The evaluator accepts a frozen evaluation suite and one or more worker endpoints. It runs each example at temperature zero with fixed prompt, tool, and token budgets. It validates the draft, renders applicable code in an isolated worktree, runs focused tests, performs a local review-mode scrape against a disposable database, and compares normalized output to the approved expected candidates.

Score each example on policy compliance, evidence citation, target-kind selection, schema validity, official URL accuracy, title and date accuracy, publish-critical location completeness, pricing/division/tag fidelity, logo disposition, code/test success, candidate-level precision and recall, duplicate safety, and unsupported claims. Record latency, prompt-processing rate, generation rate, input and output tokens, peak resident memory, peak swap, retries, and Sol material-correction count separately. GPU experiments also record peak GPU memory. A source that correctly returns `BLOCKED` or `INSUFFICIENT_EVIDENCE` receives full credit for safe refusal.

Add a fixture-only worker that returns predefined drafts. This proves the controller, generator, worktree, scrape, and scoring behavior before an inference server exists. The evaluator must fail a fixture that invents a date, chooses an internal BracketIQ action URL, emits a fake logo, or produces output despite a blocked policy.

At the end of this milestone, the complete workflow can be demonstrated deterministically without a model. This is the control condition for the later bakeoff.

### Milestone 4: Provision and harden the low-cost OVH inference server

Provision an OVHcloud VPS-4 with 8 vCores, 24 GB RAM, and 200 GB NVMe in a standard data-center region where Docker and monitoring are supported. Use Ubuntu 24.04 LTS unless the order offers only another supported LTS image. Record the actual region, CPU model and flags, RAM, disk, bandwidth, image ID, monthly price, tax, renewal price, backup inclusion, and order date in `deploy/ai/README.md`. The plan's $23.37 starting price is a dated observation, not purchasing authority.

If VPS-4 is unavailable or the measured winning model cannot pass the 24 GB memory gate, present the OVH Kimsufi KS-2 32 GB dedicated server as the first fallback. It was advertised at approximately the same monthly price but may have a one-time setup charge, older CPU, different availability, and no VPS semantics. Do not substitute it silently; record the benchmark and obtain user approval.

Create `deploy/ai/compose.yml`, `deploy/ai/model.env.example`, `deploy/ai/controller.env.example`, and systemd units for the model service and mapping controller. Pin the `llama.cpp` source revision or container digest, model repository and revision, quantized artifact hash, and prompt template. The production model container is CPU-only and exposes `llama-server`; do not install CUDA, PyTorch, Transformers, vLLM, TRL, PEFT, or bitsandbytes on the persistent VPS unless a separate measured need exists.

Place the inference API on localhost or a private VPC address. Require a bearer token even on the private address, limit the firewall to the controller, and expose only a health endpoint and an OpenAI-compatible generation endpoint. The model container receives no `DATABASE_URL`, Spaces key, GitHub token, Codex credential, email credential, or deployment credential. Disable default public ingress.

The controller and agent sandbox remain separate security principals, but they may share one VPS because of the budget. The controller container may hold the minimum live read and queue credentials needed by the existing claim/export command. It copies a completed evidence bundle and a clean repository worktree into the unprivileged sandbox, then removes operational credentials from the sandbox environment. The sandbox has no live database route, no object-storage credentials, no Git remote credentials, no Codex credentials, and no unrestricted public network. It may call only the local model endpoint and controller-provided tool endpoints for bounded artifact reads and local validation.

Run only one model request and one mapping job at a time. Start with 8,192 context tokens, quantized key/value cache, memory mapping enabled, and a 2,048-token output ceiling. Create 8 to 16 GB of encrypted or root-only swap as crash protection, but fail the capacity gate if a normal representative job sustains more than 512 MB of swap or drives available memory below 1 GB. Swap may prevent an out-of-memory kill; it is not part of the intended model capacity.

Persist the production quantization, adapters, dataset manifests, evaluation reports, and configuration to the VPS disk and a BracketIQ-controlled off-host object store. Keep at least 40 GB free for worktrees, evidence bundles, temporary conversion output, logs, and upgrades. Do not store the full unquantized training checkpoint on the small VPS.

Add `deploy/ai/bin/verify-host.sh` and `deploy/ai/bin/verify-model.sh`. Host verification checks CPU instruction support, exact cores and RAM, disk headroom, swap policy, private firewall, time synchronization, monthly configuration, and absence of forbidden credentials in the model container. Model verification calls health, performs one deterministic schema-only prompt and one representative artifact-chunk prompt, and records peak resident memory, peak swap, prompt tokens per second, output tokens per second, and wall time.

At the end of this milestone, the model endpoint is reachable only from the controller, survives service restart, reports the pinned revision and quantization, stays within the RAM/swap gate, and can be removed without affecting the BracketIQ web application or affiliate database.

### Milestone 5: Run the frozen base-model bakeoff

Serve and evaluate these candidates one at a time on the actual OVH production VPS and against the same frozen test suite:

- `gpt-oss-20b` in its native MXFP4 format as the memory-safe default.
- Qwen3-Coder-30B-A3B-Instruct in a pinned four-bit GGUF such as Q4_K_M as the code-specialized candidate.
- One pinned sub-10B fallback chosen before the suite is frozen, used only to measure the accuracy lost by moving to substantially lower RAM.

Before performance testing, complete the `OpenWeightModelManifest` for each candidate. Reject a candidate before downloading production artifacts when its complete inference weights are unavailable, its exact license prohibits commercial use, modification, fine-tuning, or derivative deployment, it requires a vendor inference service, or its required runtime/training path cannot be inspected and pinned. Apache 2.0 satisfies the intended permission gate when the exact repository and bundled components pass review; preserve the license and required notices with every base and derivative release.

Record the exact model repository, revision hash, license review, tokenizer revision, quantization artifact and hash, `llama.cpp` revision, maximum context, key/value cache format, sampling configuration, reasoning level when applicable, and prompt template. Prove an offline cold start from copied local artifacts with outbound network disabled and no vendor API key. This production bakeoff is text-only. Screenshots remain available to Sol or a separate short-lived vision service; the persistent CPU worker relies on extracted branding metadata, Markdown, and bounded HTML. Screenshot understanding is not image generation.

The worker receives a compact job overview first: the current mapping contract, policy decision, artifact manifest, Markdown, a structural DOM outline, and retrieved repository instructions. It can request bounded HTML or screenshot artifacts by hash through controller tools. Do not place every full HTML page and every documentation file in the initial prompt. The controller logs which chunks were read so evidence use can be reproduced.

Retrieve current documentation at runtime from a small allowlist: the affiliate source-builder skill, its import contract, `docs/admin-affiliate-scraping-execplan.md`, the relevant source-registry row, and a few approved examples selected by target kind and detected platform. Never retrieve a test-set gold output or another mapping from the same held-out organization.

Select the production candidate using the scorecard, not one headline metric. A candidate is ineligible if it violates a blocked policy, invents a scheduled date, invents an organization logo, attempts a live write, exposes a secret, exceeds 22 GB peak resident use, sustains more than 512 MB swap, or cannot finish a representative source within 90 minutes. Among eligible candidates, prefer the highest end-to-end mapping score. If the top two are within two percentage points, prefer the one with lower Sol correction rate; if still tied, prefer lower peak memory and job time.

The minimum gate for an assisted pilot is 100 percent valid result envelopes, 100 percent correct policy refusal on the blocked set, zero invented dates or generated organization logos, at least 90 percent correct target-kind selection, at least 95 percent correct official action URLs on applicable examples, at least 90 percent publish-critical field accuracy, and at least 80 percent of ordinary generic/manual sources reaching passing local tests without a human code edit. These thresholds are initial gates and must be revised in the Decision Log if real results show a better safety measure.

At the end of this milestone, `docs/affiliate-source-mapping-model-bakeoff.md` contains a reproducible result from the actual OVH CPU host, the chosen model and revision, quantization, prompt/tool contract version, RAM/swap/throughput measurements, and the reason the other candidates were rejected or retained as fallbacks.

### Milestone 6: Connect the selected model to the mapping queue

Create `src/server/affiliateImports/agentRunner.ts` and `scripts/run-affiliate-mapping-agent.ts`, with package command `affiliate:mapping:agent`. The runner supports a specific intake or the next queued job, a worker name, a model endpoint, `--dry-run`, and an explicit local or live evidence environment. Dry run may claim nothing and must write no database state.

For a real job, the trusted controller uses the existing queue claim, exports the selected stored run, verifies every artifact hash, creates an isolated worktree from the configured base commit, and constructs the bounded model context. It drives a limited tool loop: list evidence, read an evidence chunk, read an allowlisted repository file, search the isolated worktree, validate a draft, render a generic mapping, run an allowlisted focused test, and request a local review-mode scrape. The loop has maximum turns, wall time, tokens, and tool calls.

The runner refuses shell text supplied directly by the model. Tool calls are typed and implemented by the controller. File writes are restricted to the job worktree and an allowlist consisting of the new source setup script, focused fixtures/tests, an optional source-specific extractor, `package.json`, and the source-registry note. Changes to Prisma schema, migrations, generic auth, deployment, or unrelated application code automatically require human escalation.

When the draft uses `CUSTOM_EXTRACTOR_REQUIRED`, stop after the structured proposal during the first release. A later plan revision may permit sandboxed custom code generation after sufficient generic-mapping accuracy is demonstrated. This prevents a rare exception from defining the security boundary of the whole system.

The controller runs the generated setup without `--scrape`, then explicitly runs the local review scrape. It inspects at least five candidates and every candidate kind, runs the scrape twice, and records new, duplicate, rejected, skipped, and warning counts. It runs the source-builder focused Jest suites, the generated source test, TypeScript when shared types were touched, and `git diff --check`.

On success, the controller creates a local source-scoped commit or patch artifact and calls `finishAffiliateSourceMappingClaim` with `REVIEW_REQUIRED`. `resultSummary` records model and revision, adapter, prompt/tool contract, evidence run and hashes, draft hash, worktree base, branch/commit or patch hash, tests, candidate samples and counts, policy outcome, logo disposition, timings, and warnings. It does not push. On a retryable failure it records the failure and leaves artifacts; on explicit release it returns the intake to the queue.

At the end of this milestone, one allowed fixture intake reaches `REVIEW_REQUIRED` with reproducible files and candidates, while one blocked fixture produces a refusal record and no mapping files.

### Milestone 7: Add Codex Sol review and human-approved teaching signals

Create `src/server/affiliateImports/agentReview.ts` and `scripts/review-affiliate-mapping-job.ts`. The reviewer receives the source evidence manifest, selected artifact excerpts, worker draft, complete scoped diff, validation transcripts, and representative normalized candidates. It does not receive secrets, live database access, or unpublished unrelated data.

Define `AffiliateMappingReview` with `APPROVE_RECOMMENDATION`, `REQUEST_CHANGES`, and `REJECT` outcomes; blocking issues; evidence citations; corrected draft fields; suggested patch; test additions; confidence; and training eligibility. Sol must explicitly check policy, classification, official URLs, dates, location, tags, divisions, pricing, capacity, descriptions, dedupe, logo provenance, setup idempotence, source evidence, candidate results, and scope.

Sol's approval is a recommendation. A human reviews the branch or patch, the rendered logo-fit output, representative candidates, and the Sol result. Only the human-controlled existing action can set mapping validation, enable automatic scraping, publish candidates, push a branch, or authorize live setup.

When a human approves a worker result unchanged, store a positive training signal. When the human approves a Sol-corrected result, store the original worker draft, structured Sol critique, approved corrected output, and diff as a correction pair. When the human rejects both, store the reason as evaluation data but exclude the example from supervised training until a gold output exists.

Do not invoke training from the review command. Dataset promotion is a separate batch action that validates evidence label, review identity, human approval, schema version, artifact hashes, and domain split before adding an example to a release.

At the end of this milestone, a reviewer can explain and correct a worker error with traceable evidence, and rerunning the review with the same inputs and pinned Sol configuration produces a versioned result without changing operational source state.

### Milestone 8: Train and evaluate the first parameter-efficient adapter

Add training configuration under `training/affiliate-source-mapping/`. Use pinned versions of PyTorch, Transformers, TRL, PEFT, bitsandbytes, and any model-specific supported kernels. Use the selected model's supported parameter-efficient fine-tuning path, bfloat16 computation, gradient checkpointing, deterministic seeds, and an initial maximum sequence length of 8,192 tokens. For a Qwen worker this is expected to be four-bit QLoRA; for `gpt-oss-20b`, follow its pinned native MXFP4/LoRA-compatible recipe rather than forcing a Qwen quantization recipe onto a different architecture. Do not train at the model's maximum advertised context.

Before the full run, inspect the selected model's actual module names and run a one-example overfit test. Verify that the LoRA target configuration reaches the intended attention, projection, and mixture-of-experts modules rather than attaching adapters only to inactive or irrelevant layers. Record trainable parameter count and module names in the experiment manifest. Verify that adapter tensors change from initialization and that the trained adapter changes the expected held-in output; a run that only changes prompts, retrieval indexes, or runtime configuration does not count as training.

Start with supervised fine-tuning on approved `FAITHFUL` drafts and corrections. Do not train on raw chain-of-thought, secrets, temporary signed URLs, test-set domains, or unapproved Sol output. Include blocked and insufficient-evidence examples so refusal is learned. Prefer concise tool-call and structured-output traces over long prose.

Run training as a short-lived OVH AI Training job on one L40S 48 GB GPU with 80 GB host RAM, or an explicitly approved equivalent if that flavor is unavailable. The first job is limited to two hours and one small subset; it reports examples and tokens per second, peak GPU memory, projected full-run duration, and projected cost. The default full-run compute cap is $20 at the price recorded when the job starts. Do not launch or continue a projected-over-budget run without user approval.

Every experiment receives an immutable ID containing base model revision, base license-manifest hash, dataset manifest hash, repository commit, schema version, hyperparameters, random seed, start/end time, provider job ID, GPU SKU, actual per-minute price, trainable parameter count, peak memory, adapter checkpoint hashes, merged-checkpoint hash, quantized-artifact hash, and evaluation results. Preserve the immutable base checkpoint and unmerged adapters for reproduction. Do not merge an adapter until it passes the promotion evaluation.

Before promotion, merge the approved adapter into a clean copy of the exact open base revision in the same short-lived training environment, verify that the resulting derivative tensor hashes differ from the base as expected, and then convert or quantize that merged checkpoint into the exact CPU-serving format. Copy the merged source checkpoint, production GGUF or native MXFP4-compatible artifact, tokenizer/template files, license and notices, experiment manifest, and hashes to durable BracketIQ-controlled storage. The small VPS must not perform a memory-intensive full-model merge and does not need the unquantized checkpoint. A derivative is not promotable until it cold-starts offline through the pinned `llama.cpp` server and passes the same VPS memory and latency gate as the base model.

Full-parameter fine-tuning of every 20B-to-30B base tensor is outside the first implementation. Reconsider it only after the reviewed dataset is materially larger, merged-LoRA results plateau, a controlled experiment demonstrates a plausible benefit, and the user approves a separately costed multi-GPU plan. Do not describe LoRA as full-parameter fine-tuning; describe it accurately as training new weights and merging them into an independently deployable derivative checkpoint.

Evaluate the base model and adapter against the identical held-out suite. The adapter is promotable only if it maintains every hard safety gate, improves the composite mapping score by at least three percentage points or reduces material Sol correction rate by at least 20 percent without reducing the composite score, and has no target-kind regression greater than two percentage points. If it fails, keep the base model and record the experiment; do not lower a safety gate to make the adapter pass.

At the end of this milestone, one versioned adapter and merged derivative checkpoint are either promoted with evidence or rejected with a reproducible report. The serving configuration can switch between the original base artifact and the promoted derivative by version and can roll back without recreating the VM.

### Milestone 9: Run staged rollout and choose steady-state infrastructure

Begin in shadow mode. The worker processes 20 already-completed sources from stored evidence, but its output cannot affect the existing mapping. Compare worker and Sol results to the approved source and record disagreements.

Move to assisted mode for 20 new or reconstructed sources. Every result requires Sol and human review. Do not enable automatic recurring scraping during this stage. Require zero policy breaches, zero fabricated dates/logos, and no unauthorized file or database changes. Track the percentage reaching `REVIEW_REQUIRED` without human code edits and the time saved per source.

Move to limited production for at most five queued sources per day. Keep concurrency at one because the 24 GB server cannot safely host parallel model contexts. Increase daily throughput through scheduling and smaller prompts, not concurrent model replicas, unless a later Decision Log records a larger host.

After the pilot, decide the steady-state OVH host:

- Keep VPS-4 when the selected model stays below 22 GB resident memory, avoids sustained swap, and finishes representative jobs within 90 minutes.
- Move to the Kimsufi KS-2 32 GB dedicated alternative, with explicit approval, when the winning model needs additional memory headroom and its older dedicated CPU passes the same throughput suite.
- Use VPS-3 with 12 GB only if the sub-10B fallback independently passes every accuracy and safety gate. Lower cost alone does not justify a worse worker that creates more Sol and human correction work.
- Do not retain a GPU for steady-state inference. Launch L40S training capacity only for a bounded experiment, copy durable artifacts, and terminate the job immediately afterward.

The production controller must stop cleanly when no jobs exist, reclaim expired leases safely, and expose redacted metrics for queue depth, job duration, model latency, prompt and generation throughput, resident memory, swap, draft validation failures, test failures, Sol outcomes, human disposition, and estimated monthly compute. It must not log raw secrets, temporary signed URLs, full source HTML, or personal contact/payment information.

At the end of this milestone, the user can point to a measured worker model, a reproducible adapter, a safe review chain, and a costed steady-state VM choice. The older manual workflow remains available as rollback.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`. Begin in a clean isolated worktree because the canonical checkout was already dirty when this plan was written.

1. Inspect repository and data state without modifying it.

       git status --short --branch
       npx prisma validate

   Do not use `affiliate:mapping:claim` against live merely to inspect counts because it changes lease state. Use the new baseline audit script for counts once implemented. If a test claim is necessary, use a disposable local database and release it explicitly.

2. Implement contracts and baseline audit, then run:

       npx jest --runInBand src/server/affiliateImports/__tests__/agentContracts.test.ts
       npm run affiliate:agent:baseline -- --dry-run --summary

   Expected summary includes source, mapping, evidence-linked, intake-linked, training-eligible, and blocked counts with `databaseWrites: 0` and `publicRequests: 0`.

3. Implement dataset inventory and backfill planning, then run:

       npm run affiliate:agent:dataset -- --dry-run --summary
       npm run affiliate:agent:evidence-backfill -- --dry-run --summary

   Expected output identifies `FAITHFUL`, `LEGACY_PARTIAL`, `STALE`, `BLOCKED`, unmatched, and ambiguous rows. A second run against unchanged inputs must print the same dataset manifest hash.

4. Implement the generator and fixture-only evaluator, then run:

       npx jest --runInBand src/server/affiliateImports/__tests__/agentGenerator.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/agentEvaluation.test.ts
       npm run affiliate:agent:evaluate -- --worker=fixture --suite=smoke

   The allowed fixture passes and the blocked, invented-date, fake-logo, and internal-link fixtures fail or refuse exactly as expected.

5. Provision OVH VPS-4 only after the infrastructure diff and actual OVH checkout total have been reviewed.

       docker compose -f deploy/ai/compose.yml config
       deploy/ai/bin/verify-host.sh
       deploy/ai/bin/verify-model.sh

   Expected host output reports 8 vCores, 24 GB RAM, at least 200 GB NVMe, the CPU instruction set, model hash, resident/swap usage, prompt and generation rates, private-only inference ingress, and no forbidden credential in the model container.

6. Run the frozen model bakeoff.

       npm run affiliate:agent:evaluate -- --suite=held-out-v1 --model=gpt-oss-20b-mxfp4
       npm run affiliate:agent:evaluate -- --suite=held-out-v1 --model=qwen3-coder-30b-a3b-instruct-q4
       npm run affiliate:agent:evaluate -- --suite=held-out-v1 --model=<pinned-sub-10b-fallback>

   Save the reports and record the selection in `docs/affiliate-source-mapping-model-bakeoff.md`.

7. Run one local worker job against fixture evidence.

       npm run affiliate:mapping:agent -- --fixture=allowed-generic --worker=ovh-vps-smoke
       npm run affiliate:mapping:agent -- --fixture=blocked-source --worker=ovh-vps-smoke

   The first produces a review-required worktree result. The second produces no executable mapping and records a policy refusal.

8. With explicit authorization for live evidence access but not live source mutation, process one selected intake.

       npm run affiliate:mapping:agent -- --live --intake=<reviewed-intake-id> --worker=ovh-vps-pilot
       npm run affiliate:mapping:review -- --job=<mapping-job-id> --reviewer=codex-sol

   Confirm that live approved-source, mapping, candidate, and published-target counts did not change through claim, generation, testing, or review.

9. Build a reviewed dataset release and run one adapter experiment.

       npm run affiliate:agent:dataset -- --release=<dataset-id>
       ovhai job run --name affiliate-mapping-smoke --gpu 1 --flavor l40s-1-gpu --volume <dataset-and-output-volume> -- <pinned-training-image> --config training/affiliate-source-mapping/<selected-model>.yaml --max-runtime=2h
       npm run affiliate:agent:evaluate -- --suite=held-out-v1 --model=<selected-model> --adapter=<adapter-id>

   Treat the OVH AI Training command as a target interface whose exact supported flags must be verified against the installed OVH CLI before use. The controller records the provider job ID, observed per-minute price, runtime, projected full-run cost, and termination result.

10. Run focused and broad repository checks after implementation changes.

       npx jest --runInBand src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/mappingExtractor.test.ts src/server/affiliateImports/__tests__/service.test.ts
       npx jest --runInBand src/server/affiliateImports/__tests__/agentContracts.test.ts src/server/affiliateImports/__tests__/agentDataset.test.ts src/server/affiliateImports/__tests__/agentGenerator.test.ts src/server/affiliateImports/__tests__/agentEvaluation.test.ts src/server/affiliateImports/__tests__/agentRunner.test.ts src/server/affiliateImports/__tests__/agentReview.test.ts
       npx prisma validate
       npx tsc --noEmit
       npm run test:ci
       git diff --check

Do not provision a paid VM, run a live intake claim, queue a new live capture, invoke paid Codex review, create a live dataset export, push code, publish candidates, or enable recurring schedules until the user explicitly authorizes the applicable external action.

## Validation and Acceptance

The contract layer is accepted when malformed or unsafe drafts fail before file generation. A blocked policy, missing evidence, invented scheduled date, internal action URL, or generated organization logo must be represented as a refusal or validation error, not a warning that allows execution.

Historical reconstruction is accepted when every exported example has a source, mapping, evidence label, domain/platform split, artifact hashes, and review state. Unmatched or ambiguous sources remain visible. No source becomes `FAITHFUL` solely because a mapping exists or has `validatedAt`.

Generation is accepted when the same valid draft produces byte-identical source files, setup without `--scrape` is idempotent, new automation remains disabled, the mapping passes the current Zod schema, and a second review scrape creates no duplicate candidate identities.

The OVH inference host is accepted when inference is private, pinned, restartable, observable, and isolated from operational credentials; the selected model remains below 22 GB resident memory, sustains no more than 512 MB swap, and finishes a representative source within 90 minutes. Deleting the model service must not affect the web app, database, source intake worker, or scheduled scrape runner.

The base-model bakeoff is accepted when every tested candidate has a passing `OpenWeightModelManifest`, all candidates run on the same OVH host with the same held-out domains, 8,192-token context ceiling, prompt/tool budget, and deterministic sampling settings, and the selected model satisfies every safety, accuracy, memory, swap, and completion-time gate. The selected worker must cold-start and complete the fixture suite from local weights with outbound network disabled and without a vendor API key.

The queue integration is accepted when concurrent controllers cannot claim the same job, a crash is recoverable after lease expiry, artifact hashes are verified, the model cannot write outside the worktree, and a completed job contains enough information to reproduce the draft, diff, tests, scrape, and candidate samples.

Sol review is accepted when it independently cites evidence for each blocking issue, distinguishes a recommendation from human approval, and creates a structured correction pair without mutating approved sources or public targets.

Training is accepted when the dataset excludes held-out domains and unapproved outputs, the two-hour L40S smoke run reports a bounded full-run projection, the actual job remains inside its approved cost cap, trainable adapter tensors demonstrably change, the exact adapter and merged derivative can be reproduced from their manifests, the derivative has distinct verified hashes and preserved license notices, the quantized derivative loads offline on VPS-4, it beats the frozen base model under the promotion rule, and rollback to the base model requires only a configuration change and service restart.

The end-to-end pilot is accepted when at least 85 percent of ordinary selector/manual sources reach `REVIEW_REQUIRED` without a human code edit, fewer than 15 percent need a material Sol correction, policy and date/logo fabrication violations remain zero, candidate precision on publish-critical fields is at least 95 percent, and no unauthorized live write occurs. These pilot metrics supplement rather than replace the per-model bakeoff gates.

## Idempotence and Recovery

All audit, dataset, backfill-planning, and evaluation commands default to dry-run or require an explicit release/output flag. Dataset example IDs and split assignments derive from stable hashes, so rerunning unchanged inputs updates no durable example.

Queue claims remain leased. If the controller crashes before producing a result, retain the evidence bundle and worktree for diagnosis, then release or reclaim the job through the existing queue rules. Never delete a branch, patch, dataset release, or adapter merely to retry it; create a new version linked to the failed attempt.

Generated setup scripts use stable source, organization, file, and mapping IDs and non-destructive upserts. Running setup without `--scrape` must not create candidates. Running the review scrape twice must be duplicate-safe. Live execution remains a separately authorized step.

Model and adapter promotion uses immutable versions and an atomic serving configuration pointer. To roll back, switch the pointer to the last approved base or adapter, restart the inference service, run the smoke evaluation, and leave the failed adapter and its report intact.

The model server can be disabled without changing application code. The mapping queue remains usable by the current manual developer/Codex process. If the OVH VPS fails, pause the controller, allow leases to expire or release them, and continue manual mapping from the exported evidence. If OVH AI Training is unavailable, keep the current approved base or adapter and defer training; do not move training onto the small production VPS.

If a dataset is found to contain a disallowed source, secret, temporary signed URL, or test-domain leakage, mark that dataset and every derived adapter quarantined. Build a new dataset version, retrain from the unchanged base model, and do not attempt to repair the deployed adapter in place.

Before ending a metered training job, copy model manifests, adapters, CPU-serving artifacts, evaluation reports, and training logs to durable storage and verify their hashes from the controller. Terminate the job immediately after verification. Do not leave a notebook, training task, or deployment replica running merely because model files were copied.

## Artifacts and Notes

The baseline audit should resemble:

    {
      "capturedAt": "2026-07-29T18:34:00.000Z",
      "environment": "local",
      "sources": 202,
      "activeMappings": 201,
      "mappingModes": {
        "manualCandidates": 103,
        "selectors": 95,
        "other": 3
      },
      "validatedActiveMappings": 194,
      "sourcesWithEvidence": 5,
      "sourcesLinkedToIntakes": 1,
      "databaseWrites": 0,
      "publicRequests": 0
    }

Those values document the initial observation only. The implemented audit output replaces them and must include its query timestamp and environment.

A compact training example contains artifact references and selected excerpts, not an uncontrolled dump:

    {
      "schemaVersion": 1,
      "exampleId": "stable-hash",
      "evidenceLabel": "FAITHFUL",
      "input": {
        "intakeSourceKey": "example-source",
        "runId": "reviewed-run",
        "artifacts": [
          { "kind": "PAGE_MARKDOWN", "sha256": "..." },
          { "kind": "PAGE_HTML", "sha256": "..." },
          { "kind": "ROBOTS", "sha256": "..." }
        ],
        "contextContractVersion": 1
      },
      "output": {
        "draftHash": "...",
        "approvedMappingHash": "...",
        "approvedCandidateFixtureHash": "..."
      },
      "split": "train"
    }

The worker result summary should be compact enough to store in `AffiliateSourceMappingJobs.resultSummary`. Large evidence, prompts, diffs, test logs, candidate fixtures, and evaluation traces belong in durable artifact storage referenced by hashes.

The bakeoff report must show per-source failures, not only averages. A model that is excellent on selector mappings but violates one blocked source is ineligible even if its composite score is highest.

The initial recurring budget should resemble:

    {
      "persistentHost": {
        "provider": "OVHcloud",
        "product": "VPS-4",
        "observedStartingMonthlyUsd": 23.37
      },
      "routineTrainingBurst": {
        "provider": "OVHcloud AI Training",
        "flavor": "l40s-1-gpu",
        "observedHourlyUsd": 1.69,
        "defaultMaxHours": 11,
        "projectedComputeUsd": 18.59
      },
      "projectedComputeSubtotalUsd": 41.96,
      "excludedUntilMeasured": [
        "tax",
        "object storage",
        "container registry",
        "Codex or API usage",
        "Firecrawl or ScrapingDog usage"
      ]
    }

The actual checkout and provider job prices replace these dated observations. The approximately $50 target applies to OVH infrastructure unless the user explicitly expands it to include existing Codex, intake-provider, or storage costs.

## Interfaces and Dependencies

In `src/server/affiliateImports/agentContracts.ts`, define:

    export const affiliateSourceDraftSchema: z.ZodType<AffiliateSourceDraft>;
    export const affiliateMappingWorkerResultSchema: z.ZodType<AffiliateMappingWorkerResult>;
    export const affiliateMappingReviewSchema: z.ZodType<AffiliateMappingReview>;
    export const affiliateMappingTrainingExampleSchema: z.ZodType<AffiliateMappingTrainingExample>;
    export const openWeightModelManifestSchema: z.ZodType<OpenWeightModelManifest>;

The model manifest must expose at least:

    type OpenWeightModelManifest = {
      schemaVersion: 1;
      upstreamRepository: string;
      upstreamRevision: string;
      modelFamily: string;
      weightArtifacts: Array<{ filename: string; sha256: string }>;
      tokenizerRevision: string;
      promptTemplateRevision: string;
      license: {
        spdxId: string;
        textSha256: string;
        notices: string[];
        commercialUseApproved: boolean;
        modificationApproved: boolean;
        derivativeDeploymentApproved: boolean;
      };
      runtimeRevision: string;
      trainingStackRevision: string;
      quantization: {
        format: string;
        sourceCheckpointSha256: string;
        artifactSha256: string;
      };
      offlineColdStartVerifiedAt: string | null;
      requiresVendorApi: false;
    };

The central draft shape must expose at least:

    type AffiliateSourceDraft = {
      schemaVersion: 1;
      intakeId: string;
      sourceKey: string;
      runId: string;
      policyDisposition: 'ALLOWED' | 'BLOCKED' | 'NEEDS_REVIEW';
      implementationMode:
        | 'GENERIC_MAPPING'
        | 'MANUAL_CANDIDATES'
        | 'CUSTOM_EXTRACTOR_REQUIRED'
        | 'BLOCKED'
        | 'INSUFFICIENT_EVIDENCE';
      listingKind: 'EVENT' | 'RENTAL' | 'TEAM' | 'CLUB' | null;
      evidence: Array<{
        artifactKind: string;
        artifactSha256: string;
        pageUrl: string;
        supports: string[];
      }>;
      organization: {
        name: string | null;
        website: string | null;
        description: string | null;
        city: string | null;
        address: string | null;
      };
      mapping: AffiliateScrapeMapping | null;
      expectedCandidates: AffiliateCandidateAssertion[];
      logo: {
        disposition: 'OFFICIAL_ASSET' | 'OFFICIAL_SCREENSHOT_CROP' | 'MISSING' | 'MANUAL_REVIEW';
        artifactSha256: string | null;
        sourceUrl: string | null;
      };
      warnings: string[];
      unresolvedQuestions: string[];
    };

Use the existing `AffiliateScrapeMapping`, `AffiliateListingKind`, and candidate field names from `src/server/affiliateImports/types.ts`; do not create a second mapping vocabulary.

In `src/server/affiliateImports/agentModelClient.ts`, define a provider-neutral interface:

    export interface AffiliateMappingModelClient {
      modelRevision(): Promise<ModelRevision>;
      createDraft(input: AffiliateMappingJobContext): Promise<AffiliateSourceDraft>;
    }

The controller implements this through the local OpenAI-compatible `llama-server` endpoint in steady state. GPU evaluation may use vLLM behind the same interface, but repository business logic must depend on the interface rather than llama.cpp-, OpenAI-, or Qwen-specific HTTP details.

In `src/server/affiliateImports/agentTooling.ts`, define typed tools for:

    listEvidence(jobId)
    readEvidenceArtifact(jobId, artifactSha256, range)
    readRepositoryFile(jobId, allowedPath, range)
    searchRepository(jobId, query, allowedRoots)
    validateDraft(jobId, draft)
    renderDraft(jobId, draft)
    runFocusedTest(jobId, testId)
    runReviewScrape(jobId)

Each tool enforces job identity, byte and row limits, path allowlists, timeouts, and redaction. Do not expose a general shell tool in the first release.

Use the current Node and TypeScript toolchain for controller, contracts, generation, and evaluation. Use the pinned C/C++ `llama.cpp` runtime for persistent inference. Use Python only inside short-lived training or GPU-evaluation containers where model libraries require it. Keep large model weights, training datasets, HTML artifacts, screenshots, and checkpoints out of Git.

Use the existing Codex CLI or API only in the reviewer adapter behind `AffiliateMappingReviewer`. The implementation must pin the reviewer model/configuration in each result and must continue to work with manual human review when Codex is unavailable.

## Plan Revision Note

Created 2026-07-29 after the user clarified that the mapping model will run on a newly provisioned BracketIQ-controlled VM rather than on the current computer and that the project may start with the stronger model immediately. The initial revision used an H200-capable environment, required a Qwen3-Coder model bakeoff before selection, reconstructed provenance for historical mappings, used batch QLoRA instead of full training, and kept Codex Sol plus human approval as independent review gates.

Revised 2026-07-29 after the user set an approximately $50 monthly budget, preferred the existing OVH account, accepted slower inference, and allowed temporary larger training infrastructure as long as the final model runs on a small server. The persistent target is now OVH VPS-4 with 24 GB RAM and CPU-only `llama.cpp`; `gpt-oss-20b` and quantized Qwen3-Coder-30B are evaluated on that exact host; and adapter training uses metered OVH L40S jobs with a two-hour smoke test and explicit cost cap.

Revised 2026-07-29 after the user made open source and open weights an explicit requirement. The plan now treats downloadable, modifiable weights and derivative-deployment rights as a hard eligibility gate; records an `OpenWeightModelManifest`; excludes closed or API-only models from the worker role; verifies offline operation; and requires a promoted LoRA adapter to be merged into a hashed, licensed, BracketIQ-controlled derivative checkpoint. Full-parameter fine-tuning is deliberately deferred until the dataset and a separately approved multi-GPU budget justify it.

Implementation update 2026-07-29: added the first contract layer in `src/server/affiliateImports/agentContracts.ts` and its focused tests. The executable draft schema now enforces the evidence, policy, official-link, scheduled-date, target-kind, and logo rules before any generator or model runner can write files. The same layer records open-weight eligibility and the immutable worker, reviewer, and training-example envelopes needed by later milestones.
