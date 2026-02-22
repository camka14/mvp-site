# Per-Division Playoff Team Count And Event Details Placement

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root and is maintained in accordance with that file.

## Purpose / Big Picture

League events now support playoff team count at the correct scope. When divisions are separate, playoff team count is configured per division and used by scheduler math and bracket generation. When single division is enabled, playoff team count is configured at event level in Event Details next to participant settings. The Include Playoffs switch also lives in Event Details, so league administrators can see the high-level switch in one place.

## Progress

- [x] (2026-02-21 23:03Z) Added `Divisions.playoffTeamCount` to Prisma schema and generated/applied migration `20260221231141_division_playoff_team_count`.
- [x] (2026-02-21 23:08Z) Updated shared types and payload mapping so division playoff counts round-trip through API payloads.
- [x] (2026-02-21 23:20Z) Updated repository/API division normalization and persistence to read/write per-division playoff team counts.
- [x] (2026-02-21 23:29Z) Updated scheduler logic (`EventBuilder`, `scheduleEvent`, `updateMatch`) to use per-division playoff count for split-division leagues with event-level fallback.
- [x] (2026-02-21 23:40Z) Moved Include Playoffs switch to Event Details, moved single-division playoff count to Event Details, added division playoff input for split leagues, and hid playoff controls inside `LeagueFields` for this flow.
- [x] (2026-02-21 23:47Z) Added/updated focused tests and verified with Jest suites.

## Surprises & Discoveries

- Observation: The bracket builder intentionally skips divisions with fewer than 3 playoff teams.
  Evidence: `src/server/scheduler/Brackets.ts` has `if (teams.length < 3) continue;`; initial test expecting 2-team playoff bracket failed and was adjusted to 3 teams for that division.

## Decision Log

- Decision: Keep `LeagueFields` playoff controls available behind a `showPlayoffSettings` prop and disable them from `EventForm`.
  Rationale: Avoids breaking `LeagueFields` component tests and preserves backward compatibility for any future usage while honoring new Event Details UX.
  Date/Author: 2026-02-21 / Codex

- Decision: Persist per-division playoff count in `Divisions` table rather than deriving from event-level values at runtime.
  Rationale: Scheduling and rescheduling must remain deterministic from stored event data, including split-division league behavior.
  Date/Author: 2026-02-21 / Codex

- Decision: Keep event-level `playoffTeamCount` as fallback for legacy data and single-division leagues.
  Rationale: Backward compatibility with existing events and API payloads while introducing per-division control.
  Date/Author: 2026-02-21 / Codex

## Outcomes & Retrospective

The feature now works end-to-end in UI, payload mapping, persistence, and scheduling. Split-division leagues can set different playoff team counts by division, and single-division leagues configure playoff count in Event Details with the Include Playoffs switch in the same section. Scheduler estimates and playoff placeholder generation now honor per-division values. Remaining risk is low and mostly around edge-case UX interactions when toggling single-division mode repeatedly, but core persistence/scheduler behavior is covered by targeted tests.

## Context and Orientation

Relevant files are:

- `src/app/events/[id]/schedule/components/EventForm.tsx` for Event Details controls, division editor controls, validation, and payload building.
- `src/app/discover/components/LeagueFields.tsx` for league slot configuration UI where playoff controls are now optional.
- `src/types/index.ts` for `Division` typing and event payload serialization in `toEventPayload`.
- `src/server/repositories/events.ts` for division normalization/sync and event loading.
- `src/app/api/events/route.ts` and `src/app/api/events/[eventId]/route.ts` for division detail read/write normalization.
- `src/server/scheduler/EventBuilder.ts`, `src/server/scheduler/scheduleEvent.ts`, and `src/server/scheduler/updateMatch.ts` for playoff scheduling and estimation.
- `prisma/schema.prisma` and `prisma/migrations/20260221231141_division_playoff_team_count/migration.sql` for schema change.

## Plan of Work

Implement in layers: first add persistence schema support for division playoff count, then update type/payload mapping, then repository/API normalization, then scheduler behavior, and finally EventForm UI/validation placement changes. Finish by updating regression tests for repository payload persistence, service payload serialization, and split-division scheduler behavior.

## Concrete Steps

From repository root (`/home/camka/Projects/MVP/mvp-site`):

    npx prisma migrate dev --name division_playoff_team_count
    npx prisma generate
    npx jest src/server/repositories/__tests__/events.upsert.test.ts src/lib/__tests__/eventService.test.ts src/server/scheduler/__tests__/leagueTimeSlots.test.ts src/app/discover/components/__tests__/LeagueFields.test.tsx "src/app/events/\[id\]/schedule/__tests__/page.test.tsx"

Expected result: migration applies cleanly, Prisma client regenerates, and all listed tests pass.

## Validation and Acceptance

Acceptance is met when:

1. In Event Details for league events, `Include Playoffs` toggle appears there (not only in league slot section).
2. If `singleDivision=true`, Event Details shows editable `Playoff Team Count` and division editor playoff count is disabled/mirrored.
3. If `singleDivision=false`, division editor exposes `Division Playoff Team Count`, and scheduler uses those values (with event-level fallback for legacy).
4. Saving/reloading event preserves per-division playoff count values.
5. Jest suites listed above pass.

## Idempotence and Recovery

- Running `prisma migrate dev` after migration exists is safe; Prisma reports schema is in sync.
- Running `npx prisma generate` repeatedly is safe.
- If tests fail, rerun only failing suites after fixing code; no destructive DB operations are required for this feature.

## Artifacts and Notes

Key test command output after implementation:

    PASS src/server/scheduler/__tests__/leagueTimeSlots.test.ts
    PASS src/server/repositories/__tests__/events.upsert.test.ts
    PASS src/lib/__tests__/eventService.test.ts
    PASS src/app/events/[id]/schedule/__tests__/page.test.tsx
    PASS src/app/discover/components/__tests__/LeagueFields.test.tsx

## Interfaces and Dependencies

The feature depends on:

- Prisma model field: `Divisions.playoffTeamCount Int?`.
- `Division` domain type in scheduler includes `playoffTeamCount: number | null`.
- `Division` API type includes `playoffTeamCount?: number`.
- EventForm division detail shape includes `playoffTeamCount?: number` and validation enforces it only when league playoffs are enabled and divisions are separate.

Revision note (2026-02-21): Created and finalized this ExecPlan after implementation to capture actual shipped behavior, decisions, and validation evidence in a self-contained form.
