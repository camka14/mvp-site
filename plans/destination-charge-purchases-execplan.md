# Route One-Time Purchases to Connected Accounts with Destination Charges

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with [PLANS.md](/home/camka/Projects/MVP/mvp-site/PLANS.md) at the `mvp-site` repository root.

## Purpose / Big Picture

Today, organizations and hosts can complete Stripe Connect onboarding, but one-time purchase charges for events, rentals, and single-purchase store products still settle entirely on the platform account. After this change, those one-time purchases will become Stripe destination charges: the exact base sale amount selected by the buyer will be transferred to the connected account automatically, while the platform retains sales tax, platform fees, Stripe processing-fee recovery, and Stripe Tax fee recovery.

The visible proof is straightforward. In Stripe, successful one-time purchase charges will no longer show a blank `Transferred to` column, and the connected account’s pending balance will increase by the base purchase amount. Refunds for those destination charges will reverse the transfer so the connected account does not keep funds when the platform refunds a buyer.

## Progress

- [x] (2026-04-08T18:15:00Z) Confirmed the current one-time purchase flow creates plain platform `PaymentIntent`s with no Connect routing.
- [x] (2026-04-08T18:15:00Z) Confirmed connected account onboarding exists and persists `stripeAccounts.accountId`, but that data is only used for onboarding/login links.
- [x] (2026-04-08T18:15:00Z) Confirmed there is no later `transfers.create` fallback, so funds never leave the platform after one-time purchases.
- [x] (2026-04-08T18:15:00Z) Confirmed destination charges require refund reversal handling or the platform will absorb refunds while the connected account keeps the original transfer.
- [x] (2026-04-08T19:30:00Z) Added `src/lib/stripeConnectAccounts.ts` and patched the one-time purchase-intent route to set destination-charge `transfer_data` when a connected account exists.
- [x] (2026-04-08T19:35:00Z) Updated all refund paths that operate on purchase `PaymentIntent`s to reverse destination-charge transfers on refund.
- [x] (2026-04-08T19:45:00Z) Added regression tests covering purchase routing and refund reversal.
- [x] (2026-04-08T19:47:00Z) Added `docs/ops/stripe-purchase-fund-flow.md` as the durable repo note for future contributors.
- [x] (2026-04-08T19:58:00Z) Ran focused Jest and ESLint validation and recorded the exact commands and outcomes below.

## Surprises & Discoveries

- Observation: The platform already stores connected Stripe account IDs for organizations and individual hosts, but the payment flow never reads them.
  Evidence: `src/app/api/billing/host/callback/route.ts` writes `stripeAccounts.accountId`, while `src/app/api/billing/purchase-intent/route.ts` creates `paymentIntents.create(...)` without `transfer_data`, `on_behalf_of`, or `application_fee_amount`.

- Observation: One-time purchase flows can pay the connected account the exact base amount without any Stripe application-fee math.
  Evidence: The purchase-intent route already separates `subtotalCents` from tax and fee recovery in `TaxQuote`, so `transfer_data.amount = subtotalCents` is sufficient for events, rentals, and `SINGLE` products.

- Observation: Recurring product subscriptions are not the same problem as one-time purchases.
  Evidence: Stripe subscription destination charges can set `transfer_data[destination]`, but keeping the connected account at the exact fixed base amount each cycle requires invoice-level application-fee logic because tax and fee totals are not fixed forever. This ExecPlan intentionally scopes to one-time purchases.

## Decision Log

- Decision: Scope this change to one-time purchases handled by `src/app/api/billing/purchase-intent/route.ts`.
  Rationale: The user asked for the selected product/event/rental price to go directly to the connected account while the platform keeps the rest. That maps cleanly to one-time purchases because the route already computes a fixed `subtotalCents` for each checkout. Recurring subscriptions need a separate invoice-created design to preserve the host’s exact base amount each cycle.
  Date/Author: 2026-04-08 / Codex

- Decision: Keep the platform as the settlement merchant for these destination charges.
  Rationale: The platform is already computing tax on the platform account and the product/event/rental charge examples in this repo assume the platform keeps sales tax and fee recovery. This means we should add `transfer_data[destination]` and `transfer_data.amount`, but not `on_behalf_of`, for the one-time purchase flow.
  Date/Author: 2026-04-08 / Codex

- Decision: Reverse transfers during refunds when the refunded `PaymentIntent` was a destination charge.
  Rationale: Without `reverse_transfer: true`, the platform refunds the buyer but the connected account keeps its transferred funds. That is incorrect for this marketplace-style settlement model.
  Date/Author: 2026-04-08 / Codex

## Outcomes & Retrospective

Completed the one-time purchase destination-charge restoration without changing the current recurring subscription flow. `POST /api/billing/purchase-intent` now transfers the untaxed purchase subtotal to the connected account when one exists, and it leaves the tax and fee recovery on the platform exactly as intended. Refund paths now retrieve the payment intent before refunding so destination-charge refunds include `reverse_transfer: true`.

The main implementation guardrail was preserving the old platform-only behavior when no connected account is configured. That fallback remains in place, so the patch is additive rather than a hard dependency on Stripe Connect onboarding being complete.

Validation results:

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/__tests__/route.test.ts src/app/api/events/__tests__/eventDeleteRoute.test.ts"
    Result: Passed for the three shell-resolved suites; the team-refund route suite had to be rerun separately because the bracketed path was interpreted by the shell.

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand --runTestsByPath 'src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/__tests__/route.test.ts'"
    Result: Passed.

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx eslint src/app/api/billing/purchase-intent/route.ts src/server/refunds/refundExecution.ts src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts src/app/api/events/[eventId]/route.ts src/lib/stripeConnectAccounts.ts src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/__tests__/route.test.ts src/app/api/events/__tests__/eventDeleteRoute.test.ts"
    Result: Passed.

## Context and Orientation

The key route for one-time purchases is `src/app/api/billing/purchase-intent/route.ts`. It handles three purchase types: event registrations, rental time slots, and one-time store products. It calculates tax and fee recovery, creates a Stripe `PaymentIntent`, and writes enough metadata for the webhook in `src/app/api/billing/webhook/route.ts` to create a paid bill and bill payment after the charge succeeds.

Connected account onboarding lives in `src/app/api/billing/host/connect/route.ts`, `src/app/api/billing/host/callback/route.ts`, and `src/app/api/billing/host/onboarding-link/route.ts`. Those routes persist a Stripe connected account ID in the `StripeAccounts` Prisma model (`prisma/schema.prisma`) under the `accountId` field. The same table also stores platform-side customer IDs in `customerId`, so any lookup helper for destination charges must explicitly filter to rows that have a non-null `accountId`.

Refund flows that must stay consistent with destination charges live in three places:

- `src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts` for manual host refunds.
- `src/server/refunds/refundExecution.ts` for refund-request approvals.
- `src/app/api/events/[eventId]/route.ts` for automatic refunds during event deletion.

The repo currently has no shared Stripe Connect helper for fund-flow decisions. This change will add one in `src/lib/` so the purchase route and refund paths can agree on what constitutes a destination charge and how to reverse it safely.

## Plan of Work

First, add a small Stripe Connect helper under `src/lib/` that resolves a connected destination account by owner. It must accept an `organizationId` and an optional fallback `hostUserId`, query `prisma.stripeAccounts` for rows where `accountId` is present, prefer organization accounts over host-user accounts, and return a normalized Stripe connected account ID or `null`. The helper must also expose a tiny predicate or refund-parameter helper so refund routes can determine whether a `PaymentIntent` used a destination charge and whether `reverse_transfer` should be applied.

Next, update `src/app/api/billing/purchase-intent/route.ts`. After the route has resolved the purchase context and computed `taxQuote`, resolve the destination connected account from the organization and host metadata already present in the request payload. When a connected account exists, add `transfer_data.destination` and `transfer_data.amount = taxQuote.subtotalCents` to `stripe.paymentIntents.create(...)`. Keep the platform as the settlement merchant by omitting `on_behalf_of`. Preserve the existing metadata so webhooks, receipts, and billing continue to work.

Then update the refund paths. Before creating a Stripe refund, retrieve the `PaymentIntent` and inspect its `transfer_data.destination`. If a destination exists, include `reverse_transfer: true` in the refund request. Use a shared helper so all refund call sites behave the same way. This keeps connected-account balances accurate after buyer refunds and event deletions.

After the route changes, add focused Jest coverage. The purchase test must prove that when a connected account exists for the purchase owner, the route creates a destination charge that transfers exactly the base sale amount and leaves tax and fee recovery on the platform. The refund tests must prove that refunds on destination-charged `PaymentIntent`s include `reverse_transfer: true`, while plain platform charges continue without it.

Finally, add a durable note under `docs/` or another stable repository location explaining the chosen Stripe fund-flow model, the tax-liability choice, and the reason recurring subscriptions are not covered by this patch. Future agents should be able to read that note and immediately understand why one-time purchases use destination charges with fixed transfer amounts.

## Concrete Steps

Work from `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`.

1. Add a Stripe Connect destination-account helper under `src/lib/`.
2. Patch `src/app/api/billing/purchase-intent/route.ts` to use destination-charge parameters for one-time purchases when a connected account is available.
3. Patch the refund call sites to reverse destination-charge transfers.
4. Add or update Jest tests for the new purchase and refund behavior.
5. Add a short repository note explaining the fund-flow decision and current recurring-subscription limitation.
6. Run focused validation:

    npm test -- --runInBand src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/__tests__/route.test.ts src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/refund-requests/__tests__/route.test.ts

    npx eslint src/app/api/billing/purchase-intent/route.ts src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts src/server/refunds/refundExecution.ts src/app/api/events/[eventId]/route.ts src/lib/stripeConnectAccounts.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/__tests__/route.test.ts src/app/api/billing/__tests__/refundRoute.test.ts src/app/api/refund-requests/__tests__/route.test.ts

The exact commands and results will be updated after execution.

## Validation and Acceptance

Acceptance is behavior-based:

1. When an organization or host has a connected Stripe account, a one-time purchase charge created by `POST /api/billing/purchase-intent` includes Stripe destination-charge routing and transfers exactly the base sale amount to that connected account.
2. When no connected account exists, the route still creates the existing plain platform charge.
3. A refund on a destination-charged `PaymentIntent` includes `reverse_transfer: true`.
4. A refund on a plain platform `PaymentIntent` does not include `reverse_transfer`.
5. Existing purchase metadata, webhook-created bills, and fee breakdown responses remain intact.

## Idempotence and Recovery

These changes are code-only and additive. Re-running the purchase and refund tests is safe. If the purchase route patch fails partway through, the safest rollback is to revert the new Stripe Connect helper and all purchase/refund call sites together; do not leave destination charges enabled without refund reversal. No database migration is required for this patch.

## Artifacts and Notes

Evidence gathered before implementation:

    src/app/api/billing/purchase-intent/route.ts currently creates:
      stripe.paymentIntents.create({
        amount: taxQuote.totalChargeCents,
        currency: 'usd',
        ...
        metadata,
      })

    There is no `transfer_data`, `application_fee_amount`, `on_behalf_of`, or later `transfers.create` in the current one-time purchase flow.

    src/app/api/billing/host/callback/route.ts already stores connected Stripe account IDs in `stripeAccounts.accountId`.

    Refund call sites currently call `stripe.refunds.create({ payment_intent, ... })` without `reverse_transfer`.

## Interfaces and Dependencies

At the end of this work, these interfaces and behaviors must exist:

- `src/lib/stripeConnectAccounts.ts` (new)
  Exposes a helper that resolves the connected destination account for an organization or host user, and a helper for deciding whether a refund must reverse a transfer.

- `src/app/api/billing/purchase-intent/route.ts`
  Uses `transfer_data.destination` and `transfer_data.amount = subtotalCents` when a connected account exists for the purchase owner.

- `src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts`
  Reverses destination-charge transfers during refunds.

- `src/server/refunds/refundExecution.ts`
  Reverses destination-charge transfers during refund-request approval.

- `src/app/api/events/[eventId]/route.ts`
  Reverses destination-charge transfers during automatic event-deletion refunds.

- `docs/ops/stripe-purchase-fund-flow.md`
  Explains the current one-time purchase settlement model and the intentional recurring-subscription limitation.

Revision note: created this ExecPlan after tracing Stripe Connect onboarding, one-time purchase charge creation, and refund flows. The purpose is to restore destination-charge fund routing for one-time purchases without reintroducing the earlier “connected account exists but transfer never happens” confusion.
