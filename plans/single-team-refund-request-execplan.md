# Single Team Refund Request

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, a team withdrawal refund stays represented by one refund request row for the team. When a host approves that one request, BracketIQ refunds every paid bill payment tied to that team registration and does not create extra “fanout” refund request rows for each player. A host can verify the behavior by approving one team refund request, seeing only one request remain in the refund list, and seeing the related Stripe refund objects created for the underlying event payments.

## Progress

- [x] (2026-04-08T00:23:54Z) Reviewed the current refund request creation, approval, and listing routes and confirmed that approval both toggles status and creates team fanout rows.
- [x] (2026-04-08T00:27:28Z) Removed team fanout row creation from `src/app/api/refund-requests/[id]/route.ts` and kept approval focused on Stripe refunds plus `BillPayments.refundedAmountCents` updates.
- [x] (2026-04-08T00:27:28Z) Hid legacy `team_refund_fanout` rows from `src/app/api/refund-requests/route.ts` so hosts and users only see the single team request.
- [x] (2026-04-08T00:27:28Z) Updated focused Jest coverage for refund approval and refund listing, then ran the refund UI regression suite alongside the API tests.

## Surprises & Discoveries

- Observation: The earlier approval route bug was larger than expected. It did not call Stripe at all; it only marked the request `APPROVED` and optionally created more refund request rows.
  Evidence: `src/app/api/refund-requests/[id]/route.ts` updated the `refundRequests` table and called `fanoutTeamRefundApproval`, but never touched Stripe before the latest patch.
- Observation: Existing production-like data already contains legacy `team_refund_fanout` rows, so stopping future fanout is not enough to produce a single-request UI.
  Evidence: Refund request `69f176dd-d08c-44ef-9ae3-46d967e72521` has reason `team_refund_fanout` and status `APPROVED`.
- Observation: The approval route can refund multiple bill payments from one team request without needing any extra `RefundRequests` rows because bill ownership is already derivable from the team, parent team, split bills, and direct player bills.
  Evidence: The focused test now approves one team request and asserts three Stripe refunds with no `refundRequests.create(...)` calls.

## Decision Log

- Decision: Keep the approval route responsible for Stripe refunds and bill-payment bookkeeping instead of introducing another refund executor module during this refactor.
  Rationale: The route already owns the approval action, and keeping the change local minimizes surface area while still delivering observable behavior.
  Date/Author: 2026-04-08 / Codex
- Decision: Filter legacy `team_refund_fanout` rows at the list API boundary instead of attempting a destructive data cleanup in this task.
  Rationale: The user asked for the product behavior to stop showing duplicate requests. Filtering is safe, immediate, and avoids risky mutation of historical records.
  Date/Author: 2026-04-08 / Codex

## Outcomes & Retrospective

The refactor landed as planned. Team refund approval now keeps one request row, refunds the linked paid bill payments directly, and updates `refundedAmountCents` without creating `team_refund_fanout` rows. The list API also hides legacy fanout rows so the UI matches the new product rule immediately.

One gap remains outside this code change: historical refund rows that were created against the wrong team or without matching bill data still cannot produce a Stripe refund because there is no refundable billing record to operate on. That is a data-linkage issue, not a remaining code path issue in this plan.

## Context and Orientation

Refund requests are stored in the Prisma `RefundRequests` table and exposed through the Next.js route handlers in `src/app/api/refund-requests`. The list endpoint in `src/app/api/refund-requests/route.ts` returns refund request rows for profile and organization screens. The approval endpoint in `src/app/api/refund-requests/[id]/route.ts` is invoked when a host clicks approve in `src/components/ui/RefundRequestsList.tsx`.

In the old design, a “fanout” row meant a second `RefundRequests` record with reason `team_refund_fanout`. Those rows were created after a host approved a team request so the system could attach an approved row to each player. The user no longer wants that. The desired behavior is simpler: one team refund request row remains the source of truth, and approving it should refund the related bill payments directly.

The Stripe refund source of truth is the `BillPayments` table. Each row has `paymentIntentId`, `amountCents`, and `refundedAmountCents`. A bill payment is refundable when it is `PAID`, has a Stripe payment intent, and `amountCents > refundedAmountCents`. The approval route already has code to resolve those bill payments and create Stripe refunds.

## Plan of Work

First, edit `src/app/api/refund-requests/[id]/route.ts` to remove the fanout helper and its invocation. Keep the existing logic that resolves refundable payments and creates Stripe refunds, but make the response report only the refunds performed for the approved request itself. The route should no longer create or update `team_refund_fanout` rows.

Second, edit `src/app/api/refund-requests/route.ts` so the `findMany` query excludes rows whose `reason` is `team_refund_fanout`. This keeps existing duplicate rows out of the UI without touching stored data. The filters for `organizationId`, `userId`, and `hostId` must continue to work.

Third, update `src/app/api/refund-requests/__tests__/route.test.ts`. Replace the two fanout-specific tests with tests that prove: approving a team refund does not create extra `RefundRequests` rows, and approving an individual or team refund creates Stripe refunds and persists `refundedAmountCents`. Add or adjust any list-route tests if necessary so filtered fanout rows stay hidden.

## Concrete Steps

Work from `/home/camka/Projects/MVP/mvp-site`.

Run the focused refund approval tests:

    npm test -- --runTestsByPath src/app/api/refund-requests/__tests__/route.test.ts

Run the refund approval tests together with the refund UI regression:

    npm test -- --runTestsByPath src/components/ui/__tests__/RefundSection.test.tsx src/app/api/refund-requests/__tests__/route.test.ts

If a list-route test is added or changed, run it explicitly:

    npm test -- --runTestsByPath src/app/api/refund-requests/__tests__/route.test.ts src/components/ui/__tests__/RefundRequestsList.test.tsx

## Validation and Acceptance

Acceptance is met when all of the following are true:

One host approval of a team refund request leaves one refund request visible in the refund list for that team. No new `team_refund_fanout` rows are returned by the list API.

Approving the request creates Stripe refunds for every refundable paid bill payment tied to that team registration and updates `BillPayments.refundedAmountCents` for each refunded payment.

Running

    npm test -- --runTestsByPath src/components/ui/__tests__/RefundSection.test.tsx src/app/api/refund-requests/__tests__/route.test.ts

passes, and any list-route coverage added for fanout filtering also passes.

## Idempotence and Recovery

The route-level changes are safe to re-run because Stripe refund creation uses idempotency keys based on the refund request ID and bill payment ID. Re-running the test commands is safe. If a test fails midway, fix the mock setup and re-run the same focused command. No schema or data migration is part of this task.

## Artifacts and Notes

Evidence to capture after implementation:

    PASS src/app/api/refund-requests/__tests__/route.test.ts
    PASS src/components/ui/__tests__/RefundSection.test.tsx

The route diff now shows the removal of fanout row creation from approval and the list-route diff shows filtering out `team_refund_fanout`.

## Interfaces and Dependencies

Use the existing Stripe SDK already imported in `src/app/api/refund-requests/[id]/route.ts`. Keep using Prisma through `src/lib/prisma.ts`. Preserve the route signature:

    export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> })

and the list route signature:

    export async function GET(req: NextRequest)

At the end of this task, the PATCH route must still return the updated refund request, plus summary refund metadata for the actual Stripe refunds performed, without fanout row side effects.

Change note: Created this ExecPlan because the refund flow is being simplified from a fanout-based design to a single-request design, and the plan records both the desired user-visible behavior and the safe migration path for legacy rows.

Change note: Updated the plan after implementation to record that team fanout row creation was removed, legacy fanout rows are filtered from the list API, and the focused refund suites passed. This update keeps the living document aligned with the shipped behavior.
