# Goal: Exhaust the eligible affiliate intake queue

Work through every eligible `AffiliateSourceIntakes` mapping job and leave each one either fully configured for repeatable affiliate scraping and organization review, accurately marked failed/blocked, or explicitly deferred with a concrete reason. Stop only when `npm run affiliate:mapping:queue-status -- --live` reports `claimableJobs = 0`, `eligibleReadyIntakesWithoutJob = 0`, and `claimedWithoutLease = 0`.

Use the existing process and data contract as authoritative:

- `.agents/skills/ingest-affiliate-intakes/SKILL.md`
- `.agents/skills/ingest-affiliate-intakes/references/completion-contract.md`
- `docs/admin-affiliate-scrape-sources.md`
- `docs/admin-affiliate-scraping-execplan.md`
- `PLANS.md`

Also use `/Users/elesesy/.codex/skills/affiliate-scrape-source-builder/SKILL.md` and its `references/import-contract.md` when that user-level skill exists. The repository-local skill and completion contract remain authoritative on the VM.

Do not redesign the importer, add schema fields, or change affiliate data structures unless the user explicitly requests it.

## Evidence Source

Use the live database-backed intake as the primary source of website information. Do not begin by manually revisiting the public site.

1. Find the intake with `npm run affiliate:intake:export -- --live --list --search <name-or-host>` when the key is unknown.
2. Export the stored run with `npm run affiliate:intake:export -- --live --url <public-url>` or `--source-key <key>`. Use `--run-id <id>` when reproducing an exact reviewed run.
3. Read `manifest.json` and `source-evidence.json`, then inspect stored `PAGE_SCREENSHOT`, `PAGE_HTML`, `PAGE_MARKDOWN`, `PAGE_LINKS`, `PAGE_IMAGES`, `PAGE_BRANDING`, `LOGO_CANDIDATE`, robots, and provider-envelope artifacts as applicable.
4. If the intake is missing, unreviewed, failed, or lacks the page needed for a safe mapping, record the exact gap and skip it for this goal. Do not retry a known failing source or silently replace the intake workflow with an undocumented browser scrape.
5. Use a direct browser or ScrapingDog request only as a documented supplemental check when the stored evidence cannot answer a specific mapping question. Do not use it to bypass a blocked policy decision.

Every checked-in setup script must define or clearly comment a `sourceEvidence` object containing the live intake source key, run ID, capture timestamp, provider, source page URLs, and artifact kinds used. Persist that object in the existing `AffiliateScrapeSources.metadata.sourceEvidence` JSON. The source-registry note must cite the same intake/run so the origin of descriptions, dates, prices, divisions, locations, action URLs, and logo choices is reproducible.

## Agent Structure

The Luna x-high goal agent is the coordinator and source owner. It owns the queue lease, stored-evidence inspection, mapping, organization setup, official-logo work, validation, source-scoped commit, terminal job result, registry update, and progress report for one intake before it claims another.

Do not split a source across simultaneous agents or claim more than one source in the same worktree. An independent reviewer may inspect a finished package later, but reviewer approval is outside this ingestion goal.

## Queue Rules

Begin with `npm run affiliate:mapping:queue-status -- --live`. Claim the oldest queued or expired job. When the report lists a ready intake with no job, claim that exact intake ID so the queue service creates its job. Do not rebuild completed sources unless their current setup fails validation.

Never scrape a `Blocked` source. If robots, terms, authentication, bot protection, unstable pages, or disallowed paths make a source unsuitable, update the registry with exact evidence, disable automation, and continue to the next source. Do not bypass restrictions.

Exclude held-out test domains and `TEAM`-only sources. Never create affiliate teams; classify supported evidence as `EVENT`, `RENTAL`, or `CLUB`. If either exclusion is discovered only after the row is claimed, finish it as `FAILED` with a specific held-out or unsupported-kind reason so it cannot become a positive training example or loop back into the claimable queue.

The registry and `output/affiliate-codex-ingestion/progress.jsonl` are the progress trackers. Update both after every source rather than waiting until the end of a batch.

## Per-Source Workflow

The goal agent must follow `$ingest-affiliate-intakes` and the affiliate source builder skill from beginning to end. In addition:

- Search existing scripts, DB records, mappings, organizations, and aliases before creating records. Repair existing records rather than duplicating them.
- Inspect the exported intake's unfiltered rendered list and representative detail-page artifacts before mapping. Use stored screenshots to compare the expected listing with extracted output.
- Create or repair an idempotent setup script and matching `package.json` command that can restore the organization, source, mapping, cadence, logo association, and intentional manual candidates.
- Run setup and scraping against a disposable database first. A launcher `--live` flag authorizes only live intake evidence reads and mapping-job queue transitions; it does not authorize live organization, source, mapping, logo, candidate, or publication writes.
- Inspect at least five candidates and every produced candidate kind. Verify classification, official URLs, dates, descriptions, tags, divisions, prices, registration type, capacity, location, and coordinates against the rendered source.
- Run the scrape twice and prove the second run does not create duplicate candidates or published targets.
- Configure the documented daily, weekly, or monthly cadence, but leave new recurring scraping disabled until coordinator review succeeds.
- Add focused fixtures/tests and run the required checks from the skill and repository instructions.

The goal agent must follow the skill's organization-logo workflow. It must find an official logo or official rendered brand mark, never invent one, run `npm run affiliate:logo-fit`, inspect all card/detail/icon/marker surfaces, and make the setup script reproduce the approved asset. Image tools may normalize or crop official evidence but must not generate a new brand identity. If no official logo is supportable, record `MANUAL_REVIEW` and keep the organization unpublishable.

## Completion Gate

The coordinator may mark a source complete only when:

- scraping policy is documented and permitted paths are used;
- the canonical organization is correctly configured and not duplicated;
- the approved official logo passes the rendered fit review;
- setup code is idempotent and locally reproducible;
- mapping/candidates use the existing import contract;
- extracted data matches the rendered source;
- location and coordinates work when the source publishes a resolvable location;
- rerunning is duplicate-safe;
- cadence and automation state are correct;
- focused tests, TypeScript, and diff checks pass;
- the registry records status, source key, mapping version, organization/logo notes, cadence, limitations, validation date, and candidate results.
- the setup script, source metadata, and registry record the live intake source key/run and capture provenance used to derive the source.
- exactly two review scrapes have stable candidate counts and normalized candidate hashes;
- the source package has a source-scoped commit and compact result JSON.

Do not treat the existence of a setup script as completion. The admin scrape flow and persisted candidate output must be demonstrated locally.

After committing, record the terminal queue result:

    npm run affiliate:mapping:complete -- --live --job=<job-id> --result=<result-json>

Use `REVIEW_REQUIRED` only for a passing package. Use `FAILED` with an exact evidence, policy, parser, or infrastructure reason when a claimed intake cannot be completed safely. Failed rows are not positive training examples and do not prevent queue exhaustion.

## Source Handoff

Each completed source should produce one source-scoped commit containing its organization, source, mapping/extractor, official-logo work, registry note, and tests. Before committing, stage explicit files and run `git diff --cached --check`.

After each batch, report:

- completed sources and source keys;
- blocked/deferred sources with reasons;
- candidate counts and validation warnings;
- logo review results;
- configured cadence and enabled/disabled state;
- test results and commit hashes;
- decisions requiring user input.

After every terminal result, run the queue status again and continue until all three completion counts are zero. Historical failed/reviewed jobs and active leases owned by another worker remain visible in the final report but are not available work. A claimed job with no lease is malformed rather than complete and must be reported for operator repair.

Do not push, deploy, modify live organization/source/mapping/candidate rows, publish candidates, approve training data, or enable live schedules unless the active user request explicitly authorizes those actions.
