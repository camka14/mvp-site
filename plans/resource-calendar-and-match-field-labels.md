# Add Field Resource View and Reliable Match Field Labels (Web)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at repository root and must remain compliant with its requirements.

## Purpose / Big Picture

Hosts and players need a schedule view that can be read by field, not only by date/time. After this change, the league schedule calendar can switch into a resource-oriented mode where each field is its own calendar resource lane. Match cards will also always show the field label, even when a match record only has `fieldId` and does not include a hydrated `field` relation.

## Progress

- [x] (2026-02-17 19:28Z) Located the schedule calendar and match card integration points in `src/app/events/[id]/schedule/components` and the schedule tab wiring in `src/app/events/[id]/schedule/page.tsx`.
- [x] (2026-02-17 19:33Z) Implemented resource-mode calendar plumbing in `LeagueCalendarView` with a `Calendar/By Field` toggle and React Big Calendar resource props/accessors.
- [x] (2026-02-17 19:34Z) Updated `MatchCard` to always render a resolved field label (`fieldLabel` prop, hydrated relation fallback, `fieldId` fallback, `Field TBD` final fallback).
- [x] (2026-02-17 19:34Z) Updated schedule page wiring to pass `activeEvent.fields` into `LeagueCalendarView`.
- [x] (2026-02-17 19:36Z) Ran targeted lint and schedule page tests; both passed after adjusting test invocation to `--runTestsByPath` for bracketed route paths.
- [x] (2026-02-17 19:44Z) Fixed runtime view mismatch (`Cannot read properties of undefined (reading 'title')`) by guarding the effective calendar view against layout/view incompatibilities.

## Surprises & Discoveries

- Observation: The month event renderer already prints a field label fallback from `match.field`, but week/day cards depend on `MatchCard`, which only prints a field when `match.field` is present.
  Evidence: `MatchCard.tsx` currently renders `{match.field && <div ...>Field {match.field.fieldNumber}</div>}`.
- Observation: Jest path matching with Next.js bracketed route segments (`[id]`) can fail when passed directly as a positional test pattern.
  Evidence: `npm test -- src/app/events/[id]/schedule/__tests__/page.test.tsx` returned “No tests found”; `npm test -- --runTestsByPath "src/app/events/[id]/schedule/__tests__/page.test.tsx"` passed.
- Observation: React Big Calendar can throw when `view` is not present in the current `views` array (for example, `view='month'` while in resource mode with `views=['day','week']`).
  Evidence: Runtime error `Cannot read properties of undefined (reading 'title')` occurred at `BigCalendar` render immediately after toggling layout.

## Decision Log

- Decision: Implement a schedule-level “By Field” mode (resource mode) instead of building a custom React Big Calendar view class.
  Rationale: React Big Calendar natively supports resources when `resources` and accessors are provided, which keeps the change additive and low risk.
  Date/Author: 2026-02-17 / Codex
- Decision: Restrict resource mode to `day`/`week` views while keeping standard mode on `month`/`week`/`day`/`agenda`.
  Rationale: Resource lanes are meaningful in time-grid views; forcing `day` when entering resource mode avoids unsupported or unclear month/agenda behavior.
  Date/Author: 2026-02-17 / Codex
- Decision: Compute and pass `effectiveCalendarView` synchronously (`view ∈ views ? view : views[0]`) instead of relying solely on effect-driven state correction.
  Rationale: Prevents transient invalid renders during mode changes and removes the runtime crash window.
  Date/Author: 2026-02-17 / Codex

## Outcomes & Retrospective

Implemented as planned. The schedule calendar now supports a field-resource mode with explicit field resources derived from event fields and visible matches, and match cards now reliably display a field label even with partial hydration. Validation passed for targeted lint and schedule page tests. No backend/data-contract changes were required.

## Context and Orientation

The schedule tab is rendered from `src/app/events/[id]/schedule/page.tsx`, and the tab uses `LeagueCalendarView` from `src/app/events/[id]/schedule/components/LeagueCalendarView.tsx`. Match visual cards in calendar and bracket contexts come from `src/app/events/[id]/schedule/components/MatchCard.tsx`. The calendar currently uses React Big Calendar in standard month/week/day/agenda views without resources configured. Match records may include `fieldId` without an expanded `field` relation, which causes field labels to disappear in cards.

## Plan of Work

Update `LeagueCalendarView.tsx` to derive a normalized field resource model from both the event field list and displayed matches. Add a UI toggle for standard calendar mode versus field-resource mode. In resource mode, pass resource props and accessors to Big Calendar and keep existing behaviors (match selection, “my matches” filtering, range slider) intact.

Update `MatchCard.tsx` to accept an optional explicit `fieldLabel` and compute a robust fallback label when relation data is missing. Use this in calendar renderers so every card can show the field.

Update `page.tsx` where `LeagueCalendarView` is mounted so the component receives `activeEvent.fields` and can build resource titles from authoritative field names/numbers.

## Concrete Steps

Run from `/home/camka/Projects/MVP/mvp-site`:

1. Edit `src/app/events/[id]/schedule/components/LeagueCalendarView.tsx` to add field-resource mode state, resource/event mapping helpers, and Big Calendar resource props.
2. Edit `src/app/events/[id]/schedule/components/MatchCard.tsx` to add deterministic field label resolution.
3. Edit `src/app/events/[id]/schedule/page.tsx` to pass event fields into `LeagueCalendarView`.
4. Run lint/test commands for touched schedule files.

Expected command examples:

    npm run lint -- src/app/events/[id]/schedule/components/LeagueCalendarView.tsx src/app/events/[id]/schedule/components/MatchCard.tsx src/app/events/[id]/schedule/page.tsx
    npm test -- src/app/events/[id]/schedule/__tests__/page.test.tsx

## Validation and Acceptance

Acceptance is met when:

1. In the schedule tab, the user can switch to a field-oriented calendar mode and see separate resource lanes per field.
2. Clicking matches still opens match details/edit flow as before.
3. Match cards in schedule/bracket contexts always show a field indicator (name/number/id fallback) instead of silently omitting it.
4. Lint/tests for changed schedule surfaces pass.

## Idempotence and Recovery

All changes are additive UI/data-mapping edits and can be reapplied safely. If resource mode causes rendering issues, disable it by default while retaining fallback field labels. If tests fail due unrelated workspace churn, rerun targeted file-scoped lint/test commands and record the discrepancy.

## Artifacts and Notes

- Web lint:

    npm run lint -- src/app/events/[id]/schedule/components/LeagueCalendarView.tsx src/app/events/[id]/schedule/components/MatchCard.tsx src/app/events/[id]/schedule/page.tsx

  Result: passed.

- Schedule page tests:

    npm test -- --runTestsByPath "src/app/events/[id]/schedule/__tests__/page.test.tsx"

  Result: `PASS .../page.test.tsx` with 7/7 tests passing.

- Runtime-fix revalidation:

    npm run lint -- src/app/events/[id]/schedule/components/LeagueCalendarView.tsx
    npm test -- --runTestsByPath "src/app/events/[id]/schedule/__tests__/page.test.tsx"

  Result: lint passed; schedule tests passed (7/7).

## Interfaces and Dependencies

Use existing dependencies only:

- React Big Calendar resource support in `LeagueCalendarView`.
- Existing `Field` and `Match` types from `src/types/index.ts`.
- Existing schedule page data source (`activeEvent`, `scheduleMatches`) in `page.tsx`.

No API contract changes are required for this work.

Revision note (2026-02-17 / Codex): Initial plan authored to cover web resource calendar mode and match field-label reliability.
Revision note (2026-02-17 / Codex): Updated progress, decisions, validation artifacts, and outcomes after implementation and test execution.
Revision note (2026-02-17 / Codex): Added post-implementation runtime bugfix details for view/layout compatibility and revalidation evidence.
