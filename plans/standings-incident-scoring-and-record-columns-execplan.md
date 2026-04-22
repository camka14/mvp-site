# Align League Standings With Incident-Based Match Scoring

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

PLANS.md is checked into this repository at `PLANS.md`, and this document is maintained in accordance with that file.

## Purpose / Big Picture

After this change, league standings will derive match results from the newer match model instead of relying only on legacy score arrays. When an event is configured to record goals or points through `MatchIncident` rows, standings will calculate totals from those incidents. When that incident-driven mode is off, standings will keep using the legacy `team1Points` and `team2Points` arrays. The schedule page standings table will also show wins, losses, and draws instead of only draws and final points.

## Progress

- [x] (2026-04-22 03:33Z) Mapped the current standings pipeline across `src/server/scheduler/standings.ts`, `src/app/api/events/[eventId]/standings/shared.ts`, `src/lib/tournamentService.ts`, and `src/app/events/[id]/schedule/page.tsx`.
- [x] (2026-04-22 03:34Z) Confirmed the canonical match write path already treats incident-driven scoring as the source of truth by mutating `segments` from `MatchIncident.linkedPointDelta` and then syncing legacy arrays.
- [x] (2026-04-22 03:49Z) Added `src/lib/standingsMatchScoring.ts` so standings can derive totals and outcomes from incident-backed canonical scoring or legacy arrays based on match rules.
- [x] (2026-04-22 03:53Z) Updated backend league standings computation and the standings response DTOs to include wins and losses.
- [x] (2026-04-22 03:57Z) Updated the schedule page fallback standings reducer and table columns to render wins, losses, draws, and final points from the shared scorer.
- [x] (2026-04-22 04:07Z) Added regression tests and executed targeted Jest coverage plus `npx tsc --noEmit`.
- [x] (2026-04-22 04:26Z) Updated the public standings embed renderer and fixtures so the widget shows `W`, `L`, `D`, and `Final Pts` with parity to the schedule page.

## Surprises & Discoveries

- Observation: the backend standings engine still skips matches unless `setResults` contains only `1` or `2`, which can hide completed or drawn points-based matches when the newer scoring path does not express the result that way.
  Evidence: `src/server/scheduler/standings.ts` currently gates `computeLeagueStandings` with `isMatchScored(match)`.

- Observation: the schedule page already computes standings locally instead of trusting the backend response in every case, but that local reducer duplicates the same legacy score-array assumptions and only tracks draws.
  Evidence: `src/app/events/[id]/schedule/page.tsx` around the local `baseStandings` reducer and the standings table render.

- Observation: TypeScript inferred `{}` for synthetic incident-backed segment scores until the helper explicitly typed the working array as `CanonicalSegment[]`.
  Evidence: `npx tsc --noEmit` initially failed with `TS7053` in `src/lib/standingsMatchScoring.ts` and passed after typing the array.

## Decision Log

- Decision: implement one shared match-result helper in `src/lib` and consume it from both the backend standings engine and the client schedule page.
  Rationale: this avoids repeating outcome logic in two places and makes incident-based scoring support deterministic across server and client render paths.
  Date/Author: 2026-04-22 / Codex

- Decision: treat `resolvedMatchRules.pointIncidentRequiresParticipant === true` as the switch for incident-driven standings scoring.
  Rationale: the match write routes and `resolveMatchRules` already use that field as the canonical signal that points/goals must be captured through incidents.
  Date/Author: 2026-04-22 / Codex

## Outcomes & Retrospective

Standings now follow the intended score source split:
- incident-driven events (`pointIncidentRequiresParticipant === true`) derive standings totals from `MatchIncident.linkedPointDelta` grouped by segment;
- non-incident events continue using legacy `team1Points`, `team2Points`, and `setResults`.

The schedule page standings table and the public standings embed now both expose `W`, `L`, `D`, and `Final Pts`, and the server standings response plus the page-local fallback reducer use the same shared outcome logic.

## Context and Orientation

League standings are computed on the server in `src/server/scheduler/standings.ts`. The API layer in `src/app/api/events/[eventId]/standings/shared.ts` turns those server rows into the JSON response consumed by the schedule page through `src/lib/tournamentService.ts`. The schedule page in `src/app/events/[id]/schedule/page.tsx` also derives a local standings snapshot from the loaded event data when it has enough information to do so.

The newer match model stores score state in two related places. `MatchSegment` rows hold per-segment scores and winner metadata. `MatchIncident` rows can increment those scores through `linkedPointDelta`, which is used for sports that want goal or point entries to be captured as incidents. The match write routes in `src/app/api/events/[eventId]/matches/[matchId]/route.ts` and `src/app/api/events/[eventId]/matches/[matchId]/score/route.ts` already sync legacy arrays from segments after updates so older consumers continue to work. Standings still need to be updated to consume the canonical source directly.

## Plan of Work

First, add a shared helper under `src/lib` that accepts a structural match shape and returns the participant ids, total scored points, segment wins, and resolved outcome for standings. That helper must prefer incident totals when `pointIncidentRequiresParticipant` is enabled, and otherwise it should fall back to the existing legacy score arrays. The helper must remain safe for both client and server imports, so it cannot depend on server-only modules.

Next, update `src/server/scheduler/standings.ts` to replace the existing set-result-only derivation with the shared helper. While doing so, extend `LeagueStanding` to include `wins` and `losses` so the backend response can power fuller standings displays.

Then update `src/app/api/events/[eventId]/standings/shared.ts` and `src/lib/tournamentService.ts` so the wins and losses values are part of the standings DTO consumed by the page.

Finally, update `src/app/events/[id]/schedule/page.tsx` so its local fallback standings reducer uses the same helper and so the standings table renders `W`, `L`, `D`, and `Final Pts`.

## Concrete Steps

From repository root `C:\Users\samue\Documents\Code\mvp-site`:

1. Add the shared helper and its unit tests.
2. Update server standings computation and response types.
3. Update the schedule page reducer and table columns.
4. Run targeted tests and `npx tsc --noEmit`.

## Validation and Acceptance

Acceptance is met when:
- incident-driven matches contribute the correct totals and outcomes to standings even if legacy score arrays are stale;
- legacy matches still produce the same standings points as before;
- the schedule page standings table shows wins, losses, draws, and final points;
- targeted Jest coverage passes; and
- `npx tsc --noEmit` passes.

## Idempotence and Recovery

These changes are additive and can be applied repeatedly without schema changes. If the shared helper introduces a regression, the safest rollback is to revert the helper consumers in `src/server/scheduler/standings.ts` and `src/app/events/[id]/schedule/page.tsx` together so server and client do not diverge again.

## Artifacts and Notes

Validation commands and outcomes:

    npx jest src\lib\__tests__\standingsMatchScoring.test.ts src\app\api\events\__tests__\standingsRoutes.test.ts src\lib\__tests__\standingsRows.test.ts --runInBand
    PASS src/lib/__tests__/standingsMatchScoring.test.ts
    PASS src/app/api/events/__tests__/standingsRoutes.test.ts
    PASS src/lib/__tests__/standingsRows.test.ts

    npx tsc --noEmit
    Exit code 0

    npx jest --runInBand --runTestsByPath "src/app/embed/[slug]/[kind]/__tests__/route.test.ts" "src/server/__tests__/publicOrganizationCatalog.test.ts"
    PASS src/app/embed/[slug]/[kind]/__tests__/route.test.ts
    PASS src/server/__tests__/publicOrganizationCatalog.test.ts

## Interfaces and Dependencies

Add a new shared helper in `src/lib/standingsMatchScoring.ts` with a structural interface similar to:

    export type StandingsMatchOutcome = 'team1' | 'team2' | 'draw' | null;

    export type DerivedStandingsMatchResult = {
      team1Id: string | null;
      team2Id: string | null;
      team1Total: number;
      team2Total: number;
      team1Wins: number;
      team2Wins: number;
      allSegmentsResolved: boolean;
      usesIncidentScoring: boolean;
      outcome: StandingsMatchOutcome;
    };

    export const deriveStandingsMatchResult(match: StandingsMatchLike): DerivedStandingsMatchResult;

Revision note (2026-04-22): Updated after the public-widget parity follow-up to record the embed renderer change and its validation evidence.
