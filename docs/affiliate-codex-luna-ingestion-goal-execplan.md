# Add a Codex Luna goal for affiliate-intake ingestion

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

BracketIQ already has an evidence-backed queue for affiliate website intakes and an open-weight mapping worker, but the open-weight worker only produces constrained mapping drafts one intake at a time. After this change, an operator can choose a second ingestion option on the BracketIQ VM: Codex CLI running `gpt-5.6-luna` at `max` reasoning effort under a durable goal. The launcher does not request fast mode or a specific service tier. That goal repeatedly consumes every eligible intake until no claimable intake remains, creating the review-ready organization setup, mapping or source-specific extractor, official logo work, source notes, tests, and validation evidence required by the existing affiliate import workflow.

The new path is an explicitly invoked developer command. It is not imported by the Next.js application, added to a web route, or scheduled by the website process, so deploying the branch does not change ordinary website behavior. The command must stop before public publication, automatic schedule enablement, or unapproved live mutation. Failed, blocked, incomplete, held-out, and `TEAM`-only intakes are recorded and skipped instead of retried indefinitely.

## Progress

- [x] (2026-07-30 22:00Z) Reviewed the existing intake queue, open-weight mapping runner, generated setup boundary, rollout goal document, Codex CLI model/configuration documentation, and current dirty worktree.
- [x] (2026-07-30 22:00Z) Created branch `codex/affiliate-codex-luna-goal` without staging unrelated deployment or legacy-source work.
- [x] (2026-07-31 00:55Z) Added and validated the repository-local `ingest-affiliate-intakes` skill and its strict completion contract.
- [x] (2026-07-31 00:55Z) Added the deterministic Codex CLI launcher using `gpt-5.6-luna`, workspace-write sandboxing, goal-tool creation, and authentication/TTY preflight.
- [x] (2026-07-31 00:55Z) Added read-only queue status and strict terminal result commands, including malformed-lease detection.
- [x] (2026-07-31 00:55Z) Updated the rollout goal with the exact intake, logo, organization, validation, failure, and publication boundaries.
- [x] (2026-07-31 00:55Z) Passed skill validation, 10 focused Jest tests, `npx tsc --noEmit`, local/live launcher dry runs, and `git diff --check`.
- [x] (2026-07-31 01:00Z) Committed the plan and implementation as `878f6e88` and `d2032b0c`, then pushed `codex/affiliate-codex-luna-goal` to the HTTPS GitHub remote for VM testing.
- [x] (2026-07-31 04:00Z) Added and VM-tested an externally isolated Docker fallback for OVH hosts that block Bubblewrap user namespaces; the goal now runs as UID 1001 with all Linux capabilities dropped, no Docker socket, and only the checkout plus selected Codex/database mounts.
- [x] (2026-07-31 18:00Z) Exhausted the live eligible mapping queue: 89 jobs produced strict review results and source-scoped commits, while 8 ineligible, duplicate, incomplete, held-out, or team-only jobs finished as durable failures instead of retrying.
- [x] (2026-07-31 19:00Z) Audited all 89 review results and separated 73 packages with official logo evidence from 16 packages that explicitly require manual logo review.
- [x] (2026-07-31 20:00Z) Added an operator-only live approval command that applies only the 73 official-logo packages, verifies their private and disabled review state, and records approval provenance without publishing organizations or enabling scheduled scraping.
- [x] (2026-07-31 20:00Z) Passed TypeScript, 88 generated source suites with 176 tests, 53 shared importer and approval tests, `git diff --check`, and an audit confirming all 73 checked-in official logos are opaque 1024-by-1024 PNG files.
- [x] (2026-08-01) Upgraded the ingestion launcher to `max` reasoning and persisted Codex fast mode through `service_tier="fast"` and `features.fast_mode=true`.
- [x] (2026-08-02) Added headless mapper pools with one isolated Git workspace and one stable worker ID per agent. Added a hard valid-division gate before `REVIEW_REQUIRED`.
- [x] (2026-08-04) Removed the fast-mode and fast-service-tier invocation overrides. Kept Luna at `max` reasoning effort.

## Surprises & Discoveries

- Observation: the installed Codex npm wrapper on this Mac is version `0.130.0`, but its platform-native binary is missing.
  Evidence: `codex --version` fails with `ENOENT` for the package's `vendor/aarch64-apple-darwin/codex/codex` path. The implementation can test argument construction locally, but the first actual Codex run must happen on the VM after its CLI installation and login are verified.

- Observation: persisted goals are a stable Codex feature and are enabled by `features.goals`; `/goal` is an interactive CLI command with automatic continuation and a verifiable stopping-condition contract.
  Evidence: current official Codex documentation describes `features.goals`, `/goal <objective>`, and `codex login status`.

- Observation: a positional initial prompt passed to interactive `codex` is submitted as a normal user message and is not parsed through the slash-command input path.
  Evidence: the current Codex source sends `initial_prompt` through `submit_initial_user_message_if_pending()` and `submit_user_message`, while slash commands are parsed through `QueuedInputAction::ParseSlash`. The launcher therefore must instruct the goal-enabled agent to call `create_goal`; a positional string beginning with `/goal` would not create a persisted goal.

- Observation: the OVH host blocks the unprivileged user namespace that Codex's Bubblewrap command sandbox requires.
  Evidence: the first VM goal run failed every command before process launch with `bwrap: setting up uid map: Permission denied`; the goal was stopped before it claimed an intake, and the queue remained at 97 queued jobs with no active leases.

- Observation: the current generated mapping setup already creates a private unlisted organization, disabled scrape source, inactive/unvalidated mapping, focused test, and registry fragment, but official logo normalization remains a manual gate.
  Evidence: `src/server/affiliateImports/agentTemplates/sourceFiles.ts` explicitly leaves `logoId` null and says that normalized-logo review remains manual.

- Observation: database claim safety does not make a shared coding workspace safe.
  Evidence: concurrent conditional claims return different jobs, but each Luna mapper edits, tests, stages, and commits a source package. Each mapper therefore needs a separate Git worktree.

## Decision Log

- Decision: add a repository-local skill at `.agents/skills/ingest-affiliate-intakes` instead of relying on a skill installed only in one user's home directory.
  Rationale: the exact workflow must travel with the branch to the VM and be automatically discoverable by every Codex invocation from this repository.
  Date/Author: 2026-07-30 / Codex

- Decision: launch interactive Codex with goals enabled and make the initial agent message call the `create_goal` tool before doing any work.
  Rationale: the CLI does not parse a positional initial prompt as a slash command. Calling the installed goal tool creates the persisted objective while retaining the interactive terminal for status, pause, resume, and recovery.
  Date/Author: 2026-07-30 / Codex

- Decision: use `gpt-5.6-luna` with `model_reasoning_effort=max`, `service_tier="fast"`, and `features.fast_mode=true` as invocation overrides.
  Rationale: this gives the hosted ingestion worker the strongest configured reasoning effort and the account's fast service tier without changing the open-weight runtime or its training eligibility contract. The model, effort, service tier, and fast-mode flag remain visible and testable in command construction and result provenance.
  Date/Author: 2026-08-01 / Codex

- Decision: keep `gpt-5.6-luna` and `model_reasoning_effort=max`, but omit `service_tier` and `features.fast_mode` from each invocation.
  Rationale: the user no longer wants fast mode. Omitting both overrides uses the Codex default service behavior and keeps the absence of fast mode explicit in launcher provenance.
  Date/Author: 2026-08-04 / Codex

- Decision: treat queue exhaustion as “no eligible claimable mapping jobs remain,” not “every historical intake row has been published.”
  Rationale: blocked, incomplete, failed, held-out, duplicate, review-required, and already-finished rows must not keep a goal alive forever. The queue status command will report each category separately.
  Date/Author: 2026-07-30 / Codex

- Decision: keep human approval and publication outside the goal.
  Rationale: Codex may create and validate review-ready organization/source/mapping/logo artifacts, but a generated mapping is not training gold and a candidate is not publishable until the existing reviewer and administrator approval gates succeed.
  Date/Author: 2026-07-30 / Codex

- Decision: permit `danger-full-access` only when `--container-isolated` is used inside a dedicated Docker boundary.
  Rationale: changing the OVH host's namespace security or running unsandboxed against the host would expose production files and Docker. The dedicated container mounts only the test checkout and Codex state, receives only selected intake/storage credentials, has no Docker socket, and joins only the live Postgres and disposable-validation networks.
  Date/Author: 2026-07-31 / Codex

- Decision: bulk approval may apply only results with `OFFICIAL_ASSET` or `OFFICIAL_SCREENSHOT_CROP` logo dispositions.
  Rationale: the operator approved the existing captured evidence and mappings, but the repository completion contract still prohibits publishing or approving an organization package whose logo disposition is `MANUAL_REVIEW`. Those 16 jobs remain review-required until official logo evidence is supplied.
  Date/Author: 2026-07-31 / Codex

- Decision: an approved setup remains private and operationally disabled.
  Rationale: live approval creates the unlisted organization, official logo, source, unvalidated mapping, and review candidates needed for later evaluation. It must verify `publicPageEnabled=false`, `autoScrapeEnabled=false`, and `validatedAt=null`; approval is not publication or automatic ingestion.
  Date/Author: 2026-07-31 / Codex

- Decision: require every accepted event to have at least one fully classified source-supported division before mapping completion.
  Rationale: divisionless events cannot support BracketIQ registration and filters. The deterministic completion gate checks source name, gender, rating type, division type, skill type, and age type in the disposable candidate rows.
  Date/Author: 2026-08-02 / Codex

- Decision: run concurrent mappers only through unique worker IDs and isolated Git workspaces.
  Rationale: the existing database lease prevents duplicate queue ownership, while workspace isolation prevents mixed files, tests, Git indexes, and commits.
  Date/Author: 2026-08-02 / Codex

## Outcomes & Retrospective

The ingestion goal and generated cohort are complete and release-validated. The repository now also supports a configurable headless mapper pool with isolated workspaces and a deterministic event-division completion gate. Live approval still stops with private organizations, disabled sources, unvalidated mappings, and unpublished review candidates. No application route, React component, Prisma schema, migration, production Compose file, or scheduled website process is changed.

## Context and Orientation

Work from `/Users/elesesy/StudioProjects/mvp-site`. Preserve every unrelated change reported by `git status --short --branch`; stage only files named by this plan.

`AffiliateSourceIntakes` is the evidence stage. An intake stores reviewed policy plus immutable HTML, Markdown, screenshots, links, image/branding data, robots evidence, and provider envelopes. `AffiliateSourceMappingJobs` is the work queue. `src/server/affiliateImports/sourceMappingQueue.ts` atomically leases one queued job and moves its intake to `MAPPING_IN_PROGRESS`; completion moves the job and intake to `REVIEW_REQUIRED`, `APPROVED`, or `FAILED`.

`scripts/run-affiliate-mapping-agent.ts` is the existing open-weight option. It calls an OpenAI-compatible model endpoint, requires an eligible open-weight manifest, parses a strict `AffiliateSourceDraft`, generates source/setup/test/registry files in an isolated worktree, and stops at review. The new Codex path is additive and must not weaken that contract.

The repository-local skill will be `.agents/skills/ingest-affiliate-intakes/SKILL.md`. It is a procedural contract for the Codex goal agent. It will require the agent to read `AGENTS.md`, the existing affiliate source builder workflow, its import contract, `docs/affiliate-source-rollout-agent-goal.md`, and the queue status before changing a source. It will define one intake as one checkpoint and require a source-scoped commit or a durable skip/failure record before moving to the next intake.

The launcher will live in `scripts/run-affiliate-intake-codex-goal.ts`, with pure argument and prompt construction in `src/server/affiliateImports/codexCliGoal.ts`. Separating the pure module permits focused tests without contacting OpenAI or starting a nested agent. The launcher checks for the Codex executable and calls `codex login status`. A missing login exits before claiming or changing any intake and prints `codex login --device-auth` as the operator action.

The read-only queue report will live in `scripts/report-affiliate-mapping-queue.ts`, backed by a pure summary function in `src/server/affiliateImports/sourceMappingQueueStatus.ts`. It will support local data by default and `--live` only when `DATABASE_URL_LIVE` is supplied. Its compact JSON will include claimable jobs, eligible ready intakes, active leases, malformed claims without leases, review-required jobs, failed jobs, and status totals. The goal is complete only when `claimableJobs`, `eligibleReadyIntakesWithoutJob`, and `claimedWithoutLease` are all zero. Failed and blocked rows remain visible but do not prevent completion.

## Plan of Work

First create the repository-local skill using the standard skill initializer. Keep `SKILL.md` concise and put the exact per-intake completion contract in one referenced file. Generate `agents/openai.yaml` from the finished skill and validate the folder with the standard skill validator. The skill must forbid public-site requests when stored evidence is sufficient, forbid `TEAM` mappings, forbid invented dates or generated logos, require official logo evidence, and require source-specific validation against stored fixtures.

Next add the pure Codex goal module. Define constants for the requested model and reasoning effort, build one stable goal objective under Codex's 4,000-character goal limit, and construct the interactive CLI arguments without shell interpolation. Use `--cd`, `--model gpt-5.6-luna`, `--config model_reasoning_effort=\"max\"`, `--enable goals`, `--sandbox workspace-write`, and `--ask-for-approval never`. Do not pass `service_tier` or `features.fast_mode`. The positional initial message must instruct the agent to call `create_goal` with the exact objective before doing any work. The launcher must use `spawn` or `execFile` with argument arrays, never a shell command string. It must preserve the interactive terminal so `/goal`, `/status`, pause, resume, and login flows remain usable.

Then add the read-only queue report. Query status groups from `AffiliateSourceIntakes` and `AffiliateSourceMappingJobs`, count old queued or expired leased jobs as claimable, count ready intakes that do not yet have an active or finished mapping job, and print stable JSON. Do not claim, release, or finish jobs from the report.

Update `docs/affiliate-source-rollout-agent-goal.md` so the goal is driven by the intake queue rather than only the historical registry. Require the new skill, queue report, per-intake validation, official logo completion or explicit manual-review disposition, organization/source/mapping setup, and the queue-exhaustion stop check. State that public publication, live writes, automatic scraping, and training-set promotion remain separate approved operations.

Add `package.json` commands:

    affiliate:mapping:queue-status
    affiliate:intakes:codex-goal
    affiliate:intakes:codex-goal:dry-run

The dry run performs dependency/auth checks, prints the exact model, effort, goal text, and argument vector with no credentials, and never launches Codex or changes queue state.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, initialize and edit the skill, then validate it:

    python3 /Users/elesesy/.codex/skills/.system/skill-creator/scripts/init_skill.py ingest-affiliate-intakes --path .agents/skills --resources references --interface display_name="Ingest Affiliate Intakes" --interface short_description="Turn reviewed affiliate intakes into validated organization source packages" --interface default_prompt="Use $ingest-affiliate-intakes to process eligible BracketIQ affiliate intakes until the mapping queue is exhausted."
    python3 /Users/elesesy/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/ingest-affiliate-intakes

Run focused tests and static checks:

    npm test -- --runInBand src/server/affiliateImports/__tests__/codexCliGoal.test.ts src/server/affiliateImports/__tests__/sourceMappingQueueStatus.test.ts
    npx tsc --noEmit
    git diff --check

Exercise the launcher without contacting OpenAI:

    npm run affiliate:intakes:codex-goal:dry-run

Expected output names `gpt-5.6-luna`, `max`, service tier `null`, fast mode `false`, `.agents/skills/ingest-affiliate-intakes/SKILL.md`, the queue-exhaustion command, and either `authenticated: true` or the exact login command. It does not claim a job.

On the VM, after the branch is checked out and dependencies are installed:

    codex --version
    codex login status

If the second command is nonzero, the operator runs:

    codex login --device-auth

After authentication, start the goal from an interactive SSH terminal:

    npm run affiliate:intakes:codex-goal -- --live

The launcher starts Codex in the repository. The operator can use `/goal` to view the persisted objective and `/status` to inspect the active model and permissions.

## Validation and Acceptance

The pure launcher tests must prove that the requested model, max effort, goal feature, repository directory, workspace-write sandbox, and no-approval mode are passed as separate safe arguments. They must prove that no service-tier or fast-mode override is present. They must also prove the goal text requires the repository skill, excludes failed/blocked/held-out/TEAM sources, requires mappings, organizations, logos, tests, review status, source-scoped commits, and stops only at the read-only queue exhaustion condition.

The queue status tests must cover a queued job, an expired lease, an active lease, a claimed job without a lease, a ready intake without a mapping job, review-required and failed jobs, and stable zero-work completion.

The skill validator must accept the repo-local skill. Focused Jest and TypeScript must pass. `git diff --check` must report no whitespace errors. The final staged diff must contain no application route, React component, Prisma schema, migration, production compose, or deployment-script change.

On the VM, `codex login status` must pass before the launcher starts. A launcher dry run must not write the database, claim a job, contact a public source, or launch an agent. The real launcher must visibly report `gpt-5.6-luna`, `max`, service tier `null`, and fast mode `false`; `/goal` must show the ingestion objective. The goal is done only when the queue report returns all three completion counts as zero and the progress log lists all review-ready and skipped intakes.

## Idempotence and Recovery

The launcher itself does not mutate the queue before Codex starts. Re-running a dry run is always safe. The queue uses leases, and a crashed worker's expired claim can be reclaimed by the existing queue code. Each per-source setup must be idempotent and source-scoped. The skill requires the agent to inspect existing scripts, sources, organizations, mappings, and logos before creating anything, preventing duplicate records.

If authentication is missing, stop before launching and use device login. If Codex is interrupted, reopen the persisted CLI session and use `/goal resume`; do not create a second goal against the same queue while the first has an active lease. If an intake cannot be completed from stored evidence, record the reason and finish or release it according to the existing mapping-job workflow so it cannot cause an infinite loop. Do not convert a failure into an approved training example.

## Artifacts and Notes

The implementation must preserve these boundaries:

    intake evidence -> Codex draft/setup/logo work -> deterministic validation
    -> REVIEW_REQUIRED -> human/Sol review -> approval -> training eligibility

The goal is not:

    intake evidence -> automatic live publication

The Mac's broken Codex native binary is not part of this repository change. VM installation and login are deployment preconditions and should be verified after this branch is pushed.

## Interfaces and Dependencies

In `src/server/affiliateImports/codexCliGoal.ts`, export:

    export const CODEX_AFFILIATE_INGESTION_MODEL = 'gpt-5.6-luna';
    export const CODEX_AFFILIATE_INGESTION_REASONING_EFFORT = 'max';
    export const CODEX_AFFILIATE_INGESTION_SERVICE_TIER = null;
    export const CODEX_AFFILIATE_INGESTION_FAST_MODE = false;

    export type CodexAffiliateGoalOptions = {
      repositoryRoot: string;
      useLiveIntakes: boolean;
      workerId: string;
    };

    export const buildCodexAffiliateIngestionGoal:
      (options: CodexAffiliateGoalOptions) => string;

    export const buildCodexAffiliateIngestionArgs:
      (options: CodexAffiliateGoalOptions) => string[];

In `src/server/affiliateImports/sourceMappingQueueStatus.ts`, export a pure summary type and:

    export const summarizeAffiliateMappingQueue:
      (input: QueueStatusRows, now?: Date) => AffiliateMappingQueueStatus;

The script may query Prisma rows, but the summary function must not import Prisma so focused tests remain deterministic.

`scripts/run-affiliate-intake-codex-goal.ts` must call `codex login status` with `execFile`, build arguments through the pure module, print a secret-free preflight summary, and use `spawn` with inherited stdio only when not in dry-run mode.

`scripts/report-affiliate-mapping-queue.ts` must configure `DATABASE_URL` from `DATABASE_URL_LIVE` only when `--live` is explicitly present and must execute read-only Prisma queries.

Revision note (2026-07-30): Created this plan to add the user-requested Codex Luna ingestion option as a durable VM goal while preserving the existing evidence, review, publication, and training-data boundaries.

Revision note (2026-07-31): Recorded the CLI positional-prompt discovery, switched durable goal creation to the `create_goal` tool, added malformed-lease handling to the stop condition, and recorded successful local validation.

Revision note (2026-07-31): Recorded the scoped implementation commits and successful branch push for VM testing.

Revision note (2026-07-31): Recorded the OVH Bubblewrap failure, externally isolated container fallback, successful device login, and running VM goal.

Revision note (2026-07-31): Recorded queue exhaustion, cohort audit results, release validation, and the guarded live-approval boundary.

Revision note (2026-08-01): Upgraded the Luna ingestion process to max reasoning in persisted fast mode and made those settings explicit in preflight output and result provenance.

Revision note (2026-08-04): Removed the service-tier and fast-mode invocation overrides. Kept Luna at max reasoning and made the default service behavior explicit in preflight output and result provenance.

Revision note (2026-08-02): Added isolated multi-mapper execution, conditional-claim concurrency proof, worker-specific progress files, and the hard valid-event-division completion gate.
