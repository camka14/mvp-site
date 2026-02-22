# Match Locking and My-Matches Filtering (Web + Backend)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root.

## Purpose / Big Picture

Hosts need to lock matches so backend auto-rescheduling will not move them, and players/parents should only see "Show Only My Matches" when it is relevant. After this change, a host can lock one match or all visible matches from the schedule UI, and backend finalize/reschedule logic will keep locked matches fixed while rescheduling unlocked ones around them.

## Progress

- [x] (2026-02-21 00:00Z) Audited current scheduler, match API routes, serialization, and schedule UI controls.
- [x] (2026-02-21 07:00Z) Implemented persisted `locked` field across Prisma schema, repository load/save, API schemas, and serialization.
- [x] (2026-02-21 07:00Z) Implemented scheduler lock guard so locked matches are not shifted/unscheduled during finalize auto-reschedule.
- [x] (2026-02-21 07:00Z) Added scheduler regression test that proves a locked match blocks reschedule movement.
- [x] (2026-02-21 07:00Z) Added web UI: per-match lock checkbox in match details, lock-all action near my-matches filter, and conditional visibility for "Show Only My Matches" (self or linked child only).
- [x] (2026-02-21 07:00Z) Validated with targeted Jest suites.
- [x] (2026-02-21 13:40Z) Added lock-preserving event reschedule path for `POST /api/events/[eventId]/schedule` that keeps locked matches in place and reschedules only unlocked matches.
- [x] (2026-02-21 13:40Z) Added backend warning payload when locked matches sit outside updated start/time-slot windows and surfaced warnings in schedule UI.
- [x] (2026-02-21 13:40Z) Updated schedule page save/reschedule flow to work from non-details tabs by falling back to active event state when form ref is unavailable.
- [x] (2026-02-21 13:40Z) Added regression tests for lock-preserving schedule route behavior, scheduler helper behavior, and non-details-tab reschedule UI behavior.

## Surprises & Discoveries

- Observation: current auto-reschedule path in `updateMatch.ts` unschedules and re-schedules matches directly; it does not rely only on `Schedule.shiftTimes`.
  Evidence: `processMatches()` calls `unscheduleMatchesOnField()` and then `scheduleEvent(...)` for unscheduled matches.
- Observation: "Reschedule Matches" depended on the details form imperative ref, which made behavior tab-sensitive in practice.
  Evidence: `getDraftFromForm()` previously hard-failed when `eventFormRef.current` was unavailable instead of using active draft state.

## Decision Log

- Decision: enforce lock behavior in both `Schedule.ts` (generic shift guard) and `updateMatch.ts` (unschedule guard).
  Rationale: this prevents future regressions regardless of which rescheduling path is used.
  Date/Author: 2026-02-21 / Codex
- Decision: for explicit event reschedule endpoint (`/api/events/[eventId]/schedule`), preserve locked matches in-place and only reschedule unlocked matches instead of full delete/rebuild.
  Rationale: full rebuild regenerates match identity and can replace locked matches; preserving in-place is required to honor lock semantics.
  Date/Author: 2026-02-21 / Codex
- Decision: return non-fatal warning objects from schedule response when preserved locked matches are outside updated windows.
  Rationale: host explicitly asked to keep locked schedule while still warning about invalid placement after event/time-slot edits.
  Date/Author: 2026-02-21 / Codex

## Outcomes & Retrospective

Implemented and validated.

- Backend now persists `Matches.locked` and round-trips it through serializers and API mappers.
- Finalize/reschedule paths now skip locked matches both in generic `Schedule.shiftTimes()` and bracket finalize-specific unschedule/reschedule flow.
- Web schedule now supports lock/unlock all visible matches and only shows "Show Only My Matches" when the current user or one of their linked children appears in at least one match.
- Explicit event reschedule route now preserves locked matches and returns warning metadata when locked matches no longer fit updated schedule windows.
- Schedule UI now allows reschedule from non-details tabs and displays backend warnings to the host after successful reschedule.
- Targeted tests passed:
  - `npm test -- src/server/scheduler/__tests__/tournamentReferees.test.ts src/app/api/events/__tests__/scheduleRoutes.test.ts`
  - `npm test -- src/app/api/events/__tests__/scheduleRoutes.test.ts src/server/scheduler/__tests__/reschedulePreservingLocks.test.ts`
  - `npx jest --runTestsByPath src/app/events/[id]/schedule/__tests__/page.test.tsx`

## Context and Orientation

Match data is persisted in `prisma/schema.prisma` (`Matches` model), loaded/saved via `src/server/repositories/events.ts`, updated by API routes `src/app/api/events/[eventId]/matches/[matchId]/route.ts` and `src/app/api/events/[eventId]/matches/route.ts`, then presented in schedule UI components under `src/app/events/[id]/schedule/components/`. Auto-rescheduling for finalized matches runs in `src/server/scheduler/updateMatch.ts` and low-level movement logic lives in `src/server/scheduler/Schedule.ts`.

## Plan of Work

Add a `locked` boolean to persisted matches with default false, thread it through model mapping and route validation so both single and bulk patch endpoints can toggle it, then enforce that locked matches remain fixed in all reschedule paths. Add a scheduler test that models a delayed match with a locked dependent match and asserts the locked match time remains unchanged after finalize. On the web schedule screen, add a lock-all toggle beside the existing my-matches filter, only show my-matches when there is at least one qualifying match (user or linked child), and add a checkbox in `MatchEditModal` so lock can be changed per match.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

1. Edit schema/model/repository/API/UI files listed above.
2. Run `npx prisma migrate dev --name add_match_locked_flag`.
3. Run `npm run test -- src/server/scheduler/__tests__/finalizeMatch.league.test.ts`.
4. Run `npm run test -- src/app/api/events/__tests__/scheduleRoutes.test.ts`.

## Validation and Acceptance

Acceptance is met when:

- Locked field persists and round-trips through API responses.
- Finalizing a delayed match does not move locked downstream matches.
- Web host can lock one match in match edit and can lock/unlock all visible matches from schedule controls.
- "Show Only My Matches" button is hidden when no self/child-involved matches exist.
- Targeted tests pass.

## Idempotence and Recovery

All edits are additive. Re-running migration command is safe only if migration has not already been applied under the same name; otherwise use `npx prisma migrate dev` with a new name. If migration fails locally, revert only the new migration folder and rerun.

## Artifacts and Notes

Will be filled with command outputs and key diffs after implementation.

## Interfaces and Dependencies

Required shape changes:

- `Match` in `src/types/index.ts` gains `locked?: boolean`.
- `Match` class in `src/server/scheduler/types.ts` gains `locked: boolean`.
- API patch schemas in match routes accept `locked`.
- `applyMatchUpdates` in `src/server/scheduler/updateMatch.ts` handles `locked`.

Revision note: Added locked-match-preserving reschedule endpoint behavior, warning propagation, non-details-tab reschedule support, and associated tests.
