# Move league schedule configuration into division settings

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root.

## Purpose / Big Picture

Event organizers should configure regular-season league behavior from the same Division Settings area where they define the divisions themselves. In split-division leagues, each league division can have its own games per opponent, rest time, match duration, set count, set duration, and point targets. In single-division mode, the same settings live in Single Division Settings and continue to drive the one combined schedule. The Schedule section should keep weekly timeslots, but it should no longer be the source of truth for league or playoff match parameters.

## Progress

- [x] 2026-05-12T22:53:54Z Read the existing EventForm, LeagueFields, scheduler EventBuilder, Division model, and event persistence paths.
- [x] 2026-05-12T23:21:30Z Add division-level league configuration to form, API/repository normalization, scheduler types, and serializer output.
- [x] 2026-05-12T23:21:30Z Move league and non-split playoff configuration controls from Schedule Config into Division Settings.
- [x] 2026-05-12T23:21:30Z Update scheduler regular-season scheduling to resolve duration, rest time, games per opponent, and set count from the active division.
- [x] 2026-05-12T23:21:30Z Add focused tests proving split league divisions can schedule with different parameters and that single-division playoff rest time remains separate from division regular-season rest time.
- [x] 2026-05-12T23:21:30Z Run focused Jest tests and `npx tsc --noEmit`.
- [x] 2026-05-13T00:03:12Z Replace the earlier JSON-column direction with explicit scalar `Divisions` columns for league schedule settings; keep playoff settings on the existing playoff division config path.

## Surprises & Discoveries

- Observation: `EventBuilder.scheduleRegularSeasonForDivision` currently receives one `durationMs` and uses event-level `gamesPerOpponent`, `setsPerMatch`, and `restTimeMinutes`, so split league divisions cannot vary those values yet.
  Evidence: `src/server/scheduler/EventBuilder.ts` builds all regular-season matches with `this.event.gamesPerOpponent`, `this.matchBuffer()`, and `this.event.setsPerMatch`.
- Observation: Playoff division settings are serialized through `standingsOverrides` for `PLAYOFF` divisions, but regular `LEAGUE` divisions do not yet preserve the missing league schedule scalar fields.
  Evidence: `src/server/repositories/events.ts` normalizes `playoffConfig` only when `kind === 'PLAYOFF'`.
- Observation: League playoff bracket matches were overwriting the tournament bracket rest buffer with the event regular-season rest buffer after bracket construction.
  Evidence: The new test `uses single-division playoff config rest time for non-split league playoffs` initially received `bufferMs` of `0` instead of `25 * MINUTE_MS`; `src/server/scheduler/EventBuilder.ts` assigned `match.bufferMs = this.matchBuffer()`.

## Decision Log

- Decision: Represent division-level regular-season settings as a scheduler `leagueConfig` runtime object, but persist them as explicit scalar `Divisions` columns (`gamesPerOpponent`, `restTimeMinutes`, `usesSets`, durations, set count, and point targets).
  Rationale: The database already models most event schedule parameters as columns, and the new fields are first-class editable settings rather than arbitrary metadata. A runtime object keeps scheduler code readable without introducing JSON persistence.
  Date/Author: 2026-05-12 / Codex
- Decision: Keep event-level league fields populated from the single-division settings and as fallbacks.
  Rationale: Existing routes, detail views, and older events still expect these fields. The scheduler can prefer division config when present and fall back to event config for backward compatibility.
  Date/Author: 2026-05-12 / Codex
- Decision: Do not add `leagueConfig` or `playoffConfig` JSON columns to `Divisions`.
  Rationale: League settings should remain explicit queryable columns, and playoff division settings already have a working persistence path through the existing playoff config serialization.
  Date/Author: 2026-05-12 / Codex

## Outcomes & Retrospective

Completed. League match parameters are now owned by division settings, split league divisions can differ for regular-season scheduling, and non-split single-division playoff rest time is read from the event playoff settings while regular-season rest time is read from the division settings.

## Context and Orientation

`src/app/events/[id]/schedule/components/EventForm.tsx` owns the large event edit form. The current Schedule Config section renders `LeagueFields`, and `LeagueFields` includes both weekly timeslot controls and league configuration controls. `src/app/discover/components/TournamentFields.tsx` renders playoff/tournament match-parameter controls. `src/server/scheduler/EventBuilder.ts` builds regular-season and playoff matches from scheduler objects in `src/server/scheduler/types.ts`. Event division detail JSON is normalized and persisted in `src/server/repositories/events.ts` and `src/app/api/events/[eventId]/route.ts`.

## Plan of Work

First, add a `LeagueDivisionConfig` type beside `PlayoffDivisionConfig`, copy it defensively in `Division`, and include it in scheduler serialization. Then normalize and preserve explicit league schedule fields on league division details in the API route and repository helper code. In EventForm, add scalar league schedule fields to `DivisionDetailForm` while using `divisionEditor.leagueConfig` only as local editor state, initialize it from the existing event-level league settings, and save the scalar fields with each league division. For single-division mode, render league configuration controls in Single Division Settings and bind them to `leagueData`. For split or multi-division mode, render those controls in the league division editor and bind them to `divisionEditor.leagueConfig`. Schedule Config will pass `showLeagueConfiguration={false}` to `LeagueFields` and stop rendering the separate non-split playoff configuration block.

Finally, update `EventBuilder` so regular-season scheduling asks the current division for games per opponent, duration, rest time, and set count. Playoff scheduling should continue to use playoff division config for split playoff divisions, and in single-division/non-split mode should use the default division's playoff config before falling back to legacy event fields.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site`.

Implement with focused patches to:

- `src/app/events/[id]/schedule/components/EventForm.tsx`
- `src/server/scheduler/types.ts`
- `src/server/scheduler/EventBuilder.ts`
- `src/server/scheduler/serialize.ts`
- `src/server/repositories/events.ts`
- `src/app/api/events/[eventId]/route.ts`
- Focused tests under `src/server/scheduler/__tests__` and existing EventForm tests as needed.

## Validation and Acceptance

Run focused scheduler and form tests, then run TypeScript:

    npm test -- --runTestsByPath src/server/scheduler/__tests__/leagueTimeSlots.test.ts
    npm test -- --runTestsByPath src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx
    npm test -- --runTestsByPath src/app/discover/components/__tests__/LeagueFields.test.tsx src/app/discover/components/__tests__/TournamentFields.test.tsx
    npm test -- --runTestsByPath src/lib/__tests__/eventService.test.ts src/server/scheduler/__tests__/serialize.test.ts
    npx tsc --noEmit

Acceptance is that a split league can save two league divisions with different regular-season settings, the scheduler uses those settings when generating each division's matches, and the Schedule Config section no longer exposes league or playoff match-parameter controls.

## Idempotence and Recovery

All changes are additive scalar division columns and compatible with older events that lack division-owned league schedule values. If a validation command fails, inspect only the failing surface and keep unrelated existing working-tree changes intact.

## Artifacts and Notes

This plan was created after source inspection showed the event-level scheduling fields were still the only regular-season scheduling source. Validation completed with focused Jest suites and TypeScript.

## Interfaces and Dependencies

Add `LeagueDivisionConfig` with optional `gamesPerOpponent`, `usesSets`, `matchDurationMinutes`, `setDurationMinutes`, `setsPerMatch`, `pointsToVictory`, and `restTimeMinutes`. `Division` should expose `leagueConfig: LeagueDivisionConfig | null`. `EventBuilder` should expose no new public API; its internal scheduling helpers should use a resolved regular-season config object derived from `division.leagueConfig` with event-level fallbacks.
