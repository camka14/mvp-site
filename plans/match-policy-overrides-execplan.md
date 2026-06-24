# Match-level policy overrides for managed matches

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained so a future contributor can continue from the current working tree without needing prior chat context.

## Purpose / Big Picture

Event managers and assistants need to change one match without changing the whole event. After this work, a manager can open a specific match and override its set count, score targets, and match-rule timing details. Those match-specific settings remain attached to that match when the match is locked, updated, scored, or rescheduled. The visible proof is that score controls and validation use the match's own settings instead of falling back to the event's default match policy.

The product has two clients. `mvp-site` is the Next.js web app and owns the Prisma-backed API. `mvp-app` is the Kotlin Multiplatform mobile app and must deserialize, edit, send, and honor the same match-level policy data.

## Progress

- [x] (2026-06-24 15:32Z) Audited both repos and confirmed `Matches.matchRulesSnapshot` already exists as a JSON column on the web backend and is already exposed to mobile as `matchRulesSnapshot`.
- [x] (2026-06-24 15:32Z) Confirmed the single and bulk match PATCH routes do not currently accept or apply match-policy fields.
- [x] (2026-06-24 15:32Z) Confirmed scoring consumers still read set point targets from event or division settings.
- [x] (2026-06-24 16:55Z) Implemented web backend normalization and persistence for match-level policy overrides in single and bulk match routes.
- [x] (2026-06-24 16:55Z) Updated web score and match-edit surfaces to prefer match-level score targets and expose match-specific rule controls.
- [x] (2026-06-24 16:55Z) Updated mobile DTO/model/repository and scoring consumers to carry and prefer match-level score targets, including mobile edit controls.
- [x] (2026-06-24 16:55Z) Added focused regression tests for backend policy normalization and mobile score-target precedence.
- [x] (2026-06-24 17:04Z) Ran `mvp-site` validation: `npx tsc --noEmit --pretty false` and focused Jest passed.
- [ ] Run `mvp-app` validation after the existing `GuideHost.kt` compile error is fixed.

## Surprises & Discoveries

- Observation: No schema migration is required for the first implementation because `Matches.matchRulesSnapshot` is already a JSON column and `saveMatches` already persists it.
  Evidence: `prisma/schema.prisma` has `matchRulesSnapshot Json?` on `Matches`, and `src/server/repositories/events.ts` writes `matchRulesSnapshot` in `saveMatches`.
- Observation: Rescheduling existing matches should preserve the policy once it is stored on the `Match` object.
  Evidence: `src/server/scheduler/reschedulePreservingLocks.ts` reuses existing `Match` instances, separates locked and unlocked matches, and schedules by each match's current start/end duration rather than rebuilding all match objects from event defaults.
- Observation: The refactored current `main` already freezes a contextual snapshot when scoring/incident operations begin, so explicit match-policy updates need to run before those validations and should not clear snapshots when omitted.
  Evidence: `src/app/api/events/[eventId]/matches/[matchId]/route.ts` calls `shouldFreezeMatchRulesSnapshot` only when the match does not already have a snapshot.
- Observation: Mobile validation cannot currently compile because `GuideHost.kt` has a pre-existing type mismatch unrelated to match policy changes.
  Evidence: `./gradlew :composeApp:testDebugUnitTest --tests "com.razumly.mvp.matchDetail.MatchContentComponentTest"` and `./gradlew :composeApp:compileCommonMainKotlinMetadata` both fail at `GuideHost.kt:201` and `GuideHost.kt:298` before running the focused test.

## Decision Log

- Decision: Store match-level set count and score targets in the existing `matchRulesSnapshot` JSON object instead of adding scalar columns.
  Rationale: The repo already treats `matchRulesSnapshot` as durable match-local policy, web and mobile already serialize it, and avoiding a migration keeps this scoped around existing discount-code schema work in the dirty tree.
  Date/Author: 2026-06-24 / Codex
- Decision: Add optional `setPointTargets` to the resolved match rules shape.
  Rationale: `segmentCount` already represents set count, but score limits are currently stored outside rules on event or division records. A named optional array lets scoring controls and validators prefer match policy without guessing from event fields.
  Date/Author: 2026-06-24 / Codex

## Outcomes & Retrospective

No implementation outcome yet. The intended final state is that a manager can save a custom match policy, reload the match, lock and reschedule the event, and still see score controls enforce the match-specific set count and score targets.

## Context and Orientation

In this plan, a "match policy" means the rules that define how a match is played or scored. The relevant fields are set count, score targets for each set, scoring model, segment label, and timekeeping information. A "segment" is the stored generic term for a set, half, period, or inning. For set-based sports, `segmentCount` is the number of sets in the match and `setPointTargets` will be the per-set points needed to win.

On the web backend, matches are stored in Prisma's `Matches` model in `prisma/schema.prisma`. The existing JSON field `matchRulesSnapshot` is loaded in `src/server/repositories/events.ts` and saved again by `saveMatches` in the same file. The single-match route is `src/app/api/events/[eventId]/matches/[matchId]/route.ts`; it updates one match. The bulk match route is `src/app/api/events/[eventId]/matches/route.ts`; it creates, updates, and deletes schedule or bracket matches in batches. Web score display and validation happen in `src/app/events/[id]/schedule/components/ScoreUpdateModal.tsx` and `src/app/events/[id]/schedule/components/MatchEditModal.tsx`.

On mobile, `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt` is the local match model. Network match update DTOs live in `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/network/dto/MatchDtos.kt`, and `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/data/MatchRepository.kt` sends match updates. Match scoring behavior lives mainly in `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt`, while schedule-card set display is in `composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/composables/MatchCard.kt`.

Both repos are dirty before this work. In `mvp-site`, discount-code changes already touch `prisma/schema.prisma` and payment routes. In `mvp-app`, unrelated membership/highlight changes already touch `MatchMVP.kt`, `MatchCard.kt`, and `MatchContentComponent.kt`. Do not revert those changes. Keep edits additive and inspect diffs before staging or committing.

## Plan of Work

First, extend the shared match rule types so `matchRulesSnapshot` can carry optional `setPointTargets`. In `mvp-site`, update both frontend types in `src/types/index.ts` and scheduler/server types in `src/server/scheduler/types.ts` if needed. In `mvp-app`, update `ResolvedMatchRulesMVP` in `MatchMVP.kt` to deserialize the same optional list with a safe default.

Second, add a small backend helper in `src/server/matches/matchPolicy.ts` or a nearby existing match module. The helper should normalize a partial policy payload by taking the current match's resolved rules, applying an optional set count, normalizing point targets to positive integers, resizing target arrays to the set count, and producing a `ResolvedMatchRules`-compatible snapshot with `setPointTargets`. It should not mutate event-level settings.

Third, extend `src/app/api/events/[eventId]/matches/[matchId]/route.ts` so host/admin match updates can include either `matchRulesSnapshot` or a smaller `matchPolicy` object. The route should validate policy changes, apply them to `targetMatch.matchRulesSnapshot`, set `targetMatch.resolvedMatchRules` to the same snapshot, and resize empty score arrays only when needed. It must not discard an existing snapshot when a later lock, score, or lifecycle update omits policy.

Fourth, extend `src/app/api/events/[eventId]/matches/route.ts` so bulk updates and creates carry the same policy fields. This is needed because the schedule editor uses bulk match updates for some create/edit flows.

Fifth, update web scoring consumers. `ScoreUpdateModal.tsx`, `MatchEditModal.tsx`, and server-side `src/server/matches/setScoringRules.ts` should prefer `matchRulesSnapshot.setPointTargets` before event, division, or playoff point arrays. Set count should prefer `matchRulesSnapshot.segmentCount` when the snapshot exists.

Sixth, update mobile. Add `setPointTargets` to `ResolvedMatchRulesMVP`, `MatchDTO`, `MatchApiDto`, `MatchUpdateDto`, bulk update DTOs if needed, and `MatchRepository.updateMatch`. Then update `resolvePointsToVictory` and display set count helpers to prefer `match.matchRulesSnapshot.setPointTargets` and `match.matchRulesSnapshot.segmentCount`.

Seventh, add focused regression tests. On web, test the helper and route or repository path that persists a custom snapshot and then saves again without policy fields. Add a scoring test that proves match-level point targets override event point targets. On mobile, add or extend common tests around `resolvePointsToVictory` or match score controls to prove match-level targets are used.

## Concrete Steps

Work in `/Users/elesesy/StudioProjects/mvp-site` for the web repository and `/Users/elesesy/StudioProjects/mvp-app` for the mobile repository.

For web validation, run targeted tests first:

    cd /Users/elesesy/StudioProjects/mvp-site
    npx jest src/server/matches/__tests__/setScoringRules.test.ts src/app/events/[id]/schedule/components/__tests__/ScoreUpdateModal.test.tsx --runInBand

Then run type checking if time allows:

    cd /Users/elesesy/StudioProjects/mvp-site
    npx tsc --noEmit

For mobile validation, run the focused common test suite containing match detail scoring tests:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:commonTest --tests "com.razumly.mvp.matchDetail.MatchContentComponentTest"

If Gradle test filtering is not supported in the local setup, run:

    cd /Users/elesesy/StudioProjects/mvp-app
    ./gradlew :composeApp:commonTest

## Validation and Acceptance

Acceptance for the web backend is that a PATCH request to one match can save a policy like "best of 3, points 25, 25, 15", and a later PATCH that only changes `locked`, score, schedule time, or lifecycle status keeps the existing `matchRulesSnapshot.setPointTargets` and `segmentCount`.

Acceptance for web scoring is that, when an event's default target is 21 but the match snapshot target is 25, score controls and server validation allow scoring to 25 and do not use 21 for that match.

Acceptance for mobile is that `MatchMVP` can deserialize the match snapshot with `setPointTargets`, send it back when a manager edits a match, and scoring helpers use the match snapshot before the event's `pointsToVictory`, `winnerBracketPointsToVictory`, or `loserBracketPointsToVictory`.

## Idempotence and Recovery

All edits are additive or narrow behavior changes. There is no database migration in this plan. If validation fails, rerun the targeted test after each fix. Because both repos started dirty, do not use `git reset`, broad checkout commands, or broad staging. Inspect `git diff --stat` and stage only files that belong to this plan if a commit is requested later.

## Artifacts and Notes

Initial audit facts:

    mvp-site/prisma/schema.prisma: Matches has matchRulesSnapshot Json?
    mvp-site/src/app/api/events/[eventId]/matches/[matchId]/route.ts: updateSchema does not accept policy fields yet.
    mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/dataTypes/MatchMVP.kt: MatchMVP already has matchRulesSnapshot and resolvedMatchRules.

## Interfaces and Dependencies

At the end of implementation, `ResolvedMatchRules` and `ResolvedMatchRulesMVP` should include:

    setPointTargets?: number[]   // TypeScript optional property
    val setPointTargets: List<Int> = emptyList()   // Kotlin default

The single-match PATCH route should accept:

    matchPolicy?: {
      scoringModel?: 'SETS' | 'PERIODS' | 'INNINGS' | 'POINTS_ONLY'
      segmentCount?: number
      setPointTargets?: number[]
      matchDurationMinutes?: number
      setDurationMinutes?: number
    }

The route may also accept `matchRulesSnapshot` for clients that already hold a resolved snapshot. If both are present, the narrower `matchPolicy` fields should be applied over the snapshot.

Revision note 2026-06-24: Created the initial plan after auditing both repositories. The plan chooses the existing JSON snapshot path to avoid a migration and preserve unrelated schema work already present in the checkout.
