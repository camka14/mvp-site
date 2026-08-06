# Affiliate Review and Candidate Repair

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` current while the work proceeds.
Follow `PLANS.md` in the repository root.

## Purpose / Big Picture

Repair the affiliate ingestion state without bypassing independent review or
publishing incomplete records. Historical approved mappings that lack an
approval handoff must enter the normal approval queue. Review and producer
repair tasks must retain their lease and attempt history. The ten candidates
that currently fail publication must identify their exact missing fields and
must become publishable only after source-backed values pass the existing
validation rules.

The result is observable in three places. Queue status shows no malformed
review handoffs. The admin review surface explains each remaining concern.
Candidate publication succeeds for repaired rows and continues to reject rows
that do not have enough source evidence.

## Progress

- [x] (2026-08-04 15:45 PDT) Read the affiliate mapping, approval, candidate,
  location, division, description, pricing, and logo contracts.
- [x] (2026-08-04 15:50 PDT) Confirmed that the active full-review cohort has
  historical approved mappings without a corresponding mapping-package
  approval row.
- [x] (2026-08-04 17:05 PDT) Identified the exact ten publish-blocked CLUB
  candidates. Five lacked candidate locality. Nine pointed at a generated
  duplicate organization instead of the canonical source organization.
- [x] (2026-08-04 17:30 PDT) Added an idempotent full-review recovery path for approved mappings that
  have no historical approval row.
- [x] (2026-08-04 18:20 PDT) Added focused regression tests for the recovery
  path, canonical CLUB publication, approval reopening, and the recovered
  Albion Hurricanes FC package.
- [x] (2026-08-04 18:10 PDT) Applied the guarded ten-candidate live repair.
  All ten now reference their canonical source organization and have valid
  source-backed locality and coordinates.
- [x] (2026-08-04 18:15 PDT) Requeued nine approved, unleased producer packages
  with exact canonical-organization and location repair context. Kept the
  terminal Albion package out of the queue until its reviewed producer commit
  was recovered and repaired.
- [x] (2026-08-04 18:30 PDT) Verified the ten live candidate records. All ten
  use the canonical source organization and have a city, valid organization
  coordinates, natural organization description, website, logo, and repair
  provenance. The canonical CLUB publication regression test passes.
- [x] (2026-08-06 03:30 UTC) Found that the admin Candidates tab requested only
  DISCOVERED and PUBLISHED rows, hiding the 144 CLUB rows in NEEDS_REVIEW. Added
  a NEEDS_REVIEW view and expanded the review result limit to 500 so the full
  current queue is visible.
- [x] (2026-08-06 04:00 UTC) Added the guarded historical CLUB sport repair
  script and applied 37 source-backed repairs in one live transaction. Each
  repaired candidate now has canonical sportNames, its unpublished target has
  the same sports array, the sport warning is removed, and the candidate status
  is DISCOVERED.
- [ ] Deploy the admin UI and repair-script changes. Deployment remains a
  separate operator action because it was not requested in this turn.

## Surprises & Discoveries

- Observation: The armed `description-quality-v1` full-review cohort uses an
  August 2 cutoff. Seventy-four approved mappings before that cutoff have no
  `MAPPING_PACKAGE` approval row.
  Evidence: The live audit found 347 approved mappings before the cutoff, 273
  with an approved review row, and 74 with no review row.

- Observation: The current cohort implementation expects every approved
  mapping to have a prior approved review row. It exits when that historical
  handoff is absent.
  Evidence: `src/server/affiliateImports/mappingFullReview.ts` verifies the
  prior approval before it resets the mapping and approval rows for full
  review.

- Observation: All ten blocked publication rows were direct `CLUB` candidates.
  Nine retained a generated duplicate target. Five lacked candidate locality.
  Their canonical source organizations already contained natural descriptions,
  official websites, and official logos.
  Evidence: The guarded live candidate audit returned ten eligible rows and no
  exclusions before apply.

- Observation: A name-plus-region Places query can return a venue, another
  organization, or a state centroid.
  Evidence: The first dry run matched Snedigar Sports Complex for NCS
  Cafarelli, Travel Sports Baseball for NCS Texas, and New York State for
  Nickel City Hockey. Official source review supplied exact Peoria, Arlington,
  and New City addresses plus the Buffalo locality before apply.

- Observation: The Albion Hurricanes FC producer commit still existed in the
  first mapper workspace even though no shared remote ref contained it.
  Evidence: Commit `f7a7b2a9c657979ddcaed2964c6d90ec38fe961c` contains the
  reviewed seven-file package. Its only original approval blocker was an
  obsolete local-only live guard.

- Observation: The Candidates tab count was not the total candidate count.
  Evidence: The live database contained 144 CLUB rows with status NEEDS_REVIEW,
  while the UI requested only status DISCOVERED and showed six CLUB rows.

- Observation: The source-backed repair set was safe to apply without
  publishing anything. Evidence: the live dry run found 37 eligible rows, no
  published rows, no owned targets, and no public pages. Post-apply validation
  found 37 repaired rows with zero sport-array or warning mismatches.

## Decision Log

- Decision: Do not create synthetic approved reviews for historical mappings.
  Create normal queued review work inside the full-review cohort instead.
  Rationale: This preserves independent review and gives each historical
  mapping the same current criteria as mappings with an existing handoff.
  Date/Author: 2026-08-04 / Codex

- Decision: Repair candidate values from stored source evidence or a verified
  source-organization fallback. Do not insert placeholder locations,
  divisions, descriptions, prices, or logos.
  Rationale: Candidate publication gates protect map behavior and public data
  quality. A fabricated value would hide the defect rather than repair it.
  Date/Author: 2026-08-04 / Codex

- Decision: Keep active mapper and reviewer leases unchanged.
  Rationale: The database lease is the authority for concurrent agent work.
  Requeue only terminal or unclaimed work that the repair explicitly targets.
  Date/Author: 2026-08-04 / Codex

- Decision: Treat official contact and organization pages as higher-confidence
  locality evidence than the first Places text-search result.
  Rationale: Places resolves coordinates. It does not prove that the first
  result is the correct organization. The repair records each official source
  URL and then resolves that exact address or city.
  Date/Author: 2026-08-04 / Codex

- Decision: Repair only labels with deterministic source-backed canonical
  sports. Leave generic directories, ticket services, blacklisted activities,
  and sportless profiles in NEEDS_REVIEW.
  Rationale: Replacing a generic label with `Other` or guessing a sport would
  make the public organization data appear complete without evidence.
  Date/Author: 2026-08-06 / Codex

## Outcomes & Retrospective

The guarded live candidate repair updated ten rows and was idempotent. A second
dry run reported zero eligible rows and ten already-repaired rows. Four
organizations received official source-backed locality corrections: NCS
Cafarelli in Peoria, Nickel City Hockey in Buffalo, NCS Texas Baseball in
Arlington, and New York Pickleball Club in New City. The other six retained
their existing valid city or coordinate evidence.

Nine approved producer packages were returned to mapping repair. The terminal
Albion Hurricanes FC package was recovered from producer commit
`f7a7b2a9c657979ddcaed2964c6d90ec38fe961c`, made live-safe, added to the
shared branch, and returned through the standard bounded retry classifier. At
the final snapshot, six target packages were claimed, three were queued, and
one was `REVIEW_REQUIRED` with its approval actively claimed. These are active
queue tasks, not unresolved data defects.

The current sport remediation adds 37 source-backed CLUB repairs. The live
database now has 42 discovered CLUB candidates, 108 CLUB candidates still in
NEEDS_REVIEW, and 878 published CLUB candidates. Twelve CLUB rows still use a
noncanonical or missing sport label because the stored evidence does not
support a safe replacement. The admin UI now exposes those rows through an
explicit NEEDS_REVIEW view. The change is live in production in image
`0bb05855ec2739fd643c19bf0e9de2bf49bce723`, deployed after the protected CI and
image-publish gates passed.

The focused validation passed 62 tests across the service, full-review,
source-queue, and Albion packages. The repair-classifier suite passed 18 tests.
TypeScript and `git diff --check` passed. Commits `3c687e1f7`, `cb52ff1c6`, and
`8e7701f05` are on `origin/main`. The live data repair is already applied, and
the canonical CLUB publication and missing-handoff code paths are now running
in production.

## Context and Orientation

`src/server/affiliateImports/mappingFullReview.ts` advances the one-time cohort
that sends approved mappings through the newest approval criteria.
`src/server/affiliateImports/approvalQueue.ts` owns approval leases and review
transitions. `src/server/affiliateImports/sourceMappingQueue.ts` owns producer
repair transitions. `src/server/affiliateImports/service.ts` validates and
publishes affiliate candidates. The admin affiliate API and UI display
candidate warnings and publication errors.

The live database is private on the OVH VM. Repository commands that use
`--live` connect through the existing production command path. Run read-only
audits before each write. Do not publish a candidate during diagnosis.

## Plan of Work

First, inspect live candidate rows and reproduce publication validation without
mutating their status or targets. Group the ten failures by missing location,
invalid division, unnatural description, invalid price, missing source link,
or another exact gate. Trace each row to its source mapping and stored intake
evidence.

Second, change the full-review cohort transaction. Existing approved approval
rows are reset as before. A cutoff-eligible approved mapping with no approval
row receives a new queued `MAPPING_PACKAGE` review row in the same transaction.
Its mapping enters `REVIEW_REQUIRED`, and its review history records that the
prior approval was missing. Existing non-approved approval rows remain a hard
error unless their state is explicitly compatible with cohort recovery. Add
tests for mixed old and missing review rows, idempotence, and transaction
rollback.

Third, repair candidate producers rather than only editing derived public
targets. Update the source setup or mapping package when a persistent mapping
field is wrong. Add source-backed candidate repair data only when the stored
evidence supports it. Run two disposable scrapes for changed mappings. Keep
sources disabled and mappings unvalidated until review approval.

Fourth, use guarded queue commands to requeue the affected terminal work. Do
not change a currently leased row. Let the configured mapper and reviewer
agents claim unique tasks through the normal queue commands.

Finally, verify the result. Re-run live queue status, candidate publication
validation, focused tests, TypeScript checks for touched contracts, and
`git diff --check`. Report any candidate that remains blocked because its
stored evidence cannot support a required value.

## Concrete Steps

1. Audit candidate publication errors and save a JSON report under the ignored
   `output/` tree.
2. Inspect each candidate's source, mapping, run logs, warnings, target row,
   divisions, and coordinates.
3. Implement and test missing-handoff support in the full-review cohort.
4. Implement source-scoped candidate repairs and regression fixtures.
5. Run all repair commands in dry-run mode.
6. Apply the exact reviewed live repair set.
7. Requeue only affected unleased rows.
8. Confirm each repaired candidate passes the same publication validation that
   blocked it before the change.

## Validation and Acceptance

Acceptance requires all of the following:

- The full-review cohort can queue a cutoff-eligible approved mapping that has
  no prior approval row.
- The cohort is idempotent and does not duplicate approval rows.
- No synthetic approved decision is written.
- Active leases remain unchanged.
- Each repaired candidate has source-backed publish-critical fields.
- Every accepted event has at least one complete canonical division and valid
  event coordinates or an evidence-backed source-organization fallback.
- Organization and event descriptions use natural source-derived copy.
- Candidate pricing remains attached to the correct event and division.
- Remaining blocked candidates show a specific evidence or validation reason.
- Focused Jest tests, TypeScript, and diff checks pass.

## Idempotence and Recovery

Every repair command is dry-run by default. It selects explicit IDs and checks
the expected current status before each update. A repeated apply must report no
additional changes. The queue repair must use one transaction and the existing
unique subject key. If the transaction fails, it must leave both mapping and
approval rows unchanged. Candidate repair must not overwrite an existing valid
coordinate, division, description, price, or official URL.

Retain the dry-run and apply JSON reports under `output/`. Use those reports to
reverse an incorrect data-only change. Code rollback does not require removal
of correct source-backed values.

## Artifacts and Notes

Record the candidate audit report, queue repair report, changed source package
paths, focused test commands, and final live counts here as work completes.

## Interfaces and Dependencies

Reuse the Prisma client and the existing affiliate queue services. Reuse the
server-side Google Places resolver for locations. Do not add a public API or a
new database model. Preserve the unique approval subject key and the current
mapper and reviewer lease contracts.
