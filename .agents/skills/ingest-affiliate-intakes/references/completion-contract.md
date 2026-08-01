# Affiliate intake completion contract

## Boundaries

An intake is evidence, not an organization or candidate. A mapping job is a leased unit of work. A review-ready result is not approved, published, or training-eligible.

Use only stored artifacts unless a required page is absent and the active user has authorized another capture. Respect robots and policy evidence. Never bypass access controls.

Supported target kinds are `EVENT`, `RENTAL`, and `CLUB`. Do not create `TEAM` mappings or affiliate teams.

## Required organization package

Every successful checkpoint must contain:

1. A canonical organization ID and idempotent setup code.
2. Source organization fields supported by evidence: name, official website, description, sports, city, address, and valid non-zero `[longitude, latitude]` coordinates resolved from that evidence when a place is identifiable.
3. A disabled affiliate source and unvalidated mapping or reviewed custom extractor.
4. Official action URLs and source provenance.
5. An official logo reference normalized to an opaque 1024 by 1024 asset, or an explicit manual-review result that prevents publication.
6. Focused tests and stored-fixture extraction evidence.
7. Two review scrapes proving stable, duplicate-safe accepted output and stable
   candidate-level rejection summaries.
8. A source registry note and a source-scoped commit.
9. A compact result JSON suitable for `affiliate:mapping:complete`.

## Candidate checks

Inspect at least five candidates when five exist, plus every produced kind. Check title, official URL, schedule/date display, sport, tags, divisions, price, venue, address, city, and coordinates or geocoding inputs.

For every multi-division event, prove that the divisions are grouped under the
correct parent event and did not leak across adjacent cards, dates, venues, or
detail pages. Preserve each source-stated division label as its display `name`
and select our structured `gender` (`M`, `F`, `C`), `ratingType` (`AGE` or
`SKILL`), `divisionTypeId`, `skillDivisionTypeId`, and `ageDivisionTypeId`
separately from that label using the canonical sport catalog. Use Coed only
when the source says coed/mixed or does not specify gender; preserve ambiguous
source text and flag it for review instead of guessing.

Keep each source price and capacity on the division that owns it. Do not
average, copy, or collapse per-division prices. Use a numeric event-level
fallback only for a genuinely single-price or single-division event; derive a
compact event price range when division prices differ, and keep fee caveats in
the details text.

For each event with an evidenced address, venue, or facility, run the normal
server-side Google Places resolver. Coordinates must contain finite longitude
then latitude, remain within geographic bounds, and must not equal `[0, 0]`.
City-only event text is not a sufficient map location.

An event may use the canonical source organization's location only when stored
evidence supports that the event occurs there. Record that decision on the
candidate with `locationSource: "SOURCE_ORGANIZATION"` plus a non-empty
`locationEvidence` note. A shared owner, nearby venue, directory parent, or city
match is not evidence. Never use one event venue as another event's fallback.

The scrape must exclude an event when its event-specific location cannot be
resolved or when it has neither an event location nor an evidence-backed source
organization fallback. Record the title and reason in the scrape run. These
candidate-level rejections do not invalidate an otherwise correct organization,
source, mapping, logo, or duplicate-safe package. A package is not
`REVIEW_REQUIRED` if bad events were persisted as candidates or targets, or if
the rejection log is missing.

Never infer a year for an ambiguous event date. Never convert a stale tryout, evaluation, deadline, or registration page into a current event. Use evergreen rows only for stable ongoing programs with explicit `NO_FIXED_DATE` or `ONGOING` display.

Rentals create facilities/resources rather than fake events. Clubs create public-organization candidates only after review. Direct club setups must link the candidate to the canonical source organization, not a generated duplicate.

## Logo checks

Prefer stored logo candidates, page branding, page images, HTML/CSS references, metadata, and screenshots. Use a favicon only when it is the best recognizable official mark.

Normalize official artwork without inventing a new identity. Use a full-canvas opaque background, preserve aspect ratio, and verify card, detail, list icon, and map marker fit. If no official mark can be verified, record `MANUAL_REVIEW` and stop publication.

When a claimed job has `repairContext.repairReason = MANUAL_LOGO_REVIEW`, the
producer must perform a fresh evidence pass over every stored logo, branding,
image, screenshot, HTML/CSS, metadata, and favicon artifact. A repaired result
requires a new commit and `OFFICIAL_ASSET` or `OFFICIAL_SCREENSHOT_CROP` backed
by stable stored evidence. If all candidates remain insufficient, report the
exact inspected artifacts and keep the package unpublishable rather than
fabricating a logo or resubmitting an unchanged manual-review result.

## Result states

Use `REVIEW_REQUIRED` only when the package, tests, and validation artifacts exist. Use `EXPANDED` only when a directory intake has produced at least one accepted, reused, or already-known official organization URL through the governed URL-intake command. Use `FAILED` for a claimed intake that cannot be mapped or expanded safely and include a concrete policy, evidence, parsing, or infrastructure reason. Release a claim only for a transient interruption that another run can safely resume.

Do not let failed or blocked rows prevent queue exhaustion. Do not turn them into positive training examples.

## Directory expansion contract

Directory proposals must be written to a JSON file and submitted with the exact command supplied by the active goal. The command writes the schema-validated `EXPANDED` result file named by `--result`; pass that file to the normal mapping-completion command without hand-editing it. The proposal file shape is:

    {
      "schemaVersion": 1,
      "parentJobId": "claimed mapping job id",
      "parentIntakeId": "claimed directory intake id",
      "proposals": [
        {
          "url": "https://official-club.example/",
          "organizationName": "Official Club",
          "region": "Portland, Oregon",
          "targetKindHints": ["CLUB"],
          "sportHints": ["Soccer"],
          "evidenceUrl": "https://stored-directory.example/clubs",
          "depth": 1
        }
      ]
    }

Every `evidenceUrl` must be a page in the parent intake. `depth` is one for an official site found in the claimed directory and two for an official site reached through one child directory. Depth greater than two, a parent self-link, a `TEAM` target, or a URL without stored evidence is rejected. The command may create review-required intakes, but it queues capture only for domains with a current `ALLOWED` policy. Do not edit the domain policy to make a batch proceed.

An `EXPANDED` completion result has no branch, commit, generated paths, candidates, logo, or review scrapes. It includes the enqueue summary under `directoryExpansion` and uses `MANUAL_REVIEW` as the non-applicable logo disposition. Directory-expansion results are terminal queue bookkeeping and must be excluded from positive mapping training data.

## Final stopping condition

Run:

    npm run affiliate:mapping:queue-status -- --live

The goal is complete only when:

    claimableJobs = 0
    eligibleReadyIntakesWithoutJob = 0
    claimedWithoutLease = 0
    queuedCaptureRuns = 0
    runningCaptureRuns = 0

When capture runs remain, process them with the exact intake-processing command supplied by the goal and then check queue status again. Active mapping leases owned by another worker are not available work. Report them separately and do not steal them before expiry.
