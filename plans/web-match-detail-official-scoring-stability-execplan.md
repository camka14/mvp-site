# Stabilize Web Match Detail Official Scoring

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

Officials using the web match-details modal should be able to tap `+` and `-` rapidly without the visible score snapping back to an older database value and then forward again. After this change, direct score edits in `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` stay local-first, `/score` writes are debounced to a single absolute-score request, and segment confirmation still remains the authoritative full-match save path.

The observable result is in the schedule page match-details modal. Open a match as an official, tap `+` several times quickly, and the score should keep climbing locally without rolling back between taps. Confirming the segment should still use the latest local score even if a debounced direct-score sync previously failed or was still waiting to fire.

## Progress

- [x] (2026-04-22 20:05Z) Read `AGENTS.md` and `PLANS.md`, located the web match-details scoring flow in `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`, and confirmed the current direct-score path still posts on every tap.
- [x] (2026-04-22 20:12Z) Traced the schedule page integration in `src/app/events/[id]/schedule/page.tsx` and confirmed the modal is the place where local score rollback happens because incoming `match` props re-seed local segment state.
- [x] (2026-04-22 21:18Z) Implemented debounced direct-score syncing plus local segment override preservation in `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`.
- [x] (2026-04-22 21:27Z) Updated regression coverage in `src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx` and the affected schedule-page integration test in `src/app/events/[id]/schedule/__tests__/page.test.tsx`.
- [x] (2026-04-22 21:33Z) Ran targeted Jest validation for the modal suite and the schedule-page suite and recorded the passing commands below.

## Surprises & Discoveries

- Observation: The modal already has a durable incident retry queue backed by `localStorage`, but the direct-score path did not share that protection and immediately posted on every tap.
  Evidence: The original `updateScore` implementation in `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` built a `scoreSet` payload and chained `emit(nextPayload)` directly for each `+/-` press.

- Observation: The rollback came from the modal's own prop-to-state synchronization, not from a missing backend capability. The `/api/events/{eventId}/matches/{matchId}/score` route already accepts absolute score writes for one team and segment.
  Evidence: `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` recomputes `segments` from `match` inside a `useEffect`, and `src/app/api/events/[eventId]/matches/[matchId]/score/route.ts` already persists absolute points.

- Observation: Jest path matching treats App Router route folders like `[id]` as pattern syntax, so the route-scoped test files must be run with `--runTestsByPath` instead of plain positional patterns.
  Evidence: `npm test -- --runInBand src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx ...` returned “No tests found,” while `npm test -- --runInBand --runTestsByPath ...` passed.

## Decision Log

- Decision: Fix the web issue in the modal state layer instead of changing the backend contract.
  Rationale: The backend `/score` endpoint is already the correct absolute-score API. The visible rollback came from client-side state rehydration while the modal was open.
  Date/Author: 2026-04-22 / Codex

- Decision: Preserve a modal-local segment override after local score edits instead of trusting incoming `match` segment state for the rest of the open session.
  Rationale: The repository-backed ignore-match behavior used in `mvp-app` does not exist here. A modal-local override is the web equivalent that keeps the on-screen score stable while official scoring is in progress.
  Date/Author: 2026-04-22 / Codex

- Decision: Debounce direct `/score` writes to 500 ms and cancel pending debounced posts before segment confirmation or match finish.
  Rationale: This matches the requested behavior, reduces duplicate writes during rapid taps, and lets segment confirmation remain the authoritative full update.
  Date/Author: 2026-04-22 / Codex

## Outcomes & Retrospective

The web match-details modal now behaves like the requested mobile fix: non-player `+/-` scoring is local-first, `/score` writes are debounced to one absolute-score sync after 500 ms, and incoming `match` prop refreshes no longer overwrite locally edited segment scores while the modal remains open. Segment confirmation and timed-match finish both cancel pending debounced score posts before sending the authoritative full-match update.

The regression coverage now exercises the failure modes that originally caused the visible rollback: rapid taps coalescing, stale prop rerenders, older delayed syncs, failed direct-score writes, and confirmation canceling a pending debounced post. No backend contract change was required.

## Context and Orientation

The web schedule page renders the match-details scoring modal from `src/app/events/[id]/schedule/page.tsx`, passing `handleScoreChange` and `handleSetComplete` into `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`. The modal keeps its own `segments` state for the visible score table and score cards, but it also re-seeded that state from the incoming `match` prop in a `useEffect`. That was the rollback source: a direct score POST returned or another refresh rehydrated `match`, and the modal overwrote the locally incremented score with an older value before the next write caught up.

In this repository, a "segment" is the per-set or per-period score record stored in `MatchSegment`. A "direct score write" is the `POST /api/events/{eventId}/matches/{matchId}/score` call made through `tournamentService.setMatchScore(...)`. An "incident queue" is the modal's existing retry mechanism for incident create, update, and delete operations, backed by `localStorage` so retries survive closing and reopening the modal.

The important files are:

- `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx`: the modal UI and local scoring state.
- `src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx`: focused regression coverage for the modal.
- `src/app/events/[id]/schedule/__tests__/page.test.tsx`: schedule-page integration coverage that exercises the modal's `Match Details` path.

## Plan of Work

Update `ScoreUpdateModal.tsx` so direct `+/-` edits stop using the old fire-on-every-tap promise chain. Replace it with a debounced direct-score sync that stores the latest absolute score payload, resets a 500 ms timer on each tap, and sends exactly one `/score` request after the user pauses. When a tap happens, update the visible `segments` immediately and record a local segment override so later `match` prop refreshes cannot overwrite those local score values while the modal remains open.

Keep the incident queue unchanged. Incident create, update, and delete actions should continue to use the existing local queue and retry behavior. Before `confirmSegment()` and `saveMatch()` perform their authoritative full-match writes, cancel any still-pending debounced direct-score timer so an older delayed `/score` request cannot fire after the confirmation write.

Update the modal tests to prove the new direct-score behavior. The tests must cover rapid taps coalescing into one debounced score write, local score stability across stale prop rerenders, older delayed responses not causing visible rollback, failed direct-score syncs keeping the local score intact, and segment confirmation canceling a pending debounced score post while still using the latest local score.

## Concrete Steps

From `C:\Users\samue\Documents\Code\mvp-site`:

1. Edit `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` to add the direct-score debounce state, local segment override helpers, and confirmation invalidation.
2. Edit `src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx` to update the existing direct-score expectations and add new debounce and stale-rerender regressions.
3. Update `src/app/events/[id]/schedule/__tests__/page.test.tsx` so the route-level score-write assertion advances the debounce timer before asserting on the `/score` request.
4. Run:

    npm test -- --runInBand --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx"
    npm test -- --runInBand --runTestsByPath "src/app/events/[id]/schedule/__tests__/page.test.tsx"

5. Record the result in this ExecPlan and keep the `Progress` section synchronized with what actually happened.

## Validation and Acceptance

Acceptance is behavioral:

- In the modal, multiple rapid `+` taps for non-player-recorded scoring produce one debounced `/score` request containing the final absolute points.
- Rerendering the modal with an older `match` prop while the modal still has local direct-score edits does not change the visible score back to the older value.
- Confirming a segment after a direct-score edit uses the latest local score and does not allow a still-pending debounced `/score` request to fire afterward.
- The targeted Jest tests in `ScoreUpdateModal.test.tsx` and the affected schedule-page test pass.

## Idempotence and Recovery

The changes are source-only and safe to rerun. If a test fails midway, re-run the same Jest command after fixing the code. No database migration or destructive step is involved. If the debounce behavior causes an unexpected regression, the quickest rollback is to revert the touched modal and test files together so the old direct-score path and its matching expectations return in sync.

## Artifacts and Notes

Validation commands run from `C:\Users\samue\Documents\Code\mvp-site`:

    npm test -- --runInBand --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx"
    npm test -- --runInBand --runTestsByPath "src/app/events/[id]/schedule/__tests__/page.test.tsx"

Both commands passed. The page suite still emits existing expected `console.error` noise from mocked failure-path tests in `page.test.tsx`, and the modal suite still emits existing expected `console.warn` noise from mocked offline incident and direct-score tests. Those warnings do not indicate a new failure.

## Interfaces and Dependencies

The modal continues to use the existing `ScorePayload` shape passed through `onScoreChange`, `onSetComplete`, and `onMatchComplete`, with only an internal optional `directScoreVersion` field added for local debounce bookkeeping. The backend API remains unchanged and still uses:

    tournamentService.setMatchScore(eventId, matchId, {
      segmentId?: string | null,
      sequence: number,
      eventTeamId: string,
      points: number,
    })

Incident retry behavior continues to use the existing `MatchIncidentOperation` queue stored under the `bracketiq:pending-match-incidents:*` key in browser `localStorage`.

Revision note: Created this ExecPlan after tracing the current web match-details scoring flow so implementation could proceed with the same local-first and debounced behavior already planned for `mvp-app`.

Revision note: Updated the ExecPlan after implementation to record the chosen modal-local score override approach, the `--runTestsByPath` Jest requirement for `[id]` route tests, and the passing validation commands.
