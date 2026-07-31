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

1. Use the exact queue-status, claim, and complete commands in the active goal. Keep `--live` only when the goal supplied it; otherwise use the local commands and do not add live access.
2. Stop successfully only when `claimableJobs`, `eligibleReadyIntakesWithoutJob`, and `claimedWithoutLease` are all zero.
3. Claim exactly one intake with the goal's stable worker ID.
4. Work only from the exported stored evidence. Do not make a new public-site request when the intake already answers the question.
5. Complete the entire intake checkpoint before claiming another.
6. Record the result using the goal's exact completion command and a JSON artifact that passes `codexAffiliateIngestionResultSchema`.
7. Re-run the queue status and continue.

Do not retry historical failed capture intakes. Do not claim blocked, incomplete, held-out test, duplicate, already promoted, or `TEAM`-only rows. If exclusion is discovered only after claiming, record `FAILED` with a precise non-training reason so the row cannot loop. If a claimed intake otherwise cannot be completed, create a result artifact explaining the exact evidence or policy gap and record it as failed or release it once for a genuinely transient interruption; do not loop on it.

## Complete one intake

Inspect the manifest, source evidence, HTML, Markdown, screenshots, links, images, branding, logo candidates, robots evidence, and provider envelopes that apply. Classify the source as `EVENT`, `RENTAL`, or `CLUB`. Never create `TEAM` mappings or affiliate teams.

Search existing organizations, sources, mappings, setup scripts, generated sources, and source registry entries before creating anything. Repair canonical records and avoid duplicates.

Create or repair everything needed for review:

- an idempotent source setup script and package command;
- the canonical organization draft with website, description, sport, city, and address when evidenced;
- a generic mapping, manual candidates, or a clearly justified custom extractor;
- official outbound action URLs;
- an official logo asset or official screenshot crop normalized to an opaque 1024 by 1024 image;
- source evidence metadata and registry notes;
- focused fixtures and tests;
- two duplicate-safe review scrapes against a disposable database;
- a compact result JSON and a source-scoped commit.

Never invent dates, prices, addresses, divisions, tags, organization facts, or logos. Image tools may crop, resize, remove transparency from, or normalize an official stored asset. They must not create a new brand mark. When no reliable official mark exists, set the logo disposition to manual review and keep the organization unpublishable.

## Preserve approval boundaries

The goal may produce review-ready code, local database records, fixtures, and validation output. It must not:

- publish candidates, organizations, events, rentals, or clubs;
- enable automatic scraping;
- mark a mapping validated;
- promote a result into a training release;
- push, deploy, or alter production application code outside the source package;
- change live organization/source/mapping rows unless the launch command and active user authorization explicitly allow live application.

A `REVIEW_REQUIRED` queue result is not approval. Human or independent reviewer approval remains mandatory before publication or training eligibility.

## Report progress

After every intake, append a short checkpoint to `output/affiliate-codex-ingestion/progress.jsonl` with the job ID, intake ID, source key, result, commit, tests, candidate counts, logo disposition, and remaining queue counts. Do not include credentials, signed artifact URLs, or raw provider envelopes.

At exhaustion, report:

- review-ready sources and commit hashes;
- skipped or failed intakes and exact reasons;
- candidate and validation summaries;
- official-logo results and manual-review gaps;
- final queue status;
- decisions still requiring the user.
