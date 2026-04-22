# Match Update Overfetch Reduction

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [PLANS.md](/C:/Users/samue/Documents/Code/mvp-site/PLANS.md).

## Purpose / Big Picture

Saving or finalizing a single match should not have to hydrate every persisted segment, incident, and roster detail in the entire event. After this change, the match PATCH route will still load the full event schedule graph it needs for league and tournament rescheduling, but it will only hydrate match child detail for the match being edited. The observable outcome is lower database fan-out on `PATCH /api/events/[eventId]/matches/[matchId]` without changing scheduler behavior.

## Progress

- [x] (2026-04-22 10:54 -07:00) Traced the current match PATCH path and confirmed it loads all match segments/incidents through `loadEventWithRelations`.
- [x] (2026-04-22 11:18 -07:00) Added `loadEventForMatchMutation` and loader options so the PATCH path only hydrates segments/incidents for the target match and skips team player/registration hydration.
- [x] (2026-04-22 11:18 -07:00) Added repository regression coverage and ran targeted Jest suites plus `npx tsc --noEmit`.

## Surprises & Discoveries

- Observation: The scheduler code path does not read persisted incidents, and the league rescheduler does not use persisted segments for unrelated matches.
  Evidence: `src/server/scheduler/reschedulePreservingLocks.ts` only works with fields, matches, participants, dependencies, and official assignment state.

- Observation: `saveMatches` rewrites child rows whenever `match.segments` or `match.incidents` are arrays, so reducing loader fan-out also requires preserving whether child rows were actually hydrated.
  Evidence: `src/server/repositories/events.ts` checks `Array.isArray(match.segments)` and `Array.isArray(match.incidents)` before deleting/recreating child rows.

## Decision Log

- Decision: Keep the rescheduler and full match row persistence behavior unchanged in this pass, and only narrow hydration of match child detail and roster detail on the PATCH path.
  Rationale: The user asked to isolate overfetch first before changing scheduling behavior, so this pass should be measurable and low risk.
  Date/Author: 2026-04-22 / Codex

## Outcomes & Retrospective

This pass reduced PATCH-path database fan-out without changing scheduler behavior. The repository loader now supports narrowed match child hydration and optional roster hydration, and the match PATCH route uses that narrower path. The remaining unknown is how much total latency is still attributable to `finalizeMatch` plus full match-row persistence. If the timeout persists, the next pass should measure scheduler time versus `saveMatches` time with this overfetch reduction already in place.

## Context and Orientation

`src/app/api/events/[eventId]/matches/[matchId]/route.ts` handles match reads and writes. Its PATCH handler loads an event aggregate with `loadEventWithRelations`, mutates one in-memory `Match`, optionally finalizes that match through the scheduler, and then persists `Object.values(event.matches)` with `saveMatches`.

`src/server/repositories/events.ts` builds that event aggregate. `loadEventWithRelations` loads divisions, fields, teams, time slots, officials, matches, team roster detail, match segments, and match incidents, then assembles `League` or `Tournament` objects plus `Match` instances. `saveMatches` writes match rows and rewrites persisted match child rows when those arrays are present.

For this task, “overfetch” means loading database rows that the PATCH handler does not need to decide permissions, validate operations, run the scheduler, or persist the updated result. The initial focus is the event-wide `matchSegments` and `matchIncidents` reads, plus team roster/player hydration that the PATCH flow does not consume.

## Plan of Work

Add loader options in `src/server/repositories/events.ts` so callers can request full event scheduling state while narrowing match child hydration and optional roster hydration. Use those options to create a match-mutation-specific load path for the PATCH route in `src/app/api/events/[eventId]/matches/[matchId]/route.ts`.

Update `buildMatches` and `saveMatches` together so matches that were loaded without child hydration do not later delete and recreate unrelated `matchSegments` or `matchIncidents`. The target match must still hydrate its current segments and incidents because the PATCH handler validates and mutates them in memory.

Add regression tests under `src/server/repositories/__tests__` that prove the narrowed loader only queries child rows for the target match and skips team roster hydration when requested.

## Concrete Steps

From `C:\Users\samue\Documents\Code\mvp-site`:

    npx jest --runInBand src/server/repositories/__tests__/events.matchMutationLoad.test.ts src/server/repositories/__tests__/saveMatches.test.ts src/server/repositories/__tests__/events.loadWithRelationsFieldConflicts.test.ts

    npx tsc --noEmit

Observed result:

    PASS src/server/repositories/__tests__/events.matchMutationLoad.test.ts
    PASS src/server/repositories/__tests__/saveMatches.test.ts
    PASS src/server/repositories/__tests__/events.loadWithRelationsFieldConflicts.test.ts

## Validation and Acceptance

Acceptance is:

1. `loadEventWithRelations` still returns a usable event aggregate for scheduling and match updates.
2. The match PATCH route uses the narrowed loader path.
3. A regression test proves only the target match id is used for `matchSegments` and `matchIncidents` hydration on the narrowed path.
4. `saveMatches` does not rewrite skipped child rows for unrelated matches.
5. Targeted Jest tests and `npx tsc --noEmit` pass.

## Idempotence and Recovery

This plan only changes repository loading and route wiring. If a step fails, rerun the targeted Jest suite after fixing the code. No schema migration or destructive data operation is part of this change.

## Artifacts and Notes

Expected proof after implementation:

    matchSegments.findMany called with { where: { matchId: { in: ['target_match'] } } }
    matchIncidents.findMany called with { where: { matchId: { in: ['target_match'] } } }

## Interfaces and Dependencies

`src/server/repositories/events.ts` should export a match-mutation-specific loader or extend `loadEventWithRelations` with options that can:

- limit hydrated match child detail to a supplied set of match ids
- skip team player hydration
- skip team registration hydration

`src/app/api/events/[eventId]/matches/[matchId]/route.ts` must call that narrowed loader for PATCH while leaving the route’s existing permission, validation, finalize, and persistence flow intact.

Revision note: Created this ExecPlan to track the overfetch-reduction pass before changing scheduler behavior.
Revision note: Updated after implementation to record the new match-mutation loader path and the passing validation commands.
