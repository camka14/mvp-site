# Affiliate intake completion contract

## Boundaries

An intake is evidence, not an organization or candidate. A mapping job is a leased unit of work. A review-ready result is not approved, published, or training-eligible.

Use only stored artifacts unless a required page is absent and the active user has authorized another capture. Respect robots and policy evidence. Never bypass access controls.

Supported target kinds are `EVENT`, `RENTAL`, and `CLUB`. Do not create `TEAM` mappings or affiliate teams.

## Required organization package

Every successful checkpoint must contain:

1. A canonical organization ID and idempotent setup code.
2. Source organization fields supported by evidence: name, official website, description, sports, city, and address.
3. A disabled affiliate source and unvalidated mapping or reviewed custom extractor.
4. Official action URLs and source provenance.
5. An official logo reference normalized to an opaque 1024 by 1024 asset, or an explicit manual-review result that prevents publication.
6. Focused tests and stored-fixture extraction evidence.
7. Two review scrapes proving stable, duplicate-safe output.
8. A source registry note and a source-scoped commit.
9. A compact result JSON suitable for `affiliate:mapping:complete`.

## Candidate checks

Inspect at least five candidates when five exist, plus every produced kind. Check title, official URL, schedule/date display, sport, tags, divisions, price, venue, address, city, and coordinates or geocoding inputs.

Never infer a year for an ambiguous event date. Never convert a stale tryout, evaluation, deadline, or registration page into a current event. Use evergreen rows only for stable ongoing programs with explicit `NO_FIXED_DATE` or `ONGOING` display.

Rentals create facilities/resources rather than fake events. Clubs create public-organization candidates only after review. Direct club setups must link the candidate to the canonical source organization, not a generated duplicate.

## Logo checks

Prefer stored logo candidates, page branding, page images, HTML/CSS references, metadata, and screenshots. Use a favicon only when it is the best recognizable official mark.

Normalize official artwork without inventing a new identity. Use a full-canvas opaque background, preserve aspect ratio, and verify card, detail, list icon, and map marker fit. If no official mark can be verified, record `MANUAL_REVIEW` and stop publication.

## Result states

Use `REVIEW_REQUIRED` only when the package, tests, and validation artifacts exist. Use `FAILED` for a claimed intake that cannot be mapped safely and include a concrete policy, evidence, parsing, or infrastructure reason. Release a claim only for a transient interruption that another run can safely resume.

Do not let failed or blocked rows prevent queue exhaustion. Do not turn them into positive training examples.

## Final stopping condition

Run:

    npm run affiliate:mapping:queue-status -- --live

The goal is complete only when:

    claimableJobs = 0
    eligibleReadyIntakesWithoutJob = 0
    claimedWithoutLease = 0

Active leases owned by another worker are not available work. Report them separately and do not steal them before expiry.
