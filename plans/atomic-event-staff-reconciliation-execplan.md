# Make event staff and invite reconciliation atomic

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the root of `mvp-site`.

## Purpose / Big Picture

After this change, saving an event's assistant hosts, officials, and staff invitations cannot leave those three representations disagreeing. The server accepts one complete desired staff state, checks that the editor started from the current staff revision, acquires the event's transaction-scoped lock, and reconciles the event row, `EventOfficials`, and event-scoped `Invites` in one PostgreSQL transaction. A transient failure rolls the entire staff mutation back. Retrying the desired state cannot create duplicate invite rows.

The behavior is observable through route tests that inject failures between invite and event-official writes and see no partial commit, send a stale revision and receive a conflict without writes, and repeat the same desired state without duplicate invitations. Android repository and component tests must prove that event creation begins with an empty persisted staff state, ordinary event fields save separately, and exactly one atomic staff request replaces the old delete/create/final-event sequence.

## Progress

- [x] (2026-07-13) Traced the Android create/edit coordinators, `EventStaffPersistence`, invite repository calls, event PATCH behavior, event-detail bootstrap, Prisma event/invite/official models, and email side effects.
- [x] (2026-07-13) Chose a dedicated versioned desired-state endpoint with a deterministic staff revision and the existing transaction-scoped event advisory lock; no schema migration is required.
- [x] (2026-07-13) Added the server staff-state helper, authenticated GET/PUT route, optimistic conflict response, post-commit email delivery, managed-bootstrap revision, and focused rollback/idempotence tests (19 focused Jest assertions passed).
- [ ] Add mobile DTO/repository support and carry the authoritative staff revision through event-detail hydration.
- [ ] Replace create/edit's multi-request invite mutations with one atomic repository call while omitting assignment fields from the ordinary event create/update request.
- [ ] Run focused Jest, TypeScript, Android repository/component, and build validation; then perform reachable browser/emulator smoke checks.
- [ ] Commit the web and mobile changes separately, reconcile DATA-030 in `docs/code-audit/README.md`, and record final evidence here.

## Surprises & Discoveries

- Observation: the dangerous boundary is narrower than the full event save.
  Evidence: Android first PATCHes ordinary event fields, then deletes invites individually, bulk-creates replacements, and PATCHes the resolved official/assistant IDs a second time. Keeping the first ordinary PATCH separate is safe if it omits staff assignments; the dedicated transaction must own every staff representation.

- Observation: event creation currently persists draft assistant/official IDs before invitations exist.
  Evidence: `DefaultCreateEventComponent.createEventAfterPayment` sends the prepared event, then calls `syncEventStaffAssignments`. The create request must persist an empty assignment state and apply the desired staff state only through the new atomic endpoint.

- Observation: `Events.updatedAt` is unsuitable as the mobile concurrency token.
  Evidence: unrelated event edits update it, while the Android `Event` Room entity does not retain the server timestamp. A deterministic revision over only assistant-host membership, canonical official rows, and event staff invites detects the relevant conflicts without a Room schema migration.

- Observation: invitation email is an external side effect and cannot be made part of a database transaction.
  Evidence: `/api/invites` already commits invite rows before calling `sendInviteEmails`. The new endpoint must commit the canonical staff state first, send only newly created/retryable invitations afterward, then reload and return the post-delivery canonical snapshot and revision.

- Observation: the current mobile algorithm validates email conflicts before saving, but the server still must be authoritative.
  Evidence: `validatePendingStaffEmailMembership` uses a separate request and can race. The new transaction resolves each email, merges roles by resolved user ID, and rejects invalid/duplicate desired entries inside the server boundary.

- Observation: accepted event-staff invitations are normally deleted by the existing accept route rather than retained with an `ACCEPTED` status.
  Evidence: `/api/invites/[id]/accept` deletes a `STAFF` invite transactionally. The reconciler therefore treats an assigned user with no current invite as already accepted and does not manufacture another invite on an idempotent save; it still preserves any legacy non-retryable status rows it encounters.

## Decision Log

- Decision: Add authenticated `GET` and idempotent `PUT /api/events/[eventId]/staff` rather than embedding invite mutations into the already large general event PATCH.
  Rationale: The route can own one narrow invariant, remain reusable by create and edit flows, and avoid duplicating scheduling/division/field update machinery. General event writes remain separate but are prevented from carrying assistant-host or event-official membership when the new flow is used.
  Date/Author: 2026-07-13 / Codex

- Decision: Use an opaque SHA-256 revision of normalized staff state, not `Events.updatedAt` and not a new database column.
  Rationale: The token changes only when assistant hosts, official membership/assignments, or staff invitation state changes. It supports optimistic conflict detection without a Prisma or Room migration.
  Date/Author: 2026-07-13 / Codex

- Decision: Acquire `pg_advisory_xact_lock` for the event before reading the current staff snapshot and applying the PUT.
  Rationale: Concurrent new clients serialize on the same event. The revision is checked after the lock, so a stale second editor receives `409 EVENT_STAFF_REVISION_CONFLICT` without any mutation.
  Date/Author: 2026-07-13 / Codex

- Decision: Treat the request as the complete desired staff state and derive invite roles from assistant-host and official membership plus pending email entries.
  Rationale: The server, not a client call sequence, determines which event row, `EventOfficials`, and event-scoped invite rows must exist. Repeating the same target updates existing rows instead of inserting duplicates.
  Date/Author: 2026-07-13 / Codex

- Decision: Preserve non-retryable historical invite rows when a role is removed, while deleting obsolete pending/failed/declined event-staff invitations.
  Rationale: Accepted invite records are audit history; pending desired-state rows are operational state. Removed pending invitations must disappear, but historical acceptance should not be destroyed merely because staffing later changes.
  Date/Author: 2026-07-13 / Codex

## Outcomes & Retrospective

Implementation is in progress. No production or live database change is required by the chosen contract. Deployment ordering will require the server endpoint to ship before the mobile consumer.

## Context and Orientation

The canonical web repository is `/Users/elesesy/StudioProjects/mvp-site`; the audited mobile worktree is `/private/tmp/mvp-app-critical-audit`. `prisma/schema.prisma` stores assistant hosts on `Events.assistantHostIds`, official assignments in `EventOfficials`, and event staff invitations in `Invites` with `type = 'STAFF'` and `eventId`.

The current Android edit path is `DefaultEventDetailComponent.updateEvent` through `EventEditActionCoordinator.runSaveEventAction`. It calls `EventRepository.updateEvent`, then `reconcileEventStaffInvites`, which calls `UserRepository.deleteInvite` once per obsolete invite and `createInvites` for replacements, then it may call `EventRepository.updateEvent` again. Event creation repeats the same reconciliation from `DefaultCreateEventComponent.syncEventStaffAssignments` after the event has already been created with assignment IDs.

The new staff revision is an opaque token computed from sorted normalized assistant-host IDs, sorted canonical `EventOfficials` fields, and sorted event-scoped staff invite identity/status/role fields. Timestamps are excluded so equivalent desired states are stable. The client must not interpret the token.

## Plan of Work

Create `src/server/events/eventStaffReconciliation.ts`. It will define strict request parsing, canonical snapshot loading, deterministic revision calculation, desired-state normalization, invitation user resolution, transactional reconciliation, and response serialization. Reuse `acquireEventLock`, `normalizeEventOfficials`, `clearRemovedEventOfficialMatchAssignments`, `ensureAuthUserAndUserDataByEmail`, and existing staff normalization helpers rather than duplicating policy.

Add `src/app/api/events/[eventId]/staff/route.ts`. GET requires an authenticated event manager and returns the canonical snapshot. PUT requires the same permission, validates a contract version plus expected revision, runs reconciliation inside one transaction, and maps stale revisions to a stable 409 code with the current revision. After commit, it sends only the transaction's email candidates, reloads the snapshot, and returns that post-delivery state. Database errors return no success snapshot and transaction tests must prove prior writes rolled back.

Expose the revision in the managed event-detail bootstrap so Android edits start with the same token as the visible staff list. Add serializable request/response DTOs and domain result types in the mobile core layers. Extend `IEventRepository` with GET and PUT staff-state methods; the implementation validates contract version, event ID, revision, canonical role fields, and response invariants before updating the cached event.

Refactor `EventStaffPersistence` into request construction and response application only. It must not call `IUserRepository.deleteInvite`, `createInvites`, or a final event PATCH. Update `EventEditActionCoordinator` so the ordinary update omits `assistantHostIds` and `eventOfficials`, then invokes one atomic staff call with the desired draft and expected revision. On conflict it keeps editing open and surfaces the server's retryable message.

For create, send an event copy with empty assistant/official membership, GET its initial staff snapshot, then PUT the prepared desired staff state. If the staff call fails, the event exists with a consistent empty staff state rather than partially mutated assignments. The UI may report that staff setup failed and allow retry; it must never claim those assignments were saved.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, add the server helper, route, bootstrap field, and focused tests using `apply_patch`. Run:

    npm test -- --runInBand --runTestsByPath <event staff route and bootstrap test paths>
    npx tsc --noEmit

From `/private/tmp/mvp-app-critical-audit`, add DTOs, repository APIs, repository implementation, coordinator integration, and focused tests. Before Gradle, verify no other wrapper for this worktree is running. Then use the repository JBR 21 and Android SDK environment and run one serialized batch:

    ./gradlew :composeApp:testDebugUnitTest --tests '*EventStaff*' --tests '*EventEditActionCoordinatorTest*' --tests '*DefaultCreateEventComponentTest*' --no-daemon --console=plain

Also run the focused repository HTTP tests and `:composeApp:assembleDebug`. Stage only DATA-030 paths in each repository, run `git diff --cached --check`, and commit each repository separately. Finally update `docs/code-audit/README.md` and this plan.

## Validation and Acceptance

Server tests must prove: an unauthenticated or unauthorized caller cannot read/write staff state; malformed and unsupported contract versions fail; a stale revision returns 409 before writes; assistant hosts, officials, and invite roles commit together; injected failure after any intermediate mutation rolls the transaction back; repeating an equivalent target does not create duplicate invite rows; removed pending invites disappear while accepted history remains; and email failure cannot corrupt the committed database state.

Mobile tests must prove: bootstrap retains the staff revision; repository GET/PUT uses the exact route and validates the response; event edit performs one ordinary assignment-free PATCH plus one staff PUT and no invite DELETE/POST/final PATCH; stale conflicts preserve the draft and surface an actionable error; create persists empty assignments first and cannot leave nonempty event roles after staff failure; and a successful response replaces local event membership and invite state with the canonical snapshot.

`npx tsc --noEmit`, focused Jest, focused Android tests, and the debug build must pass. Install the fresh APK and cold-launch it on the attached emulator; inspect logcat for crash, ANR, Room, or serialization errors. If an authenticated manager session is reachable, edit staff and confirm one staff PUT in the network/log path. If authentication is unavailable, record that limitation and rely on route/repository/component regressions for the protected interaction.

## Idempotence and Recovery

GET is read-only. PUT is a complete desired-state replacement under the event lock, so retrying after refetching the current revision cannot accumulate duplicate invites. A stale token never writes. If email delivery fails after commit, the invite remains in a retryable failed state and the canonical response reflects it; the database staff invariant remains intact.

No schema migration or live data backfill is planned. If a local test transaction fails, fix the code and rerun the focused suite; do not edit live rows manually. If mobile deployment races ahead of the endpoint, the app must retain the old release until the server route is available.

## Artifacts and Notes

Expected conflict shape:

    {
      "error": "Event staff changed. Reload and try again.",
      "code": "EVENT_STAFF_REVISION_CONFLICT",
      "currentRevision": "<opaque sha256>"
    }

Expected successful response shape:

    {
      "contractVersion": 1,
      "eventId": "event_1",
      "revision": "<opaque sha256>",
      "assistantHostIds": ["assistant_1"],
      "eventOfficials": [{ "id": "...", "userId": "official_1", "positionIds": ["..."], "fieldIds": [], "isActive": true }],
      "officialIds": ["official_1"],
      "staffInvites": [{ "id": "...", "type": "STAFF", "eventId": "event_1", "userId": "official_1", "staffTypes": ["OFFICIAL"] }]
    }

## Interfaces and Dependencies

The server helper will expose effective interfaces equivalent to:

    loadEventStaffSnapshot(client, eventId): Promise<EventStaffSnapshot>
    reconcileEventStaffDesiredState(client, session, eventId, input): Promise<{
      snapshot: EventStaffSnapshot;
      emailCandidates: InviteRecord[];
    }>

The mobile repository interface will expose domain operations equivalent to:

    getEventStaffState(eventId: String): Result<EventStaffState>
    reconcileEventStaff(
        event: Event,
        pendingInvites: List<EventStaffInviteInput>,
        expectedRevision: String,
    ): Result<EventStaffState>

`EventStaffState` contains the merged `Event`, canonical `staffInvites`, and opaque `revision`. The existing generic invite repository remains for player, team, and organization invitation workflows but is no longer used for event staff persistence.

Plan revision note (2026-07-13): Created the initial self-contained plan after tracing the full create/edit call graph, event PATCH official persistence, invite transaction/email ordering, bootstrap hydration, and mobile cache model. The dedicated desired-state route and staff-only revision keep the invariant narrow enough to implement without database migrations while still eliminating every partial staff-save sequence identified by DATA-030.
