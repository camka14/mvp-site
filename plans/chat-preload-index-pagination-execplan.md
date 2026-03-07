# Chat Message Preload and Indexed History Pagination

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan must be maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, every chat preloads the latest 20 messages into local state before a user opens that chat window, so initial chat open is instant. When a user scrolls upward in a chat, older messages load in indexed pages with a visible loading row. Loading stops automatically when no messages remain, using server-provided pagination metadata (`totalCount`, `nextIndex`, `remainingCount`, `hasMore`).

## Progress

- [x] (2026-03-06 19:55Z) Reviewed existing chat API, service, context, and UI data flow.
- [x] (2026-03-06 20:05Z) Implemented indexed pagination metadata on chat messages API route.
- [x] (2026-03-06 20:08Z) Extended chat service with typed paged-message fetch and metadata support.
- [x] (2026-03-06 20:18Z) Refactored chat context to preload latest 20 for all chats and track per-chat pagination state.
- [x] (2026-03-06 20:24Z) Updated chat detail UI to load older pages on scroll-top with loading indicator and stop-at-end behavior.
- [x] (2026-03-06 20:30Z) Added regression tests for route pagination and chat detail scroll/loading behavior.
- [x] (2026-03-06 20:33Z) Ran targeted lint/tests and typecheck; all passed.
- [x] (2026-03-06 20:37Z) Corrected pagination state helper to keep `nextIndex` and `remainingCount` consistent, then reran lint/tests/typecheck.

## Surprises & Discoveries

- Observation: The existing chat route supports only `limit` + `order`, and the context currently reloads whole chat windows on a polling interval with no history metadata.
  Evidence: `src/app/api/chat/groups/[id]/messages/route.ts` and `src/context/ChatContext.tsx`.
- Observation: Jest path matching with bracketed route segments (`[id]`) is interpreted as a regex pattern unless run with `--runTestsByPath`.
  Evidence: First targeted run skipped the new route test; rerun with `--runTestsByPath` executed and passed it.

## Decision Log

- Decision: Use index-based offset pagination (`index` + `limit`) on the existing route instead of adding a new endpoint.
  Rationale: Keeps API surface small and satisfies the explicit requirement for index pagination.
  Date/Author: 2026-03-06 / Codex

- Decision: Keep polling in `ChatDrawer` and make `loadMessages` a metadata-aware refresh merge, while adding top-scroll `loadMoreMessages` for history paging.
  Rationale: Preserves existing near-real-time updates while introducing paged history loading without a second chat state system.
  Date/Author: 2026-03-06 / Codex

## Outcomes & Retrospective

Completed. The chat system now preloads latest messages for all chats, stores local per-chat pagination state, and supports indexed history loading while scrolling upward in chat detail. Route + component tests were added and passed, and full typecheck succeeded. Remaining future work is performance tuning if very large chat-group counts require preload concurrency limits.

## Context and Orientation

Chat messages are fetched from `src/app/api/chat/groups/[id]/messages/route.ts` through `src/lib/chatService.ts`, then stored in `src/context/ChatContext.tsx` and rendered in `src/components/chat/ChatDetail.tsx`. `src/components/chat/ChatDrawer.tsx` loads open chat windows and polls for fresh messages. The key gap is that there is no message history pagination state in context and no top-scroll load behavior in the detail view.

## Plan of Work

First, update the messages route to parse an `index` query param, apply `skip`/`take` with the existing order mode, and return pagination metadata alongside messages. Next, add typed paged-fetch support in `chatService`. Then refactor `ChatContext` to preload each chat’s latest 20 messages during chat group load, store those messages keyed by chat ID, and maintain per-chat pagination metadata for remaining history and load-in-progress state. After that, update `ChatDetail` to trigger `loadMoreMessages` when near top, render “Loading more messages…” while pending, preserve scroll position while prepending older messages, and stop requesting when `hasMore` is false. Finally, add route + UI/context regression tests and run targeted checks.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

1. Edit `src/app/api/chat/groups/[id]/messages/route.ts` for index pagination and metadata output.
2. Edit `src/lib/chatService.ts` with paged fetch types and method.
3. Edit `src/context/ChatContext.tsx` to preload and paginate locally.
4. Edit `src/components/chat/ChatDetail.tsx` for top-scroll loading UX.
5. Add tests in `src/app/api/chat/groups/[id]/messages/__tests__/route.test.ts` and chat component/context tests as needed.
6. Run targeted lint/tests.

## Validation and Acceptance

Acceptance criteria:

1. Opening chat UI after chat-group load should not require a full initial fetch per opened chat because latest 20 are preloaded in context.
2. Scrolling to the top of a chat with more history should show a loading row and prepend older messages while preserving reading position.
3. Reaching the end of history should stop additional load requests (`hasMore === false` or `remainingCount === 0`).
4. Route tests should verify metadata math and index pagination wiring.

## Idempotence and Recovery

All edits are additive and safe to rerun. If pagination math is incorrect, revert just the changed route/service/context files and rerun targeted tests to isolate failing behavior.

## Artifacts and Notes

Validation artifacts:

    npm run lint -- src/context/ChatContext.tsx src/components/chat/ChatDetail.tsx src/lib/chatService.ts src/app/api/chat/groups/[id]/messages/route.ts src/app/api/chat/groups/[id]/messages/__tests__/route.test.ts src/components/chat/__tests__/ChatDetail.test.tsx
    -> eslint passed

    npm test -- --runInBand src/components/chat/__tests__/ChatDetail.test.tsx src/components/chat/__tests__/ChatList.test.tsx src/lib/__tests__/chatMessages.test.ts
    -> 3 suites passed

    npm test -- --runInBand --runTestsByPath src/app/api/chat/groups/[id]/messages/__tests__/route.test.ts
    -> 1 suite passed

    npx tsc --noEmit
    -> typecheck passed

## Interfaces and Dependencies

Expected route response shape:

    {
      messages: MessageRow[],
      pagination: {
        index: number,
        limit: number,
        totalCount: number,
        nextIndex: number,
        remainingCount: number,
        hasMore: boolean,
        order: "asc" | "desc"
      }
    }

Expected chat context additions:

    messagePagination[chatId] => { nextIndex, totalCount, remainingCount, hasMore, loadingMore, initialized, limit }
    loadMoreMessages(chatId: string): Promise<void>

Plan revision note: Initial document created to track this implementation as required by `PLANS.md`.
Plan revision note (2026-03-06): Updated with implementation completion status, validation evidence, and final decisions so the plan remains restartable and accurate.
Plan revision note (2026-03-06, follow-up): Fixed helper-state consistency (`nextIndex` clamping vs. overrides) and reran validations.
