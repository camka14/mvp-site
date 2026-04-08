# Automatic Withdrawal Refunds

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, the event-details withdrawal button does what its label promises. When a paid registration is still inside the host-configured refund window, clicking `Withdraw and Get Refund` immediately creates the Stripe refund, records an approved refund request for audit history, and removes the registration in the same server flow. When the registration is outside that window, the UI continues to show a request-based flow and the server only creates a waiting refund request. A host or tester can verify the behavior by withdrawing from a paid event before the refund deadline and seeing both the registration removal and an approved refund reflected in the data and Stripe mocks, then repeating outside the deadline and seeing only a waiting request.

## Progress

- [x] (2026-04-08T01:03:00Z) Reviewed the current refund UI and confirmed that `RefundSection` already shows `Withdraw and Get Refund` based on `cancellationRefundHours`, but the corresponding API flows still only create waiting refund requests.
- [x] (2026-04-08T01:03:00Z) Reviewed the team participant-delete route and the individual refund route and confirmed both withdrawal paths diverge from the approval route’s Stripe refund logic.
- [x] (2026-04-08T01:21:00Z) Extracted shared refund-policy and refund-execution helpers so approval, automatic individual refunds, and automatic team refunds use the same eligibility rule and Stripe bookkeeping.
- [x] (2026-04-08T01:21:00Z) Updated the automatic individual refund route and the team participant-withdrawal route so in-window paid withdrawals create immediate Stripe refunds plus approved refund request records.
- [x] (2026-04-08T01:21:00Z) Updated focused regression tests for the refund UI, payment service, individual refund route, participant-delete route, and refund approval route, then ran the combined Jest suites successfully.

## Surprises & Discoveries

- Observation: The UI already decides between `Withdraw and Get Refund` and `Withdraw and Request Refund` entirely from `cancellationRefundHours` and event start time, but that decision is not enforced on the server.
  Evidence: `src/components/ui/RefundSection.tsx` calculates `canAutoRefund` from `event.start` and `event.cancellationRefundHours`, while `src/app/api/billing/refund/route.ts` always creates a waiting refund request and `src/app/api/events/[eventId]/participants/route.ts` always calls `ensureTeamRefundRequest(...)`.
- Observation: Stripe refund execution already exists for host approval and for host-managed partial team refunds, so the missing piece is not Stripe support itself; it is reuse and wiring.
  Evidence: `src/app/api/refund-requests/[id]/route.ts` already resolves refundable payments and creates Stripe refunds, and `src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts` already persists direct Stripe refund results to `BillPayments.refundedAmountCents`.
- Observation: The slot-provisioned team withdrawal path can still be tested cleanly without a live database by reusing the existing `participantsRoute.test.ts` transaction mock and mocking the Stripe refund calls.
  Evidence: The new schedulable-team test passes while asserting both slot-team reset behavior and automatic refund persistence in the same mocked transaction flow.

## Decision Log

- Decision: Keep an approved `RefundRequests` row even for automatic refunds.
  Rationale: The user asked for immediate refunds, not for removing audit history. An approved row preserves the refund trail while still distinguishing immediate refunds from waiting host-reviewed requests.
  Date/Author: 2026-04-08 / Codex
- Decision: Share refund execution helpers between approval and automatic-refund routes instead of duplicating Stripe logic.
  Rationale: The current bug exists because the product had multiple refund paths with different behavior. Shared helpers reduce the chance of future drift between manual approval and automatic withdrawal refunds.
  Date/Author: 2026-04-08 / Codex
- Decision: Keep team automatic refunds on the participant-delete route by adding refund intent metadata, rather than moving the event-details flow onto `/api/billing/refund-all`.
  Rationale: The participant-delete route already owns the slot-team removal logic for schedulable events. Extending that route with `refundMode` and `refundReason` keeps the existing withdrawal semantics intact while adding immediate refund behavior only when the caller explicitly asks for it.
  Date/Author: 2026-04-08 / Codex

## Outcomes & Retrospective

The implementation landed as planned. `RefundSection` now shares refund-policy logic with the server, automatic individual refunds use the shared Stripe executor instead of creating waiting requests, and team refund clicks now send explicit refund intent through the participant-delete API so slot-team withdrawals can auto-refund immediately when eligible.

The resulting product rule is now consistent: if the UI presents `Withdraw and Get Refund`, the server either completes the Stripe refund and records an approved refund request, or it returns an error without silently downgrading the action into a waiting request. Outside the refund window, the UI still presents a request-based flow and the server persists only a waiting request.

## Context and Orientation

The refund UI for event details lives in `src/components/ui/RefundSection.tsx`. That component decides whether a paid participant sees `Withdraw and Get Refund` or `Withdraw and Request Refund`. It currently bases that decision on whether the event start time is in the future and whether `cancellationRefundHours` places the current time before the refund deadline.

The individual paid withdrawal API lives in `src/app/api/billing/refund/route.ts`. Today it removes the participant from event state and creates a `RefundRequests` row with status `WAITING`. The team withdrawal API lives inside `src/app/api/events/[eventId]/participants/route.ts`; when removing a team, it clears the team registration and calls `ensureTeamRefundRequest(...)`, which also creates only a `WAITING` request. The manual host approval path lives in `src/app/api/refund-requests/[id]/route.ts`; unlike the withdrawal routes, it already resolves the relevant `BillPayments`, calls Stripe refunds, and updates `refundedAmountCents`.

In this repository, a refund request row is the audit record in the `RefundRequests` table. A refund is financially real only when a Stripe refund object is created against one or more `BillPayments.paymentIntentId` values, and the corresponding `BillPayments.refundedAmountCents` values are increased. An automatic refund must therefore do both things: create or update the audit row and execute the financial refund.

## Plan of Work

First, add a shared refund-processing module under `src/server` or `src/lib` that contains the reusable pieces currently embedded in `src/app/api/refund-requests/[id]/route.ts`: ID normalization, refundable-payment resolution for individual or team requests, Stripe refund execution with idempotency keys, and the bill-payment bookkeeping that increments `refundedAmountCents`. Keep the helper narrow and data-driven so routes can supply either an existing refund request row or a new in-memory request shape before persisting it.

Second, add a small shared refund-policy helper that computes whether an event is inside the automatic refund window from `event.start` and `event.cancellationRefundHours`. Update `src/components/ui/RefundSection.tsx` to consume that helper so the UI and server both speak the same policy language.

Third, update `src/app/api/billing/refund/route.ts`. When the target registration is eligible for automatic refund and a refundable payment exists, the route should attempt the Stripe refund first using the shared helper. If Stripe succeeds, the route should commit a database transaction that removes the participant from the event, creates an `APPROVED` refund request row (or upgrades an existing waiting row), and persists the `BillPayments.refundedAmountCents` updates. When the registration is not eligible for automatic refund, preserve the current waiting-request behavior.

Fourth, update `src/app/api/events/[eventId]/participants/route.ts` for the team-withdrawal path. When a paid team withdrawal is still inside the automatic refund window, do not call `ensureTeamRefundRequest(...)`. Instead, build the request shape for the actual slot team being removed, execute Stripe refunds with the shared helper, and inside the existing transaction create an `APPROVED` refund request row plus the bill-payment updates while removing the team registration. If the event is outside the automatic window, keep the current waiting-request path.

Finally, update the tests. Extend `src/components/ui/__tests__/RefundSection.test.tsx` to prove the immediate-refund label still maps to the direct refund action and the out-of-window label still maps to the request path. Extend `src/app/api/billing/__tests__/refundRoute.test.ts` so automatic refunds create approved rows and no-waiting-only downgrade occurs. Extend `src/app/api/events/__tests__/participantsRoute.test.ts` so automatic team withdrawals create approved refund rows and update bill payments, while out-of-window team withdrawals still create waiting requests.

## Concrete Steps

Work from `/home/camka/Projects/MVP/mvp-site`.

Run the automatic refund route tests:

    npm test -- --runTestsByPath src/app/api/billing/__tests__/refundRoute.test.ts

Run the participant-delete refund tests:

    npm test -- --runTestsByPath src/app/api/events/__tests__/participantsRoute.test.ts

Run the UI regression together with both API suites:

    npm test -- --runTestsByPath src/components/ui/__tests__/RefundSection.test.tsx src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/events/__tests__/participantsRoute.test.ts src/app/api/refund-requests/__tests__/route.test.ts

## Validation and Acceptance

Acceptance is met when all of the following are true:

For a paid registration inside the refund window, clicking the event-details button path represented by `Withdraw and Get Refund` triggers a Stripe refund in tests, records an approved refund request, and removes the participant or team registration.

For a paid registration outside the refund window, the same UI shows `Withdraw and Request Refund`, and the server only creates a waiting refund request without hitting Stripe.

The host approval route still works, using the same shared Stripe refund logic, and focused Jest coverage passes for refund requests, refund route handling, participant deletion, and the refund UI.

## Idempotence and Recovery

The test commands are safe to re-run. Shared Stripe refund execution must continue to use idempotency keys based on the refund request ID and bill payment ID so retries do not duplicate external refunds. If a route test fails after helper extraction, restore the helper contracts first and re-run the narrowest affected suite before running the full combined set. No schema change is required for this plan.

## Artifacts and Notes

The most important evidence after implementation should look like:

    PASS src/app/api/billing/__tests__/refundRoute.test.ts
    PASS src/app/api/events/__tests__/participantsRoute.test.ts
    PASS src/components/ui/__tests__/RefundSection.test.tsx
    PASS src/app/api/refund-requests/__tests__/route.test.ts
    PASS src/lib/__tests__/paymentService.test.ts

The resulting diff should show the shared refund helper, automatic approval behavior in the individual and team withdrawal routes, and test cases that explicitly distinguish immediate refunds from waiting refund requests.

## Interfaces and Dependencies

Use the existing Stripe SDK already in the repository. Keep Prisma access through `src/lib/prisma.ts`. Preserve the public route signatures:

    export async function POST(req: NextRequest)

for `src/app/api/billing/refund/route.ts`, and

    export async function DELETE(req: NextRequest, { params }: { params: Promise<{ eventId: string }> })

for `src/app/api/events/[eventId]/participants/route.ts`.

At the end of this change there must be one shared server-side helper surface that can:

    resolveRefundablePaymentsForRequest(client, request)
    createStripeRefundAttempts({ request, payments, approvedByUserId })
    applyRefundAttempts(tx, attempts, now)

or equivalent stable names with the same responsibilities.

Change note: Created this ExecPlan because the user-visible refund behavior now spans the UI label, automatic withdrawal routes, and the host approval route, and a self-contained plan is the safest way to keep those layers aligned.

Change note: Updated the plan after implementation to record the shared helpers, the participant-delete refund intent wiring, and the exact focused Jest suites that now pass for immediate versus request-based refund behavior.
