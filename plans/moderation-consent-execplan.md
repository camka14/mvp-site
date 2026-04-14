# Moderation, Consent, Blocking, and Admin Review

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `/PLANS.md`.

## Purpose / Big Picture

After this change, the web backend and web client will support a full moderation loop: chat access is gated by an explicit terms agreement, abusive users can be blocked, chats and events can be reported, reported events disappear from the reporting user’s discovery feed immediately, and admins can review moderation items and archived chats without losing evidence. A user will be able to see this working by opening chat for the first time and seeing the consent modal, by reporting or blocking content and seeing it disappear from their own UI immediately, and by opening the admin dashboard and seeing moderation and chat-review tools.

## Progress

- [x] (2026-04-14 14:55Z) Reviewed the current chat, auth, event search, admin dashboard, and social graph implementation to identify the contract and UI edit points.
- [x] (2026-04-14 21:58Z) Added the Prisma schema changes and migration for moderation reports, archive metadata, suspension state, blocked users, hidden events, and chat consent, then regenerated the Prisma client.
- [x] (2026-04-14 21:58Z) Implemented shared moderation helpers, event denylist validation, chat archive helpers, moderation email delivery, and auth/session enforcement for suspended users.
- [x] (2026-04-14 21:58Z) Implemented the new moderation, block, consent, and admin API routes and updated existing chat, event, auth, and social routes to use them.
- [x] (2026-04-14 21:58Z) Wired the web UI for chat consent, chat report, event report, blocked users, and admin moderation and chat review.
- [x] (2026-04-14 23:38Z) Added focused regression coverage for chat terms, denylist filtering, moderation helpers, and unblock route behavior, and fixed the generic `/api/events` list route so `hiddenEventIds` apply there as well.
- [x] (2026-04-15 04:53Z) Expanded regression coverage for chat list and drawer UI behavior, chat-group route consent and block enforcement, moderation report submission, block creation, and suspended-session auth handling.
- [x] (2026-04-15 05:08Z) Added explicit server-side coverage for `hiddenEventIds` filtering in both `/api/events` and `/api/events/search`, plus direct `requireSession` tests for suspended users.

## Surprises & Discoveries

- Observation: chat membership and deletion are currently implemented by mutating `ChatGroup.userIds` directly, and the delete route removes both the group and all messages.
  Evidence: `src/app/api/chat/groups/[id]/route.ts` currently deletes `messages` and `chatGroup` in one transaction.

- Observation: authenticated API access is currently stateless after JWT verification and does not re-check `AuthUser` state.
  Evidence: `src/lib/permissions.ts` returns decoded token contents without reading the database.

- Observation: the repository already had an unrelated lint failure in the event schedule test area, so full-project lint cannot be used as the acceptance gate for this feature branch.
  Evidence: `npm run lint` fails in `src/app/events/[id]/schedule/__tests__/page.test.tsx` because the test mutates `capturedEventFormProps` during render, which violates `react-hooks/globals`.

## Decision Log

- Decision: preserve chat groups and chat messages for moderation evidence instead of deleting them when membership drops below two users.
  Rationale: the requested moderation workflow requires admin review of past violations, so evidence must remain queryable even when a user leaves or blocks.
  Date/Author: 2026-04-14 / Codex

- Decision: hide reported events per user using `UserData.hiddenEventIds` and enforce that hiding on both API responses and client filtering.
  Rationale: the requirement is user-specific suppression, not global event deletion.
  Date/Author: 2026-04-14 / Codex

## Outcomes & Retrospective

Implementation landed end to end. The schema now stores moderation reports, user block and hidden-event state, chat consent, soft-removed messages, archived chats, and suspended auth users. End-user chat access is gated behind a versioned terms agreement, block and report actions create moderation records and hide content immediately for the acting user, and event create and update now reject denylisted names and descriptions. The admin dashboard gained `Chats` and `Moderation` tabs so admins can inspect archived chats inline, remove offending messages, unpublish events, suspend users, and resolve or dismiss moderation reports with notes.

Verification outcome:

- `npx prisma generate` passed after the schema and migration landed.
- Focused Jest coverage now passes for chat terms, event content denylist, moderation helpers, chat drawer and chat list UI flows, chat-group route enforcement, moderation report creation, block and unblock routes, server-side hidden-event filtering in both event list/search endpoints, and suspended-session auth handling.
- Targeted lint passed for the production and test files touched in the moderation flow.
- `npm run lint` still fails because of a pre-existing unrelated issue in `src/app/events/[id]/schedule/__tests__/page.test.tsx`, so full lint is not a clean signal for this branch.

## Context and Orientation

This repository is the source of truth for backend contracts used by both the website and the Kotlin Multiplatform app. The Prisma schema lives in `prisma/schema.prisma`. Auth session validation lives in `src/lib/permissions.ts` and session issuance lives in `src/app/api/auth/*`. Web chat reads and writes go through `src/app/api/chat/groups/route.ts`, `src/app/api/chat/groups/[id]/route.ts`, `src/app/api/chat/groups/[id]/messages/route.ts`, and `src/app/api/messages/route.ts`. Social graph logic lives in `src/server/socialGraph.ts` and is surfaced by `src/app/api/users/social/*`. Event discovery is driven by `src/app/api/events/search/route.ts`, while event create and update behavior lives in `src/app/api/events/route.ts` and `src/app/api/events/[eventId]/route.ts`. The admin dashboard UI is `src/app/admin/AdminDashboardClient.tsx`. The floating web chat UI is driven by `src/context/ChatContext.tsx`, `src/context/ChatUIContext.tsx`, `src/components/chat/ChatDetail.tsx`, and `src/lib/chatService.ts`. The profile connections UI is `src/app/profile/page.tsx` and uses `src/lib/userService.ts`.

For this feature, “archive” means a chat group still exists in the database and remains available to admins, but it is hidden from normal end-user chat lists. “Soft-remove” means a message or event stays in storage for audit purposes but no longer appears in standard user-facing reads.

## Plan of Work

First, extend `prisma/schema.prisma` to add blocked users, hidden events, chat consent fields, moderation report storage, chat archive fields, message removal fields, and auth-user suspension fields. Add a matching migration under `prisma/migrations/` and regenerate the Prisma client in `src/generated/prisma`.

Next, add a moderation helper module under `src/server/` that centralizes report creation, due-date calculation, moderation email delivery, block-report cleanup, and archive/remove actions. In the same pass, add an auth helper that rejects suspended `AuthUser` records in `requireSession`, `/api/auth/me`, and login or social-auth session issuance routes.

Then update the existing chat and social APIs. Chat list and message reads must exclude archived groups and removed messages for normal users while allowing admins to read everything. Chat creation must reject blocked pairings. Chat leave and block flows must archive a chat when it loses viable membership instead of deleting it. Social graph reads and writes must include a blocked list and add routes to block and unblock users, including optional removal from all shared chats and deletion of block-generated moderation reports on unblock.

After the contract layer is stable, add a public terms page and a new consent endpoint. Update the floating chat UI so the first chat open requires agreement, add a report action to the chat header menu, add an event report action in the event page title row, extend the profile connections section with blocked users and unblock support, and add `Chats` and `Moderation` tabs to the admin dashboard with inline review tools.

## Concrete Steps

Run the following from the repository root as work proceeds.

    npm test -- --runInBand src/server/__tests__/socialGraph.test.ts
    npm test -- --runInBand src/app/api/auth/__tests__/authRoutes.test.ts
    npm test -- --runInBand src/components/chat/__tests__/ChatDetail.test.tsx
    npm test -- --runInBand src/app/events/[id]/schedule/__tests__/page.test.tsx
    npm run lint

If the Prisma client must be regenerated locally, run:

    npx prisma generate

If a migration needs to be verified against a local database, use the project’s existing Prisma migrate workflow after confirming database connectivity.

## Validation and Acceptance

Acceptance for the backend is behavioral. A logged-in user who has not accepted terms must see chat blocked until they agree. A user who reports an event must stop seeing that event in discover responses for that account. A user who blocks another user with “leave all chats” enabled must see shared chats disappear from their own chat list immediately, while an admin can still open the archived chat and review the messages. A suspended user must lose API access on the next authenticated request. The admin dashboard must show moderation items with due dates and open archived chats inline.

Tests must cover the new moderation routes, blocked social graph behavior, auth rejection for suspended users, discover filtering for `hiddenEventIds`, and the new admin and chat UI states.

## Idempotence and Recovery

All new routes should be written so repeated requests are safe. Posting consent twice should only refresh the stored agreement metadata. Blocking an already-blocked user should be a no-op. Unblocking a user who is not blocked should be a no-op. Archiving a chat multiple times should not destroy evidence. If a migration partially fails in development, rerun it against a clean local database or recreate the migration after restoring `prisma/schema.prisma` and the generated client.

## Artifacts and Notes

Expected moderation email behavior:

    Subject: [Moderation] BLOCK_USER report for user_123
    Body includes reporter id, target id, dueAt, and any metadata needed for admin triage.

Expected archived chat behavior:

    GET /api/chat/groups?userId=<current-user>
    -> archived chats are omitted for end users
    GET /api/admin/chat-groups
    -> archived chats are included with archive metadata

## Interfaces and Dependencies

The Prisma schema must expose these new shapes:

    UserData.blockedUserIds: String[]
    UserData.hiddenEventIds: String[]
    UserData.chatTermsAcceptedAt: DateTime?
    UserData.chatTermsVersion: String?
    AuthUser.disabledAt: DateTime?
    AuthUser.disabledByUserId: String?
    AuthUser.disabledReason: String?
    ChatGroup.archivedAt: DateTime?
    ChatGroup.archivedReason: String?
    ChatGroup.archivedByUserId: String?
    Messages.removedAt: DateTime?
    Messages.removedByUserId: String?
    Messages.removalReason: String?

Define a `ModerationReport` model with typed target and status enums, due-date storage, reviewer metadata, and freeform JSON metadata for block and report context.

Define server helpers that make these operations explicit:

    createModerationReport(...)
    archiveChatGroup(...)
    softRemoveMessage(...)
    suspendAuthUser(...)
    assertAuthUserIsActive(...)

Update the social and chat route handlers so those helpers are the single path for moderation state transitions.

Revision note: created this ExecPlan before implementation to satisfy the repository requirement that significant multi-surface features be tracked with a living execution plan.
