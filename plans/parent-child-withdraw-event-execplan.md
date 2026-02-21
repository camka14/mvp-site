# Parent-Targeted Event Withdrawal and Refund Routing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `mvp-site/PLANS.md` and aligns with mobile client updates in `mvp-app`.

## Purpose / Big Picture

Parents need to withdraw a specific child from an event regardless of child status (participant, waitlist, free-agent), and the system must distinguish whether leave/refund actions target the parent or child when both are registered. After this change, API and web UI flows will explicitly select target user and persist refunds/withdrawals for the correct profile.

## Progress

- [x] (2026-02-20 09:49Z) Audited participants/waitlist/free-agents/refund routes and discover/refund UI/service clients.
- [x] (2026-02-20 17:54Z) Added parent-linked-child authorization for participant removal.
- [x] (2026-02-20 17:54Z) Added target-user refund handling that also withdraws target in one transaction.
- [x] (2026-02-20 17:54Z) Updated discover/refund UI and service clients for explicit target-user selection.
- [x] (2026-02-20 17:54Z) Added/updated Jest tests for route/service regressions.

## Surprises & Discoveries

- Observation: Waitlist/free-agent routes already support parent-linked-child operations, reducing required backend surface.
  Evidence: `src/app/api/events/[eventId]/waitlist/route.ts`, `src/app/api/events/[eventId]/free-agents/route.ts`.
- Observation: Participants removal currently rejects parent-managed child user IDs.
  Evidence: `src/app/api/events/[eventId]/participants/route.ts` (strict self check).
- Observation: Refund route stores requester as `session.userId` only and does not withdraw target.
  Evidence: `src/app/api/billing/refund/route.ts`.

## Decision Log

- Decision: Reuse existing endpoints with optional `userId` target parameters.
  Rationale: Preserves compatibility and avoids client/server route sprawl.
  Date/Author: 2026-02-20 / Codex.
- Decision: Refund route will perform withdrawal + refund request creation in a DB transaction.
  Rationale: Enforces atomic behavior for withdrawal intent and prevents partially applied states.
  Date/Author: 2026-02-20 / Codex.

## Outcomes & Retrospective

Completed implementation and verification:

- Participant DELETE route now permits parent-managed linked-child removal and synchronizes participant, waitlist, and free-agent arrays.
- Refund POST route now accepts optional `userId`, validates linked-child authorization, verifies target membership, atomically withdraws target, and de-duplicates pending refund requests.
- Web `RefundSection` now supports selecting self vs linked child and routes actions correctly for participant, waitlist, and free-agent statuses.
- Service layer now forwards explicit target user IDs for leave/refund and exposes waitlist removal helper.
- Route and service tests were added/updated and pass.

Validation commands:

- `npm test -- src/lib/__tests__/paymentService.test.ts src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/events/__tests__/participantsRoute.test.ts` (pass).
- `npx eslint src/components/ui/RefundSection.tsx src/lib/paymentService.ts src/app/api/billing/refund/route.ts src/app/api/events/[eventId]/participants/route.ts src/app/discover/components/EventDetailSheet.tsx src/lib/eventService.ts src/lib/__tests__/paymentService.test.ts src/app/api/events/__tests__/participantsRoute.test.ts src/app/api/billing/__tests__/refundRoute.test.ts` (pass).

## Context and Orientation

Core API handlers:

- `src/app/api/events/[eventId]/participants/route.ts` controls participant add/remove logic and registration metadata.
- `src/app/api/events/[eventId]/waitlist/route.ts` and `src/app/api/events/[eventId]/free-agents/route.ts` already implement parent-child authorization checks.
- `src/app/api/billing/refund/route.ts` creates `refundRequests` rows.

Core web client surface:

- `src/lib/paymentService.ts` handles leave/refund API calls.
- `src/lib/eventService.ts` handles waitlist/free-agent calls.
- `src/components/ui/RefundSection.tsx` renders leave/refund actions.
- `src/app/discover/components/EventDetailSheet.tsx` has linked child state and event registration context.

## Plan of Work

Implement backend first: extend participants DELETE authorization for active parent-child links and extend refund route to accept a target `userId`, validate authorization + event membership, atomically remove target from event participation arrays, and create/refuse duplicate waiting refund entries.

Then implement web clients: update payment/event services with target-user optional parameters; update refund/withdraw UI to select target profile (self or linked child currently on participant/waitlist/free-agent lists) and route to proper API based on selected target state.

Finally update Jest suites for participants route, add refund route tests, and extend payment service tests for target-user payload behavior.

## Concrete Steps

From `/home/camka/Projects/MVP/mvp-site`:

1. Edit backend routes and tests:
   - `src/app/api/events/[eventId]/participants/route.ts`
   - `src/app/api/billing/refund/route.ts`
   - `src/app/api/events/__tests__/participantsRoute.test.ts`
   - add `src/app/api/billing/__tests__/refundRoute.test.ts`.
2. Edit web service + UI:
   - `src/lib/paymentService.ts`
   - `src/lib/eventService.ts`
   - `src/components/ui/RefundSection.tsx`
   - `src/app/discover/components/EventDetailSheet.tsx`
   - `src/lib/__tests__/paymentService.test.ts`.
3. Run focused tests and capture results.

## Validation and Acceptance

Acceptance behavior:

1. Parent can remove linked child from participants via leave flow.
2. Parent can request refund for linked child; refund row `userId` equals child; child removed from event arrays.
3. If parent and child are both enrolled, UI allows selecting either target; chosen target only is modified.
4. Existing self leave/refund flows keep working.

## Idempotence and Recovery

All changes are idempotent code edits. No schema migration required. If any tests fail due to unrelated local modifications, rerun targeted suites and report isolated failures.

## Artifacts and Notes

Key command transcripts and targeted test outputs will be appended after implementation.

## Interfaces and Dependencies

Interface additions:

- Refund API request accepts optional `userId` target.
- Payment service leave/refund accepts optional target user id.
- Event service adds waitlist removal helper for target user.

Plan update note: Created initial execution plan for parent-targeted withdrawal/refund across API + web discover flows.
