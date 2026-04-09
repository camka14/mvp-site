# Reuse Incomplete Product Checkouts and Block Repeat Clicks

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with [PLANS.md](/home/camka/Projects/MVP/mvp-site/PLANS.md) at the `mvp-site` repository root.

## Purpose / Big Picture

Organization store purchases currently have two avoidable failure modes. First, the `Buy now` / `Subscribe` button can be clicked repeatedly before the checkout request finishes, which can create duplicate Stripe objects. Second, the backend always creates a new Stripe `PaymentIntent` or subscription checkout even when the same buyer already has an unfinished checkout for the same product. After this change, the first click will disable the product button while checkout starts, and the backend will reuse matching incomplete Stripe checkouts instead of creating duplicates.

The visible proof is simple. On the organization store tab, clicking `Subscribe` or `Buy now` should immediately show a loading state and ignore repeated clicks until the request resolves. On the backend, repeating the same product checkout request before payment completion should return the existing client secret rather than minting a second Stripe object.

## Progress

- [x] (2026-04-08T16:29:14-07:00) Confirmed the organization store page does not track an in-flight checkout button state, so repeated clicks can invoke the same checkout route multiple times.
- [x] (2026-04-08T16:29:14-07:00) Confirmed both `src/app/api/billing/purchase-intent/route.ts` and `src/app/api/products/[id]/subscriptions/route.ts` always create new Stripe objects and never search for reusable incomplete ones.
- [x] (2026-04-08T16:39:00-07:00) Added per-request button guarding on the organization store page so repeated clicks cannot start multiple product checkouts in parallel.
- [x] (2026-04-08T16:42:00-07:00) Added `src/lib/stripeCheckoutReuse.ts` and wired product checkout routes to reuse matching unfinished Stripe objects.
- [x] (2026-04-08T16:45:00-07:00) Added regression coverage for one-time product PaymentIntent reuse and recurring subscription reuse.
- [x] (2026-04-08T16:47:28-07:00) Updated the durable payment-flow note with checkout-reuse rules and tradeoffs.
- [x] (2026-04-08T16:47:28-07:00) Ran focused Jest and ESLint validation and recorded the results.

## Surprises & Discoveries

- Observation: The local Prisma `PaymentIntents` table is not useful for checkout reuse.
  Evidence: `prisma/schema.prisma` only stores `id`, `eventId`, and `userId` for `PaymentIntents`, so it does not contain Stripe status, client secrets, product IDs, tax totals, or connected-account routing details.

- Observation: Reuse has to be stricter than "same product and same user".
  Evidence: Tax amount and payout routing can change if the buyer changes billing address or if the organization's connected account status changes, so reuse must also match the computed total and Connect destination settings.

- Observation: Product checkout reuse still occurs after the route computes the current tax quote.
  Evidence: Both product routes need the current total charge before they can prove that an older unfinished Stripe object is still safe to reuse, so duplicate clicks no longer create duplicate Stripe checkout objects but can still create a fresh Stripe Tax calculation first.

## Decision Log

- Decision: Reuse incomplete checkouts from Stripe itself instead of extending local Prisma state first.
  Rationale: Stripe is already the source of truth for whether a `PaymentIntent` or subscription is still unfinished. Reusing Stripe objects avoids a migration and keeps the logic aligned with the actual checkout object that the client must confirm.
  Date/Author: 2026-04-08 / Codex

- Decision: Only reuse when the existing unfinished checkout matches the same customer, product, computed total, billing-address fingerprint, and connected-account routing.
  Rationale: This prevents reviving stale checkouts that were created under different tax assumptions or payout settings.
  Date/Author: 2026-04-08 / Codex

## Outcomes & Retrospective

Completed the product checkout idempotency patch across the organization store UI and both Stripe product checkout routes. The organization store button now blocks repeat clicks while checkout start is in flight, one-time product purchases reuse matching incomplete Stripe `PaymentIntent`s, and recurring product subscriptions reuse matching incomplete Stripe subscriptions when the billing address, total charge, and payout routing still match.

The main tradeoff is that reuse happens after the current tax quote is calculated, because matching on the current total is part of the safety check. That means the backend still performs a fresh tax calculation on each checkout-start attempt even when it ultimately returns an existing unfinished Stripe object. This is acceptable for now because it avoids stale checkout reuse, but it is worth remembering if Stripe Tax calculation volume becomes a concern later.

Validation results:

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npm test -- --runInBand --runTestsByPath 'src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts' 'src/app/api/products/[id]/subscriptions/__tests__/route.test.ts'"
    Result: Passed. One expected console error still appears from the existing Stripe failure-path test that verifies the route returns `502` instead of a fake client secret.

    wsl.exe bash -lc "cd /home/camka/Projects/MVP/mvp-site && npx eslint 'src/app/organizations/[id]/page.tsx' 'src/app/api/billing/purchase-intent/route.ts' 'src/app/api/products/[id]/subscriptions/route.ts' 'src/lib/stripeCheckoutReuse.ts' 'src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts' 'src/app/api/products/[id]/subscriptions/__tests__/route.test.ts' 'src/components/ui/PaymentModal.tsx' 'src/components/ui/paymentModalCopy.ts' 'src/components/ui/__tests__/paymentModalCopy.test.ts'"
    Result: Passed.

## Context and Orientation

The frontend entry point is `src/app/organizations/[id]/page.tsx`. That page renders store products and starts checkout from `handlePurchaseProduct(...)`, which delegates to `startProductCheckout(...)`. Today the button always remains clickable while the request is in flight.

One-time product purchases use `src/app/api/billing/purchase-intent/route.ts`. That route is also shared by event registrations and rentals, but this change only adds reuse for the product purchase path. The route already computes tax, fee breakdowns, and destination-charge transfer settings, then creates a Stripe `PaymentIntent`.

Recurring product subscriptions use `src/app/api/products/[id]/subscriptions/route.ts`. That route computes tax, ensures the Stripe recurring catalog exists, creates a Stripe subscription, and returns the first invoice confirmation secret. It already supports connected-account destination charges for the first invoice and renewals.

The durable payment-flow note for future contributors lives in `docs/ops/stripe-purchase-fund-flow.md`. This change must update that file so the reuse rules are documented alongside the existing destination-charge rules.

## Plan of Work

First, patch the organization store page so each product button knows whether checkout is currently starting for that specific product. The button should enter a loading and disabled state on click, and it should be re-enabled once checkout either opens, requests a billing address, or fails.

Next, add a small helper under `src/lib/` that computes a deterministic fingerprint from a billing address and exposes Stripe checkout-reuse helpers. The helpers should search the buyer's Stripe objects, filter to unfinished states, and only return a reusable object when all routing and pricing details still match the current request.

Then, wire the one-time product route to reuse a matching incomplete `PaymentIntent` before creating a new one, and wire the recurring subscription route to reuse a matching incomplete subscription checkout before creating a second subscription. The response shape must remain unchanged so the existing payment modal can keep using the returned client secret.

Finally, add focused tests for one-time product reuse and recurring subscription reuse, then update the payment-flow note so future agents understand why reuse is keyed this way and why event/rental reuse is intentionally not broadened in the same patch.

## Concrete Steps

Work from `\\wsl.localhost\Ubuntu\home\camka\Projects\MVP\mvp-site`.

1. Patch `src/app/organizations/[id]/page.tsx` to track the in-flight product checkout button and show loading/disabled state.
2. Add a Stripe checkout-reuse helper under `src/lib/`.
3. Update `src/app/api/billing/purchase-intent/route.ts` to reuse matching incomplete one-time product `PaymentIntent`s.
4. Update `src/app/api/products/[id]/subscriptions/route.ts` to reuse matching incomplete subscription checkouts.
5. Add Jest coverage for the reuse behavior and any extracted UI logic.
6. Update `docs/ops/stripe-purchase-fund-flow.md`.
7. Run focused validation:

    npm test -- --runInBand src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts src/app/api/products/[id]/subscriptions/__tests__/route.test.ts

    npx eslint src/app/organizations/[id]/page.tsx src/app/api/billing/purchase-intent/route.ts src/app/api/products/[id]/subscriptions/route.ts src/lib/stripeCheckoutReuse.ts src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts src/app/api/products/[id]/subscriptions/__tests__/route.test.ts

The exact commands and results are recorded in `Outcomes & Retrospective`.

## Validation and Acceptance

Acceptance is behavior-based:

1. Clicking `Subscribe` or `Buy now` on an organization product immediately disables that button and prevents repeat checkout-start requests until the current request resolves.
2. Repeating the same unfinished one-time product checkout returns the same Stripe client secret instead of creating a second `PaymentIntent`.
3. Repeating the same unfinished recurring product checkout returns the same Stripe confirmation secret instead of creating a second subscription.
4. If the pricing, billing-address fingerprint, or connected-account routing no longer matches, the backend creates a fresh Stripe object instead of reusing the old one.
5. Existing destination-charge payout behavior remains unchanged for newly created product and subscription checkouts.

## Idempotence and Recovery

These steps are safe to rerun. The reuse helpers are additive and only apply when Stripe still shows an unfinished checkout that matches the current request. If the route patch fails partway through, the safe fallback is to remove the reuse helper and keep the current "always create new checkout" behavior; do not partially reuse Stripe objects without the matching guards because that can revive stale tax or payout settings.

## Artifacts and Notes

Evidence gathered before implementation:

    src/app/organizations/[id]/page.tsx
      handlePurchaseProduct(product) -> startProductCheckout(product)
      The rendered Button does not use any loading or in-flight state.

    src/app/api/billing/purchase-intent/route.ts
      Always calls stripe.paymentIntents.create(...) after tax calculation.

    src/app/api/products/[id]/subscriptions/route.ts
      Always calls stripe.subscriptions.create(...) after tax calculation and catalog sync.

## Interfaces and Dependencies

At the end of this work, these interfaces and behaviors must exist:

- `src/app/organizations/[id]/page.tsx`
  Tracks which product checkout request is in flight and disables that button while the request is starting.

- `src/lib/stripeCheckoutReuse.ts`
  Exposes helpers for computing a billing-address fingerprint and locating reusable incomplete Stripe checkouts for products.

- `src/app/api/billing/purchase-intent/route.ts`
  Reuses matching incomplete one-time product `PaymentIntent`s before creating a new one.

- `src/app/api/products/[id]/subscriptions/route.ts`
  Reuses matching incomplete product-subscription checkouts before creating a new subscription.

- `docs/ops/stripe-purchase-fund-flow.md`
  Documents the checkout-reuse rules and why they are constrained to matching totals, billing-address fingerprints, and connected-account routing.

Revision note: created this ExecPlan after tracing the organization store checkout start path and the two Stripe product checkout routes. The intent is to make checkout start idempotent from both the UI and Stripe backend sides without changing the existing destination-charge settlement rules.

Revision note: updated after implementation to record the chosen reuse rules, the Stripe Tax calculation tradeoff, and the final validation commands/results.
