# Goal: Exhaust the eligible affiliate intake queue

Work through every eligible `AffiliateSourceIntakes` mapping job and leave each one either fully configured for repeatable affiliate scraping and organization review, expanded into evidenced official organization intakes, accurately marked failed/blocked, or explicitly deferred with a concrete reason. Stop only when `npm run affiliate:mapping:queue-status -- --live` reports `claimableJobs = 0`, `eligibleReadyIntakesWithoutJob = 0`, `claimedWithoutLease = 0`, `queuedCaptureRuns = 0`, and `runningCaptureRuns = 0`.

Use the existing process and data contract as authoritative:

- `.agents/skills/ingest-affiliate-intakes/SKILL.md`
- `.agents/skills/ingest-affiliate-intakes/references/completion-contract.md`
- `docs/admin-affiliate-scrape-sources.md`
- `docs/admin-affiliate-scraping-execplan.md`
- `PLANS.md`

Also use `/Users/elesesy/.codex/skills/affiliate-scrape-source-builder/SKILL.md` and its `references/import-contract.md` when that user-level skill exists. The repository-local skill and completion contract remain authoritative on the VM.

Do not redesign the importer or add schema fields unless the user explicitly requests it. Directory child URLs use the existing intake/page/run records through `npm run affiliate:intakes:enqueue-urls`; do not add them to campaign cursors by hand.

## Evidence Source

Use the live database-backed intake as the primary source of website information. Do not begin by manually revisiting the public site.

1. Find the intake with `npm run affiliate:intake:export -- --live --list --search <name-or-host>` when the key is unknown.
2. Export the stored run with `npm run affiliate:intake:export -- --live --url <public-url>` or `--source-key <key>`. Use `--run-id <id>` when reproducing an exact reviewed run.
3. Read `manifest.json` and `source-evidence.json`, then inspect stored `PAGE_SCREENSHOT`, `PAGE_HTML`, `PAGE_MARKDOWN`, `PAGE_LINKS`, `PAGE_IMAGES`, `PAGE_BRANDING`, `LOGO_CANDIDATE`, robots, and provider-envelope artifacts as applicable.
4. If the intake is missing, unreviewed, failed, or lacks the page needed for a safe mapping or directory expansion, record the exact gap and skip it for this goal. Do not retry a known failing source or silently replace the intake workflow with an undocumented browser scrape.
5. Use a direct browser or ScrapingDog request only as a documented supplemental check when the stored evidence cannot answer a specific mapping question. Do not use it to bypass a blocked policy decision.

Every checked-in setup script must define or clearly comment a `sourceEvidence` object containing the live intake source key, run ID, capture timestamp, provider, source page URLs, and artifact kinds used. Persist that object in the existing `AffiliateScrapeSources.metadata.sourceEvidence` JSON. The source-registry note must cite the same intake/run so the origin of descriptions, dates, prices, divisions, locations, action URLs, and logo choices is reproducible.

## Agent Structure

The Luna x-high goal agent is the coordinator and source owner. It owns the queue lease, stored-evidence inspection, mapping, organization setup, official-logo work, validation, source-scoped commit, terminal job result, registry update, and progress report for one intake before it claims another.

Multiple mapper agents may run at the same time only when each agent has a
unique worker ID and a separate Git workspace. Each mapper must use the claim
command as its only job-assignment tool. The database performs a conditional
lease update, so concurrent claims cannot assign one job to two workers.

Do not split a source across simultaneous agents or claim more than one source in the same worktree. An independent reviewer may inspect a finished package later, but reviewer approval is outside this ingestion goal.

## Queue Rules

Begin with `npm run affiliate:mapping:queue-status -- --live`. Claim the oldest queued or expired job. When the report lists a ready intake with no job, claim that exact intake ID so the queue service creates its job. Do not rebuild completed sources unless their current setup fails validation.

Never scrape a `Blocked` source. If robots, terms, authentication, bot protection, unstable pages, or disallowed paths make a source unsuitable, update the registry with exact evidence, disable automation, and continue to the next source. Do not bypass restrictions.

Exclude held-out test domains and `TEAM`-only sources. Never create affiliate teams; classify supported evidence as `EVENT`, `RENTAL`, or `CLUB`. If either exclusion is discovered only after the row is claimed, finish it as `FAILED` with a specific held-out or unsupported-kind reason so it cannot become a positive training example or loop back into the claimable queue.

The registry and `output/affiliate-codex-ingestion/progress.jsonl` are the progress trackers. Update both after every source rather than waiting until the end of a batch.

For a stored aggregator or club directory, extract all evidenced official organization websites to the proposal JSON contract in the repository-local skill. Submit them with the exact `affiliate:intakes:enqueue-urls` command in the active goal, then pass the schema-validated result file written by that command to `affiliate:mapping:complete` to complete the directory job as `EXPANDED`. The enqueue service owns canonicalization, deduplication, compliance reuse, and capture queueing. It queues ScrapingDog only for current `ALLOWED` domains; new or expired policies remain review-required and blocked policies remain blocked. Do not change policy decisions to force capture. Do not expand more than two directory levels or submit `TEAM` targets.

When queue status reports allowed queued/running captures, run the goal's `affiliate:intakes:process` command and recheck status. Successful captures create their own mapping jobs, which the same Luna goal must continue claiming without another prompt.

## Per-Source Workflow

The goal agent must follow `$ingest-affiliate-intakes` and the affiliate source builder skill from beginning to end. In addition:

- Search existing scripts, DB records, mappings, organizations, and aliases before creating records. Repair existing records rather than duplicating them.
- Inspect the exported intake's unfiltered rendered list and representative detail-page artifacts before mapping. Use stored screenshots to compare the expected listing with extracted output.
- Create or repair an idempotent setup script and matching `package.json` command that can restore the organization, source, mapping, cadence, logo association, and intentional manual candidates through both its disposable default and the guarded `--live` application mode. The producer validates only the disposable mode and must not apply the package live.
- Run setup and scraping against a disposable database first. A launcher `--live` flag authorizes only live intake evidence reads and mapping-job queue transitions; it does not authorize live organization, source, mapping, logo, candidate, or publication writes.
- Inspect at least five candidates and every produced candidate kind. Verify classification, official URLs, dates, descriptions, tags, divisions, prices, registration type, capacity, location, and coordinates against the rendered source.
- Write public event and organization descriptions from stored first-party evidence. Describe the activity, audience, format, schedule, venue, services, or material terms in natural language. Do not narrate that a record was listed, found, scraped, captured, or mapped from a site, and do not start an event description by repeating its full title. When event-specific prose is absent, one concise organization-level activity fallback may be reused across related events if the evidence supports it.
- Give each canonical organization the most specific defensible location. Prefer a source-backed street address. When no address is published, use an evidenced city, locality, metro, or region from first-party content, stored intake discovery context, or explicit parent-directory evidence. Record the fallback evidence and geocode the locality through the server-side Google Places path. City or region centroid coordinates are valid for an organization; do not leave its location or coordinates null only because a street address is unavailable.
- Treat each source event as one parent record. Group every division under its exact event identity/detail-page context and never merge divisions across adjacent cards, dates, venues, or registration pages. Preserve the organization's exact division label as the display name, then independently select BracketIQ's canonical `gender` (`M`, `F`, `C`), `ratingType` (`AGE` or `SKILL`), `divisionTypeId`, `skillDivisionTypeId`, and `ageDivisionTypeId`. Use Coed only when the source says coed/mixed or leaves gender unspecified; preserve ambiguous labels and flag them for review rather than guessing.
- Keep source prices and capacities on their owning divisions. Do not copy or average a division price. Use an event-level fallback only for a genuinely single-price or single-division event; when division prices differ, expose a compact event price range and keep late fees, discounts, membership requirements, and other caveats in the details.
- Resolve event-specific evidenced addresses, venues, and facilities through the server-only Google Places path. An event may use the canonical source organization's valid location only when stored evidence shows it is held there and the candidate records `locationSource: "SOURCE_ORGANIZATION"` plus a non-empty `locationEvidence` note. City-only text, common ownership, or proximity is insufficient. Reject and log only the affected event when no usable location exists; do not fail an otherwise valid organization/source package.
- Run the scrape twice and prove the second run does not create duplicate candidates or published targets.
- Configure the documented daily, weekly, or monthly cadence, but leave new recurring scraping disabled until coordinator review succeeds.
- Add focused fixtures/tests and run the required checks from the skill and repository instructions.
- For a source-only package, run source-specific Jest, targeted ESLint for the
  authored TypeScript, both disposable setup/scrape runs, and scoped diff
  checks. Do not run the repository-wide `npx tsc --noEmit` command. Reserve a
  full-project TypeScript check for an explicitly authorized change to shared
  importer contracts, route contracts, or public application code.

The goal agent must follow the skill's organization-logo workflow. It must find an official logo or official rendered brand mark and never invent one. It must run `npm run affiliate:logo-fit -- --organization-id=<exact-organization-id> --output=<unique-logo-fit-directory>` for only the current organization, inspect all card/detail/icon/marker surfaces, and make the setup script reproduce the approved asset. It must dry-run and then apply `npm run affiliate:logo-fit:cleanup -- --path=<exact-directory>` after it records the fit result. It must never use `--all` for a mapping job or retain generated preview copies. Image tools may normalize or crop official evidence but must not generate a new brand identity. If no official logo is supportable, record `MANUAL_REVIEW` and keep the organization unpublishable.

When a requeued claim contains `repairContext`, the agent must repair the named
defect rather than rebuilding the prior result unchanged. For
`MANUAL_LOGO_REVIEW`, exhaust and visually inspect the stored branding, image,
logo-candidate, screenshot, HTML/CSS, structured-data, metadata, and favicon
evidence. Inspect the current intake `lastRunId` first because a reviewer may
have added a supplemental official-page capture and verified `LOGO_CANDIDATE`.
Commit a verified official normalized asset or official screenshot
crop when supportable. If none is supportable, record the exact evidence gap
and stop the package from cycling; never invent a replacement mark.

For a claimed `event-datetime-v1` remediation job, inspect every expected
occurrence and classify it as `SCHEDULED`, `DATE_ONLY`, `NO_FIXED_DATE`, or
`ONGOING`. The producer result must include a compact `dateTimeReview` with
timezone-evidence, start-precision, end-derivation, duration-warning,
UTC-host-regression, display-mode, evergreen-transition, and evergreen-evidence
counts. Every evergreen row needs source-backed schedule text and no hidden
dated session; tryouts and evaluations cannot be evergreen. Independent review
must recompute event-local UTC instants and set `dateTimeQualityVerified` only
after checking the complete section.

## Completion Gate

The coordinator may mark a source complete only when:

- scraping policy is documented and permitted paths are used;
- the canonical organization is correctly configured and not duplicated;
- the approved official logo passes the rendered fit review;
- setup code is idempotent and locally reproducible;
- mapping/candidates use the existing import contract;
- extracted data matches the rendered source;
- event and organization descriptions are natural, source-derived public copy without discovery narration or repeated event titles;
- organization location and coordinates use the best defensible source, intake, or directory evidence, with a city or region centroid when no street address is published;
- accepted events have event-specific valid non-zero coordinates or an explicit evidence-backed source-organization fallback, while invalid event locations are excluded and appear in stable scrape-run rejection summaries;
- source division names remain intact while canonical gender/age/skill fields are populated from evidence;
- every accepted event has at least one source-supported division, and each
  division has a name, gender, rating type, division type, skill type, and age
  type;
- divisions are grouped to the correct parent event and each division retains its own source price and capacity, with event-level price/range derived without cross-division leakage;
- rerunning is duplicate-safe;
- cadence and automation state are correct;
- source-specific tests, targeted ESLint, disposable setup/scrape validation,
  duplicate-safety evidence, and scoped diff checks pass;
- the registry records status, source key, mapping version, organization/logo notes, cadence, limitations, validation date, and candidate results.
- the setup script, source metadata, and registry record the live intake source key/run and capture provenance used to derive the source.
- exactly two review scrapes have stable candidate counts and normalized candidate hashes;
- the source package has a source-scoped commit and compact result JSON.

Do not treat the existence of a setup script as completion. The admin scrape flow and persisted candidate output must be demonstrated locally.

If the stored source sport is not an exact current `Sports.name`, do not write
a source package, generated scraper, or candidate. Preserve the exact source
label only in a structured human-review result with reason code
`SPORT_NOT_IN_CATALOG` and complete the mapping job as
`HUMAN_REVIEW_REQUIRED`. This terminal result does not create an approval job.

After committing, record the terminal queue result:

    npm run affiliate:mapping:complete -- --live --job=<job-id> --result=<result-json>

Use `REVIEW_REQUIRED` only for a passing package. Use `HUMAN_REVIEW_REQUIRED`
for the structured unsupported-sport stop described above. Use `EXPANDED` only
for a directory whose proposal command accepted, reused, or deduplicated at
least one evidenced official URL. Use `FAILED` with an exact evidence, policy,
parser, or infrastructure reason when a claimed intake cannot be completed
safely. Human-review, expanded, and failed rows are not positive
mapping-training examples and do not prevent queue exhaustion.

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

After every terminal result, run the queue status again and continue until all five completion counts are zero. Process allowed capture runs before concluding that no new mapping jobs exist. Historical expanded/failed/reviewed jobs and active leases owned by another worker remain visible in the final report but are not available work. A claimed job with no lease is malformed rather than complete and must be reported for operator repair.

The live goal may create/reuse intake pages, policy-preflight rows, capture runs, and stored capture artifacts through the governed commands. Do not push, deploy, modify live organization/source/mapping/candidate rows, publish candidates, approve training data, alter domain-policy decisions, or enable live schedules unless the active user request explicitly authorizes those actions.
