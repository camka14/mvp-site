# Add Durable Rental Bookings Backed by Bills

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` from the repository root. It is self-contained for a contributor who only has this working tree.

## Purpose / Big Picture

Users should be able to pay for facility rentals without being forced to create an event immediately. After payment, the rented fields or courts should block the facility owner's inventory, appear in calendars as rentals, and remain available for the renter to attach to an event later. The billing ledger should remain the existing `Bills` and `BillPayments` tables so rentals are reported and reconciled like event registrations, products, and team payments.

The working behavior is visible when a public rental checkout creates a durable rental booking and a bill/payment record instead of creating a private event. Confirmed booking items should be treated as scheduling blockers until they are cancelled or refunded. If an event is created from a booking later, event timeslots are projections of the booking and are not editable by the renter.

## Progress

- [x] (2026-06-18 21:30Z) Confirmed current schema and flow: `Fields.rentalSlotIds` points to sellable `TimeSlots`, public rental orders currently create private `Events`, and the Stripe webhook already creates instant bills for rentals.
- [x] (2026-06-18 21:35Z) Decided the source-of-truth split: `Bills` and `BillPayments` remain money truth; `RentalBookings` and `RentalBookingItems` become inventory truth; event `TimeSlots` are optional read-only projections.
- [x] (2026-06-18 22:05Z) Added additive Prisma schema and SQL migration for rental bookings, booking items, bill source fields, organization bill owners, and rental-backed event timeslot metadata.
- [x] (2026-06-18 22:15Z) Updated public rental checkout so paid rental orders create confirmed bookings and bills instead of private events.
- [x] (2026-06-18 22:28Z) Updated conflict detection and field calendar responses so confirmed standalone rental booking items block scheduling and display as rental reservations.
- [x] (2026-06-18 22:28Z) Added tests for booking creation, bill source fields, webhook compatibility, and facility calendar rental-reservation classification.
- [x] (2026-06-18 22:29Z) Ran focused tests, Prisma validation, typecheck, production build, local migration deploy, and browser smoke test on the rental flow.

## Surprises & Discoveries

- Observation: `src/app/api/billing/webhook/route.ts` already creates instant bills for `purchase_type=rental`.
  Evidence: `buildInstantLineItems()` maps rental purchases to `type: 'RENTAL'`, and `createInstantBillAndPayment()` creates a `Bills` row and one `BillPayments` row for successful Stripe payment intents.
- Observation: Existing rental checkout locks are intentionally temporary.
  Evidence: `src/server/repositories/rentalCheckoutLocks.ts` sets `RENTAL_CHECKOUT_LOCK_TTL_MS` to ten minutes and stores those holds in `LockFiles`.

## Decision Log

- Decision: Add `RentalBookings` and `RentalBookingItems` rather than using event `TimeSlots` as paid reservation truth.
  Rationale: Event timeslots cannot exist without an event and should be editable by event workflows. A paid rental may exist before any event and must block inventory independently.
  Date/Author: 2026-06-18 / Codex.
- Decision: Add `sourceType` and `sourceId` to `Bills`.
  Rationale: The finance layer already exposes source entity concepts, but the database currently infers rentals from `slotId`. Explicit source fields let a bill point to a rental booking without overloading event or weekly occurrence columns.
  Date/Author: 2026-06-18 / Codex.
- Decision: Add `ORGANIZATION` to `BillsOwnerTypeEnum`.
  Rationale: An organization can rent another organization's resources. The bill owner should be the renter organization, while the bill `organizationId` remains the facility owner organization.
  Date/Author: 2026-06-18 / Codex.

## Outcomes & Retrospective

Implemented the first durable rental-booking foundation. Public rental checkout now creates `RentalBookings` and `RentalBookingItems`, links rental bills through `Bills.sourceType = 'RENTAL_BOOKING'` and `Bills.sourceId = bookingId`, and no longer creates a private event just to reserve inventory. Standalone confirmed rental booking items are scheduling blockers and appear in the field/facility calendar feed as rental reservations. Event time slots can carry rental booking metadata so attached rentals are recognizable and locked from ordinary renter edits.

Validation passed with Prisma schema validation, generated schema validation, local migration deploy, focused Jest suites, `npx tsc --noEmit`, `npm run build`, and a production-mode browser smoke of `http://localhost:3000/o/razumly/rentals`.

## Context and Orientation

The app is a Next.js, TypeScript, Prisma, and Postgres application. Prisma models live in `prisma/schema.prisma`; this repository also keeps `prisma/schema.generated.prisma` in sync. SQL migrations live under `prisma/migrations`.

The word "rental availability" means a facility-defined sellable window, currently represented by `TimeSlots` whose ids are listed in `Fields.rentalSlotIds`. The word "rental booking" means a paid or pending customer reservation for a concrete field and time. The word "projection" means an event `TimeSlots` row created from a booking item so the event scheduler can use the booked window without owning the booking itself.

The current public rental UI lives in `src/app/o/[slug]/rentals/PublicRentalSelectionClient.tsx`. It posts paid rental selections to `src/app/api/public/organizations/[slug]/rental-orders/route.ts`, which currently creates private event rows. Stripe payment intents are created through `src/app/api/billing/purchase-intent/route.ts`, and Stripe webhook bill creation is in `src/app/api/billing/webhook/route.ts`.

## Plan of Work

First, add additive schema fields and models. `Bills` receives nullable `sourceType` and `sourceId`, and `BillsOwnerTypeEnum` receives `ORGANIZATION`. `RentalBookings` stores one paid or pending rental order, including owner organization, renter user or renter organization, optional bill id, optional attached event id, status, and totals. `RentalBookingItems` stores the concrete field, facility, start, end, price, and optional projected event timeslot id. `TimeSlots` receives nullable rental booking metadata so rental-backed event slots can be recognized and locked.

Next, update backend services so a paid rental order creates a booking and links the bill. The public rental order endpoint should validate selections against rental availability, verify payment, create or reuse a booking, create booking items, and return the booking id plus next-action URLs. It should not create a private event. The Stripe webhook should fill `Bills.sourceType` and `Bills.sourceId` when rental metadata includes a booking id, and it should support `ORGANIZATION` bill ownership.

Then, update scheduling conflict detection so confirmed rental booking items block field availability. Existing event conflict checks should ignore rental booking items attached to the same event only when the exact booking item is projected into that event.

Finally, update the rental client copy and post-payment choices. After payment succeeds, the user should see actions to create an event now or manage/attach later. Event creation from a rental booking can be implemented as a follow-up route if time does not permit full event-form integration in this pass; the durable booking and blocking behavior are the required foundation.

## Concrete Steps

Run commands from `/Users/elesesy/.codex/worktrees/ab2e/mvp-site`.

Schema validation:

    npx prisma validate

Focused tests:

    npm test -- --runTestsByPath 'src/app/api/public/organizations/[slug]/rental-orders/__tests__/route.test.ts' 'src/app/api/billing/__tests__/webhookRoute.test.ts' 'src/app/organizations/[id]/__tests__/page.test.tsx' --runInBand

Typecheck and build:

    npx tsc --noEmit
    npm run build

## Validation and Acceptance

Acceptance is met when a paid public rental order creates one `RentalBookings` row and one or more `RentalBookingItems` rows, the bill row has `sourceType = 'RENTAL_BOOKING'` and `sourceId = rentalBookingId`, and no private event is created solely to represent the rental. Confirmed booking items must appear as blockers to field scheduling and as rental items in the facility calendar feed.

## Idempotence and Recovery

The SQL migration is additive. Re-running Prisma validation and Jest tests is safe. If checkout changes fail midway, the old event-backed rental flow can be identified by `src/app/api/public/organizations/[slug]/rental-orders/route.ts`; no destructive migration is planned.

## Artifacts and Notes

- SQL migration: `prisma/migrations/20260618133000_add_rental_bookings_billing_source/migration.sql`.
- Browser screenshot artifact from the production smoke: `/tmp/mvp-site-qa/rentals.png`.
- Production smoke used `DATABASE_URL='postgresql://mvp:mvp_password@localhost:5433/mvp?schema=public' JWT_SECRET='local-browser-qa-secret' PORT=3000 npm start`.

## Interfaces and Dependencies

New Prisma models must be available through the existing Prisma client as `rentalBookings` and `rentalBookingItems`. Billing code must treat `Bills.sourceType` as a string with values such as `EVENT`, `RENTAL_BOOKING`, `PRODUCT`, and `TEAM_REGISTRATION`; this avoids adding a rigid enum while the product source taxonomy is still expanding.
