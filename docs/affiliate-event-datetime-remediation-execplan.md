# Affiliate Event Date and Time Remediation

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`,
`Decision Log`, and `Outcomes & Retrospective` current while the work proceeds.
Follow `PLANS.md` in the repository root.

## Purpose / Big Picture

Every affiliate event must preserve the date and time that the source presents.
The mapper must interpret a local wall-clock time in the event timezone before it
stores a UTC instant. It must also store an explicit end when the source gives an
end or a duration. It must not invent an end, a clock time, or a timezone when the
stored evidence does not support one.

This work has four visible outcomes. First, every previously approved event
mapping enters one named producer-remediation cohort and receives the new date
and time review. Second, future mapping packages cannot pass independent review
without timezone-stable date and time evidence. Third, a guarded repair updates
the affected unpublished candidates and published affiliate events without
creating duplicate occurrences. Fourth, web, Android, and iOS show the same
event-local start and end semantics.

For a scheduled event with a start but no end, the public UI must show one
`Starts` row with the full event-local date and time and no `Ends` row. For a
same-day range, it must show the full start date and time and then the end time.
For a range that crosses a day, it must show the full date and time for both
ends. A source that gives a calendar date but no clock time must show a date only.

This plan does not authorize a live queue mutation, a process restart, a live
candidate repair, a deployment, or a mobile release. Each action remains a
separate implementation or operator approval.

## Progress

- [x] (2026-08-06 11:27 PDT) Read `PLANS.md`, the mapping producer and reviewer
  contracts, the queue and cohort code, the affiliate event publication path,
  and the current web and mobile presentation paths.
- [x] (2026-08-06 11:27 PDT) Confirmed the source of the Rose City Volleyball
  offset error and the separate missing-end presentation error.
- [x] (2026-08-06 11:27 PDT) Confirmed that the existing full-review cohort sends
  approved work to reviewers, not to mapping producers.
- [x] (2026-08-06 11:27 PDT) Confirmed that mobile persists the event timezone but
  replaces a missing end with the start instant and relies on
  `noFixedEndDateTime` to retain missing-end meaning.
- [x] (2026-08-06 11:27 PDT) Wrote this cross-repository implementation and
  remediation plan.
- [ ] (2026-08-06 11:52 PDT) Implement the shared affiliate date, time, duration, and evidence contract
  (completed: deterministic normalizer, duration parser, `DATE_ONLY`, raw
  field preservation, end derivation, provenance, focused regression tests,
  and removal of the host-local legacy parser bridge; remaining:
  coordinate-based timezone resolution and accepted-output rejection).
- [ ] Implement and test the named producer-remediation cohort.
- [ ] Update the mapper and independent reviewer instructions.
- [ ] Preview, approve, and arm the live cohort after current leases drain.
- [ ] Complete and approve every eligible event mapping package.
- [ ] Preview and separately approve the candidate and event data repair.
- [ ] Implement and verify the web presentation changes.
- [ ] Implement and verify the Android and iOS presentation changes.
- [ ] Deploy and release through separately approved operations.

## Surprises & Discoveries

- Observation: The Rose City Volleyball mapping does contain a start time. The
  error is not caused by an absent `startsAt` field.
  Evidence: `previousDaySectionDateTime` in
  `src/server/affiliateImports/mappingExtractor.ts` creates a JavaScript `Date`
  from source-local text without an IANA timezone. It produces different UTC
  instants when the same test runs with `TZ=UTC` and
  `TZ=America/Los_Angeles`.

- Observation: The title and the normalized timestamp follow separate paths.
  Evidence: The mapping preserves a title that starts with `9:30 PM`, while the
  date transform stored `2026-08-10T21:30:00Z`. A viewer formatting that instant
  in `America/Los_Angeles` sees `2:30 PM`.

- Observation: The event timezone fallback occurs after the mapper has already
  produced the wrong instant.
  Evidence: `src/server/affiliateImports/service.ts` can assign
  `America/Los_Angeles` to the event, but changing the label does not convert a
  UTC instant that was parsed incorrectly.

- Observation: The web detail view hides a valid start time when the end is
  absent.
  Evidence: `eventDetailPublicModel.ts` sets `sharesSingleDayWindow` only when
  both values exist. `PublicEventOverview.tsx` then changes the start row to
  `Start date` and formats only the date.

- Observation: The affiliate publication path marks every affiliate event as
  open-ended, including events with an explicit end.
  Evidence: `buildAffiliateEventData` in
  `src/server/affiliateImports/service.ts` always sets
  `noFixedEndDateTime: true`.

- Observation: Mobile does not preserve a nullable event end in Room.
  Evidence: `EventApiDto.toEventOrNull()` accepts a null end only when
  `noFixedEndDateTime` is true, then sets `Event.end` to the start instant. The
  read-only event detail can therefore show a false zero-length end unless the
  presentation checks the missing-end flag.

- Observation: The shared Compose event card uses the event timezone but shows
  a date range without a start time. The native iOS Discover card shows the
  start time but formats it in the device timezone.
  Evidence: `EventCard.kt` builds `scheduledDateRangeText` from local dates, and
  `DiscoverCards.swift` uses Foundation `Date.formatted` without
  `event.timeZone`.

- Observation: The current full-review cohort cannot perform the requested
  mapping-agent pass.
  Evidence: `mappingFullReview.ts` changes approved mapping jobs to
  `REVIEW_REQUIRED` and queues their approval rows. It does not return the jobs
  to `QUEUED` or the intakes to `READY_FOR_MAPPING`.

- Observation: The database now enforces one active mapping job per intake.
  Evidence: migration
  `20260806190000_enforce_one_active_affiliate_mapping_job_per_intake` creates a
  partial unique index for `QUEUED`, `CLAIMED`, and `REVIEW_REQUIRED` jobs.
  The remediation must reuse the existing job row instead of creating a second
  active row.

- Observation: A corrected start can change the default candidate dedupe key.
  Evidence: `buildAffiliateCandidateDedupeKey` includes `startsAt` by default.
  Running a corrected mapping before reconciling the old row can create a second
  candidate for the same source occurrence.

- Observation: Existing generic mappings do not all provide an IANA timezone
  field yet.
  Evidence: The extractor now leaves timezone-less local values unresolved and
  adds `timeZone:MISSING_IANA_TIME_ZONE` to candidate warnings. It does not
  preserve a host-local timestamp, so the same source cannot produce different
  UTC instants on different hosts.

- Observation: A local wall-clock time can be invalid even when its date and
  time text are syntactically valid.
  Evidence: The new parser rejects `March 8, 2026 2:30 AM` as
  `NONEXISTENT_LOCAL_TIME` and `November 1, 2026 1:30 AM` as
  `AMBIGUOUS_LOCAL_TIME` in `America/Los_Angeles`.

## Decision Log

- Decision: Add a named producer-remediation cohort with the key
  `event-datetime-v1`. Do not reuse the reviewer-only full-review behavior.
  Rationale: The user requested that mapping agents inspect and correct every
  mapping. Independent review must occur after that producer work.
  Date/Author: 2026-08-06 / Codex

- Decision: Reuse each existing mapping job row and preserve its result,
  approval, repair, and full-review history.
  Rationale: This keeps one audit trail and satisfies the active-job uniqueness
  rule. Creating replacement rows would split provenance and can violate the
  partial unique index.
  Date/Author: 2026-08-06 / Codex

- Decision: Let the cohort wait until mapping, capture, and approval work is
  idle. Never reset an active lease.
  Rationale: The database lease is the concurrency authority. The cohort must
  not interrupt or duplicate work that a producer or reviewer already owns.
  Date/Author: 2026-08-06 / Codex

- Decision: Treat source time as a wall-clock value until the mapper resolves an
  IANA timezone. Convert it to a UTC instant only with that timezone.
  Rationale: JavaScript host timezone parsing caused the observed seven-hour
  shift. A production host, test host, and viewer device must produce the same
  instant.
  Date/Author: 2026-08-06 / Codex

- Decision: Resolve timezone evidence in this order: an explicit source IANA
  zone, an explicit source abbreviation with unambiguous location evidence,
  event venue coordinates, source-organization coordinates, then human review.
  Do not use a silent `America/Los_Angeles` fallback for new scheduled output.
  Rationale: A default can make an invalid timestamp appear complete. The repo
  already has coordinate-based timezone resolution in `src/server/timeZones.ts`.
  Date/Author: 2026-08-06 / Codex

- Decision: Use this end precedence: explicit end, explicit duration, then null.
  An explicit end wins over duration. A material conflict between the two is a
  producer defect that the reviewer must resolve.
  Rationale: Source evidence is stronger than inference. A duration is still
  sufficient evidence for a deterministic end when it belongs to the same
  occurrence.
  Date/Author: 2026-08-06 / Codex

- Decision: Support explicit duration forms such as `54 minutes`, `90 min`,
  `1 hour`, `2 Hours 5 Mins`, and explicit day units. Reject zero, negative,
  ambiguous, or unreasonably large durations. Do not use a product default.
  Rationale: The Rose City source already provides `2 Hours 5 Mins`. A shared
  parser prevents every source package from implementing a different rule.
  Date/Author: 2026-08-06 / Codex

- Decision: Add `DATE_ONLY` to the affiliate `dateDisplayMode` contract.
  Rationale: The current contract cannot distinguish a source date from an
  invented midnight time. `DATE_ONLY` keeps the instant needed for ordering but
  tells all clients not to present a clock time.
  Date/Author: 2026-08-06 / Codex

- Decision: Keep the mobile `Event.end` storage type stable in this change. Use
  `noFixedEndDateTime` as the explicit missing-end signal, and never render the
  placeholder `end = start` as an actual end.
  Rationale: A nullable Room migration would affect scheduling, editing,
  rentals, and many unrelated call sites. The existing flag can carry the
  missing state if the server sets it accurately and presentation uses it.
  Date/Author: 2026-08-06 / Codex

- Decision: Repair mapping packages before existing candidate and event rows.
  Keep live data repair as a separate dry-run and apply step.
  Rationale: A mapping correction prevents recurrence. A queue transition does
  not change rows that were already published, and a data write requires its
  own review and expected-count guard.
  Date/Author: 2026-08-06 / Codex

- Decision: Apply the automatic row repair only to future, non-archived
  affiliate events whose existing start is on or after one captured repair
  cutoff. Report events before that cutoff and archived rows separately.
  Rationale: Historical rows can have reporting and registration consequences.
  A single captured cutoff prevents the eligible set from changing during the
  dry-run and apply steps. Past and archived corrections should use an explicit
  operator scope instead of an implicit bulk write.
  Date/Author: 2026-08-06 / Codex

- Decision: Hide the public Timeline section when it has no preview items.
  Rationale: An inferred `WEEKLY_EVENT` type does not prove that structured
  matches or time slots exist. An empty schedule message adds no event detail.
  Date/Author: 2026-08-06 / Codex

- Decision: Do not keep a host-local compatibility bridge for mappings without
  timezone evidence. Emit a machine-readable warning and leave the datetime
  unresolved until the producer supplies defensible timezone evidence.
  Rationale: A compatibility value recreates the original defect and can differ
  by deployment host. An unresolved value is safe for review and makes the
  producer-remediation requirement visible.
  Date/Author: 2026-08-06 / Codex

## Outcomes & Retrospective

Milestone 1 has a local implementation slice. The web repository now has a
timezone-aware affiliate datetime normalizer, a duration parser, `DATE_ONLY`
contract support, two-pass extraction, normalized datetime provenance, and
backend handling for explicit affiliate ends. No queue rows, live mappings,
candidates, events, processes, production data, or mobile files changed.

The slice is intentionally not rollout-complete. Mappings without timezone
evidence remain unresolved and require producer remediation; they never use the
host timezone as a substitute.
The cohort, agent/reviewer contract, live data repair, web presentation, and
mobile parity remain unimplemented.

When implementation finishes, record the final cohort count, every excluded
source and reason, producer and reviewer outcomes, candidate and event repair
counts, test results, deployment identifiers, mobile build identifiers, and
screenshots here. Record any source that remains blocked because it has no
defensible timezone, start time, end, duration, or stored evidence.

## Context and Orientation

The web and affiliate importer repository is
`/Users/elesesy/StudioProjects/mvp-site`. The mobile repository is
`/Users/elesesy/StudioProjects/mvp-app`. The web repository is the backend and
API source of truth. The mobile repository writes API event data to Room and
observes Room in its screens.

An `AffiliateSourceIntake` is stored source evidence. An
`AffiliateSourceMappingJob` is the leased producer task for that intake. A
mapping producer writes or repairs source-scoped setup code, a mapping or custom
extractor, fixtures, tests, and a result package. An `AffiliateApprovalJob` is
the separate reviewer task. A producer cannot approve its own package.

`src/server/affiliateImports/sourceMappingQueue.ts` owns producer claims and
completion. `src/server/affiliateImports/approvalQueue.ts` owns reviewer claims,
approval, and producer-repair returns. `mappingFullReview.ts` owns the existing
reviewer-only full-review cohort. `scripts/requeue-approved-affiliate-mapping-repairs.ts`
shows the guarded transition from an approved package back to producer work,
but it requires explicit job IDs and consumes the normal repair history.

The mapping DSL is defined in `src/server/affiliateImports/types.ts` and
executed by `mappingExtractor.ts`. `mappingExtractor.ts` currently parses
natural date text with host-local JavaScript `Date` constructors. The generated
package contract is in `agentContracts.ts`, `agentTemplates/sourceFiles.ts`, and
`codexIngestionResult.ts`. Producer instructions live in
`.agents/skills/ingest-affiliate-intakes`,
`docs/affiliate-source-rollout-agent-goal.md`, and `codexCliGoal.ts`. The
reviewer result contract is `approvalResult.ts`.

`AffiliateImportCandidates` stores `startsAt`, `endsAt`, `timeZone`, and the raw
extracted payload. Published affiliate events copy those values through
`buildAffiliateEventData` in `service.ts`. Correcting a mapping does not update
an existing candidate or event.

The main web card is `src/components/ui/EventCard.tsx`. The public detail model
and overview are under
`src/app/discover/components/eventDetail`. `getEventDateTime` in
`src/types/index.ts` does not accept an event timezone. Lower detail formatting
uses `formatDisplayDate`, `formatDisplayTime`, and `formatDisplayDateTime` with
an explicit timezone.

On mobile, the persistent model is
`core/model/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/Event.kt`.
API decoding is in
`core/network/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/EventDtos.kt`.
The shared card is
`composeApp/src/commonMain/kotlin/com/razumly/mvp/core/presentation/composables/EventCard.kt`.
Read-only detail rows are built in
`composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetails.kt`.
The native iOS Discover card is `iosApp/iosApp/Discover/DiscoverCards.swift`.

For this plan, a wall-clock value is the source text such as `9:30 PM on August
10`. An IANA timezone is a stable identifier such as
`America/Los_Angeles`. A UTC instant is the stored moment such as
`2026-08-11T04:30:00.000Z`. A duration-derived end is a UTC instant calculated
by adding a source-provided elapsed duration to a correctly resolved start.

## Plan of Work

### Milestone 1: Create a deterministic date and time contract

First, add a shared affiliate event datetime normalizer. Keep raw date, time,
end, duration, and timezone text until all fields for an item are extracted.
Change the generic extractor to use two passes: collect raw field values, then
apply date and time transforms with the resolved timezone and occurrence
context. Do not call `new Date(localText)` or `Date.parse(localText)` for a
source-local value. The extractor leaves a source-local value unresolved when
the mapping supplies no defensible IANA timezone and emits a warning for
producer remediation.

Extend `FieldMapping` and `AffiliateCandidateInput` with `durationText`. Add a
small duration parser that returns an integer number of minutes and a specific
failure reason. Add the value to `rawPayload.extractedFields` even though it
does not need a new Prisma column. When `endsAt` is absent and a valid
`durationText` belongs to the same item, calculate `endsAt = startsAt +
duration`. Record `endDerivation` as `EXPLICIT_END`, `EXPLICIT_DURATION`, or
`NONE` in normalized import metadata. Record the exact duration text and parsed
minutes when duration supplies the end.

Extend `AffiliateDateDisplayMode` with `DATE_ONLY`. A mapper must use
`SCHEDULED` only when the source supplies a clock time. It must use `DATE_ONLY`
when the source supplies a calendar date but no time. `NO_FIXED_DATE` and
`ONGOING` retain their current meaning. Do not derive a clock end from a
duration if the occurrence has no start time. An explicit whole-day duration
may derive an end date while the display mode remains `DATE_ONLY`.

Make timezone a required, evidence-backed field for `SCHEDULED` and
`DATE_ONLY` event candidates. Use `resolveTimeZoneFromCoordinates` when stored
venue or organization coordinates provide the timezone. If the source
timezone remains unknown, exclude the event from accepted output and record a
specific review issue. Remove the blind Pacific fallback from new scheduled
affiliate event publication.

Add deterministic validation for daylight-saving transitions. Ambiguous or
nonexistent source times must not silently choose an instant. A source package
must supply enough evidence to resolve the occurrence or stop it for human
review.

Update the generated source test so each scheduled expected candidate proves
all of the following:

- the start has source evidence and an explicit UTC offset;
- the IANA timezone has source, venue, or organization evidence;
- the end has explicit end evidence, explicit duration evidence, or an explicit
  `NONE` disposition;
- a title-leading clock time, when it describes the same occurrence, matches
  the formatted local start;
- the same fixture produces the same output with `TZ=UTC` and a non-UTC host
  timezone;
- an inferred end is after the start and matches the parsed duration;
- a `DATE_ONLY` candidate never presents an invented time.

### Milestone 2: Make the producer and reviewer contracts enforce the rule

Add a compact `dateTimeReview` section to the producer completion result. Make
it mandatory when the claimed job contains the `event-datetime-v1` remediation
context and returns `REVIEW_REQUIRED`. It must identify the contract revision,
candidate count, timezone evidence, start precision, end derivation counts,
duration warnings, and the UTC-host regression result. Keep detailed evidence
in the package report and fixtures so the result JSON remains below its one MiB
limit.

Update the repository-backed ingestion skill, completion contract, rollout
goal, CLI objective, and generated package instructions. Tell the mapping agent
to inspect every event occurrence, not only the first five candidates, for
start, end, duration, timezone, precision, DST, and title consistency. A repair
claim must update its source-scoped fixture and commit even when the existing
mapping was otherwise correct.

Add `dateTimeQualityVerified` to the independent approval checks. An event
mapping cannot be approved until the reviewer independently verifies the UTC
instant in the event timezone, the start precision, and the end disposition.
Add producer reason codes for wrong start, missing or wrong timezone, wrong end,
unapplied duration, date-only precision, and host-timezone-dependent parsing.
Route those codes to `PRODUCER_REPAIR`. Use `INSUFFICIENT_STORED_EVIDENCE` only
when the producer cannot resolve the value from stored first-party evidence,
venue coordinates, or source-organization coordinates.

### Milestone 3: Add the one-time producer-remediation cohort

Create a producer cohort service beside `mappingFullReview.ts`. Store its
durable control row in `AffiliateApprovalJobs` under a non-claimable subject
type such as `MAPPING_PRODUCER_REMEDIATION_COHORT`. The row records the key
`event-datetime-v1`, arm time, mapping cutoff, contract revision, target kind,
preview counts, excluded counts, and final enqueue count.

The cohort must first run as a read-only inventory. Select every active or
historically approved source package that can produce `EVENT` candidates. Do
not rely only on `AffiliateScrapeSources.targetKind`; inspect the active mapping
kind, manual candidates, custom extractor registry, intake target hints, and
recent candidate kinds. Join each package to its exact intake and mapping job.
Report legacy mappings that have no intake or stored evidence. Create an
evidence-backfill intake for those sources only through the normal capture and
policy path; do not create a synthetic producer approval or a source-free job.

The cohort waits until these values are all zero: claimable producer jobs,
active producer leases, ready intakes without jobs, queued or running allowed
captures, review-required mapping jobs, claimable reviewer jobs, and active
reviewer leases. Reusing the same cohort key must return the prior state without
another enqueue.

In one transaction, recheck the cohort control row and every selected mapping
job. For each eligible approved package:

1. Preserve the prior result and approval in history.
2. Append a `mappingFullReviewHistory` entry with the cohort key and current
   `repairHistoryStartIndex` so this policy receives a fresh bounded
   three-repair budget.
3. Append a producer repair entry with
   `EVENT_DATETIME_REVIEW_REQUIRED` and the required date/time checks.
4. Change the same mapping job from `APPROVED` to `QUEUED`.
5. Clear only stale claim, branch, commit, error, and finish fields on that row.
6. Change its intake to `READY_FOR_MAPPING`.
7. Change its existing approved mapping-package approval to `DEFERRED` with an
   operator cohort decision. The normal mapping completion path will reopen it
   as `QUEUED` after the producer submits the repaired package.

Do not create a second active mapping job. Do not reset a claimed job. Do not
include `EXPANDED` directory bookkeeping, unsupported `TEAM` packages, or a
source that cannot produce an event. Keep failed evidence captures and current
human-review stops out of automatic retry. Report each excluded row with a
stable reason.

Add a CLI that defaults to preview. Apply mode must require `--live`, `--apply`,
the cohort key, the mapping cutoff, the expected eligible count, the expected
excluded count, and an operator identity. It must write a redacted JSON report
under `output/affiliate-event-datetime-remediation/`. A changed count or row
state aborts the whole transaction.

### Milestone 4: Process and approve every mapping package

Deploy the new parser, result contract, producer instructions, reviewer
instructions, and cohort code only after local validation. Process restarts and
deployment remain separate operator actions. Arm the cohort only after the
updated producer and reviewer containers are confirmed to use the new contract.

Let mapping agents claim work through the normal claim command. Each producer
must inspect stored HTML, Markdown, screenshots, structured data, and existing
mapping output. It must repair the generic mapping, manual candidates, or custom
extractor; add a focused fixture; run two duplicate-safe disposable review
scrapes; run the UTC-host regression; and create a new source-scoped commit.
The producer must not apply its own live mapping, publish a candidate, or
approve its result.

Let the independent reviewer claim the returned mapping package. The reviewer
must recompute representative instants, inspect every end derivation, confirm
date-only handling, and reject any host-timezone-dependent path. A package with
no defensible timezone or occurrence evidence stops for human review. A package
with a concrete parser or mapping defect returns to the producer through the
normal bounded repair loop.

Track cohort completion by package, not only by total queue emptiness. The
cohort is complete when every eligible job has a terminal current outcome of
approved, human-review-required with a specific evidence gap, or failed with a
specific non-retryable reason. Report any source that the current fleet cannot
repair.

### Milestone 5: Repair existing candidates and published affiliate events

Do not run a corrected live scrape before the old occurrence rows are
reconciled. Use each approved source package against its stored fixture or a
disposable database to produce a corrected occurrence report without writing
to the live candidate table.

Add a dry-run audit that compares corrected occurrences with current
`AffiliateImportCandidates` and `Events`. Match one-to-one by source ID,
official action URL, normalized title, stored source item identity or source
index, and existing published event link. Use the old start only as evidence,
not as the primary identity. An ambiguous, missing, or many-to-one match is not
eligible for automatic repair.

For each exact match, preview these changes:

- candidate `startsAt`, `endsAt`, `timeZone`, `dateDisplayMode`, normalized
  datetime provenance, warnings, and corrected dedupe key;
- published event `start`, `end`, `timeZone`, `dateDisplayMode`, and
  `noFixedEndDateTime`;
- no other candidate or event field;
- no new candidate, event, organization, division, tag, registration, or
  payment row.

Before apply, check that the corrected dedupe key does not collide with another
candidate. Apply the candidate and linked event in one transaction. Require an
explicit ID set, expected counts by issue class, no published-registration
conflict, and unchanged current values. Keep only future, non-archived events
whose existing start is on or after the captured repair cutoff in the default
apply set. Write past, archived, ambiguous, and
registration-sensitive rows to separate report sections.

After the guarded repair, run one review scrape for each corrected source. The
new scrape must match the repaired candidate instead of creating a duplicate.
Then run a second review scrape and prove stable counts and hashes. Publication
state must remain unchanged.

### Milestone 6: Fix the web event presentation

Replace the card and detail call sites that use `getEventDateTime(event)` with
one event-window presentation helper. The helper accepts start, optional end,
IANA timezone, `dateDisplayMode`, and `noFixedEndDateTime`. It returns explicit
start and end labels and values. Use the helper in the Discover card, detail
hero pill, overview rows, organization event surfaces that share the public
card, and metadata where applicable.

Compute same-day equality in `event.timeZone`, not with browser-local
`Date.toDateString()`. Apply these display rules:

- `SCHEDULED` with a start: `Starts` plus full date and time.
- `SCHEDULED` with a same-day end: `Ends` plus the time.
- `SCHEDULED` with a cross-day end: `Ends` plus full date and time.
- `SCHEDULED` without an end: omit the end row.
- `DATE_ONLY`: show `Start date` and, when present, `End date`; show no clock
  time.
- `NO_FIXED_DATE` or `ONGOING`: show the existing schedule text and no end row.

Change `buildAffiliateEventData` so `noFixedEndDateTime` is true only when the
normalized end is null. Preserve a real end from the candidate. Remove the
empty public Timeline when `schedulePreviewItems` is empty. Do not construct a
fake schedule item from the event start.

Add regression tests with a process or browser timezone that differs from the
event timezone. The main fixture must prove that
`2026-08-11T04:30:00.000Z` in `America/Los_Angeles` displays August 10 at
9:30 PM on the card, hero, and overview. Add null-end, same-day, cross-midnight,
date-only, evergreen, daylight-saving, and invalid-timezone cases.

### Milestone 7: Fix Android and iOS presentation parity

Add one shared Kotlin event-window presentation builder. It must use
`event.resolvedTimeZone()`, `dateDisplayMode`, and
`noFixedEndDateTime`. It must never format the placeholder mobile end when the
server said the end is not fixed. Use 12-hour AM/PM output.

Use the shared builder in the Compose event card and read-only event detail.
The mobile card must include the event-local start time for `SCHEDULED` events.
The detail must use the same start and end rules as web. Keep create and edit
picker behavior outside this presentation change.

Expose the same shared presentation to native iOS Discover. Replace
`discoverEventDateLabel` so it does not use the device timezone. If Swift
interop makes the presentation object awkward, expose one small Kotlin string
function for the card and keep all date logic in Kotlin.

Keep API responses as the backend source of truth. `EventApiDto` must accept a
null end only with `noFixedEndDateTime: true`, write the event to Room, and then
let screens observe Room. Add tests that an explicit end survives, a missing end
does not render the start as an end, a `DATE_ONLY` event has no time label, and
the event timezone wins over the device timezone.

Capture Android and iOS screenshots for the scheduled start-only, same-day
range, cross-day range, and date-only cases. Use realistic fixture names and no
test emails or automation labels.

### Milestone 8: Roll out and verify without combining authority stages

Use this order: merge validated code, deploy the web/backend under explicit
approval, update agent containers under explicit approval, preview the cohort,
apply the cohort under explicit approval, complete independent reviews, preview
the row repair, apply the exact row repair under explicit approval, verify web,
then build and release mobile through its normal release workflow.

Do not stop or restart an agent, timer, app, database, or container because this
plan exists. Before each operational step, re-read live leases and queue state.
If the live fleet or schema differs from this plan, update `Surprises &
Discoveries` and revise the affected step before continuing.

## Concrete Steps

Work first in `/Users/elesesy/StudioProjects/mvp-site`.

1. Record the baseline without writes. Save queue counts, event-producing source
   inventory, mapping job statuses, approval statuses, active leases, mapping
   modes, candidate date quality, published event links, and evidence coverage
   under `output/affiliate-event-datetime-remediation/baseline/`.

2. Add the datetime normalizer, duration parser, `DATE_ONLY` contract, timezone
   evidence checks, candidate provenance, and focused tests. Repair
   `previousDaySectionDateTime` and every other local-text date transform.

3. Update producer result, completion, generated-package, skill, goal, reviewer,
   reason-code, and human-review guidance contracts. Add contract tests before
   changing a live agent.

4. Add the producer cohort service and guarded CLI. Test waiting, exact
   selection, active-lease protection, missing-evidence exclusions, transaction
   rollback, idempotence, history preservation, fresh repair budget, and
   approval reopening.

5. Implement the web event-window helper and apply it to public surfaces. Add
   UI and model tests.

6. Run focused validation sequentially. Do not run Jest from another agent or
   checkout at the same time.

       cd /Users/elesesy/StudioProjects/mvp-site
       npm test -- --runInBand \
         src/server/affiliateImports/__tests__/mappingExtractor.test.ts \
         src/server/affiliateImports/__tests__/service.test.ts \
         src/server/affiliateImports/__tests__/agentContracts.test.ts \
         src/server/affiliateImports/__tests__/codexIngestionResult.test.ts \
         src/server/affiliateImports/__tests__/sourceMappingQueue.test.ts \
         src/server/affiliateImports/__tests__/approvalResult.test.ts \
         src/server/affiliateImports/__tests__/approvalQueue.test.ts \
         src/server/affiliateImports/__tests__/mappingFullReview.test.ts \
         src/components/ui/__tests__/EventCard.test.tsx \
         src/app/discover/components/eventDetail/__tests__/eventDetailPublicModel.test.ts \
         src/app/discover/components/eventDetail/__tests__/PublicEventOverview.test.tsx \
         src/app/discover/components/eventDetail/__tests__/PublicEventProgramDetails.test.tsx

       npx tsc --noEmit
       git diff --check

   The first implementation milestone was validated with the narrower command
   below because the queue, reviewer, and UI changes are not part of this
   stopping point:

       cd /Users/elesesy/StudioProjects/mvp-site
       npm test -- --runInBand \
         src/server/affiliateImports/__tests__/affiliateDateTime.test.ts \
         src/server/affiliateImports/__tests__/mappingExtractor.test.ts \
         src/server/affiliateImports/__tests__/agentContracts.test.ts \
         src/server/affiliateImports/__tests__/agentGoldMaterialization.test.ts \
         src/server/affiliateImports/__tests__/service.test.ts

       npx tsc --noEmit --pretty false
       git diff --check

   Observed result on 2026-08-06: 5 suites passed and 90 tests passed; TypeScript
   and the diff check passed.

7. Validate the mapper fixture under two host timezones and compare normalized
   JSON, not locale-formatted test output.

       cd /Users/elesesy/StudioProjects/mvp-site
       TZ=UTC npm test -- --runInBand src/server/affiliateImports/__tests__/mappingExtractor.test.ts
       TZ=America/Los_Angeles npm test -- --runInBand src/server/affiliateImports/__tests__/mappingExtractor.test.ts

8. Under separate deployment approval, deploy the contract. Confirm the mapper
   and reviewer process arguments and revision. Preview the cohort first. Record
   the exact command that the implementation adds and its JSON output here.

9. Under separate queue-write approval, apply the cohort with its exact expected
   counts. Let normal mapper and reviewer claims process the work. Do not release
   a valid lease to make the cohort finish faster.

10. After all packages reach a terminal outcome, run the row-repair command in
    preview mode. Review every automatic match and exclusion. Under separate
    data-write approval, apply only the exact expected future set selected by
    the captured cutoff.

Then work in `/Users/elesesy/StudioProjects/mvp-app`.

11. Add the shared mobile presentation builder. Update Compose event cards,
    read-only detail rows, native iOS Discover, and focused tests. Preserve the
    API-to-Room-to-screen flow.

12. Use JDK 17 and run the project-standard mobile checks.

       cd /Users/elesesy/StudioProjects/mvp-app
       ./gradlew :composeApp:testDebugUnitTest
       ./gradlew :composeApp:assembleDebug
       ./gradlew bootIOSSimulator
       ./gradlew :composeApp:iosSimulatorArm64Test
       git diff --check

13. Run Android and iOS UI smoke tests with the same API fixtures. Capture the
    four required date-window screenshots. Record device timezone and event
    timezone with each result.

14. Under separate release approval, ship the mobile change through the normal
    app release workflow. Verify that the released app receives the corrected
    API values from Room and displays the same semantics as web.

## Validation and Acceptance

The importer is accepted when the same stored source evidence produces the same
UTC instants under `TZ=UTC` and `TZ=America/Los_Angeles`. The Rose City fixture
must produce a 9:30 PM Pacific start as `2026-08-11T04:30:00.000Z`, not
`2026-08-10T21:30:00.000Z`. Its `2 Hours 5 Mins` duration must produce an end of
`2026-08-11T06:35:00.000Z`. The candidate must retain
`America/Los_Angeles`, the raw duration, parsed duration, and end derivation.

The mapping contract is accepted when every event package has an explicit start
precision, timezone provenance, and end disposition. The producer cannot
complete an `event-datetime-v1` package without its datetime review result. The
reviewer cannot approve an event package without
`dateTimeQualityVerified: true`.

The cohort is accepted when preview and apply select the same exact approved
event-mapping job IDs, active leases remain unchanged, no duplicate active job
is created, all prior results and approvals remain in history, and reusing the
same cohort key enqueues zero additional rows. Every legacy source without
stored evidence appears in the exclusion report.

The data repair is accepted when every applied candidate has one exact corrected
occurrence, every linked event matches its candidate, every corrected dedupe
key is unique, and the second review scrape creates no duplicate candidate. The
apply must not publish, unpublish, archive, delete, or change registration and
payment data.

The web and mobile UI are accepted when all of these cases pass in an event
timezone that differs from the browser or device timezone:

- start only shows a full event-local start and no end;
- same-day start and end show a full start and an end time;
- a range over midnight shows full date and time at both ends;
- `DATE_ONLY` shows dates and no clock times;
- evergreen events retain schedule text;
- invalid timezone input uses the documented safe fallback and emits a testable
  warning or diagnostic;
- no empty public Timeline appears;
- web, Android, and iOS all use 12-hour AM/PM time.

The work is complete only after focused tests, TypeScript, Android assembly,
iOS simulator tests, diff checks, live post-repair audits, and visual smoke
tests pass. Record any skipped check and its exact blocker in `Outcomes &
Retrospective`.

At the current milestone, acceptance is limited to the importer slice: the
same timezone-backed fixture produced identical UTC values under `TZ=UTC` and
`TZ=America/Los_Angeles`; the Rose City-shaped duration produced a 125-minute
end; date-only input retained `DATE_ONLY`; and invalid daylight-saving local
times stopped with explicit errors. The remaining acceptance gates are still
open.

## Idempotence and Recovery

The cohort CLI is preview-only by default. Its apply transaction rechecks the
control row, cutoff, job status, approval status, lease absence, and expected
counts. A repeated apply with the same key reports `ALREADY_ENQUEUED` and changes
nothing. A failed transaction leaves every job, intake, and approval unchanged.

Producer repairs use new source-scoped commits. Do not overwrite or delete the
prior commit or review result. If a corrected mapping fails review, the normal
three-attempt repair cycle applies from the cohort's recorded repair-history
start index. After that limit, stop for human review.

The row-repair command is preview-only by default. Apply mode uses explicit IDs,
expected old values, expected counts, and one transaction per exact candidate
and event pair. Keep before and after JSON under the ignored output directory.
If a repair is wrong, restore only the recorded datetime fields from that
artifact after a separate review. Do not use a broad database rollback.

Do not run corrected live scrapes before dedupe reconciliation. If a duplicate
already exists, stop automatic repair for that occurrence and report both IDs.
Do not delete either row automatically.

Web presentation changes are independently reversible. The backend datetime
contract and repaired data remain valid if UI deployment is rolled back. Mobile
presentation changes are also independently reversible because this plan does
not change the Room event schema.

The working `mvp-site` checkout already contains unrelated affiliate-agent and
admin-review changes. Preserve them. Implement this plan in isolated commits or
a clean worktree, and merge only the intended paths. The `mvp-app` checkout was
clean when this plan was written.

## Artifacts and Notes

Store redacted implementation artifacts under
`output/affiliate-event-datetime-remediation/`:

- `baseline/inventory.json` for source, mapping, job, approval, and evidence
  scope;
- `cohort/preview.json` and `cohort/apply.json` for queue transitions;
- `packages/outcomes.json` for producer and reviewer results;
- `repair/preview.json`, `repair/apply.json`, and `repair/postcheck.json` for
  candidate and event changes;
- `ui/web/`, `ui/android/`, and `ui/ios/` for screenshots and timezone notes.

Do not store credentials, signed artifact URLs, raw provider envelopes,
personal registration data, or payment data in these artifacts.

The known reference occurrence is the Rose City Volleyball event whose source
title starts with `9:30 PM`. Use it as one regression fixture, not as a special
case in production code. The generalized parser and contract must cover all
event sources.

Revision note, 2026-08-06: Created this plan after tracing the host-timezone
mapping error, the absent-end web behavior, the unconditional affiliate
open-end flag, and mobile device-timezone and placeholder-end behavior.

Revision note, 2026-08-06 11:52 PDT: Implemented the first local importer
milestone. Added `affiliateDateTime.ts`, extended the mapping and candidate
contracts with duration and `DATE_ONLY`, changed extraction to collect raw
fields before datetime normalization, and recorded focused validation results.
No live queue, data, process, deployment, or mobile action was performed.

Revision note, 2026-08-06: Addressed the importer review findings. Removed the
host-local compatibility parser, selected the trailing clock for range ends,
inferred cross-year range starts, cleared invalid manual datetime values,
derived `DATE_ONLY` from date-only evidence, narrowed duration fallback, and
changed the repair scope to future events after one captured cutoff.

Revision note, 2026-08-06: Addressed the second importer review pass. Preserved
manual duration-derived ends and stored `DATE_ONLY`, rolled no-year dates across
year boundaries, rejected timezone abbreviations, supported same-month `and`
ranges and overnight clocks, and used event-local calendar days for whole-day
durations across DST.

Revision note, 2026-08-06: Corrected yearless cross-year range inference so a
December reference resolves `December 31 - January 2` to the current December
and following January instead of the previous year pair.

Revision note, 2026-08-06: Corrected the early-January case so an active
December–January range uses the previous December and current January rather
than advancing both dates by one year.

## Interfaces and Dependencies

The implementation must preserve these queue interfaces:

- `claimNextAffiliateSourceIntakeForMapping` remains the only producer claim
  boundary.
- `finishAffiliateSourceMappingClaim` remains the producer completion boundary.
- `completeAffiliateApproval` remains the independent reviewer completion and
  producer-repair boundary.
- the partial unique active-job index remains in force.
- current lease fields and worker identity checks remain authoritative.

Extend, do not bypass, these data contracts:

- `FieldMapping` and `AffiliateScrapeMapping` in
  `src/server/affiliateImports/types.ts`;
- `AffiliateCandidateInput` and normalized raw import metadata;
- `affiliateSourceDraftSchema` and generated source fixtures;
- `codexAffiliateIngestionResultSchema` for the producer datetime review;
- `affiliateApprovalResultSchema` for independent datetime verification;
- public `Event` API fields `start`, `end`, `timeZone`,
  `noFixedEndDateTime`, and `dateDisplayMode`;
- mobile `EventApiDto`, Room `Event`, and the shared presentation builder.

Reuse `src/server/timeZones.ts` for IANA validation and coordinate-based
resolution. Reuse the web display functions in `src/lib/dateUtils.ts`. Reuse
`Event.resolvedTimeZone()` and the existing AM/PM formatters on mobile. Do not
add a third-party timezone service or parse source-local dates through the host
timezone.
