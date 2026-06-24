# Add Discount Offers and Generated Codes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md` at the `mvp-site` repository root.

## Purpose / Big Picture

After this change, event hosts, organizations, and eligible team or store managers can create discounts for paid events, products, memberships, and team registrations. A discount is an offer tied to one purchasable item and stores the final discounted price in cents. Each discount can have many generated codes, and each code can have an optional usage limit. Buyers enter a code during checkout; the server validates that the code belongs to the exact item being purchased, applies the stored final price, and records code usage after the purchase succeeds.

The visible behavior is that a manager can create a discount for a specific item, generate a code such as `SUMMER25`, and a buyer can apply that code at checkout to see the lower total. A code with a usage limit stops working once redemptions reach that limit.

## Progress

- [x] (2026-06-24T15:19:20Z) Read `PLANS.md`, inspected current product, event, team-registration, organization-tab, and checkout code paths, and created this living ExecPlan.
- [x] (2026-06-24T15:23:52Z) Added Prisma enums, models, indexes, and migration SQL for discounts, generated codes, and code redemptions.
- [x] (2026-06-24T15:23:52Z) Added `src/server/discounts/discountCodeResolver.ts` with focused Jest coverage for code normalization, target validation, usage limits, amount clamping, and redemption idempotency.
- [x] (2026-06-24T15:28:43Z) Wired authenticated event, product, and team-registration PaymentIntent checkout through the resolver for paid discounted checkouts.
- [x] (2026-06-24T15:28:43Z) Wired guest event PaymentIntent checkout through the same resolver for paid discounted checkouts.
- [ ] Record redemptions and increment code usage after successful paid and zero-dollar checkouts. Completed: paid Stripe PaymentIntent webhook metadata parsing and idempotent redemption recording. Remaining: zero-dollar no-Stripe completion path.
- [ ] Add API routes and client service helpers for listing discounts, creating discounts, generating codes, and disabling codes. Completed: `GET/POST /api/discounts`, `POST /api/discounts/[discountId]/codes`, and `src/lib/discountService.ts`. Remaining: code deactivation endpoint and focused route tests.
- [ ] Add organization and profile management surfaces for discounts.
- [ ] Add checkout code-entry UI for event registration, guest registration, products, memberships, and team registrations.
- [ ] Run focused Jest tests after each server milestone, then `npx tsc --noEmit` and browser smoke tests after UI wiring.

## Surprises & Discoveries

- Observation: Authenticated product, event, rental, and team-registration checkout already share `src/app/api/billing/purchase-intent/route.ts`, but guest event checkout uses a separate route.
  Evidence: `src/lib/purchaseContext.ts` returns canonical product and team registration amounts, while `src/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route.ts` separately calls `resolveEventRegistrationPriceCents`.

- Observation: Reusable incomplete Stripe `PaymentIntent`s already match on total amount, so discount code details must participate in metadata and/or the matching inputs.
  Evidence: `src/lib/stripeCheckoutReuse.ts` is used by `purchase-intent` and looks for a matching `totalChargeCents`.

- Observation: The current checkout route cannot honestly complete a 100 percent discount by returning a normal payment response.
  Evidence: `src/app/api/billing/purchase-intent/route.ts` returns Stripe `PAYMENT_INTENT` responses and rejects non-positive amounts before creating Stripe objects. The first implementation keeps zero-dollar completion as a separate milestone instead of faking a Stripe intent.

## Decision Log

- Decision: Store the final discounted price in `Discounts.discountedPriceCents` and treat percent or flat discount fields as UI helpers only.
  Rationale: The checkout server can apply one simple, auditable amount and does not need to replay historical UI arithmetic. This also matches the user requirement that flat values are stored as the new item price rather than as a discount amount.
  Date/Author: 2026-06-24 / Codex

- Decision: Put usage limits on generated codes, not on discount offers.
  Rationale: The user clarified that the discount item should have multiple generated codes and each code should track its own usage. This allows one discount offer to have different public, staff, or customer-specific code limits.
  Date/Author: 2026-06-24 / Codex

- Decision: Start with one target item per discount.
  Rationale: The requested creation flow selects an item type and then a specific item. A single target makes checkout validation strict and avoids ambiguous price application across unrelated items.
  Date/Author: 2026-06-24 / Codex

- Decision: Disable existing incomplete Stripe PaymentIntent reuse when a discount code is applied.
  Rationale: The existing reuse helpers match on total amount but not discount id or code id. Two different codes can produce the same total, so discounted checkouts should create a fresh intent until reuse is extended to match discount metadata.
  Date/Author: 2026-06-24 / Codex

## Outcomes & Retrospective

Implementation is in progress. The first milestone added the additive database structure and a focused server resolver. Validation passed:

    npm test -- --runInBand src/server/discounts/__tests__/discountCodeResolver.test.ts
    Result: PASS, 9 tests passed.

The second milestone wired paid authenticated and guest PaymentIntent checkout through the resolver, added discount metadata to Stripe intents, and added idempotent paid-redemption recording in the billing webhook. Validation passed:

    npm test -- --runInBand src/server/discounts/__tests__/discountCodeResolver.test.ts
    Result: PASS, 9 tests passed.

    npx tsc --noEmit --pretty false
    Result: PASS, no output.

    npx prisma validate
    Result: PASS, schema is valid.

Zero-dollar discount completion is intentionally not complete yet. It needs a route behavior that completes the purchase or registration without creating a Stripe PaymentIntent and still records redemption usage.

The third milestone added the initial management API contract:

    GET /api/discounts?ownerType=USER
    GET /api/discounts?ownerType=ORGANIZATION&ownerId=<organizationId>
    POST /api/discounts
    POST /api/discounts/[discountId]/codes

These routes enforce user ownership or organization management permissions, validate that the target item belongs to the selected owner, and reject discounted prices above the current item price. Validation passed after running `npx prisma generate` so the generated Prisma client knew about the new models:

    npx tsc --noEmit --pretty false
    Result: PASS, no output.

    npm test -- --runInBand src/server/discounts/__tests__/discountCodeResolver.test.ts
    Result: PASS, 9 tests passed.

At 2026-06-24T15:34:25Z, `src/lib/discountService.ts` was added as the client wrapper for the new routes. Validation still passed:

    npx tsc --noEmit --pretty false
    Result: PASS, no output.

    npm test -- --runInBand src/server/discounts/__tests__/discountCodeResolver.test.ts
    Result: PASS, 9 tests passed.

## Context and Orientation

This repository is a TypeScript Next.js App Router application backed by Prisma and Postgres. Prisma models live in `prisma/schema.prisma`; SQL migrations live in `prisma/migrations`. The checked-in Prisma schema uses plural model names such as `Events`, `Products`, `CanonicalTeams`, and `EventRegistrations`.

Paid event registration prices are stored on `Events.price`, with optional division-specific prices resolved by `src/server/paidRegistrationGate.ts` in `resolveEventRegistrationPriceCents`. Store products and memberships are rows in `Products`; recurring memberships are products whose `period` is not one-time. Team registration prices are stored on `CanonicalTeams.registrationPriceCents`.

Authenticated checkout starts through `src/lib/paymentService.ts`, which posts to `src/app/api/billing/purchase-intent/route.ts`. That route calls `src/lib/purchaseContext.ts` to resolve the canonical subtotal for products and team registrations, and it uses the event payload for event and rental purchases. Guest event checkout uses `src/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route.ts`.

Organization management tabs are built by `src/app/organizations/[id]/organizationTabs.ts` and rendered in `src/app/organizations/[id]/page.tsx`. Personal billing management is rendered inside `src/app/profile/page.tsx`.

A discount is the manager-created offer for one item. A discount code is a buyer-entered string linked to a discount. A redemption is the permanent record that a code was used for a purchase attempt that succeeded or was completed as a zero-dollar checkout.

## Plan of Work

First, add the data model. `prisma/schema.prisma` should define `DiscountOwnerTypeEnum`, `DiscountTargetTypeEnum`, `DiscountStatusEnum`, and `DiscountCodeStatusEnum`, plus three models: `Discounts`, `DiscountCodes`, and `DiscountCodeRedemptions`. `Discounts` stores owner, target, original price snapshot, and final discounted price. `DiscountCodes` stores the human code, optional `usageLimit`, and `usedCount`. `DiscountCodeRedemptions` stores one usage with purchase target, buyer identity when available, amounts, and Stripe/payment references when available.

Second, add a server module under `src/server/discounts/` that normalizes code strings, resolves target prices, validates code usage, and calculates the final purchase amount. The function should accept the canonical purchase type, target id, original amount, optional buyer user id, and optional code string. It should return the unchanged amount when no code is supplied and return an error when a supplied code is invalid, inactive, for another item, or over its usage limit.

Third, wire the resolver into `src/app/api/billing/purchase-intent/route.ts` before tax and fee calculation. The route should include the code, discount id, original amount, and discounted amount in Stripe metadata and in the response fee breakdown when useful. Product and team-registration reuse should not return a previous incomplete checkout created for a different code.

Fourth, wire the same resolver into guest event payment intent creation. Guest registration uses a token rather than a logged-in user, so the redemption should record guest email when available and still enforce code usage limits.

Fifth, add redemption recording. For paid Stripe checkouts, `src/app/api/billing/webhook/route.ts` should create one redemption and increment `DiscountCodes.usedCount` after payment success. For zero-dollar discounted checkouts, the registration or purchase completion route must create the redemption immediately without creating a Stripe intent.

Sixth, add management APIs and UI. Organization discounts belong in a new organization tab named `Discounts` for owners and staff with event, product, team, billing, or payment management permissions. User-owned discounts belong in Profile `Billing`. The creation form should let the manager choose target type, search and select an item, choose percent or flat display mode, and edit either discount amount or new price. Both input pairs are UI helpers; the submitted payload sends the final `discountedPriceCents`.

Seventh, add buyer checkout UI. Existing payment-entry surfaces should show an optional code field before checkout starts. Applying the code should request a server preview for the exact item and show original price, discount label, and final price before creating a payment intent.

## Concrete Steps

Work from `/Users/elesesy/StudioProjects/mvp-site`.

1. Edit `prisma/schema.prisma` and add migration SQL under `prisma/migrations/<timestamp>_add_discount_codes/migration.sql`.
2. Add `src/server/discounts/discountCodeResolver.ts` and focused Jest coverage in `src/server/discounts/__tests__/discountCodeResolver.test.ts`.
3. Update `src/lib/paymentService.ts` to pass optional `discountCode` values through checkout calls.
4. Update `src/app/api/billing/purchase-intent/route.ts` to apply discounts before tax calculation and to include discount metadata.
5. Update `src/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route.ts` to apply discounts for guest event payment.
6. Add redemption helpers and wire them into Stripe webhook success handling.
7. Add route handlers under `src/app/api/discounts` and organization/profile-specific list endpoints as needed.
8. Add organization tab routing in `src/app/organizations/[id]/organizationTabs.ts` and render the management UI in `src/app/organizations/[id]/page.tsx`.
9. Add a profile billing discount manager in `src/app/profile/page.tsx` or, if the file becomes too large, an extracted client component imported by that page.
10. Add code-entry UI to buyer checkout flows and run browser smoke tests.

Focused validation should run after server milestones:

    npm test -- --runInBand src/server/discounts/__tests__/discountCodeResolver.test.ts

Before completion, run:

    npx tsc --noEmit

After UI wiring, start the app and smoke test organization discount creation and a discounted checkout:

    npm run dev

Then open `http://localhost:3000`, create or choose a paid item, create a discount code, enter the code during checkout, and verify the displayed final price matches the discounted price.

## Validation and Acceptance

The feature is accepted when all of the following are true.

A manager can create a discount for one event, product, membership product, or team registration. The manager can generate multiple codes for that discount. Each code can have no usage limit or a positive integer usage limit. A buyer can enter a valid code for the matching item and checkout uses the stored discounted final price. A code for a different item is rejected. An inactive code is rejected. A code at its usage limit is rejected. A 100 percent discount or a new price of zero creates a zero-dollar path that completes the registration or purchase without charging Stripe and records code usage. Code usage is visible in the manager's code list.

Tests should prove the resolver does not allow negative final prices, does not allow final prices above the original item price, rejects exhausted codes, and accepts unlimited codes repeatedly. Server route tests should prove checkout metadata includes discount details and that redemptions are idempotent when a webhook is retried.

## Idempotence and Recovery

The migration is additive and does not alter existing payment rows. Re-running tests is safe. Generated discount codes should be unique after uppercasing and trimming; if generation collides, retry with a new random suffix. Redemption recording must be idempotent by enforcing a unique key on the payment reference or by checking for an existing redemption before incrementing `usedCount`.

If a checkout request creates a Stripe intent but later code redemption fails in the webhook, the webhook should log the failure and avoid double-incrementing usage on retry. The recovery path is to rerun the webhook or manually insert the missing redemption after checking the payment metadata.

## Artifacts and Notes

Initial code-path evidence:

    prisma/schema.prisma
      Events.price is the event-level registration price.
      Products.priceCents is the store product and membership price.
      CanonicalTeams.registrationPriceCents is the open team registration price.

    src/lib/purchaseContext.ts
      resolvePurchaseContext returns product and team-registration canonical amounts.

    src/app/api/billing/purchase-intent/route.ts
      Authenticated checkout computes tax from resolvedPurchase.amountCents.

    src/app/api/public/organizations/[slug]/events/[eventId]/guest-payment-intent/route.ts
      Guest checkout computes event price separately.

## Interfaces and Dependencies

At the end of this work, `src/server/discounts/discountCodeResolver.ts` should expose at least:

    type DiscountPurchaseType = 'event' | 'product' | 'team_registration';

    type ResolvedDiscountApplication = {
      code: string;
      discountId: string;
      discountCodeId: string;
      originalAmountCents: number;
      discountedAmountCents: number;
    };

    async function resolveDiscountApplication(params: {
      code?: string | null;
      purchaseType: DiscountPurchaseType;
      targetId: string;
      originalAmountCents: number;
      buyerUserId?: string | null;
      client?: typeof prisma;
    }): Promise<{ amountCents: number; discount: ResolvedDiscountApplication | null }>;

The resolver must be the only place that decides whether a buyer-entered code applies. UI code may preview calculations, but checkout routes must call the resolver before creating or skipping payment.

Revision note: created this ExecPlan after inspecting the existing Prisma schema, organization tabs, profile billing tab, purchase context, authenticated checkout route, and guest event payment route. The usage-limit decision was updated from the initial discussion so each generated code owns its own optional usage cap.
