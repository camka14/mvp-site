---
name: review-affiliate-approvals
description: Independently review and drain BracketIQ affiliate domain-policy and mapping-package approval queues. Use when a Luna reviewer is launched to allow, block, approve, reject, or defer captured affiliate sources without publishing or enabling automation.
---

# Review Affiliate Approvals

Act only as an independent reviewer. Read `AGENTS.md`,
`docs/affiliate-luna-approval-agent-execplan.md`, and
`references/approval-contract.md` before claiming work.

## Drain the queue

1. Reconcile and inspect the queue with the exact commands in the goal.
2. Claim one job with the stable reviewer identity from the goal.
3. Review only the claimed subject. Do not edit the producer's source package.
4. Write one schema-valid result JSON and run the completion command.
5. Reconcile and check status again. Continue until `claimableJobs=0`,
   `activeLeases=0`, and `claimedWithoutLease=0`.

Never claim a second job while the current claim is unfinished. Never invent
evidence. For a manual-logo claim only, the goal's governed logo-evidence
command may add a freshly verified official-page reference to the intake. Use
`DEFER` only when contradictory evidence, or incomplete mapping-package
evidence, prevents a deterministic decision. A missing domain-policy resource
uses the default-allow rule below. A completed search that finds no official
mark is a deterministic logo-absence result, not a deferral by itself.

The claim command is the only job-assignment tool. Do not select a queued row
directly. Its conditional database lease is the race boundary for concurrent
reviewers. Another reviewer may finish or claim a different approval while
this worker is active. Never use another reviewer's active lease. Append
progress only to `output/affiliate-codex-approvals/progress/<reviewer-id>.jsonl`.

## Review a domain policy

Run the bounded policy-evidence command from the goal for the claimed policy
key. Review the stored intake/page context, fetched `robots.txt`, and available
terms, privacy, or legal pages.

- `BLOCK` only when stored evidence contains an explicit prohibition that
  applies to automated capture of the target public path. An applicable
  `robots.txt` disallow rule or an explicit policy ban qualifies.
- `ALLOW` when the bounded review finds no explicit applicable prohibition.
  This default applies when `robots.txt`, terms, privacy, or legal pages are
  missing, unavailable, silent, or ambiguous about automated capture.
- Apply every restriction to its stated path and scope. A rule for login,
  account, checkout, payment, or another private path does not block a separate
  public listing path.
- Use `DEFER` only when stored evidence conflicts about whether an explicit
  prohibition applies to the target path, or when the target domain or path
  cannot be identified.

Robots rules remain technical evidence. Failed or missing resources still
prove that the bounded check occurred. Cite the attempted resources and their
stored outcomes in the result. A later technical capture failure is an intake
failure, not a domain-policy prohibition.

## Review a mapping package

Verify the claimed job's producer is not the reviewer. Inspect its stored
intake evidence, commit, changed-file scope, test evidence, parser/mapping,
official-logo proof, two stable duplicate-safe scrapes, candidate count,
location resolution, and live safety state.

Run the mapping-package evidence command from the goal before deciding. The
command verifies the exact producer commit and generated files through the
read-only producer repository, and verifies both review-scrape rows through the
disposable validation database. Inspect producer files with the exact commit
identifiers reported by that command; do not require the commit or generated
paths to exist in the reviewer's own checkout.

Keep the evidence stores separate. The disposable database proves extraction,
candidate content, and duplicate safety. The live database proves only queue
identity and the unpublished, disabled, unvalidated safety state before guarded
application. A disposable review-scrape ID is not expected to exist in live,
and its absence there is not a rejection or deferral reason.

The approval loop preserves the disposable connection as
`DATABASE_URL_DISPOSABLE_VALIDATION` before switching `DATABASE_URL` to live.
Do not overwrite or unset that value. Mapping-package evidence commands resolve
the disposable URL from the preserved variable so child goal processes cannot
silently query production for disposable run IDs.

Before a package is approved for the first time, an evidence-matched live
source and organization normally do not exist. Treat the evidence command's
`NOT_APPLIED` live-safety state as expected unless it finds a conflicting or
already-published record. `APPROVE` invokes the guarded application boundary,
which creates the review state and then deterministically requires the
organization to be unlisted, its public page disabled, recurring scraping
disabled, and its mapping unvalidated. Do not reject a valid package merely
because those rows have not been created before approval.

Review organization validity separately from candidate-event validity. Do not
reject an otherwise valid organization/source package merely because the
review scrapes rejected events without usable locations. Confirm that those
events were excluded from candidate/target persistence and that both scrape
runs contain stable title-and-reason rejection summaries.

Also review event and division integrity independently of the organization:

- Compare the organization description and inspected event descriptions with
  stored first-party page evidence. Public copy must describe the organization
  or activity naturally. It must not say where the record was listed, found,
  scraped, captured, or mapped, and an event description must not begin by
  repeating the full event title. A concise organization-level fallback may be
  shared across related events only when event-specific prose is absent and the
  fallback accurately describes the activity. Set `descriptionQualityVerified`
  only after this check. Reject concrete event copy defects with
  `EVENT_DESCRIPTION_INVALID` and organization copy defects with
  `ORGANIZATION_DESCRIPTION_INVALID`, using `PRODUCER_REPAIR`.

- Confirm every division is attached to the correct parent event and that
  divisions from neighboring event cards, dates, venues, or detail pages were
  not merged.
- Confirm the displayed division `name` preserves the organization's exact
  label while `gender` (`M`, `F`, `C`), `ratingType` (`AGE` or `SKILL`),
  `divisionTypeId`, `skillDivisionTypeId`, and `ageDivisionTypeId` use the
  canonical BracketIQ catalog. Do not require the source label to match our
  canonical display name. Use Coed only when the source says coed/mixed or
  leaves gender unspecified; ambiguous classification is a DEFER or concrete
  REJECT, never a guess.
- Confirm each division keeps its own source price and capacity. Reject copied,
  averaged, or cross-event prices. A single event-level price is valid only
  when the source publishes one price for the whole event or there is one
  division; differing division prices must produce a compact event range, with
  fee caveats retained in details.
- Require at least one valid division for every accepted `EVENT`. A valid
  division has a source display `name`, `gender` in `M`, `F`, or `C`,
  `ratingType` in `AGE` or `SKILL`, and non-empty `divisionTypeId`,
  `skillDivisionTypeId`, and `ageDivisionTypeId`. Read the deterministic
  `eventDivisionQuality` section from the package evidence command. Reject a
  non-passing result with `PRODUCER_REPAIR` and the applicable division reason
  codes. Do not approve a divisionless event.

For every accepted event with an evidenced address or venue, independently
compare the evidence with its finite, in-range `[longitude, latitude]`
coordinates. Source-organization coordinates are valid only when the candidate
explicitly records `locationSource: "SOURCE_ORGANIZATION"`, has a non-empty
evidence note showing the event is held there, and the canonical organization's
location is itself valid. A city match, common owner, or nearby organization is
not enough. Reject the package when an invalid event slipped through, when an
organization fallback is unevidenced, or when scrape failures were hidden; do
not reject it simply because invalid events were correctly filtered and logged.

For a package whose producer result says `logoDisposition = MANUAL_REVIEW`,
inspect all stored branding and image evidence named by the package first. If
that evidence has no usable mark, manually inspect the public official site.
When the site exposes an official mark, run the goal's
`affiliate:approvals:logo-evidence` command with the active approval ID,
mapping-job ID, stable reviewer ID, official page URL, and exact image URL. The
command must confirm the page is in the intake's policy scope, recapture it
through ScrapingDog, verify that the page references the image, and store a
new provenance-backed `LOGO_CANDIDATE`. Cite the returned run and artifact IDs,
then `REJECT` with `PRODUCER_REPAIR` and
`OFFICIAL_LOGO_REPAIR_REQUIRED`. The producer—not the reviewer—normalizes,
assigns, tests, and commits it. If neither stored nor newly captured official
evidence contains an official mark after the bounded search, approve the
otherwise-valid package with `officialLogoVerified = false` and
`logoAbsenceAccepted = true`. Cite the inspected evidence and official-site
check in the rationale and evidence references. Logo absence alone is not a
blocking issue. A reviewer never edits the package or invents a brand mark.

- `APPROVE` only when every required check in the result schema is true. The
  logo check requires exactly one of `officialLogoVerified` or
  `logoAbsenceAccepted`.
- `REJECT` with `mappingDisposition.nextAction = PRODUCER_REPAIR` for a
  concrete setup, parser, event-filtering, description, division, pricing, capacity, logo,
  validation, or duplicate-safety defect that stored or governed supplemental
  evidence lets the producer fix. Include every applicable reason code and
  blocking issue.
- `DEFER` with `mappingDisposition.nextAction = HUMAN_REVIEW_REQUIRED` when
  evidence is incomplete, contradictory, or needs a human. Do not defer a
  concrete producer defect.
- A hard rejection may also use `HUMAN_REVIEW_REQUIRED` when retrying cannot
  safely resolve it. This terminal state is deliberately excluded from both
  agent queues.

Do not repair, regenerate, amend, commit, push, or deploy the package during
review. A rejection is not approved training data.

## Authority boundary

The live goal authorizes only approval queue transitions, evidence refresh,
domain-policy/intake review and capture queueing, and guarded application of an
approved package as an unpublished, disabled source.

Never publish an organization or candidate, enable recurring scraping, validate
a mapping, approve training data, change unrelated live data, push code, or
deploy. Never approve work produced by this reviewer identity.
