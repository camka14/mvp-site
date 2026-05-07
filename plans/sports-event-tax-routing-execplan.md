# Sports event tax routing

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` in the repository root. It is self-contained so a contributor can continue the work without relying on prior conversation.

## Purpose / Big Picture

BracketIQ currently calls Stripe Tax during every paid event checkout that reaches `/api/billing/purchase-intent`. For low-price recreational sports registrations, that creates avoidable cost and friction when the event location is in a jurisdiction where no sales tax should be collected for the transaction. After this work, the backend will decide whether an event registration can use a zero-tax path before calling Stripe Tax. Users in clearly zero-tax sports event jurisdictions can pay through the existing web modal or mobile PaymentSheet without a Stripe Tax calculation.

The first milestone keeps the current PaymentIntent-based checkout UI intact. Later milestones can add Stripe Checkout Sessions and a backend threshold so both `mvp-site` and `mvp-app` switch behavior from the same server response instead of duplicating the threshold in each client.

## Progress

- [x] (2026-05-07 20:35Z) Read the existing billing route, Stripe tax helper, web PaymentModal, mobile PaymentSheet call sites, and `PLANS.md`.
- [x] (2026-05-07 20:35Z) Confirmed both web and mobile already depend on `/api/billing/purchase-intent`, which is the right backend control point for future PaymentIntent versus Checkout routing.
- [x] (2026-05-07 21:00Z) Added `src/lib/taxPolicy.ts` and `src/lib/__tests__/taxPolicy.test.ts`.
- [x] (2026-05-07 21:10Z) Wired `/api/billing/purchase-intent` and `/api/billing/tax-preview` through the tax policy helper.
- [x] (2026-05-07 21:15Z) Added route coverage proving a New Jersey sports event checkout skips `calculateTaxQuote` and still charges customer fees.
- [x] (2026-05-07 21:25Z) Added additive checkout/tax policy fields to the web and mobile purchase-intent contracts, plus clearer fee preview labels.
- [x] (2026-05-07 21:30Z) Ran focused route/helper tests and TypeScript validation.
- [x] (2026-05-07 21:45Z) Collapsed the customer-facing Stripe tax check cost into the Stripe fee line in web and mobile previews while keeping backend fields separate.
- [x] (2026-05-08 00:20Z) Added organization tax profile fields, event tax handling, rental tax handling, Prisma migration, and generated Prisma client updates.
- [x] (2026-05-08 00:35Z) Wired persisted event, rental slot, and organization tax context into `/api/billing/purchase-intent` and `/api/billing/tax-preview` so clients do not decide tax policy locally.
- [x] (2026-05-08 00:45Z) Added the organization create/edit tax agreement UI and organization-hosted event tax handling selector. Rentals remain on Stripe Tax.
- [x] (2026-05-08 01:05Z) Confirmed `mvp-app` reads organizations but does not create or update them, so no mobile organization agreement screen is required for this milestone.
- [x] (2026-05-08 01:25Z) Ran web focused tests, web TypeScript validation, and Android Kotlin compile successfully after the organization tax responsibility milestone.
- [x] (2026-05-08 01:40Z) Added Washington to the individual/no-organization sports event zero-tax gate while leaving organization-hosted Washington events controlled by org tax settings.

## Surprises & Discoveries

- Observation: The current route calculates tax before reserving the `STARTED` event registration row.
  Evidence: `src/app/api/billing/purchase-intent/route.ts` calls `calculateTaxQuote` around line 819 and reserves the event slot around line 898.
- Observation: Event rows store `location`, optional `address`, and `coordinates`, but do not store structured state/postal-code fields.
  Evidence: `prisma/schema.prisma` `model Events` has `location String`, `address String?`, and `coordinates Json`.
- Observation: The web app has a `PaymentIntent` response type only. Mobile also expects a purchase intent response from the same endpoint.
  Evidence: `src/types/index.ts` defines `PaymentIntent`, and `mvp-app` `BillingRepository.kt` calls `api/billing/purchase-intent`.
- Observation: `mvp-app` already had a `checkoutSessionId` field in one billing DTO area, but the main `PurchaseIntent` model did not expose checkout URL or tax policy fields.
  Evidence: `composeApp/src/commonMain/kotlin/com/razumly/mvp/core/data/repositories/BillingRepository.kt` now has additive `checkoutMode`, `checkoutUrl`, `checkoutSessionId`, `taxMode`, `taxReasonCode`, and `taxJurisdictionState` fields.
- Observation: Android Kotlin compilation did not finish within the three-minute tool timeout on this Windows host.
  Evidence: `.\gradlew.bat :composeApp:compileDebugKotlinAndroid` timed out after 184 seconds with no useful output. `.\gradlew.bat :composeApp:compileKotlinMetadata` completed successfully, but the task was skipped after configuration because of disabled native targets on Windows.
- Observation: Washington sports league participation fees are usually not subject to retail sales tax, but fees charged by an athletic or fitness facility operator for league play are taxable.
  Evidence: Washington DOR's sports leagues guide says retail sales tax generally does not apply to soccer, baseball, basketball, football, volleyball, hockey, softball, or other league play participation fees, while charges by an AFF operator for league play require sales tax.
- Observation: The mobile app currently lists and searches organizations but does not create or edit organizations.
  Evidence: Source search under `C:\Users\samue\StudioProjects\mvp-app\composeApp\src` found GET calls for `api/organizations` and `api/organizations/{id}/templates`, but no POST or PATCH path for `api/organizations`.
- Observation: The Android compile task starts a local backend helper during prebuild.
  Evidence: `.\gradlew.bat :composeApp:compileDebugKotlinAndroid` logged `startLocalBackend: starting (npm) in C:\Users\samue\Documents\Code\mvp-site on port 3000`; the tracked pid was gone after the compile finished.

## Decision Log

- Decision: Implement zero-tax routing in a standalone helper rather than inline in the route.
  Rationale: The user wants threshold and checkout behavior to be modular. A single policy helper can later decide between zero-tax PaymentIntent, Stripe-tax PaymentIntent, and Stripe Checkout.
  Date/Author: 2026-05-07 / Codex.
- Decision: Apply the first zero-tax gate only to `purchaseType === "event"`.
  Rationale: Facility rentals can be taxable as recreational facility use or real-property rental depending on state and facts. Keeping rentals on the existing Stripe Tax path avoids silently under-collecting while event-specific rules are introduced.
  Date/Author: 2026-05-07 / Codex.
- Decision: Treat BracketIQ event registrations as recreational sports participant charges, not spectator tickets.
  Rationale: The product positioning and user clarification say events are tournaments, leagues, pickup games, and similar sports participation.
  Date/Author: 2026-05-07 / Codex.
- Decision: Initial explicit individual participant-exemption states are New York, New Jersey, and Washington, plus safe no-general-sales-tax states where there is no state or local general sales tax in normal use.
  Rationale: New York and New Jersey publish participant sporting activity exemptions. Washington publishes a sports league participation rule that generally treats participation fees as not retail sales unless an athletic or fitness facility operator is charging for league play. Delaware and Oregon publish no state/local or general sales tax guidance. New Hampshire is commonly no-sales-tax but will remain easy to add; Alaska and Montana are intentionally excluded from the automatic zero gate because local sales or resort taxes can apply.
  Date/Author: 2026-05-07 / Codex.
- Decision: Customer-facing payment previews show one Stripe fee line instead of separate card processing and Stripe Tax service rows.
  Rationale: The backend should retain the detailed breakdown for audit and policy decisions, but the checkout UI does not need to expose the tax-check cost as a separate customer label.
  Date/Author: 2026-05-07 / Codex.
- Decision: Add Washington to the individual/no-organization sports registration zero-tax gate, but keep organization-hosted Washington events controlled by the organization tax profile.
  Rationale: Washington's rule turns on whether an athletic or fitness facility operator is charging for league play. An individual pickup or league host is not modeled as that facility operator, while organizations now have a tax profile and agreement that lets them choose Stripe Tax or attest to sports registration exemption.
  Date/Author: 2026-05-08 / Codex.
- Decision: Add organization-level tax responsibility fields instead of custom manual tax rates for the MVP.
  Rationale: Manual tax rates would make organizations enter rates without solving the harder legal question of whether a transaction is taxable. The MVP stores who the seller is, whether the seller operates an athletic facility, the default event tax handling, and an agreement timestamp. Stripe Tax remains available when the organization chooses the conservative path.
  Date/Author: 2026-05-08 / Codex.
- Decision: Require an accepted organization tax responsibility agreement before an organization-hosted event can use the sports-registration-exempt path.
  Rationale: Existing organizations may not have seen the new responsibility language. Falling back to Stripe Tax until acceptance prevents an old organization from silently skipping tax through a new default or event override.
  Date/Author: 2026-05-08 / Codex.
- Decision: Keep rentals on Stripe Tax and store rental tax handling as `STRIPE_TAX`.
  Rationale: Facility and field rentals are more often taxable and fact-specific than participant event registration. A one-value field keeps the model extensible without adding an unsafe exemption path.
  Date/Author: 2026-05-08 / Codex.

## Outcomes & Retrospective

The first milestone is implemented. Event registrations in the configured zero-tax jurisdictions return `taxMode: "ZERO_TAX"`, omit a Stripe Tax calculation ID, skip the PaymentIntent tax hook, and still charge event price plus BracketIQ and Stripe fees. Rentals and unknown/unconfigured event states preserve the existing Stripe Tax path.

The organization tax responsibility milestone is also implemented. Organizations now store a tax profile and agreement timestamp, organization-hosted events can inherit the organization default or explicitly choose Stripe Tax or sports-registration-exempt handling, and checkout/tax preview routes load persisted event and organization tax context before deciding whether Stripe Tax is required. Rentals continue to use Stripe Tax.

The next milestone should implement a Checkout Session creator and a backend payment presentation decision such as `PAYMENT_INTENT` versus `CHECKOUT_SESSION`, using the fields added in this milestone. That work should include mobile Custom Tab/Safari View behavior and web hosted or embedded Checkout behavior.

## Context and Orientation

The current one-time payment flow is centered on `src/app/api/billing/purchase-intent/route.ts`. That route resolves the purchase amount with `src/lib/purchaseContext.ts`, loads a billing address, calls `src/lib/stripeTax.ts` `calculateTaxQuote`, reserves event or rental state, and creates a Stripe PaymentIntent.

The web checkout UI is `src/components/ui/PaymentModal.tsx`. It receives the backend `PaymentIntent` response and displays `feeBreakdown` before mounting Stripe Elements. The mobile app in `C:\Users\samue\StudioProjects\mvp-app` uses the same backend route and presents native Stripe PaymentSheet.

A "zero-tax gate" means a deterministic backend function decides that a Stripe Tax calculation is not needed for a specific purchase. The first gate is limited to sports event participant registrations because BracketIQ events are recreational sports participation, not spectator tickets. The helper must return a reason and state so the decision is auditable in metadata and tests.

## Plan of Work

Create `src/lib/taxPolicy.ts` with functions for normalizing US state names/codes from free-form event `address` and `location` strings. The module should export a `resolvePurchaseTaxPolicy` function that accepts purchase type, tax category, event location fields, and returns either `ZERO_TAX` or `STRIPE_TAX_REQUIRED`.

Update `src/app/api/billing/purchase-intent/route.ts` so it resolves tax policy after the purchase context is known. For `ZERO_TAX`, it should not require a saved billing address, should not call `calculateTaxQuote`, should build the same fee breakdown with zero tax and no Stripe Tax service fee, and should create the PaymentIntent without `hooks.inputs.tax.calculation`. It should still charge the customer the event price plus BracketIQ and card-processing fees, and still reserve event registration before creating the PaymentIntent.

Update `src/app/api/billing/tax-preview/route.ts` through the same helper so previews return a zero-tax breakdown without requiring billing address when policy says tax is zero.

Extend `src/types/index.ts` so the existing payment response can include optional tax policy fields. This is an additive contract that future web/mobile Checkout routing can reuse.

Add focused tests in `src/lib/__tests__/taxPolicy.test.ts` and the existing purchase-intent route test file. Tests should verify state extraction, New York/New Jersey participant exemptions, safe no-tax states, rental fallback to Stripe Tax, and that a New Jersey sports event checkout skips `calculateTaxQuote` but still creates a PaymentIntent for the fee-inclusive total.

## Concrete Steps

From `C:\Users\samue\Documents\Code\mvp-site`, run:

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand

If TypeScript issues appear after route edits, run:

    npx tsc --noEmit

Validation actually run during this milestone:

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand
    Result: PASS, 2 suites, 17 tests.

    npm test -- src/app/api/billing/__tests__/purchaseIntentRoute.test.ts src/app/api/billing/__tests__/purchaseIntentDestinationChargeRoute.test.ts src/app/api/billing/__tests__/purchaseIntentDuplicateEventRoute.test.ts src/app/api/billing/__tests__/purchaseIntentTeamRegistrationRoute.test.ts --runInBand
    Result: PASS, 4 suites, 22 tests. One expected mocked Stripe failure logs in the destination-charge 502 test.

    npx tsc --noEmit
    Result: PASS.

    npx tsc --noEmit
    Result after customer-facing fee label update: PASS.

    npm test -- src/components/ui/__tests__/PriceWithFeesPreview.test.tsx --runInBand
    Result after customer-facing fee label update: PASS, 1 suite, 3 tests.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileKotlinMetadata
    Result: BUILD SUCCESSFUL; the metadata compile task itself was skipped after configuration warnings about disabled iOS targets on Windows.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileDebugKotlinAndroid
    Result: timed out after 184 seconds before producing useful compiler output.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileDebugKotlinAndroid
    Result after customer-facing fee label update: BUILD SUCCESSFUL. Existing warnings remain, including disabled iOS native targets on Windows and unrelated Kotlin deprecation/safe-call warnings.

    npx prisma generate
    Result after organization tax responsibility update: PASS. Prisma Client 7.7.0 generated to src/generated/prisma.

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/organizations/__tests__/organizationsRoute.test.ts src/app/api/organizations/__tests__/organizationByIdRoute.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand
    Result after organization tax responsibility update: PASS, 4 suites, 31 tests.

    npm test -- src/server/repositories/__tests__/events.upsert.test.ts src/components/ui/__tests__/PriceWithFeesPreview.test.tsx src/app/api/billing/__tests__/purchaseIntentTeamRegistrationRoute.test.ts src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx src/app/events/[id]/schedule/__tests__/page.test.tsx --runInBand
    Result after organization tax responsibility update: PASS, 3 suites, 44 tests. The bracketed event-form paths did not match under this command and were rerun with --runTestsByPath.

    npm test -- --runTestsByPath "src/app/events/[id]/schedule/components/__tests__/EventForm.test.tsx" "src/app/events/[id]/schedule/__tests__/page.test.tsx" --runInBand
    Result after organization tax responsibility update: PASS, 2 suites, 95 tests. Existing warning/error logs are exercised by those tests.

    npx tsc --noEmit
    Result after organization tax responsibility update: PASS.

    npm test -- src/lib/__tests__/taxPolicy.test.ts src/app/api/billing/__tests__/purchaseIntentRoute.test.ts --runInBand
    Result after adding Washington individual-event zero-tax handling: PASS, 2 suites, 21 tests.

    npx tsc --noEmit
    Result after adding Washington individual-event zero-tax handling: PASS.

    C:\Users\samue\StudioProjects\mvp-app> .\gradlew.bat :composeApp:compileDebugKotlinAndroid
    Result after organization tax responsibility update: BUILD SUCCESSFUL. Existing Windows host warnings about disabled iOS targets remain.

## Validation and Acceptance

Acceptance for the first milestone is:

1. A paid individual/no-organization event registration with event address or location in New Jersey, New York, Washington, Delaware, or Oregon returns `feeBreakdown.taxAmount: 0` and a `taxMode` showing `ZERO_TAX`.
2. The route does not call `calculateTaxQuote` for those zero-tax event registrations.
3. The PaymentIntent amount still includes the event price, BracketIQ processing fee, and Stripe card processing fee so the customer pays fees.
4. Rentals still call the existing Stripe Tax path unless and until a separate rental policy is added.
5. Existing tests for taxed event checkout still pass.

## Idempotence and Recovery

The changes are additive and safe to rerun. The policy helper has no external side effects. If a zero-tax route change fails after creating a `STARTED` event registration, the existing purchase-intent error handling still releases the reservation on Stripe PaymentIntent creation failure.

If the state cannot be resolved from event location strings, the helper must return `STRIPE_TAX_REQUIRED`, which preserves current behavior rather than guessing.

## Artifacts and Notes

Sources used for the initial safe policy:

- New York Tax Bulletin ST-8 says participant sporting facilities or activities such as golf, bowling, swimming, or skiing are nontaxable, while spectator/professional/college sporting event admissions are taxable.
- New Jersey Tax Topic Bulletin S&U-11 says charges for admission to sporting activities in which the patron participates are exempt, while spectator sporting events and equipment rentals are taxable.
- Delaware Division of Revenue says there are no state or local sales taxes in Delaware, though gross receipts taxes apply to sellers and are not consumer sales tax.
- Oregon Department of Revenue says Oregon does not have a general sales or use/transaction tax.
- Washington Department of Revenue says sports league participation fees generally are not retail sales, but an athletic or fitness facility operator must collect sales tax on league play charges.

## Interfaces and Dependencies

In `src/lib/taxPolicy.ts`, define:

    export type TaxMode = 'ZERO_TAX' | 'STRIPE_TAX_REQUIRED';
    export type TaxPolicyDecision = {
      mode: TaxMode;
      reasonCode: string;
      jurisdictionState: string | null;
      purchaseType: string;
    };
    export const resolvePurchaseTaxPolicy: (params: ResolvePurchaseTaxPolicyParams) => TaxPolicyDecision;

The route responses should include optional fields:

    taxMode?: TaxMode;
    taxReasonCode?: string;
    taxJurisdictionState?: string | null;

Future Checkout work should extend this policy module to choose a checkout presentation. The backend should return a single response shape that tells clients whether to present a PaymentIntent client secret or a Checkout URL, so `mvp-site` and `mvp-app` do not contain duplicated threshold logic.

Revision note: 2026-05-07. Created the initial plan to capture the tax-routing decision and start with a zero-tax event gate before Checkout Session migration.

Revision note: 2026-05-07. Updated the plan after implementing the first milestone, recording validation results and the remaining Checkout Session migration work.

Revision note: 2026-05-08. Updated the plan after implementing organization tax responsibility fields, event tax handling overrides, rental Stripe Tax persistence, and validation for the new milestone.
