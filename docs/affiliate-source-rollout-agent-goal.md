# Goal: Complete the Affiliate Source Registry

Work through the eligible sources in `docs/admin-affiliate-scrape-sources.md` and leave each one either fully configured for repeatable affiliate scraping, accurately marked blocked, or explicitly deferred with a concrete reason.

Use the existing process and data contract as authoritative:

- `/Users/elesesy/.codex/skills/affiliate-scrape-source-builder/SKILL.md`
- `/Users/elesesy/.codex/skills/affiliate-scrape-source-builder/references/import-contract.md`
- `docs/admin-affiliate-scrape-sources.md`
- `docs/admin-affiliate-scraping-execplan.md`
- `PLANS.md`

Do not redesign the importer, add schema fields, or change affiliate data structures unless the user explicitly requests it.

## Evidence Source

Use the live database-backed intake as the primary source of website information. Do not begin by manually revisiting the public site.

1. Find the intake with `npm run affiliate:intake:export -- --live --list --search <name-or-host>` when the key is unknown.
2. Export the stored run with `npm run affiliate:intake:export -- --live --url <public-url>` or `--source-key <key>`. Use `--run-id <id>` when reproducing an exact reviewed run.
3. Read `manifest.json` and `source-evidence.json`, then inspect stored `PAGE_SCREENSHOT`, `PAGE_HTML`, `PAGE_MARKDOWN`, `PAGE_LINKS`, `PAGE_IMAGES`, `PAGE_BRANDING`, `LOGO_CANDIDATE`, robots, and provider-envelope artifacts as applicable.
4. If the intake is missing, unreviewed, failed, or lacks the page needed for a safe mapping, update/queue the intake through the admin flow. Do not silently replace the intake workflow with an undocumented browser scrape.
5. Use a direct browser or ScrapingDog request only as a documented supplemental check when the stored evidence cannot answer a specific mapping question. Do not use it to bypass a blocked policy decision.

Every checked-in setup script must define or clearly comment a `sourceEvidence` object containing the live intake source key, run ID, capture timestamp, provider, source page URLs, and artifact kinds used. Persist that object in the existing `AffiliateScrapeSources.metadata.sourceEvidence` JSON. The source-registry note must cite the same intake/run so the origin of descriptions, dates, prices, divisions, locations, action URLs, and logo choices is reproducible.

## Agent Structure

The primary agent is the coordinator. It owns the queue, worktrees, integration, final validation, registry updates, and progress reporting.

For every source, assign exactly two subagents:

1. One source agent owns that complete source: policy review, rendered-page inspection, ScrapingDog output, classification, organization/source/mapping setup, candidates, cadence, tests, and source notes. Do not split one source among event, rental, club, parser, or test agents.
2. One separate logo agent owns that source organization's logo discovery, normalization, persistence, and rendered fit review. The source agent must not substitute a placeholder logo. For a directory source, its one logo agent owns the logos for organizations created by that directory.

Different sources may run in parallel only in isolated branches/worktrees. The two agents assigned to the same source must work sequentially or on non-overlapping branches that the coordinator integrates. They must not edit the same files concurrently.

## Queue Rules

Process P0 before P1. Start with `Not started`, then resume partially completed statuses. Do not rebuild completed sources unless their current setup fails validation.

Never scrape a `Blocked` source. If robots, terms, authentication, bot protection, unstable pages, or disallowed paths make a source unsuitable, update the registry with exact evidence, disable automation, and continue to the next source. Do not bypass restrictions.

The registry is the progress tracker. Update the relevant row after every source rather than waiting until the end of a batch.

## Per-Source Workflow

The source agent must follow the affiliate source builder skill from beginning to end. In addition:

- Search existing scripts, DB records, mappings, organizations, and aliases before creating records. Repair existing records rather than duplicating them.
- Inspect the exported intake's unfiltered rendered list and representative detail-page artifacts before mapping. Use stored screenshots to compare the expected listing with extracted output.
- Create or repair an idempotent setup script and matching `package.json` command that can restore the organization, source, mapping, cadence, logo association, and intentional manual candidates.
- Run setup and scraping against the local database first. Do not touch live data without explicit user authorization.
- Inspect at least five candidates and every produced candidate kind. Verify classification, official URLs, dates, descriptions, tags, divisions, prices, registration type, capacity, location, and coordinates against the rendered source.
- Run the scrape twice and prove the second run does not create duplicate candidates or published targets.
- Configure the documented daily, weekly, or monthly cadence, but leave new recurring scraping disabled until coordinator review succeeds.
- Add focused fixtures/tests and run the required checks from the skill and repository instructions.

The logo agent must follow the skill's organization-logo workflow. It must find an official logo or official rendered brand mark, never invent one, run `npm run affiliate:logo-fit`, inspect all card/detail/icon/marker surfaces, and make the setup script reproduce the approved asset.

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

Do not treat the existence of a setup script as completion. The admin scrape flow and persisted candidate output must be demonstrated locally.

## Source Handoff

Each completed source should produce a source-scoped commit and a logo-scoped commit, or one coordinator-integrated commit containing only that source. Before committing, stage explicit files and run `git diff --cached --check`.

After each batch, report:

- completed sources and source keys;
- blocked/deferred sources with reasons;
- candidate counts and validation warnings;
- logo review results;
- configured cadence and enabled/disabled state;
- test results and commit hashes;
- decisions requiring user input.

Do not push, deploy, modify the live database, publish candidates, or enable live schedules unless the active user request explicitly authorizes those actions.
