# Organization Store Tab with Membership Products

> Legacy note: Appwrite table/function references here are historical. The current implementation uses Next.js API routes + Prisma; map `/products` and subscription flows to `/api/*` endpoints.

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: follow `PLANS.md` in the repository root for mandatory ExecPlan structure and maintenance rules.

## Purpose / Big Picture

Expose an Organization “Store” tab where owners can add membership products (price in cents, billing period week/month/year) tied to their organization, and where users can purchase those products via Stripe. Product data must be pulled from the backend/Appwrite, creation must flow through the new `/products` endpoint, and successful payments should register a subscription (start date, price, userId, productId) for the purchaser.

## Progress

- [x] (2025-12-14 23:17Z) Drafted ExecPlan defining store tab scope, data flow, and integration points.
- [ ] Add product/subscription types and service helpers (Appwrite table access + function calls).
- [ ] Update organization page UI with Store tab (owner creation form, product list, purchase actions).
- [ ] Integrate payment flow for products and subscription creation callbacks.
- [ ] Add/update tests and validation notes.

## Surprises & Discoveries

- None yet.

## Decision Log

- Decision: Use a dedicated `productService` to wrap Appwrite database reads and call the backend `/products` function for creation/subscriptions, keeping ownership logic server-side. Rationale: avoids duplicating auth rules in the client and aligns with other service abstractions (organizationService/eventService). Date/Author: 2025-12-14 / Codex.

## Outcomes & Retrospective

Pending implementation.

## Context and Orientation

Organization detail UI lives in `src/app/organizations/[id]/page.tsx`, using `SegmentedControl` tabs for overview/events/teams/referees/refunds/fields. Ownership is determined via `useApp` user data. Payments use `paymentService` (`src/lib/paymentService.ts`) and `PaymentModal` (`src/components/ui/PaymentModal.tsx`), which expects a `PaymentIntent` fee breakdown and triggers `onPaymentSuccess` to perform side effects (e.g., joining an event). Organization data is loaded via `organizationService` (`src/lib/organizationService.ts`), which maps Appwrite rows to the `Organization` type defined in `src/types/index.ts`. There is no concept of products/subscriptions, no table ID constants for products, and no store tab UI.

## Plan of Work

Extend shared types to include `Product` (id, organizationId, priceCents, period enum, name/description, isActive) and `Subscription` (id, productId, userId, organizationId, startDate, priceCents, status). Update `Organization` to carry `productIds?` and optionally hydrated `products`.

Implement `productService` to:
- List products for an organization via Appwrite tables (using a new `NEXT_PUBLIC_APPWRITE_PRODUCTS_TABLE_ID` with fallback to `products`).
- Create products by calling the backend function at `/products` with owner/user/org context.
- Create subscriptions after payment via `/products/{id}/subscriptions`.

Update `organizationService.withRelations` to fetch products when `productIds` are present so the page can display them without extra calls.

Enhance `paymentService` to request product purchase intents (`/billing/purchase-intent` with `productId`/organization) and return `PaymentIntent` data; keep existing event billing intact.

Add a Store tab to `src/app/organizations/[id]/page.tsx`:
- Owner-only form to add a membership product (name/description optional, price in dollars -> cents, period select).
- Product list cards showing price/period; owner can see status; non-owners get a “Purchase” action.
- Use `PaymentModal` (or a lightweight variant) for product checkout, providing product summary and a success callback that calls `productService.createSubscription` with start date and price.
- Handle loading/error states and refresh organization/products after creation/purchase.

## Concrete Steps

- Types: update `src/types/index.ts` with `Product`, `Subscription`, `ProductPeriod` enum, extend `Organization` with `productIds`/`products?`, and adjust helpers (e.g., `formatPrice` usage) if needed.
- Services: add `src/lib/productService.ts`; extend `organizationService.withRelations` to pull products; extend `paymentService` with `createProductPaymentIntent`.
- UI: modify `src/app/organizations/[id]/page.tsx` to add tab option, render Store content with owner form, product grid, purchase buttons, and payment/subscription flows using `PaymentModal`.
- Tests: add/update Jest tests for new services (e.g., productService payload building, paymentService product branch) in `src/lib/__tests__/`; add component-level checks if feasible.
- Config awareness: ensure new table env variables default safely (fallback to `products`/`subscriptions` ids) and document any required env additions.

## Validation and Acceptance

- Manual: run the Next dev server, navigate to an organization as owner, create a product; see it listed with correct price/period. As a regular user, click Purchase to open payment modal; after mock payment success, subscription call succeeds and UI confirms purchase (e.g., toast + refreshed list).
- Automated: from repo root run `npm test -- products` (or `npm test`) to ensure new unit tests pass. No regressions in existing payment/organization tests.

## Idempotence and Recovery

Product creation is additive; duplicates can be removed later. Store tab reads are read-only; failures in payment/subscription creation should surface notifications and leave state unchanged. Re-running tests is safe.

## Artifacts and Notes

- Capture payment/subscription success path in component state to avoid double-creating subscriptions if the modal closes; guard with a flag keyed by `productId`.

## Interfaces and Dependencies

- Appwrite tables: `products` (`$id`, `name`, `description?`, `priceCents` int, `period` enum `week|month|year`, `organizationId`, `createdBy`, `isActive`), `subscriptions` (`$id`, `productId`, `userId`, `organizationId`, `startDate` datetime, `priceCents`, `status`).
- Backend endpoints invoked: `POST /products` to create products; `POST /products/{id}/subscriptions` after payment; `POST /billing/purchase-intent` with `{ user, productId, organization }` to obtain Stripe client secret and fees.

---
Change note: Initial ExecPlan added for organization store tab and product purchase flow (2025-12-14 / Codex).
