---
name: plan-affiliate-discovery-campaigns
description: Assess BracketIQ affiliate organization coverage, create bounded source-discovery campaigns, and recover failed campaign intake captures with durable manual browser evidence. Use when a Codex goal or operator asks to drain the affiliate coverage queue, find missing clubs or competition operators, add league or tournament discovery campaigns, evaluate whether a market is covered, or manually inspect a website that ScrapingDog could not capture.
---

# Plan Affiliate Discovery Campaigns

Claim one coverage job at a time. Finish it before claiming another. Continue until the queue report proves no claimable job or active lease remains.

Before the first claim, read:

- `AGENTS.md`
- `docs/affiliate-coverage-agent-execplan.md`
- `docs/affiliate-source-discovery-campaigns.md`
- `src/server/affiliateImports/sourceDiscoveryRules.ts`
- `references/completion-contract.md` in this skill

## Run the queue

1. Use the exact reconcile, queue-status, claim, campaign-create, manual-evidence, intake-export, and completion commands in the active goal.
2. Keep `--live` only when the goal supplied it.
3. Reconcile before claiming and after every completion.
4. Use only the claim command for assignment. Its conditional lease is the race boundary.
5. Resume the active job returned for this worker. Do not take another worker's lease.
6. Stop only when `claimableJobs`, `activeLeases`, and `claimedWithoutLease` are all zero.

## Assess market coverage

Treat the claim as one market assessment. Inspect the parent campaign, selected sports, completed query profiles, recent new-domain yield, result types, unresolved leads, and neighboring focused campaigns.

Assess organization archetypes separately:

- clubs and academies;
- facilities;
- league and tournament competition operators;
- governing associations;
- recreation departments;
- training providers.

Separate the organization archetype from its event types. One competition operator can run leagues and tournaments. A tournament or cup name is not automatically an organization. Create an organization-oriented campaign only when evidence suggests a persistent operator identity, such as its own official domain, contact identity, recurring competition series, or independent registration operation. Otherwise keep the competition under the evidenced host organization.

Create focused campaigns when a sport or archetype has weak coverage. Prefer metro searches for local operators and regional or state language for governing associations. Use `LEAGUE` and `TOURNAMENT` as separate campaign source types. Do not create arbitrary query text, duplicate a campaign fingerprint, or use provider calls outside the deterministic campaign runner.

Run every created campaign with the exact discovery-run command in the active goal. Then complete the job as `CAMPAIGNS_CREATED`. This returns the same market assessment to the queue. Reclaim it to receive fresh campaign results and reassess. Continue until the evidence supports `COVERED` or requires human review.

Mark a market `COVERED` only when:

- at least two independent source families were checked;
- the relevant query profiles completed;
- no discovered lead remains unresolved;
- recent new-domain yields are recorded;
- failed intake captures for the assessed evidence have a terminal outcome.

Organization count alone does not prove coverage. Peer-market differences are anomaly signals only.

## Recover failed intake captures

Export and inspect the stored failed run first. Identify the exact failed page and reason. Then perform one bounded manual public-page navigation or direct request when no explicit prohibition exists.

Do not use credentials, login sessions, CAPTCHA solving, stealth evasion, proxy rotation, or repeated retries. Do not bypass `DISALLOWED` robots evidence or a blocked domain policy. A public page that requires authentication is not manually recoverable.

When the page is readable, save the final HTML and an optional screenshot in the workspace. Submit them through the manual-evidence command. The command must create a supplemental `MANUAL_BROWSER` run and durable HTML or Markdown artifacts before the job can use `CAPTURE_RECOVERED`.

If the official URL moved, do not silently attach another domain's content. Record the replacement as human review unless the governed intake workflow has created or linked the replacement page.

If stored evidence shows an existing approved scraper has broken selectors, return `MAPPER_REPAIR_REQUIRED`. Do not edit scraper packages from this role. Use `HUMAN_REVIEW_REQUIRED` for explicit prohibitions, login-only pages, conflicting identity, inaccessible evidence, or a replacement domain that needs approval.

## Preserve boundaries

The Coverage Agent may create active bounded discovery campaigns and durable supplemental intake evidence. It must not:

- map or repair source code;
- approve mappings or domain policies;
- publish organizations, events, rentals, or clubs;
- enable approved-source automatic scraping;
- alter training releases;
- invent an organization identity or replacement URL;
- push, deploy, restart processes, or change unrelated live data.

## Report progress

After each completion, append one compact JSON line to `output/affiliate-coverage-agent/progress/<agent-id>.jsonl`. Record the job, subject type, decision, campaign IDs or manual run ID, reasons, and remaining queue counts. Do not include credentials, signed URLs, raw provider envelopes, or full page content.

At exhaustion, report campaigns created, recovered captures, mapper repairs, human-review items, and the final queue status.
