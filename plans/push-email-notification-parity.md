# Email and push parity for backend notifications

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must follow the rules in `mvp-site/PLANS.md`.

## Purpose / Big Picture

Today, backend email sends and device push notifications are separate, and push dispatch is not implemented behind `/api/messaging/topics/[topicId]/messages`. After this change, backend message publishing will resolve recipients and attempt Firebase push delivery, and invite emails will also attempt push delivery to the same user. We will also persist device push tokens so the backend can target specific users by user id.

## Progress

- [x] (2026-02-12 19:08Z) Audited current invite email flow and messaging routes; confirmed push route is an echo and subscriptions do not persist device tokens.
- [x] (2026-02-12 19:17Z) Added Firebase bootstrap and push delivery service with token persistence, recipient targeting, and invalid-token pruning.
- [x] (2026-02-12 19:23Z) Updated messaging subscriptions/messages routes and invite email sender to use shared push delivery logic.
- [x] (2026-02-12 19:46Z) Added regression tests for subscriptions/messages routes and invite email parity.
- [x] (2026-02-12 19:47Z) Ran focused Jest suites with `--runTestsByPath`; all new tests passed.
- [x] (2026-02-12 19:51Z) Validated Prisma schema with `npx prisma validate --schema prisma/schema.prisma`.
- [ ] Repository-wide lint remains red due unrelated pre-existing errors in `e2e/fixtures/*`.

## Surprises & Discoveries

- Observation: Mobile clients already send `pushToken` and `pushTarget` through the subscriptions endpoint when registering the device.
  Evidence: `mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/PushNotificationsRepository.kt` sends these fields to `/api/messaging/topics/{topicId}/subscriptions`.
- Observation: Repository-wide `npm run lint` currently fails on pre-existing unrelated hook-rule issues in `e2e/fixtures/*`.
  Evidence: ESLint reports `react-hooks/rules-of-hooks` errors in `e2e/fixtures/api.ts` and `e2e/fixtures/auth.ts` without touching those files in this change.

## Decision Log

- Decision: Persist push tokens in a dedicated Prisma model and query it with Prisma raw SQL helpers.
  Rationale: This avoids coupling rollout to immediate Prisma client regeneration and still keeps schema + migration as source of truth.
  Date/Author: 2026-02-12 / Codex

- Decision: Keep push delivery best-effort and never fail email or message API requests solely due to Firebase issues.
  Rationale: Notification fan-out failures should degrade gracefully and be observable via logs/response metadata.
  Date/Author: 2026-02-12 / Codex

## Outcomes & Retrospective

Backend now attempts push notifications in both key paths that mattered for parity:

- Topic message publishing now resolves recipients and calls Firebase-backed push delivery.
- Invite email sends now also attempt user-targeted push delivery when a `userId` is known.

Device token persistence is now explicit in Prisma schema and migration SQL, allowing backend fan-out by user id. The only remaining rollout dependency is operational: providing Firebase credentials in environment variables and applying the Prisma migration in each environment before relying on push persistence.

## Context and Orientation

Email sends are centralized in `src/server/inviteEmails.ts`. Messaging topic APIs live under `src/app/api/messaging/topics/*`; specifically `subscriptions/route.ts` currently only mutates `ChatGroup.userIds`, and `messages/route.ts` currently echoes payload without delivery. Database schema lives in `prisma/schema.prisma` and migrations in `prisma/migrations/*`.

"Push target" in this repo means a device push token registered against a user id. "Topic membership" means user ids attached to a messaging topic in `ChatGroup.userIds`.

## Plan of Work

Introduce a Firebase bootstrap module in `src/server/firebaseAdmin.ts` and a push service in `src/server/pushNotifications.ts`. The push service will register/unregister device tokens, resolve tokens by user ids, send multicast payloads through Firebase Admin, and prune invalid tokens.

Update the subscriptions route so POST continues to manage topic memberships and additionally upserts a device token when `pushToken` is present. Update DELETE to continue removing topic memberships and remove device targets when appropriate.

Replace the messages route echo behavior with real recipient resolution: use payload `userIds` when provided, otherwise use topic memberships from `ChatGroup.userIds`, exclude `senderId`, and invoke push delivery.

Finally, update `sendInviteEmails` so successful email sends also attempt a user-targeted push notification using the same subject/body context.

## Concrete Steps

1. Add `PushDeviceTarget` model and migration SQL.
2. Add Firebase bootstrap utility and push notification service.
3. Patch messaging subscriptions/messages routes to use push service.
4. Patch invite emails to trigger push attempts.
5. Add Jest coverage for new paths.
6. Run focused tests.

## Validation and Acceptance

Acceptance is met when:

- POST `/api/messaging/topics/{topicId}/subscriptions` can persist topic membership and device token metadata.
- POST `/api/messaging/topics/{topicId}/messages` returns push dispatch metadata and attempts delivery to resolved recipients.
- `sendInviteEmails` attempts push delivery for invites with a resolvable `userId`.

Tests should assert these behaviors directly in route/service unit tests.

## Idempotence and Recovery

Subscription registration uses upsert by token, so repeated calls are safe. Message sends are retryable; delivery failures are reported in response metadata/logs without corrupting persisted state. If migration rollout fails, backend still runs but push persistence/delivery will be degraded until schema is applied.

## Artifacts and Notes

Focused validation command:

    npm test -- --runTestsByPath src/server/__tests__/inviteEmails.test.ts src/app/api/messaging/topics/[topicId]/messages/__tests__/route.test.ts src/app/api/messaging/topics/[topicId]/subscriptions/__tests__/route.test.ts

Result: 3 test suites passed, 6 tests passed.

## Interfaces and Dependencies

New server interfaces:

- `registerPushDeviceTarget({ userId, pushToken, pushTarget?, pushPlatform? })`
- `unregisterPushDeviceTarget({ userIds, pushToken?, pushTarget? })`
- `sendPushToUsers({ userIds, title, body, data? })`

Firebase dependency uses `firebase-admin` at runtime via env-based service account configuration.

Change note: Initial ExecPlan created for backend email+push parity implementation (2026-02-12 / Codex).
Change note: Updated with completed implementation and validation artifacts (2026-02-12 / Codex).
