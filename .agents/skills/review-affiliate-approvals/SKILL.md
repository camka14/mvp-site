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
evidence. Use `DEFER` when stored evidence cannot support a deterministic
decision.

## Review a domain policy

Run the bounded policy-evidence command from the goal for the claimed policy
key. Review the stored intake/page context, fetched `robots.txt`, and available
terms, privacy, or legal pages.

- `ALLOW` only when the evidence supports public automated capture and contains
  no applicable prohibition.
- `BLOCK` when the site's stated policy or technical rules prohibit the planned
  capture.
- `DEFER` when policy pages are unavailable, contradictory, ambiguous, or do
  not address the planned use clearly enough.

Robots rules are technical evidence, not blanket legal permission. A missing
robots file is not by itself permission. Cite every decisive stored resource in
the result.

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
inspect all stored branding and image evidence named by the package. If a
first-party official mark is present but the producer failed to normalize,
assign, or commit it, `REJECT` with that exact producer repair. If no official
mark can be verified from the stored evidence, `DEFER` for a human evidence
decision instead of treating the organization identity itself as invalid. A
reviewer never edits the package, approves a logo-less package, or invents a
brand mark.

- `APPROVE` only when every required check in the result schema is true.
- `REJECT` for a concrete defect that requires new producer work.
- `DEFER` when evidence is incomplete or the decision needs a human.

Do not repair, regenerate, amend, commit, push, or deploy the package during
review. A rejection is not approved training data.

## Authority boundary

The live goal authorizes only approval queue transitions, evidence refresh,
domain-policy/intake review and capture queueing, and guarded application of an
approved package as an unpublished, disabled source.

Never publish an organization or candidate, enable recurring scraping, validate
a mapping, approve training data, change unrelated live data, push code, or
deploy. Never approve work produced by this reviewer identity.
