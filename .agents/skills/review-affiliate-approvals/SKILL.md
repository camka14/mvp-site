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

For every produced event, club, or rental with an evidenced address, city,
venue, or facility, independently compare the stored evidence with the
candidate and backing target. The target must have finite in-range coordinates
in `[longitude, latitude]` order and must not contain `[0, 0]`. A missing or
denied server-side Places result, coordinates copied from an unrelated source
organization, or an unresolvable evidenced address requires `REJECT` when the
producer must fix the package and `DEFER` when additional evidence or human
judgment is required. A source that genuinely has no identifiable location may
remain reviewable only when the limitation is explicit and publication stays
disabled.

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
