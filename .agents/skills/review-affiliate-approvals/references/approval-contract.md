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
  "decision": "DEFER",
  "confidence": 0.8,
  "rationale": "The stored terms pages did not address automated reuse.",
  "evidenceReferences": [
    {
      "kind": "DOMAIN_POLICY_RESOURCE",
      "identifier": "https://example.org/terms",
      "finding": "The captured page does not state whether automated listing capture is permitted."
    }
  ],
  "checks": {
    "robotsReviewed": true,
    "termsReviewed": true,
    "storedEvidenceSufficient": false,
    "identityIndependent": true,
    "packageValidationPassed": false,
    "officialLogoVerified": false,
    "duplicateSafetyVerified": false
  },
  "blockingIssues": [
    "Stored policy evidence is insufficient for a terminal domain decision."
  ]
}
```

Allowed decisions are:

- `DOMAIN_POLICY`: `ALLOW`, `BLOCK`, or `DEFER`.
- `MAPPING_PACKAGE`: `APPROVE`, `REJECT`, or `DEFER`.

A terminal domain decision requires `robotsReviewed`, `termsReviewed`, and
`storedEvidenceSufficient`. A mapping approval requires
`identityIndependent`, `packageValidationPassed`, `officialLogoVerified`,
`duplicateSafetyVerified`, and `storedEvidenceSufficient`.

A producer result with `logoDisposition = MANUAL_REVIEW` is never approved as
written. The reviewer must still inspect the stored logo and branding evidence.
Use `REJECT` when that evidence contains an official organization mark that the
producer can normalize and commit in a repair pass. Use `DEFER` when the stored
evidence contains no verifiable official mark and a human must supply or approve
new evidence. Do not use an unrelated platform logo, photograph, generated
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
