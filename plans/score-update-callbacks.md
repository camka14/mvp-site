```md
# Async score and match update callbacks for schedule scoring

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must be maintained in accordance with PLANS.md at `mvp-site/PLANS.md`.

## Purpose / Big Picture

Enable in-app scoring to fire the right backend updates at the right times. After this change:
- Every score change (point increment/decrement) triggers a non-blocking update for the match so backend state can trail live scoring.
- When a set is confirmed, we persist that set result and block advancement if the update fails.
- When a match finishes, we call the backend match-completion endpoint (Python `event_manager.update_match`) and ensure it succeeds.
A host/referee should be able to update scores in the schedule UI, see sets advance, and observe backend data updated without manual refresh.

## Progress

- [x] (2025-02-18 00:00Z) Drafted ExecPlan
- [x] (2025-02-18 00:45Z) Wired fire-and-forget score update callback on point changes
- [x] (2025-02-18 00:45Z) Awaited set-complete update with error handling and state refresh
- [x] (2025-02-18 00:45Z) Match completion call to Python `update_match` endpoint with success gating
- [ ] Validation steps executed and documented

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use existing services to hit match update endpoints rather than new API shape; add fire-and-forget wrapper plus awaited variant.
  Rationale: Minimizes surface change and leverages current tournament/league services.
  Date/Author: 2025-02-18 / Codex
- Decision: Default non-draw sports to minimum three sets when no config is present to keep progression available through third set in modal.
  Rationale: Users reported being unable to reach a third set; padding prevents early termination.
  Date/Author: 2025-02-18 / Codex

## Outcomes & Retrospective

- Pending implementation.

## Context and Orientation

Relevant frontend paths:
- `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` renders score editing controls.
- `src/app/events/[id]/schedule/page.tsx` wires match click handling and submits score updates via `tournamentService.updateMatch`.
- `src/app/events/[id]/schedule/components/TournamentBracketView.tsx` also calls `onScoreUpdate` when bracket matches are edited (if needed).
Backend:
- `mvp-build-bracket/src/event_manager.py` routes `/events/{eventId}/matches/{matchId}` to `entrypoints/update_match.update_match`.
- `mvp-build-bracket/src/entrypoints/update_match.py` applies match completion logic when scores/sets are provided.

Current gaps:
- Score changes only persist on explicit “Save Match” and are awaited.
- No fire-and-forget update on point changes.
- No explicit set-complete callback that blocks advancement.
- No guaranteed match-complete call to Python endpoint when a match finishes from the UI.

## Plan of Work

Milestone 1: Add callback props and plumbing
- Extend `ScoreUpdateModal` props to accept three async callbacks: `onScoreChange` (fire-and-forget), `onSetComplete` (awaited, returns success), `onMatchComplete` (awaited, returns success). Provide defaults to avoid breakage.
- Update schedule page wiring so these callbacks are passed down (and bracket view if it bypasses the modal).

Milestone 2: Implement fire-and-forget score update
- Add a helper in `tournamentService` (and league equivalent if needed) that posts partial match updates (team points / set results) without awaiting errors in the UI. Use `void` promise handling with try/catch that logs only.
- In `ScoreUpdateModal`, call `onScoreChange` whenever points change (increment/decrement) with the current match id and provisional points. Do not block UI; ignore errors.

Milestone 3: Set completion update with enforced success
- On set confirmation, invoke `onSetComplete` with the updated setResults/points. Await; if it fails, show an error and do not advance to next set.
- Ensure the awaited update uses the existing service (likely `tournamentService.updateMatch`) and surfaces errors via the modal.

Milestone 4: Match completion call to Python endpoint
- Detect match completion in `ScoreUpdateModal` after set confirmation/save. When complete, invoke `onMatchComplete` which calls the Python `/events/{eventId}/matches/{matchId}` route (or legacy task) and awaits success. If it fails, show error and keep modal open.
- Add a client helper (e.g., in `tournamentService` or a small fetch wrapper) to hit the backend endpoint with the required payload. Ensure it’s distinct from fire-and-forget.

Milestone 5: Validation
- Manual: run frontend, open a match, increment scores (observe no blocking), confirm set (must persist), finish match (backend call succeeds; no errors). Verify multi-set advancement works.
- Automated: add/adjust tests if existing harness covers score updates; otherwise rely on manual check and ensure no console errors.

## Concrete Steps

Commands (from `mvp-site` unless noted):
- Read/update files as above.
- If adding a helper to call Python endpoint, ensure URL and payload consistent with `event_manager.update_match` (method PATCH/POST on `/events/{eventId}/matches/{matchId}` with setResults/team points).
- Optional: run existing tests `npm test` or targeted Jest suite if present.

## Validation and Acceptance

- In dev server, update a match score:
  - Increment/decrement points: no modal blocking; background update attempted (log-only).
  - Confirm a set: persists via awaited update; if backend rejects, user sees error and cannot advance.
  - Complete match: backend `update_match` endpoint is called; on success modal closes/settles; on failure user is notified and match remains editable.
- No regression in existing match editing flows (calendar/bracket).

## Idempotence and Recovery

- Fire-and-forget calls are safe repeats. Awaited set/match updates retry-able by re-clicking confirm/save. If a final match completion call fails, user can retry from the modal without corrupting state.

## Artifacts and Notes

- Keep any new helper functions small and documented inline. Log errors in console for fire-and-forget; surface UI errors for awaited steps.

## Interfaces and Dependencies

- `ScoreUpdateModal` new props:
  - `onScoreChange?: (payload: { matchId: string; team1Points: number[]; team2Points: number[]; setResults: number[] }) => Promise<void> | void`
  - `onSetComplete?: (payload: same as above) => Promise<void>`
  - `onMatchComplete?: (payload: same as above & { eventId: string }) => Promise<void>`
- Service helper: in `tournamentService` (and/or `leagueService`), add `updateMatchScores(matchId, payload, { fireAndForget?: boolean })` and `completeMatch(eventId, matchId, payload)` that hits the Python endpoint and returns a promise to await in set/match completion.

Note: This document is a living plan; update `Progress`, `Decision Log`, `Surprises & Discoveries`, and `Outcomes & Retrospective` as work proceeds.
```
