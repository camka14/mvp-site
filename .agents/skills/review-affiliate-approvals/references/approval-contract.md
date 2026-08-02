# Affiliate approval contract

The claim command exports `approvalJob` and `subject`. Use their exact IDs in
the result. `reviewerId` must exactly match the claim owner.

## Result JSON

```json
{
  "schemaVersion": 1,
  "approvalJobId": "approval-job-id",
  "subjectType": "DOMAIN_POLICY",
  "subjectKey": "example.org",
  "reviewerId": "codex-luna-approval-vm-1",
  "decision": "ALLOW",
  "confidence": 0.9,
  "rationale": "The bounded review found no explicit prohibition that applies to capture of the target public path.",
  "evidenceReferences": [
    {
      "kind": "DOMAIN_POLICY_RESOURCE",
      "identifier": "https://example.org/terms",
      "finding": "The policy resource was not available. This is not an explicit prohibition."
    }
  ],
  "checks": {
    "robotsReviewed": true,
    "termsReviewed": true,
    "storedEvidenceSufficient": true,
    "identityIndependent": true,
    "packageValidationPassed": false,
    "descriptionQualityVerified": false,
    "officialLogoVerified": false,
    "logoAbsenceAccepted": false,
    "duplicateSafetyVerified": false
  },
  "blockingIssues": []
}
```

Allowed decisions are:

- `DOMAIN_POLICY`: `ALLOW`, `BLOCK`, or `DEFER`.
- `MAPPING_PACKAGE`: `APPROVE`, `REJECT`, or `DEFER`.

Every non-approved `MAPPING_PACKAGE` result must also contain:

```json
"mappingDisposition": {
  "nextAction": "PRODUCER_REPAIR",
  "reasonCodes": ["EVENT_LOCATION_INVALID", "EVENT_PRICING_INVALID"]
}
```

`PRODUCER_REPAIR` is valid with `REJECT` and atomically returns the same mapping
job to the producer with the rationale and every blocking issue. Use all
applicable codes from the result schema. `HUMAN_REVIEW_REQUIRED` is valid with
`REJECT` or `DEFER`, is never claimable by an agent, and is required for every
mapping `DEFER`. Three automatic producer repair passes are allowed; a later
rejection is escalated to human review even if the reviewer requested repair.
Mapping `APPROVE` results and all domain-policy results must omit this field.

Producer-repair reason codes are `LIVE_SETUP_UNSUPPORTED`,
`EVENT_LOCATION_INVALID`, `EVENT_DIVISION_GROUPING_INVALID`,
`EVENT_DIVISION_CLASSIFICATION_INVALID`, `EVENT_PRICING_INVALID`,
`EVENT_CAPACITY_INVALID`, `EVENT_DESCRIPTION_INVALID`,
`ORGANIZATION_DESCRIPTION_INVALID`, `OFFICIAL_LOGO_REPAIR_REQUIRED`,
`PACKAGE_VALIDATION_FAILED`, `DUPLICATE_SAFETY_INVALID`, and
`OTHER_PRODUCER_DEFECT`. Human-review reason codes are
`NO_VERIFIABLE_OFFICIAL_LOGO` (legacy decisions),
`INSUFFICIENT_STORED_EVIDENCE`, and
`CONFLICTING_LIVE_RECORD`. `RETRY_LIMIT_EXCEEDED` and
`UNCLASSIFIED_TERMINAL_FAILURE` are normally assigned by queue recovery rather
than the reviewer.

A terminal domain decision requires `robotsReviewed`, `termsReviewed`, and
`storedEvidenceSufficient`. For `DOMAIN_POLICY`, a bounded review is sufficient
for `ALLOW` when it finds no explicit prohibition that applies to the target
public path. Missing, inaccessible, silent, or ambiguous policy resources are
not prohibitions. They do not require `DEFER`. Set `storedEvidenceSufficient`
to `true` after recording the attempted resources and their stored outcomes.
Use `BLOCK` only for an explicit applicable prohibition. Use `DEFER` only when
stored evidence conflicts about whether an explicit prohibition applies, or
when the target domain or path cannot be identified. A prohibition for a
private, account, login, checkout, or payment path does not block a separate
public listing path. A mapping approval requires
`identityIndependent`, `packageValidationPassed`, `descriptionQualityVerified`,
`duplicateSafetyVerified`,
and `storedEvidenceSufficient`, plus exactly one of `officialLogoVerified` or
`logoAbsenceAccepted`.

For a producer result with `logoDisposition = MANUAL_REVIEW`, the reviewer must
inspect stored logo and branding evidence first and then perform the bounded
public official-site check. When the site exposes an official mark, run the
governed `affiliate:approvals:logo-evidence` command. That command captures the
official page through ScrapingDog, verifies the selected image URL is referenced
by the page, and stores both page provenance and a `LOGO_CANDIDATE` under a new
intake run. Cite the returned run and artifact IDs and use `REJECT` with
`OFFICIAL_LOGO_REPAIR_REQUIRED`; the producer owns normalization and the new
commit. When the completed search finds no official mark, `APPROVE` the
otherwise-valid package with `officialLogoVerified = false` and
`logoAbsenceAccepted = true`, citing what was inspected. Use `DEFER` only when
the evidence is inaccessible, contradictory, or too incomplete to establish
logo presence. Do not use an unrelated platform logo, photograph, generated
initials, or fabricated brand mark.

For a mapping approval, `packageValidationPassed` also means accepted event
locations were independently checked and rejected event-location failures are
visible in both review-scrape logs. Null, malformed, out-of-range, and `[0, 0]`
coordinates fail accepted-event validation. A source-organization location is
valid for an event only when the candidate explicitly records
`locationSource: "SOURCE_ORGANIZATION"`, a non-empty stored-evidence note, and
the referenced canonical organization has valid coordinates. Cite the stored
intake artifact plus candidate/target or rejection-log evidence. Correctly
filtered bad events do not invalidate an otherwise valid organization package.

`packageValidationPassed` also requires division and pricing integrity. Every
source division must be grouped under the correct parent event; adjacent
cards, dates, venues, and detail pages must not leak divisions into one
another. The source's exact division label must remain the display `name`,
while BracketIQ's canonical `gender` (`M`, `F`, `C`), `ratingType` (`AGE` or
`SKILL`), `divisionTypeId`, `skillDivisionTypeId`, and `ageDivisionTypeId` are
stored as separate structured fields. A reviewer must not reject a source
label merely because it differs from the canonical catalog label. Coed is
appropriate when the source says coed/mixed or does not specify gender;
ambiguous age or skill classification requires DEFER or a concrete REJECT.
Each division's source price and capacity must remain attached to that
division. Do not approve copied or averaged prices. An event-level price is a
fallback only for a genuinely single-price or single-division event; differing
division prices must produce a compact range and retain fee caveats in details.

`descriptionQualityVerified` requires an independent comparison of the
organization description and inspected event descriptions with stored
first-party evidence. Descriptions must sound like direct descriptions of the
organization or activity. They must not narrate discovery with phrases such as
`listed by`, `listed on`, `found on`, `according to the site`, `the source
says`, `scraped from`, or `mapped from`. Event descriptions must not begin by
repeating the full event title. A concise organization-level activity fallback
may be reused when the site has no event-specific prose. Reject a concrete event
defect with `EVENT_DESCRIPTION_INVALID` and an organization defect with
`ORGANIZATION_DESCRIPTION_INVALID`; both return to `PRODUCER_REPAIR`.

The mapping-package evidence command is the authoritative bridge between the
producer and reviewer containers. Its producer-commit and file hashes come from
the producer checkout mounted read-only. Its two review-scrape rows and current
candidate count come from the disposable validation database. Live records are
authoritative only for approval identity and unpublished/disabled/unvalidated
safety checks. Never look for disposable run IDs in live or reject a package
because the reviewer's own Git checkout cannot resolve a commit that the
evidence command verified in the producer repository.

The parent approval loop preserves the original disposable database URL in
`DATABASE_URL_DISPOSABLE_VALIDATION` before changing `DATABASE_URL` to live.
Evidence and completion commands use that preserved URL. An inherited live
`DATABASE_URL` must never be treated as the disposable validation database.

For a not-yet-applied package, zero evidence-matched live sources is the normal
pre-approval state. The reviewer checks that no conflicting or published live
row exists; it does not require the future organization/source/mapping rows to
exist. The guarded application command creates those rows only after `APPROVE`
and rejects completion unless the resulting organization is unlisted with its
public page disabled, recurring scraping is disabled, and the mapping remains
unvalidated.

Positive decisions have no blocking issues. `BLOCK`, `REJECT`, and `DEFER`
must contain at least one concrete blocking issue. Evidence references must use
stable identifiers from the claim, database, repository commit, test output, or
bounded policy-evidence capture; do not cite unstored browsing impressions.
