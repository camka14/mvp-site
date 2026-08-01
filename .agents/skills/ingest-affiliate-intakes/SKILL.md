---
name: ingest-affiliate-intakes
description: Process BracketIQ AffiliateSourceIntakes into complete, review-ready affiliate organization packages. Use when a Codex goal or operator asks to drain the affiliate mapping queue, ingest indexed sites, create or repair organization/source/mapping setup code, select and normalize official logos, validate stored HTML or Markdown evidence, or prepare approved input/output examples for later affiliate-mapping training.
---

# Ingest Affiliate Intakes

Turn one eligible stored intake at a time into a reproducible, tested organization package. Continue until the read-only queue report proves no eligible work remains.

Before processing the first intake, read:

- `AGENTS.md`
- `PLANS.md`
- `docs/affiliate-source-rollout-agent-goal.md`
- `docs/admin-affiliate-scrape-sources.md`
- `docs/admin-affiliate-scraping-execplan.md`
- `src/server/affiliateImports/codexIngestionResult.ts`
- `references/completion-contract.md` in this skill

Also read `/Users/elesesy/.codex/skills/affiliate-scrape-source-builder/SKILL.md` and its `references/import-contract.md` when they exist on the machine. The completion contract in this skill remains authoritative on a VM where that user-level skill is absent.

## Run the queue

1. Use the exact queue-status, claim, URL-enqueue, capture-processing, and complete commands in the active goal. Keep `--live` only when the goal supplied it; otherwise use the local commands and do not add live access.
2. Stop successfully only when `claimableJobs`, `eligibleReadyIntakesWithoutJob`, `claimedWithoutLease`, `queuedCaptureRuns`, and `runningCaptureRuns` are all zero.
3. Claim exactly one intake with the goal's stable worker ID. If the claim
   includes `repairContext`, treat its `repairReason` as required producer work
   and create a new source-scoped commit before resubmitting.
4. Work only from the exported stored evidence. Do not make a new public-site request when the intake already answers the question.
5. Complete the entire intake checkpoint before claiming another.
6. Record the result using the goal's exact completion command and a JSON artifact that passes `codexAffiliateIngestionResultSchema`.
7. Re-run the queue status and continue.

When the stored intake is an aggregator or club directory, do not create a scraper package for the directory merely to end the claim. Inspect its stored HTML, Markdown, and link artifacts and identify the evidenced official organization websites. Write a proposal JSON using the exact batch contract in `references/completion-contract.md`, submit it through the goal's `affiliate:intakes:enqueue-urls` command, and pass the schema-validated result JSON written by that command to the normal completion command to record the parent job as `EXPANDED`. Do not visit those child sites directly: the shared intake service will deduplicate them, apply the existing policy gate, and queue ScrapingDog for current allowed domains. Run the goal's `affiliate:intakes:process` command while allowed captures are queued, then map the child intakes produced by successful captures.

Expand at most two directory levels. Reject links back to the parent intake, unsupported `TEAM` targets, intermediary/search URLs presented as official sites, and URLs not evidenced by a stored parent page. New or expired domain policies remain review-required; never auto-approve them. Blocked policies never enter capture.

Do not retry historical failed capture intakes. Do not claim blocked, incomplete, held-out test, duplicate, already promoted, or `TEAM`-only rows. If exclusion is discovered only after claiming, record `FAILED` with a precise non-training reason so the row cannot loop. A valid directory expansion is `EXPANDED`, not `FAILED` and not a positive mapping-training example. If a claimed intake otherwise cannot be completed, create a result artifact explaining the exact evidence or policy gap and record it as failed or release it once for a genuinely transient interruption; do not loop on it.

## Complete one intake

Inspect the manifest, source evidence, HTML, Markdown, screenshots, links, images, branding, logo candidates, robots evidence, and provider envelopes that apply. Classify the source as `EVENT`, `RENTAL`, or `CLUB`. Never create `TEAM` mappings or affiliate teams.

Search existing organizations, sources, mappings, setup scripts, generated sources, and source registry entries before creating anything. Repair canonical records and avoid duplicates.

Create or repair everything needed for review:

- an idempotent source setup script and package command that supports the normal
  guarded `--live` application path; validate it only against the disposable
  database because the producer goal never authorizes live application;
- the canonical organization draft with website, description, sport, city, and address when evidenced; for US locations, persist the city as `City, ST` whenever the stored evidence establishes the state so public search and sitemap location filters can classify it, but never infer a missing state;
- valid `[longitude, latitude]` coordinates resolved through the server-side Google Places path for the canonical organization when its own location is evidenced;
- a generic mapping, manual candidates, or a clearly justified custom extractor;
- official outbound action URLs;
- an official logo asset or official screenshot crop normalized to an opaque 1024 by 1024 image;
- source evidence metadata and registry notes;
- focused fixtures and tests;
- two duplicate-safe review scrapes against a disposable database;
- a compact result JSON and a source-scoped commit.

Never invent dates, prices, addresses, divisions, tags, organization facts, or logos. Image tools may crop, resize, remove transparency from, or normalize an official stored asset. They must not create a new brand mark. When no reliable official mark exists, set the logo disposition to manual review and keep the organization unpublishable.

For a `MANUAL_LOGO_REVIEW` repair, inspect every stored `LOGO_CANDIDATE`,
`PAGE_BRANDING`, `PAGE_IMAGES`, screenshot, HTML/CSS reference, structured-data
logo, Open Graph image, and favicon before concluding that the logo is missing.
Open and visually inspect plausible image artifacts. Normalize or crop only a
verified first-party organization mark and update the setup script, fixture,
result disposition, and rendered-fit evidence in a new commit. If no official
mark can be verified, record which artifacts were inspected and why each is
insufficient; finish without inventing a mark and do not recycle the same
evidence indefinitely.

Treat organization validity separately from child event validity. A valid
organization package is not failed merely because one or more extracted events
lacks a usable location. The review scrape must exclude those events, record
their titles and location rejection reasons in the scrape run, and keep the
organization/source package reviewable.

For an event with its own evidenced venue or address, let the normal
server-side Google Places resolver obtain its coordinates. When stored evidence
instead shows that an event occurs at the canonical source organization, set
`locationSource: "SOURCE_ORGANIZATION"` and include a concrete
`locationEvidence` note on that candidate. Use the source organization's
coordinates only in that explicit evidence-backed mode. A city alone, a common
owner, or proximity is insufficient. When neither event-specific location nor
source-organization evidence exists, preserve the gap: the scrape must reject
that event and expose the failure rather than invent coordinates.

## Preserve event, division, and pricing semantics

Treat each source event as the parent record for the divisions shown inside
that event card or detail page. Group every division under exactly one parent
event using the source's stable event identity, URL, or detail-page context;
never merge divisions from neighboring cards, dates, venues, or registration
pages. Set `singleDivision` only when the source genuinely exposes one
division. Keep an event with multiple divisions as one event with multiple
division rows.

Preserve the organization's exact division label in the division `name` (for
example, `Women's D3`, `12U Gold`, or `Adult Rec`). Add our own structured
classification separately: `gender` must be `M`, `F`, or `C`; `ratingType`
must be `AGE` or `SKILL`; and `divisionTypeId`, `skillDivisionTypeId`, and
`ageDivisionTypeId` must use the canonical sport catalog. Use `C`/Coed only
when the source says coed/mixed or does not specify a gender. Do not replace a
source label with our canonical label, and do not guess an age or skill tier
when the evidence is ambiguous; preserve the source text and add a warning or
manual-review disposition.

Keep prices and capacity attached to the division that owns them. Parse the
source's per-division registration price into `priceCents` without averaging,
overwriting, or copying one division's price to another. Use an event-level
price only when the source publishes one price for the whole event or there is
truly one division; when division prices differ, derive the public event price
as a compact range. Keep late fees, discounts, membership requirements,
player-card fees, and other caveats in the description/details, and leave
price null when the source does not publish a price.

## Preserve approval boundaries

The goal may produce review-ready code, local database records, fixtures, and validation output. It must not:

- publish candidates, organizations, events, rentals, or clubs;
- enable automatic scraping;
- mark a mapping validated;
- promote a result into a training release;
- push, deploy, or alter production application code outside the source package;
- change live organization/source/mapping rows unless the launch command and active user authorization explicitly allow live application.

A `REVIEW_REQUIRED` queue result is not approval. An `EXPANDED` result only records that child URLs were submitted; it is not a source mapping or a training example. Human or independent reviewer approval remains mandatory before publication or training eligibility.

## Report progress

After every intake, append a short checkpoint to `output/affiliate-codex-ingestion/progress.jsonl` with the job ID, intake ID, source key, result, commit, tests, candidate counts, logo disposition, and remaining queue counts. Do not include credentials, signed artifact URLs, or raw provider envelopes.

At exhaustion, report:

- review-ready sources and commit hashes;
- skipped or failed intakes and exact reasons;
- candidate and validation summaries;
- official-logo results and manual-review gaps;
- final queue status;
- directory-expansion counts and child URLs awaiting policy review;
- decisions still requiring the user.
