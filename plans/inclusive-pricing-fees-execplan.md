# Inclusive pricing and shared price inputs

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `PLANS.md` at the repository root. The mobile companion repository at `/Users/elesesy/StudioProjects/mvp-app` has the same ExecPlan rules and treats this repository as the backend source of truth.

## Purpose / Big Picture

BracketIQ currently shows a base event, product, team, rental, or bill amount and adds BracketIQ and Stripe fees during checkout. After this change, hosts will set an inclusive online list price up front. The shared price input will show the host what they take home after the default 2.9% plus 30 cent processing fee and the 1% platform fee, and it will allow either the take-home amount or the customer-facing total to be edited. Customers should see the list price as the normal price, without a separate BracketIQ or Stripe fee line at checkout.

## Progress

- [x] (2026-06-24T23:09Z) Read the current web and mobile pricing surfaces, checkout fee helpers, and plan rules.
- [x] (2026-06-24T23:34Z) Added shared web inclusive-pricing math and `HostPriceInput` for two-way host take-home and list-price editing.
- [x] (2026-06-24T23:40Z) Replaced web event, product, rental, and bill price-entry controls with the shared component.
- [x] (2026-06-24T23:48Z) Updated web checkout, bill creation, webhook handling, tax quote, and subscription transfer calculations so list prices are charged as-is and fees are internal allocations.
- [x] (2026-06-24T23:55Z) Updated web fee math, price preview, bill route, and webhook tests for inclusive totals.
- [x] (2026-06-24T23:59Z) Mirrored the shared price-entry behavior in mobile event/division and team registration price creation surfaces.
- [x] (2026-06-25T00:03Z) Ran focused web tests, web typecheck, and mobile Kotlin metadata compile.

## Surprises & Discoveries

- Observation: The active web and mobile checkouts are dirty with unrelated local edits before this task started.
  Evidence: `git status --short --branch` showed existing modified files in both repositories; this plan will keep edits scoped to pricing files and will not revert unrelated work.

- Observation: New inclusive-price PaymentIntents need to be distinguishable from older in-flight PaymentIntents.
  Evidence: Webhook bill creation still receives historical `mvp_fee_cents` and `stripe_fee_cents` metadata, so new intents now include `fees_included_in_price: true` and the webhook suppresses customer-visible fee line items only for that marker.

## Decision Log

- Decision: The persisted price field should become the customer-facing inclusive list price for new edits, and checkout should not add separate BracketIQ or Stripe fees on top of that price.
  Rationale: The user asked to stop adding fees at checkout and instead show the host take-home math at price creation time.
  Date/Author: 2026-06-24 / Codex

- Decision: The shared calculator uses the default card processing rate, 2.9% plus 30 cents, and the existing 1% platform fee to convert between host take-home and list price.
  Rationale: This matches the requested default processing-fee assumption and the existing platform fee rule in `src/lib/billingFees.ts`.
  Date/Author: 2026-06-24 / Codex

## Outcomes & Retrospective

Implemented inclusive pricing across the web checkout paths and the mobile price-editing surfaces. Hosts now edit a list price or host take-home amount with the fee allocation visible before saving, while customers no longer see separate BracketIQ or Stripe fee add-ons for new inclusive-price checkouts.

## Context and Orientation

The web fee helper is `src/lib/billingFees.ts`. It currently calculates a 1% BracketIQ fee and a Stripe gross-up that is added at checkout. The editable event price surfaces are under `src/app/events/[id]/schedule/components/eventForm/sections/`, product pricing is in `src/app/organizations/[id]/page.tsx`, rental slot pricing is in `src/components/ui/CreateRentalSlotModal.tsx`, and bill creation is in `src/app/events/[id]/schedule/schedulePage/EventBillingModals.tsx` plus `useEventBilling.ts`.

The existing web reusable cents text input is `src/components/ui/CentsInput.tsx`, backed by `src/lib/priceUtils.ts`. The new shared price input should build on those utilities instead of adding a second parsing style.

The mobile editable event price surfaces are in `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/eventDetail/EventDetailsDivisionEditorForm.kt`. Team registration pricing is in `/Users/elesesy/StudioProjects/mvp-app/composeApp/src/commonMain/kotlin/com/razumly/mvp/teamManagement/CreateOrEditTeamScreen.kt`.

## Plan of Work

First, add shared inclusive-pricing math on the web. Define helpers that calculate processing fee, platform fee, total/list price, and host take-home from either the host amount or the total amount. Then create a `HostPriceInput` component with two editable currency inputs and a compact formula summary: take-home plus processing fee plus platform fee equals total.

Second, replace price-entry fields in event single-division pricing, division editor pricing, product create/edit, rental slot create/edit, and bill creation with the shared component. Existing state should continue to store cents in the same fields, but those cents now represent the inclusive list price when the host edits the total. When the host edits take-home, the component computes and writes the inclusive total.

Third, update checkout helpers so checkout does not add customer-visible BracketIQ or Stripe fees to stored prices. Fee breakdowns should preserve internal metadata for finance and host-receives calculations, but customer totals should equal the stored/list price plus tax when applicable. Customer-facing checkout copy should not say that Stripe fees vary by payment method.

Fourth, mirror the price input math and compact two-way price entry in the mobile event and team forms. Mobile should send the inclusive list price to the backend, matching the web contract.

## Concrete Steps

Run commands from `/Users/elesesy/StudioProjects/mvp-site` for web changes and `/Users/elesesy/StudioProjects/mvp-app` for mobile changes. Use path-scoped edits and path-scoped git inspection because both worktrees started with unrelated local modifications.

## Validation and Acceptance

Run focused web tests for `billingFees`, `PriceWithFeesPreview` replacement behavior, payment intent totals, and any new shared input tests. Then run `npx tsc --noEmit` if the focused tests pass.

For mobile, run focused Kotlin tests if new pure pricing helpers are added. If only Compose surfaces are changed, run `./gradlew :composeApp:compileCommonMainKotlinMetadata` or the closest available compile task and record the result.

Acceptance is met when creating or editing an event/product/team/rental/bill price shows a take-home plus processing fee plus platform fee equals total summary, editing either side updates the other, and checkout no longer adds BracketIQ or Stripe fees on top of the listed amount.

## Idempotence and Recovery

The fee math changes are pure functions and can be tested repeatedly. If a UI replacement causes regressions, revert only the newly touched pricing component and affected surface, not unrelated local files. Keep path-scoped diffs before validation.

## Artifacts and Notes

Validation run from `/Users/elesesy/StudioProjects/mvp-site`:

- `npm test -- --runTestsByPath src/lib/__tests__/billingFees.test.ts src/components/ui/__tests__/HostPriceInput.test.tsx src/components/ui/__tests__/PriceWithFeesPreview.test.tsx 'src/app/api/events/[eventId]/teams/[teamId]/billing/bills/__tests__/route.test.ts' src/app/api/billing/__tests__/webhookRoute.test.ts` passed with 5 suites and 29 tests.
- `npx tsc --noEmit` passed.

Validation run from `/Users/elesesy/StudioProjects/mvp-app`:

- `./gradlew :composeApp:compileCommonMainKotlinMetadata` passed. Gradle emitted existing warnings about configuration-time dependency resolution and unrelated deprecated APIs.

## Interfaces and Dependencies

In `src/lib/billingFees.ts`, expose helpers that can be used by both checkout and UI preview code. In `src/components/ui/HostPriceInput.tsx`, expose a controlled component with `value`, `onChange`, `disabled`, `hostLabel`, and `totalLabel` props so it can replace existing `NumberInput` and `CentsInput` price fields.
