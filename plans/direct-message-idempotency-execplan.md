# Make direct-message creation atomic across web and mobile

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the root of `mvp-site`.

## Purpose / Big Picture

After this change, two people opening a direct message at the same time from different devices or clients always reach one canonical conversation. The server, rather than a web or mobile cache, decides uniqueness atomically. The migration keys one deterministic legacy conversation per participant pair without moving messages, archiving rows, or otherwise destructively guessing which historical two-person rows are direct messages.

The behavior is observable through route tests that submit different client-generated chat IDs for the same participant pair and receive the same server row, service tests proving clients call the idempotent POST directly, and a transactional migration replay that excludes notification topics and enforces a unique sorted participant pair.

## Progress

- [x] (2026-07-13 21:34Z) Traced the web and Android check-then-create flows, the chat-group POST handler, archive/update behavior, and the Prisma schema.
- [x] (2026-07-13 21:34Z) Chose a nullable two-column canonical participant pair so database uniqueness does not depend on delimiter or hashing conventions.
- [x] (2026-07-13 22:06Z) Added the schema migration, migration contract test, server pair helper, atomic POST upsert, and archive/update lifecycle handling.
- [x] (2026-07-13 22:06Z) Removed web and Android local uniqueness decisions and made Android consume the canonical row returned by the server.
- [x] (2026-07-13) Ran the focused web regressions (10 suites, 58 tests), TypeScript compilation, Prisma validation/generation/checked-client checks, and the isolated full-chain migration/concurrency exercise.
- [ ] Complete the final consolidated Android regression rerun after replacing test-scheduler races with explicit mock completion signals.
- [ ] Commit the site and mobile changes separately, reconcile APP-069 in `docs/code-audit/README.md`, and record final evidence here.

## Surprises & Discoveries

- Observation: Android's public `createChatGroup` returns only `Unit`, and `findOrCreateDirectMessage` currently returns the client draft rather than the row returned by the server.
  Evidence: `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/chat/data/ChatGroupRepository.kt` uses `singleResponse(..., onReturn = {})` and then returns `newChatGroup` after creation. An idempotent server may return an older canonical ID, so this path must retain the server result.

- Observation: archiving a direct chat currently leaves no server-owned uniqueness marker to release because the marker does not yet exist.
  Evidence: `src/server/moderation.ts` updates only archive metadata and membership. The new pair columns must be cleared in the same write so an archived conversation does not permanently block a replacement.

- Observation: running raw `prisma format` rewrites unrelated hand-aligned schema blocks, while raw `prisma generate` leaves broad formatting churn in the checked-in client.
  Evidence: the repository provides `npm run prisma:generate` and `scripts/normalize-prisma-generated.mjs`; unrelated schema formatting was restored and generated output was normalized to the four `ChatGroup`-owned files.

- Observation: Prisma PostgreSQL migration files are not guaranteed to receive an implicit transaction, and a temporary table declared `ON COMMIT DROP` can disappear between autocommitted statements.
  Evidence: the final migration now owns an explicit `BEGIN`/`COMMIT`, uses a session-lifetime `_DirectMessageWinner` table, and drops it before committing. The initial prototype replay was discarded after the broader safety review changed the backfill design.

- Observation: `ChatGroup` also stores notification topics, and Android originally resolved a direct message from inside every Room-backed `chatGroupsFlow` emission.
  Evidence: topic IDs use `user_`, `team_`, `event_`, `tournament_`, and `match_` prefixes; blindly backfilling every two-person row could key a topic. Posting and then upserting Room from the flow mapping could also retrigger the same POST indefinitely.

## Decision Log

- Decision: Store the sorted pair as nullable `directUserIdA` and `directUserIdB` columns with a composite unique constraint.
  Rationale: Two columns are unambiguous for arbitrary IDs, are directly addressable by Prisma's compound unique selector, and avoid synchronizing a custom string encoding between TypeScript and SQL.
  Date/Author: 2026-07-13 / Codex

- Decision: Apply the pair only to server-created two-participant direct conversations, clear it when membership changes away from that exact pair, and leave ordinary multi-person groups unkeyed.
  Rationale: A group conversation that later shrinks to two people can legitimately remain distinct from their direct conversation. The server's direct-message creation path still has exactly one canonical row.
  Date/Author: 2026-07-13 / Codex

- Decision: Transactionally key only the most recently updated eligible legacy row per participant pair, exclude all known notification/team topic prefixes, and leave older duplicates and their references untouched.
  Rationale: The legacy schema has no authoritative direct-message discriminator. Choosing one row preserves the old newest-row resolution behavior and lets the unique invariant deploy, while avoiding destructive message, moderation, push-target, or archive rewrites based on a guess.
  Date/Author: 2026-07-13 / Codex

- Decision: Clear the active pair when membership changes, reconstruct it on an eligible admin restore only when no other canonical row is active, and make every messaging-topic membership path preserve-or-clear the marker consistently.
  Rationale: Pair uniqueness is valid only while the exact two participants remain. Restore and alias routes must not create an active unkeyed duplicate or return a keyed row with stale membership.
  Date/Author: 2026-07-13 / Codex

## Outcomes & Retrospective

The web implementation and database proof are complete; final commits and Android evidence are still pending.

- Focused Jest validation passed 10 suites and 58 tests, `npx tsc --noEmit` passed, and the repository-owned Prisma validate, generate, and checked-client commands passed.
- A clean PostgreSQL 16 database replayed all 152 migrations. The final migration keyed only `dm-winner` for `user-a,user-b`, left `dm-older`, `event_event-1`, and `team_team-1` active and unkeyed, and preserved the original message, moderation-report, and push-target references.
- Two concurrent same-pair SQL upserts both returned `race-right`; the final keyed-row count for that pair was one.

## Context and Orientation

`mvp-site/prisma/schema.prisma` defines the canonical PostgreSQL `ChatGroup` and `Messages` models. `mvp-site/src/app/api/chat/groups/route.ts` validates and creates chat groups. Today it always inserts the caller's ID, so concurrent callers can create two rows. `mvp-site/src/lib/chatService.ts` first lists groups and checks locally before POSTing.

The audited Android work lives on branch `codex/critical-audit-remediation` in `/private/tmp/mvp-app-critical-audit`. Its `core/repository-impl/src/commonMain/kotlin/com/razumly/mvp/chat/data/ChatGroupRepository.kt` repeats the local check against `chatGroupsFlow`, creates a draft with a new ID, and returns that draft. Both clients must instead POST the pair and use the canonical response.

A canonical participant pair means the two user IDs sorted into stable A and B columns. A database composite unique constraint permits at most one active direct row with that non-null pair. Ordinary groups and archived groups keep both columns null, and PostgreSQL permits multiple null pairs.

## Plan of Work

Add `directUserIdA` and `directUserIdB` to `ChatGroup` in `prisma/schema.prisma`, together with `@@unique([directUserIdA, directUserIdB])`. Add a transaction-wrapped migration that creates the columns, excludes team and notification-topic identifiers, chooses one newest active two-person legacy row for each sorted pair, assigns only that winner, and creates the unique index without rewriting duplicate histories.

In `src/server/chatSafety.ts`, add a small helper that normalizes a participant list and returns the sorted pair only when there are exactly two unique IDs. In `src/app/api/chat/groups/route.ts`, keep all current participant, minor-account, block, and authorization checks, then use Prisma `upsert` by the compound pair for a two-person request. Multi-person requests continue to use `create`. The upsert's update arm writes only the same pair values, so retrying does not rename, rehost, or reorder the existing conversation.

Update `src/server/moderation.ts` so every archive clears both pair fields. Update all chat-group and messaging-topic membership routes so a keyed direct row keeps its pair only while the same two participants remain; adding/removing a participant clears the marker. Admin restore reconstructs an eligible pair and returns a typed conflict if another canonical row is active. Add focused tests for these lifecycle rules.

Replace `findOrCreateDirectMessage` in `src/lib/chatService.ts` with one direct call to the idempotent create endpoint and test that it performs no preliminary GET and returns a server-selected ID. Web state upserts that returned row by ID instead of blindly appending it. In Android, refactor the internal creation path to return the canonical `ChatGroup` after caching it, but resolve it once per direct-message flow collection rather than from every Room emission. The returned relation uses the server response ID, not the client draft.

## Concrete Steps

From `/Users/elesesy/StudioProjects/mvp-site`, edit the schema, migration, server helper/routes, services, and focused Jest tests using `apply_patch`. Run:

    npm run prisma:validate
    npm run prisma:generate
    node scripts/check-prisma-generated.mjs
    npm test -- --runInBand --runTestsByPath <focused test paths>
    npx tsc --noEmit

Use the repository's isolated/local PostgreSQL tooling to replay the complete migration chain. On the migrated database, submit or execute two concurrent upserts with different proposed IDs and the same pair; both results must identify one row and a direct SQL count for the pair must be one.

From `/private/tmp/mvp-app-critical-audit`, edit the Android repository and focused tests. Before running Gradle, verify no other Gradle wrapper for this worktree is active. Then run exactly one serialized focused task using the repository's JBR 21 and Android SDK environment:

    ./gradlew --no-daemon :composeApp:testDebugUnitTest --tests <focused classes> --console=plain --warning-mode=none --quiet

Stage only APP-069 paths in each repository, run `git diff --cached --check`, and commit each repository separately. Finally update `docs/code-audit/README.md` and this plan with commit IDs and evidence.

## Validation and Acceptance

The server route tests must prove that a two-user request uses the sorted compound pair and that an upsert may return an existing canonical ID different from the caller's ID. A three-user request must still create a distinct ordinary group, reserved notification IDs must be rejected on the direct endpoint, and every membership/restore route must preserve or clear the pair safely. Archive tests must prove the pair fields are cleared.

The web service test must observe one POST and no list GET when opening a direct message, and the provider must deduplicate an already-present canonical row. The Android regression must prove the relation returned to navigation uses the canonical response ID and that repeated Room emissions do not repeat the POST.

Prisma validation and TypeScript compilation must pass. A full local migration replay must create the composite unique index, key only one eligible duplicate, exclude notification topics, and leave all histories/references untouched. Two concurrent same-pair creations must leave exactly one active keyed row.

## Idempotence and Recovery

The application upsert is idempotent by design. The migration runs once under Prisma; its duplicate selection is deterministic because it orders by the latest available update/create timestamp and then ID. If local replay fails, discard only the isolated test database and replay from the migration chain. Do not edit or reset the live database during implementation. If generated Prisma files change, stage only generator-owned output that corresponds to the schema.

## Artifacts and Notes

Focused route evidence after implementation:

    PASS src/app/api/chat/groups/__tests__/route.test.ts
      creates or returns one canonical direct chat for a sorted participant pair
      preserves ordinary multi-person group creation

Database replay evidence:

    dm-older|||t
    dm-other|user-a|user-c|t
    dm-winner|user-a|user-b|t
    event_event-1|||t
    team_team-1|||t
    message-older|dm-older
    message-winner|dm-winner
    report-older|dm-older
    push-older|dm-older
    concurrent pair count/result: 1|race-right|race-right

## Interfaces and Dependencies

`src/server/chatSafety.ts` will export a pair type and a helper with the effective shape:

    getCanonicalDirectMessagePair(userIds: string[]):
      { directUserIdA: string; directUserIdB: string } | null

`ChatGroup` will expose nullable `directUserIdA` and `directUserIdB` Prisma fields and the generated compound selector `directUserIdA_directUserIdB`.

Android's public `IChatGroupRepository.createChatGroup` may remain `Result<Unit>` for existing component compatibility, but production must use a private canonical-returning function for direct-message creation. That function returns the actual `ChatGroup` from the POST after saving it to Room.

Plan revision note (2026-07-13 21:34Z): Created the initial self-contained implementation plan after tracing both clients, the API, archive lifecycle, and schema. The two-column pair and migration consolidation decisions remove encoding ambiguity and make the invariant safe for populated databases.

Plan revision note (2026-07-13 22:06Z): Recorded the completed implementation surfaces and replaced raw Prisma formatting/generation commands with the repository-owned validation and generated-client normalization workflow after observing unrelated formatting churn.

Plan revision note (2026-07-13 22:14Z): Recorded the clean full-chain replay, seeded duplicate consolidation, and concurrent database upsert evidence. The temporary merge table now has explicit session lifetime so correctness does not depend on migration-runner transaction wrapping.

Plan revision note (2026-07-13 22:33Z): Replaced the destructive legacy consolidation prototype after review showed that `ChatGroup` also stores notification topics and has no authoritative historical DM discriminator. The final design is transaction-wrapped, excludes reserved topic prefixes, keys one winner, and leaves every older row and reference untouched. Added lifecycle coverage for topic aliases, subscriptions, restore conflicts, web deduplication, and Android Room feedback-loop prevention.
