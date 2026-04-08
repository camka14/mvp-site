# Route Recurring Product Subscriptions to Connected Accounts

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with [PLANS.md](/home/camka/Projects/MVP/mvp-site/PLANS.md) at the `mvp-site` repository root.

## Purpose / Big Picture

Recurring product subscriptions currently charge on the platform and never send recurring funds to the connected account, even when the organization has completed Stripe Connect onboarding. After this change, recurring product subscriptions will use Stripe destination charges so the connected account receives the selected recurring base price, while the platform keeps tax and fee recovery each cycle.

The visible proof is straightforward. The first subscription invoice payment should show a connected destination in Stripe, and renewal invoices should continue routing funds to the connected account while the platform retains the fee amount configured on each invoice.

## Progress

- [x] (2026-04-08T20:25:00Z) Confirmed the subscription create route currently creates a plain platform subscription with no `transfer_data`.
- [x] (2026-04-08T20:25:00Z) Confirmed the route already splits recurring billing into a base product item and a non-taxable platform-fee item.
- [x] (2026-04-08T20:25:00Z) Confirmed Stripe only supports fixed subscription platform fees at the invoice level, not as a flat recurring subscription parameter.
- [x] (2026-04-08T20:55:00Z) Patched the subscription create route to create destination-charge subscriptions and configure the first invoice PaymentIntent with a flat application fee amount.
- [x] (2026-04-08T21:00:00Z) Patched the billing webhook to configure renewal invoices on `invoice.created` with a flat `application_fee_amount` and `transfer_data.destination`.
- [x] (2026-04-08T21:06:00Z) Added regression tests for the subscription route and invoice-created webhook behavior.
- [x] (2026-04-08T21:08:00Z) Ran focused Jest and ESLint validation and recorded the exact commands/results below.

## Surprises & Discoveries

- Observation: Stripe subscriptions support `transfer_data[destination]`, but recurring flat platform fees must be set on each invoice rather than on the subscription itself.
  Evidence: Stripe’s Connect subscriptions docs say `application_fee_percent` must be percentage-based at the subscription level, and flat `application_fee_amount` must be added on each invoice created by the subscription.

- Observation: The first subscription invoice is special because it is produced during subscription creation and must be configured before the customer confirms the initial payment.
  Evidence: The current route expands `latest_invoice.confirmation_secret` immediately after `stripe.subscriptions.create(...)`, so the route has direct access to the first invoice’s PaymentIntent setup path.

## Decision Log

- Decision: Use destination charges for recurring subscriptions and keep the platform as the settlement merchant.
  Rationale: This matches the existing one-time purchase flow and the product tax-liability assumptions already used elsewhere in the repo.
  Date/Author: 2026-04-08 / Codex

- Decision: Set a flat platform fee amount on subscription invoices instead of trying to approximate the split with `application_fee_percent`.
  Rationale: The user wants the connected account to receive the selected recurring base price, while the platform keeps tax and fee recovery. Stripe’s subscription-level percentage fee cannot guarantee that exact fixed payout.
  Date/Author: 2026-04-08 / Codex

## Outcomes & Retrospective

Recurring product subscriptions now follow the same business split as one-time purchases: the connected account receives the recurring base price, while the platform keeps tax and fee recovery. The implementation is intentionally split across two stages because Stripe only supports flat recurring platform fees at the invoice level:

- the subscription route sets `transfer_data.destination` and updates the first invoice PaymentIntent with a flat `application_fee_amount`
- the webhook listens to `invoice.created` and configures each draft renewal invoice with the same fixed platform-take model before Stripe auto-charges it

The existing product subscription UX still works because the route continues returning Stripe’s confirmation secret; the client-secret guard was also widened to accept the subscription confirmation secret format instead of only raw `pi_...` secrets.

Validation results:

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand src/app/api/products/[id]/subscriptions/__tests__/route.test.ts src/app/api/billing/__tests__/webhookRoute.test.ts src/lib/__tests__/stripeClientSecret.test.ts"
    Result: Passed for the non-bracketed shell match set; the bracketed subscription route path was rerun directly to avoid shell path interpretation.

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand --runTestsByPath 'src/app/api/products/[id]/subscriptions/__tests__/route.test.ts' 'src/app/api/billing/__tests__/webhookRoute.test.ts'"
    Result: Passed.

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx eslint src/app/api/products/[id]/subscriptions/route.ts src/app/api/products/[id]/subscriptions/__tests__/route.test.ts src/app/api/billing/webhook/route.ts src/app/api/billing/__tests__/webhookRoute.test.ts src/lib/stripeConnectAccounts.ts src/lib/stripeClientSecret.ts src/lib/__tests__/stripeClientSecret.test.ts src/components/ui/PaymentModal.tsx"
    Result: Passed.
