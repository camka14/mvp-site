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

For a mapping approval, `packageValidationPassed` also means that every
evidence-backed event, club, and rental location has been independently checked
against the persisted target coordinates. Null, malformed, out-of-range, and
`[0, 0]` coordinates fail package validation when the source identifies a
resolvable place. Cite the stored intake artifact plus the candidate/target ID
or focused test output in `evidenceReferences`; never treat an unstored browser
impression or a nearby organization's coordinates as proof.

Positive decisions have no blocking issues. `BLOCK`, `REJECT`, and `DEFER`
must contain at least one concrete blocking issue. Evidence references must use
stable identifiers from the claim, database, repository commit, test output, or
bounded policy-evidence capture; do not cite unstored browsing impressions.
