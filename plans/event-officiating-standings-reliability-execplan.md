# Make live standings and officiating controls reliable

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan is maintained in accordance with `PLANS.md` at the `mvp-site` repository root.

## Purpose / Big Picture

During a live tournament, organizers must be able to enter pool standings adjustments without values becoming zero, moving to another team, or being replaced by stale state. Administrators must be able to repair any match directly, assigned human officials must have a reliable check-in flow, team officials must be able to start and score without an unnecessary official check-in prompt, and team event check-in must remain visible across navigation. The finished behavior is demonstrated through focused server and UI tests plus a local live-event scenario that edits several pool standings values, saves them, reloads the pool, and observes the exact same values.

## Progress

- [x] (2026-07-12 04:22Z) Reconciled `origin/main` and `origin/codex/admin-score-edit-hotfix` into the local audit branch at merge commit `485ab34c`, preserving existing worktree changes.
- [x] (2026-07-12 04:22Z) Traced the web pool-standings draft, save request, server persistence, and reload path.
- [x] (2026-07-12 05:05Z) Added regressions for empty standings input, explicit zero, absent draft keys, rapid final edit plus save, stable row identity, exact readback, duplicate team updates, and out-of-pool updates.
- [x] (2026-07-12 05:05Z) Implemented lossless standings draft parsing, stable row ordering during edits, team-specific validation, synchronous save snapshots, exact save/readback reconciliation, and stricter server validation.
- [ ] Carry platform-admin capability through the mobile auth model and expose unrestricted match repair controls without weakening official permissions.
- [x] (2026-07-12 06:05Z) Separated assigned-human-official check-in from team-official readiness and added authorized team check-in controls on Event Details across web authorization and mobile UI.
- [x] (2026-07-12 06:50Z) Moved active-event team check-in prompting to mobile app-level state so it survives navigation, reads manager-scoped check-in status, and retries transient read failures.
- [ ] Reconcile the remaining mobile set-confirmation and operation-outbox fixes, then validate reconnect and repeated-confirmation scenarios.
- [ ] Run focused web/mobile tests, type checks, and a local end-to-end live-event exercise; record the evidence here.

## Surprises & Discoveries

- Observation: The standings input handler converts every string with `Number(value)`, so Mantine's empty-string value becomes numeric zero.
  Evidence: `src/app/events/[id]/schedule/page.tsx` uses `Number(value)` in `handleStandingsOverrideChange`; JavaScript evaluates `Number('')` as `0`.
- Observation: Draft point edits are used immediately by the standings sort, so editing one team can move its input row before the organizer finishes editing the remaining teams.
  Evidence: `getDraftStandingsPoints` feeds the `standings` memo before the sort comparator runs.
- Observation: The server standings PATCH is an incremental, event-locked update and does not itself replace unrelated team overrides.
  Evidence: `src/app/api/events/[eventId]/standings/route.ts` calls `applyPointsOverrideUpdates` under `acquireEventLock`.
- Observation: A draft object that omitted a team was previously interpreted as an instruction to clear that team's existing override.
  Evidence: The prior save reducer emitted `{ points: null }` whenever `standingsDraftOverrides[row.teamId]` was missing but a persisted override existed.
- Observation: A React state update from the final `NumberInput` change could still be pending when the Save callback captured its render-time state.
  Evidence: The old callback depended on `standingsDraftOverrides`; the new implementation mirrors edits synchronously into `standingsDraftOverridesRef` and snapshots that ref at save time.
- Observation: Event officials could read team arrivals but could not record them because the shared write helper only accepted the target team's manager or coach.
  Evidence: `GET /api/events/[eventId]/team-check-ins` used event-official access, while `checkInTeam` returned 403 before the correction.

## Decision Log

- Decision: Fix standings entry and readback before the broader officiating work.
  Rationale: Incorrect pool standings can seed the wrong teams into a live bracket, making this the highest-impact data-integrity issue.
  Date/Author: 2026-07-12 / Codex
- Decision: Treat an empty or incomplete number input as an unsaved invalid draft, never as zero and never as a request to clear an override.
  Rationale: Zero is a legitimate explicit result, while clearing text is a transient editing state. Conflating them silently corrupts intent.
  Date/Author: 2026-07-12 / Codex
- Decision: Keep row order stable while drafts are being edited and apply ranking changes after a successful server readback.
  Rationale: Organizers commonly edit several teams in sequence; inputs must not move underneath them.
  Date/Author: 2026-07-12 / Codex
- Decision: The server response after a standings PATCH is authoritative, and the client must compare it with the submitted snapshot before reporting success.
  Rationale: A success message is unsafe if the persisted values differ from what the organizer submitted.
  Date/Author: 2026-07-12 / Codex

## Outcomes & Retrospective

The web standings integrity milestone is complete. Empty input can no longer become zero, explicit zero remains valid, rows do not move while edits are in progress, missing draft keys do not clear saved adjustments, the final synchronous edit is included in Save, and the server rejects duplicate or cross-pool team updates. Focused validation passed: 14 standings/helper route tests, all 69 schedule-page tests, `npx tsc --noEmit`, and `git diff --check`. The server now authorizes event staff and active officials to record arrival for a registered team and lets team managers read their own authoritative arrival state. The companion mobile implementation adds both Event Details actions and a global prompt. The latest cross-repo pass completed 16 focused web tests and 98 focused mobile tests without failures.

## Context and Orientation

The web application is `/Users/elesesy/StudioProjects/mvp-site`. The mobile application is `/Users/elesesy/StudioProjects/mvp-app`. The web schedule page owns pool and league standings state in `src/app/events/[id]/schedule/page.tsx`. The visual table is `src/app/events/[id]/schedule/schedulePage/StandingsTabPanel.tsx`. `src/lib/tournamentService.ts` sends standings requests. `src/app/api/events/[eventId]/standings/route.ts` persists absolute final-points overrides to the Prisma `Divisions.standingsOverrides` JSON field and returns a recomputed standings response.

An absolute final-points override is the organizer-selected final standings point total for a team. It is not a delta. A draft is the value currently being edited in the browser before the server acknowledges it. A readback is the response returned by the server after a write; it is authoritative because it was computed from the transaction that persisted the change.

Mobile official behavior is primarily in `composeApp/src/commonMain/kotlin/com/razumly/mvp/matchDetail/MatchContentComponent.kt` and `MatchDetailScreen.kt`. Event-level prompts and standings are owned by `eventDetail/DefaultEventDetailComponent.kt`. The current mobile `AuthAccount` omits the server's `isAdmin` session value. The backend match mutation routes already use `canManageEvent`, which recognizes platform administrators, event hosts, assistant hosts, and organization event managers.

There are two different check-ins. Team event check-in records that a participating team has arrived. Official match check-in records that an assigned human official is present for a specific match. They must not share prompts or permission rules. A team assigned to officiate another match is called a team official in the existing model; under the desired behavior, it does not need the human-official check-in prompt.

## Plan of Work

First extract the standings draft normalization and update-building logic from the schedule page into a small pure TypeScript module under `src/app/events/[id]/schedule/schedulePage/`. The module will preserve empty/incomplete input as invalid draft state, distinguish explicit zero from empty text, build updates from an immutable snapshot, and verify the server readback. The table will receive a separate input-value accessor so invalid raw text can remain visible without being converted to zero. Draft values will not participate in row sorting until a save succeeds. The save callback will read from a synchronously maintained ref so the final field edit cannot be missed by a rapid Save click. The server will reject duplicate team IDs and teams outside the selected division instead of silently accepting ambiguous updates.

Second establish a shared mobile capability model that carries `isAdmin` from `AuthSessionDto` into authenticated app state. Event and match screens will use explicit capabilities for unrestricted management, assigned-human-official actions, and team-official actions. Administrators will receive direct numeric match repair controls and check-in toggles; they will not be gated by match start or official windows.

Third remove the human-official prompt for team officials and allow them to start and score immediately. Assigned human officials will retain their per-slot check-in. Event Details will show team-arrival controls to authorized assigned officials and administrators, and server routes will verify assignment and target-team scope while recording the actor.

Fourth lift event-team prompt evaluation into an app-level coordinator. It will derive active events and managed teams, retry transient failures, preserve a visible manual action after dismissal, and avoid prompting officials merely because they are assigned to officiate.

Finally reconcile the mobile operation-outbox and authoritative finalization changes already present on `codex/critical-audit-remediation`. Run offline/reconnect and repeated Confirm Set tests to prove that local state cannot overwrite a server-finalized match.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, run the standings regressions with:

    npm test -- --runInBand --runTestsByPath 'src/app/events/[id]/schedule/schedulePage/__tests__/standingsOverrideDraft.test.ts' 'src/app/events/[id]/schedule/__tests__/page.test.tsx' 'src/app/api/events/__tests__/standingsRoutes.test.ts'

Run the focused match and access regressions with:

    npm test -- --runInBand --runTestsByPath 'src/app/api/events/__tests__/standingsRoutes.test.ts' 'src/server/matches/__tests__/legacyOfficialCheckIn.test.ts' 'src/app/events/[id]/schedule/__tests__/page.test.tsx'

Run the web type check with:

    npx tsc --noEmit

From `/Users/elesesy/StudioProjects/mvp-app`, run focused mobile tests with a usable manifest API-key placeholder and without starting the local backend:

    ./gradlew :composeApp:testDebugUnitTest --tests 'com.razumly.mvp.matchDetail.MatchContentComponentTest' -Pmvp.startBackend=false

The mobile command currently fails before test execution if the Android manifest has no `MAPS_API_KEY` value. Fix the test build configuration rather than placing a real secret in source.

## Validation and Acceptance

The standings milestone is accepted when a test enters final points for at least three pool teams, including explicit zero, while rows would rank differently; the row identities remain stable until save, the exact last edit is included in the PATCH body, and reload returns the same values. Clearing a field must block save with a team-specific message and must never submit zero or null. A server test must prove that duplicate team updates and teams outside the selected division are rejected.

The admin milestone is accepted when a platform admin who is not host, assistant host, assigned official, or team member can open a match, directly set per-set points, edit official check-in state, and save before start, after completion, and outside the official window. A normal assigned official must still obey the official window and check-in rules.

The check-in milestone is accepted when an assigned team official sees no official check-in modal and can start and score, while an assigned human official must check in. That human official can check in both participating teams from Event Details, and an unrelated user cannot. A team manager sees the active-event arrival prompt after navigating away from Event Details and can retry after a transient network failure.

The synchronization milestone is accepted when confirming a set offline queues one ordered operation, reconnecting applies it once, and the locally stored match equals the authoritative finalized server response without reverting completion, winner, scores, or actual end time.

## Idempotence and Recovery

All database writes remain incremental and event-locked. The work must not rewrite live standings as part of testing. Local tests use fixtures only. If a merge or test exposes unrelated dirty-tree work, preserve it and stage only explicit paths. Before each cross-repository milestone, compare the relevant files and HEAD with `/Users/elesesy/StudioProjects/mvp-site` and `/Users/elesesy/StudioProjects/mvp-app`; do not reset either dirty tree.

## Artifacts and Notes

The hotfix merge at `485ab34c` includes the server compatibility and live-match safeguards from `da0df305`, `3dc7000f`, `381a7d02`, `c251c9cb`, `96c75187`, `2d23ed81`, `a310ad8c`, and `7f0316fc`. Post-merge focused tests passed before this plan began. The new standings regression transcript will be added after implementation.

## Interfaces and Dependencies

The standings helper will expose typed functions for normalizing Mantine `NumberInput` values, constructing `{ teamId, points }` updates, and comparing a submitted snapshot with `LeagueStandingsDivisionResponse.standingsOverrides`. It must not import React or Prisma so Jest can test it directly.

The standings PATCH schema will continue to accept `divisionId` and `pointsOverrides`, but it will reject duplicate team IDs and verify every team belongs to the selected division. Existing `canManageEvent` authorization and `acquireEventLock` transaction locking remain mandatory.

Mobile capabilities will be derived from authenticated session state plus event and match assignments. They must not infer platform-admin access from email addresses or hard-coded user IDs. Team-arrival writes performed by an official must use an authenticated server route that validates the official assignment and records `checkedInByUserId`.

Revision note (2026-07-12): Created after tracing the live pool-standings save path and reconciling the July 11 live-event hotfix commits. The first milestone prioritizes preventing silent standings corruption before broader officiating changes.

Revision note (2026-07-12 05:05Z): Recorded completion of the web standings-integrity milestone and its focused test evidence; mobile administration and check-in work remains active.

Revision note (2026-07-12 06:05Z): Recorded the corrected server authorization for official-assisted team arrivals and the companion mobile Event Details control.

Revision note (2026-07-12 06:50Z): Recorded manager-scoped check-in reads, the completed global mobile prompt, and the final focused cross-repo validation counts.
