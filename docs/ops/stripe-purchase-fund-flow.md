# Stripe purchase fund flow

## Current one-time purchase behavior

`src/app/api/billing/purchase-intent/route.ts` is the shared one-time purchase entry point for:

- event registrations
- rentals
- single-purchase products

When a connected account exists, the route now creates a Stripe destination charge by setting `transfer_data` on the platform `PaymentIntent`.

The transfer amount is always the untaxed purchase subtotal (`taxQuote.subtotalCents`).

That means the connected account receives only the organizer-selected base price, while the platform retains:

- sales tax
- platform/MVP fees
- Stripe processing fee recovery
- Stripe Tax fee recovery

The route resolves the destination account in this order:

1. `stripeAccounts.organizationId`
2. `stripeAccounts.userId` for the event host

If no connected account is found, the route preserves the previous platform-only payment behavior and does not set `transfer_data`.

When Stripe fails to create a real payment intent, the API must return an error response instead of a synthetic `pi_fallback_*` value. The frontend Stripe Elements integration only accepts genuine client secrets shaped like `..._secret_...`, and fake placeholders will crash the checkout UI if they are treated as valid.

## Current recurring subscription behavior

`src/app/api/products/[id]/subscriptions/route.ts` now creates destination-charge subscriptions when a connected account exists for the organization.

The first invoice is handled in the subscription route itself:

- the subscription is created with `transfer_data.destination`
- the first invoice’s PaymentIntent is retrieved immediately
- `application_fee_amount` is set to the non-base amount (`totalCharge - baseRecurringPrice`)

This keeps the connected account at the organizer-selected recurring base price on the initial payment, while the platform keeps:

- sales tax
- platform/MVP fees
- Stripe processing fee recovery
- Stripe Tax fee recovery

Renewal invoices are handled in `src/app/api/billing/webhook/route.ts` on `invoice.created`:

- retrieve the Stripe subscription
- resolve the current connected account from the organization
- compute the base recurring amount from the `product_base` subscription item
- update the draft invoice with `application_fee_amount` and `transfer_data.destination`

This matches Stripe’s recommendation for flat recurring platform fees: use destination charges on the subscription and set a flat `application_fee_amount` on each subscription invoice.

## Refund requirement

Any refund path that targets a destination charge must set `reverse_transfer: true` on the Stripe refund request. Otherwise the buyer is refunded from the platform while the connected account keeps the transferred funds.

Current refund call sites that handle this:

- `src/server/refunds/refundExecution.ts`
- `src/app/api/events/[eventId]/teams/[teamId]/billing/refunds/route.ts`
- `src/app/api/events/[eventId]/route.ts`

Those paths now retrieve the payment intent first and automatically set `reverse_transfer` when the payment intent has `transfer_data.destination`.

## Remaining limitation

If a recurring subscription was created before the connected account existed, the initial invoice will already have been platform-only. Renewal invoices can still be configured once the connected account exists, but there is no retroactive transfer for earlier invoice payments.
